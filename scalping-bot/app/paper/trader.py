"""Paper trading engine.

Every BUY signal opens a virtual spot position sized so that a stop-out costs
``RISK_PER_TRADE`` of the balance. Targets close the position in tranches and
the stop is moved to break-even once TP1 is banked.

Because this is *spot*, a SELL signal is an exit instruction rather than a
short: it closes an open virtual position for that symbol and does nothing
when none exists. No Binance order is ever created by this module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.backtest.metrics import PerformanceMetrics, TradeResult, compute_metrics
from app.config import Settings
from app.database.database import Database, as_utc
from app.strategy.models import Signal, SignalSide, SignalStatus, SignalUpdate
from app.strategy.risk_manager import RiskManager
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Binance spot taker fee, charged on entry and on every exit tranche.
FEE_RATE = 0.001


@dataclass
class PaperPosition:
    """An open virtual position."""

    symbol: str
    side: SignalSide
    entry_price: float
    quantity: float
    remaining: float
    stop_loss: float
    take_profits: tuple[float, float, float]
    risk_amount: float
    opened_at: datetime
    signal_id: int | None = None
    trade_id: int | None = None
    realized_pnl: float = 0.0
    fees: float = 0.0
    targets_hit: int = 0
    allocations: tuple[float, ...] = (0.5, 0.3, 0.2)

    @property
    def notional(self) -> float:
        return self.entry_price * self.quantity

    def unrealized(self, price: float) -> float:
        if self.remaining <= 0:
            return 0.0
        if self.side is SignalSide.BUY:
            return (price - self.entry_price) * self.remaining
        return (self.entry_price - price) * self.remaining


class PaperTrader:
    """Simulated account fed by the signal engine's callbacks."""

    def __init__(
        self,
        settings: Settings,
        database: Database | None = None,
        risk: RiskManager | None = None,
    ) -> None:
        self.settings = settings
        self.database = database
        self.risk = risk or RiskManager(settings)
        self.balance = settings.paper_start_balance
        self.start_balance = settings.paper_start_balance
        self.equity_peak = settings.paper_start_balance
        self.positions: dict[str, PaperPosition] = {}
        self.closed_trades: list[TradeResult] = []
        self._allocations = _normalize_allocations(settings.tp_allocation)

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    async def load(self) -> None:
        """Restore balance and closed-trade history from the database."""
        if self.database is None:
            return
        try:
            account = await self.database.get_account()
            self.balance = account.balance or self.settings.paper_start_balance
            self.start_balance = account.start_balance or self.settings.paper_start_balance
            self.equity_peak = account.equity_peak or self.balance

            for record in await self.database.closed_paper_trades():
                self.closed_trades.append(
                    TradeResult(
                        symbol=record.symbol,
                        side=record.side,
                        entry_price=record.entry_price,
                        exit_price=record.exit_price,
                        quantity=record.quantity,
                        pnl=record.pnl,
                        pnl_percent=record.pnl_percent,
                        opened_at=as_utc(record.opened_at),
                        closed_at=as_utc(record.closed_at),
                        exit_reason=record.exit_reason,
                        fees=record.fees,
                        targets_hit=record.targets_hit,
                    )
                )
            logger.info(
                "Paper account restored: balance %.2f, %d historical trades",
                self.balance,
                len(self.closed_trades),
            )
        except Exception as exc:  # noqa: BLE001 - start fresh rather than crash
            logger.exception("Could not restore paper account: %s", exc)

    async def _persist_account(self) -> None:
        if self.database is not None:
            await self.database.update_account(self.balance, self.equity_peak)

    # ------------------------------------------------------------------
    # Signal handling
    # ------------------------------------------------------------------
    async def on_signal(self, signal: Signal) -> PaperPosition | None:
        """Open (BUY) or close (SELL) a virtual position for ``signal``."""
        if not self.settings.paper_trading:
            return None

        if signal.side is SignalSide.SELL:
            position = self.positions.get(signal.symbol)
            if position is not None:
                await self._close(position, signal.price or signal.entry, "SELL signal")
            return None

        if signal.side is not SignalSide.BUY:
            return None

        if signal.symbol in self.positions:
            logger.debug("Paper position for %s already open, skipping", signal.symbol)
            return None

        # Size from the account's equity so risk stays 1% of the account,
        # then cap by the cash actually available: spot has no leverage, so
        # several open positions cannot together exceed the balance.
        equity = self.equity()
        quantity = self.risk.position_size(equity, signal.entry, signal.stop_loss)

        # A tight stop makes the risk-based size larger than the account, so
        # cap each position's share of equity - otherwise the first signal
        # spends everything and no other symbol can ever be traded.
        cap = equity * self.settings.max_position_percent
        quantity = min(quantity, cap / signal.entry)

        affordable = self.balance / (signal.entry * (1.0 + FEE_RATE))
        quantity = min(quantity, max(0.0, affordable))
        if quantity <= 0:
            logger.warning("Paper trade for %s skipped: position size is zero", signal.symbol)
            return None

        notional = quantity * signal.entry
        if notional < 10.0:
            logger.info(
                "Paper trade for %s skipped: only %.2f USDT of free cash left",
                signal.symbol,
                self.balance,
            )
            return None

        entry_fee = notional * FEE_RATE
        position = PaperPosition(
            symbol=signal.symbol,
            side=signal.side,
            entry_price=signal.entry,
            quantity=quantity,
            remaining=quantity,
            stop_loss=signal.stop_loss,
            take_profits=signal.targets,
            risk_amount=quantity * abs(signal.entry - signal.stop_loss),
            opened_at=datetime.now(tz=timezone.utc),
            signal_id=signal.db_id,
            fees=entry_fee,
            # The entry fee is part of the trade's cost, so it belongs in the
            # trade's PnL - otherwise reported PnL and cash would disagree.
            realized_pnl=-entry_fee,
            allocations=self._allocations,
        )
        self.balance -= notional + entry_fee
        self.positions[signal.symbol] = position

        if self.database is not None:
            position.trade_id = await self.database.create_paper_trade(
                signal_id=signal.db_id,
                symbol=signal.symbol,
                side=signal.side.value,
                entry_price=position.entry_price,
                quantity=position.quantity,
                remaining_quantity=position.remaining,
                stop_loss=position.stop_loss,
                tp1=signal.tp1,
                tp2=signal.tp2,
                tp3=signal.tp3,
                risk_amount=position.risk_amount,
                notional=notional,
                status="OPEN",
                opened_at=position.opened_at,
                fees=entry_fee,
            )

        await self._persist_account()
        logger.info(
            "PAPER OPEN %s qty=%.8g @ %.8g (notional %.2f, risk %.2f)",
            signal.symbol,
            quantity,
            signal.entry,
            notional,
            position.risk_amount,
        )
        return position

    async def on_update(self, update: SignalUpdate) -> None:
        """React to a signal lifecycle transition."""
        position = self.positions.get(update.signal.symbol)
        if position is None:
            return

        status = update.new_status
        if status is SignalStatus.STOP_LOSS:
            await self._close(position, update.price, "Stop loss")
        elif status is SignalStatus.TP1_HIT:
            await self._take_partial(position, update.price, 0, "TP1")
        elif status is SignalStatus.TP2_HIT:
            await self._take_partial(position, update.price, 1, "TP2")
        elif status is SignalStatus.TP3_HIT:
            # The final target closes the position outright, so record the
            # third hit here - _close does not go through _take_partial.
            position.targets_hit = 3
            await self._close(position, update.price, "TP3")
        elif status in (SignalStatus.INVALIDATED, SignalStatus.EXPIRED):
            await self._close(position, update.price, status.value.title())

    # ------------------------------------------------------------------
    # Position management
    # ------------------------------------------------------------------
    async def _take_partial(
        self,
        position: PaperPosition,
        price: float,
        index: int,
        label: str,
    ) -> None:
        if position.remaining <= 0:
            return

        fraction = (
            position.allocations[index] if index < len(position.allocations) else 0.0
        )
        quantity = min(position.quantity * fraction, position.remaining)
        if quantity <= 0:
            return

        pnl = self._gross_pnl(position, price, quantity)
        fee = price * quantity * FEE_RATE

        position.remaining -= quantity
        position.realized_pnl += pnl - fee
        position.fees += fee
        position.targets_hit = max(position.targets_hit, index + 1)
        # Selling returns the whole tranche's value to cash, not just profit.
        self.balance += position.entry_price * quantity + pnl - fee
        self.equity_peak = max(self.equity_peak, self.equity())

        # Protect the rest of the position once the first target pays out.
        if index == 0:
            position.stop_loss = position.entry_price

        if self.database is not None and position.trade_id is not None:
            await self.database.update_paper_trade(
                position.trade_id,
                remaining_quantity=position.remaining,
                pnl=position.realized_pnl,
                fees=position.fees,
                targets_hit=position.targets_hit,
                stop_loss=position.stop_loss,
            )
        await self._persist_account()

        logger.info(
            "PAPER %s %s: closed %.8g @ %.8g (pnl %.4f, remaining %.8g)",
            position.symbol,
            label,
            quantity,
            price,
            pnl - fee,
            position.remaining,
        )

        if position.remaining <= position.quantity * 1e-6:
            await self._close(position, price, label)

    async def _close(self, position: PaperPosition, price: float, reason: str) -> None:
        """Close whatever is left of the position and book the trade."""
        if position.remaining > 0:
            pnl = self._gross_pnl(position, price, position.remaining)
            fee = price * position.remaining * FEE_RATE
            position.realized_pnl += pnl - fee
            position.fees += fee
            self.balance += position.entry_price * position.remaining + pnl - fee
            position.remaining = 0.0

        self.equity_peak = max(self.equity_peak, self.balance)
        self.positions.pop(position.symbol, None)

        notional = position.entry_price * position.quantity
        pnl_percent = (position.realized_pnl / notional * 100.0) if notional else 0.0
        closed_at = datetime.now(tz=timezone.utc)

        trade = TradeResult(
            symbol=position.symbol,
            side=position.side.value,
            entry_price=position.entry_price,
            exit_price=price,
            quantity=position.quantity,
            pnl=position.realized_pnl,
            pnl_percent=pnl_percent,
            opened_at=position.opened_at,
            closed_at=closed_at,
            exit_reason=reason,
            fees=position.fees,
            targets_hit=position.targets_hit,
        )
        self.closed_trades.append(trade)

        if self.database is not None and position.trade_id is not None:
            await self.database.update_paper_trade(
                position.trade_id,
                status="CLOSED",
                remaining_quantity=0.0,
                exit_price=price,
                pnl=position.realized_pnl,
                pnl_percent=pnl_percent,
                fees=position.fees,
                closed_at=closed_at,
                result="WIN" if position.realized_pnl > 0 else "LOSS",
                exit_reason=reason,
                targets_hit=position.targets_hit,
            )
        await self._persist_account()

        logger.info(
            "PAPER CLOSE %s @ %.8g (%s) pnl=%.4f (%.2f%%) balance=%.2f",
            position.symbol,
            price,
            reason,
            position.realized_pnl,
            pnl_percent,
            self.balance,
        )

    @staticmethod
    def _gross_pnl(position: PaperPosition, price: float, quantity: float) -> float:
        if position.side is SignalSide.BUY:
            return (price - position.entry_price) * quantity
        return (position.entry_price - price) * quantity

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------
    def equity(self, prices: dict[str, float] | None = None) -> float:
        """Free cash plus the marked value of every open position.

        ``balance`` is cash only - opening a position spends it - so equity is
        what the account is actually worth.
        """
        prices = prices or {}
        held = 0.0
        for symbol, position in self.positions.items():
            price = prices.get(symbol, position.entry_price)
            held += position.remaining * price
        return self.balance + held

    def metrics(self) -> PerformanceMetrics:
        return compute_metrics(self.closed_trades, self.start_balance)

    def status(self) -> dict:
        metrics = self.metrics()
        return {
            "enabled": self.settings.paper_trading,
            "balance": round(self.balance, 2),
            "equity": round(self.equity(), 2),
            "start_balance": round(self.start_balance, 2),
            "open_positions": len(self.positions),
            "symbols": sorted(self.positions),
            **metrics.as_dict(),
        }


def _normalize_allocations(allocations: tuple[float, ...]) -> tuple[float, ...]:
    """Make sure the three tranches are positive and sum to 1."""
    values = [value for value in allocations[:3] if value > 0]
    while len(values) < 3:
        values.append(0.0)
    total = sum(values)
    if total <= 0:
        return (0.5, 0.3, 0.2)
    return tuple(value / total for value in values)
