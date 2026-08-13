"""Historical backtester.

The backtester walks forward one 1m candle at a time and, at every step,
shows the strategy *only* the candles that had already closed at that moment.
It calls the very same ``build_analysis`` / ``best_side`` / ``RiskManager``
code the live engine uses, so a backtested setup and a live setup are
produced by identical logic.

Two deliberate constraints keep the results honest:

* trade management starts on the candle **after** the signal candle, so a
  signal can never be filled and resolved by the bar that created it;
* when one candle spans both the stop and a target, the stop wins.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pandas as pd

from app.backtest.metrics import PerformanceMetrics, TradeResult, compute_metrics
from app.binance.rest import BinanceRestClient
from app.config import TF_ENTRY, TF_MAIN, TF_TREND, Settings
from app.market.candles import FRAME_COLUMNS, Candle
from app.paper.trader import FEE_RATE, _normalize_allocations
from app.strategy.models import SignalSide
from app.strategy.risk_manager import RiskManager
from app.strategy.scalping_strategy import (
    MIN_CANDLES,
    MarketAnalysis,
    TimeframeSnapshot,
    analyze_timeframe,
    higher_timeframes_allow_a_setup,
)
from app.strategy.scoring import best_side
from app.utils.helpers import interval_ms
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Rolling window of candles handed to the indicators at each step.
ANALYSIS_WINDOW = 260


@dataclass(frozen=True)
class BacktestConfig:
    """Inputs for one backtest run."""

    symbol: str
    start: datetime
    end: datetime
    initial_balance: float = 1000.0
    min_score: float | None = None
    risk_per_trade: float | None = None


@dataclass
class BacktestSignal:
    """A signal produced during a backtest."""

    symbol: str
    side: SignalSide
    score: float
    timestamp: datetime
    entry: float
    stop_loss: float
    take_profits: tuple[float, float, float]
    risk_reward: float
    setup: str


@dataclass
class BacktestResult:
    """Everything a run produced."""

    config: BacktestConfig
    metrics: PerformanceMetrics
    trades: list[TradeResult] = field(default_factory=list)
    signals: list[BacktestSignal] = field(default_factory=list)
    candles_processed: int = 0
    rejected: dict[str, int] = field(default_factory=dict)

    def summary(self) -> dict:
        return {
            "symbol": self.config.symbol,
            "start": self.config.start.isoformat(),
            "end": self.config.end.isoformat(),
            "candles": self.candles_processed,
            "signals": len(self.signals),
            **self.metrics.as_dict(),
        }


def aggregate_candles(candles: list[Candle], interval: str) -> list[Candle]:
    """Roll 1m candles up into ``interval`` candles.

    Buckets are aligned to the epoch exactly like Binance aligns them, and a
    bucket's ``close_time`` is its theoretical end so a partially filled
    bucket is naturally excluded until that time has passed.
    """
    step = interval_ms(interval)
    if step == interval_ms("1m"):
        return list(candles)

    buckets: dict[int, list[Candle]] = {}
    for candle in candles:
        start = candle.open_time - (candle.open_time % step)
        buckets.setdefault(start, []).append(candle)

    aggregated: list[Candle] = []
    for start in sorted(buckets):
        group = sorted(buckets[start], key=lambda item: item.open_time)
        aggregated.append(
            Candle(
                open_time=start,
                open=group[0].open,
                high=max(item.high for item in group),
                low=min(item.low for item in group),
                close=group[-1].close,
                volume=sum(item.volume for item in group),
                close_time=start + step - 1,
                quote_volume=sum(item.quote_volume for item in group),
                trades=sum(item.trades for item in group),
            )
        )
    return aggregated


def _frame(candles: list[Candle]) -> pd.DataFrame:
    frame = pd.DataFrame(
        [candle.as_row() for candle in candles], columns=list(FRAME_COLUMNS)
    )
    for column in ("open", "high", "low", "close", "volume", "quote_volume"):
        frame[column] = frame[column].astype("float64")
    return frame


@dataclass
class _OpenTrade:
    """State of the single simulated position."""

    symbol: str
    side: SignalSide
    entry_price: float
    quantity: float
    remaining: float
    stop_loss: float
    take_profits: tuple[float, float, float]
    opened_at: datetime
    allocations: tuple[float, ...]
    realized_pnl: float = 0.0
    fees: float = 0.0
    targets_hit: int = 0

    def gross(self, price: float, quantity: float) -> float:
        if self.side is SignalSide.BUY:
            return (price - self.entry_price) * quantity
        return (self.entry_price - price) * quantity


class BacktestEngine:
    """Runs the live strategy over historical candles."""

    def __init__(self, settings: Settings, client: BinanceRestClient) -> None:
        self.settings = settings
        self.client = client
        self.risk = RiskManager(settings)

    async def load_candles(self, config: BacktestConfig) -> list[Candle]:
        """Fetch 1m candles plus enough warm-up history for the indicators."""
        # 15m EMA/MACD need a long lead-in; ANALYSIS_WINDOW 15m candles is
        # ANALYSIS_WINDOW * 15 minutes of 1m data.
        warmup_ms = ANALYSIS_WINDOW * interval_ms("15m")
        start_ms = int(config.start.timestamp() * 1000) - warmup_ms
        end_ms = int(config.end.timestamp() * 1000)

        candles = await self.client.historical_klines(
            config.symbol, TF_ENTRY, start_ms, end_ms
        )
        logger.info(
            "Loaded %d 1m candles for %s (%s -> %s, incl. warm-up)",
            len(candles),
            config.symbol,
            config.start.date(),
            config.end.date(),
        )
        return candles

    async def run(self, config: BacktestConfig) -> BacktestResult:
        candles = await self.load_candles(config)
        return self.run_on_candles(config, candles)

    def run_on_candles(
        self,
        config: BacktestConfig,
        candles: list[Candle],
    ) -> BacktestResult:
        """Walk forward over ``candles`` (1m) and simulate the strategy."""
        candles = sorted(candles, key=lambda item: item.open_time)
        min_score = (
            self.settings.min_signal_score if config.min_score is None else config.min_score
        )
        risk_fraction = (
            self.settings.risk_per_trade
            if config.risk_per_trade is None
            else config.risk_per_trade
        )
        allocations = _normalize_allocations(self.settings.tp_allocation)

        # Pre-aggregate the higher timeframes once; slicing them per step is
        # then just a binary search.
        higher: dict[str, list[Candle]] = {}
        higher_close_times: dict[str, list[int]] = {}
        for interval in self.settings.timeframes:
            if interval == TF_ENTRY:
                continue
            aggregated = aggregate_candles(candles, interval)
            higher[interval] = aggregated
            higher_close_times[interval] = [item.close_time for item in aggregated]

        start_ms = int(config.start.timestamp() * 1000)
        balance = config.initial_balance
        trades: list[TradeResult] = []
        signals: list[BacktestSignal] = []
        rejected: dict[str, int] = {}
        open_trade: _OpenTrade | None = None
        processed = 0

        # A 15m snapshot only changes every fifteen 1m bars, so higher
        # timeframes are recomputed on bucket change instead of every bar.
        htf_cache: dict[str, tuple[int, TimeframeSnapshot | None]] = {}

        for index, candle in enumerate(candles):
            if candle.open_time < start_ms:
                continue
            processed += 1

            # 1. Manage an existing position with THIS candle. The position
            #    was opened on a previous candle, so this is not look-ahead.
            if open_trade is not None:
                closed, balance = self._manage(open_trade, candle, balance, trades)
                if closed:
                    open_trade = None
                # One position at a time: never look for a new entry on the
                # same candle that just closed one.
                continue

            # 2. Look for a new signal using only closed data up to here.
            if index < MIN_CANDLES:
                continue

            snapshots = self._higher_snapshots(
                higher, higher_close_times, candle.close_time, htf_cache
            )
            if snapshots is None:
                continue

            # Both mandatory higher-timeframe confirmations are decided by
            # the 15m and 5m snapshots alone. If neither direction can pass,
            # skip the expensive 1m analysis entirely.
            if not higher_timeframes_allow_a_setup(
                snapshots[TF_TREND], snapshots[TF_MAIN]
            ):
                _count(rejected, "mandatory confirmations")
                continue

            entry_window = candles[max(0, index - ANALYSIS_WINDOW + 1) : index + 1]
            entry_snapshot = analyze_timeframe(_frame(entry_window), TF_ENTRY)
            if entry_snapshot is None:
                continue
            snapshots[TF_ENTRY] = entry_snapshot

            analysis = MarketAnalysis(
                symbol=config.symbol,
                price=candle.close,
                timeframes=snapshots,
                book_ticker=None,       # no historical top-of-book
                order_book=None,        # no historical depth
                spread_percent=None,
            )

            result = best_side(analysis, self.settings)
            if not result.mandatory_passed:
                _count(rejected, "mandatory confirmations")
                continue
            if result.total < min_score:
                _count(rejected, "score below threshold")
                continue

            filters = self.risk.check_filters(analysis, result.side)
            if not filters.passed:
                for reason in filters.reasons:
                    _count(rejected, reason.split("(")[0].strip())
                continue

            plan, reason = self.risk.build_plan(analysis, result.side)
            if plan is None:
                _count(rejected, reason.split("(")[0].strip() or "risk rejected")
                continue

            # Spot backtest: only long setups can actually be traded.
            if result.side is not SignalSide.BUY:
                _count(rejected, "sell signal (no spot short)")
                continue

            quantity = self.risk.position_size(
                balance, plan.entry, plan.stop_loss, risk_fraction
            )
            if quantity <= 0:
                _count(rejected, "position size zero")
                continue

            timestamp = datetime.fromtimestamp(candle.close_time / 1000, tz=timezone.utc)
            signals.append(
                BacktestSignal(
                    symbol=config.symbol,
                    side=result.side,
                    score=result.total,
                    timestamp=timestamp,
                    entry=plan.entry,
                    stop_loss=plan.stop_loss,
                    take_profits=plan.take_profits,
                    risk_reward=plan.risk_reward,
                    setup=result.component("entry_1m").description
                    if result.component("entry_1m")
                    else "",
                )
            )

            entry_fee = plan.entry * quantity * FEE_RATE
            balance -= entry_fee
            open_trade = _OpenTrade(
                symbol=config.symbol,
                side=result.side,
                entry_price=plan.entry,
                quantity=quantity,
                remaining=quantity,
                stop_loss=plan.stop_loss,
                take_profits=plan.take_profits,
                opened_at=timestamp,
                allocations=allocations,
                fees=entry_fee,
                realized_pnl=-entry_fee,
            )

        # Close anything still open at the very end of the range.
        if open_trade is not None and candles:
            balance = self._force_close(open_trade, candles[-1], balance, trades)

        metrics = compute_metrics(trades, config.initial_balance)
        return BacktestResult(
            config=config,
            metrics=metrics,
            trades=trades,
            signals=signals,
            candles_processed=processed,
            rejected=rejected,
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    @staticmethod
    def visible_window(
        aggregated: list[Candle],
        close_times: list[int],
        cutoff: int,
    ) -> list[Candle]:
        """Higher-timeframe candles that had already closed at ``cutoff``.

        ``bisect_right`` on close times is the anti-look-ahead guard: a
        bucket is invisible until the moment it actually completes.
        """
        end = bisect.bisect_right(close_times, cutoff)
        return aggregated[max(0, end - ANALYSIS_WINDOW) : end]

    def _higher_snapshots(
        self,
        higher: dict[str, list[Candle]],
        higher_close_times: dict[str, list[int]],
        cutoff: int,
        cache: dict[str, tuple[int, TimeframeSnapshot | None]],
    ) -> dict[str, TimeframeSnapshot] | None:
        """Snapshots for 3m/5m/15m, recomputed only when a bucket closes."""
        snapshots: dict[str, TimeframeSnapshot] = {}

        for interval, aggregated in higher.items():
            close_times = higher_close_times[interval]
            end = bisect.bisect_right(close_times, cutoff)

            cached = cache.get(interval)
            if cached is not None and cached[0] == end:
                snapshot = cached[1]
            else:
                window = aggregated[max(0, end - ANALYSIS_WINDOW) : end]
                snapshot = (
                    analyze_timeframe(_frame(window), interval)
                    if len(window) >= MIN_CANDLES
                    else None
                )
                cache[interval] = (end, snapshot)

            if snapshot is None:
                return None
            snapshots[interval] = snapshot

        return snapshots

    def _manage(
        self,
        trade: _OpenTrade,
        candle: Candle,
        balance: float,
        trades: list[TradeResult],
    ) -> tuple[bool, float]:
        """Apply one candle to the open trade. Returns ``(closed, balance)``."""
        # Pessimistic ordering: a candle that touches both resolves as a stop.
        stop_hit = (
            candle.low <= trade.stop_loss
            if trade.side is SignalSide.BUY
            else candle.high >= trade.stop_loss
        )
        if stop_hit:
            balance = self._close(trade, candle, trade.stop_loss, "Stop loss", balance, trades)
            return True, balance

        for level_index in range(trade.targets_hit, 3):
            level = trade.take_profits[level_index]
            touched = (
                candle.high >= level
                if trade.side is SignalSide.BUY
                else candle.low <= level
            )
            if not touched:
                break

            if level_index == 2:
                balance = self._close(trade, candle, level, "TP3", balance, trades)
                return True, balance

            fraction = trade.allocations[level_index]
            quantity = min(trade.quantity * fraction, trade.remaining)
            if quantity > 0:
                gross = trade.gross(level, quantity)
                fee = level * quantity * FEE_RATE
                trade.remaining -= quantity
                trade.realized_pnl += gross - fee
                trade.fees += fee
                balance += gross - fee
            trade.targets_hit = level_index + 1
            if level_index == 0:
                trade.stop_loss = trade.entry_price  # move to break-even

            if trade.remaining <= trade.quantity * 1e-9:
                balance = self._close(trade, candle, level, f"TP{level_index + 1}", balance, trades)
                return True, balance

        return False, balance

    def _close(
        self,
        trade: _OpenTrade,
        candle: Candle,
        price: float,
        reason: str,
        balance: float,
        trades: list[TradeResult],
    ) -> float:
        if trade.remaining > 0:
            gross = trade.gross(price, trade.remaining)
            fee = price * trade.remaining * FEE_RATE
            trade.realized_pnl += gross - fee
            trade.fees += fee
            balance += gross - fee
            trade.remaining = 0.0

        notional = trade.entry_price * trade.quantity
        trades.append(
            TradeResult(
                symbol=trade.symbol,
                side=trade.side.value,
                entry_price=trade.entry_price,
                exit_price=price,
                quantity=trade.quantity,
                pnl=trade.realized_pnl,
                pnl_percent=(trade.realized_pnl / notional * 100.0) if notional else 0.0,
                opened_at=trade.opened_at,
                closed_at=datetime.fromtimestamp(candle.close_time / 1000, tz=timezone.utc),
                exit_reason=reason,
                fees=trade.fees,
                targets_hit=trade.targets_hit,
            )
        )
        return balance

    def _force_close(
        self,
        trade: _OpenTrade,
        candle: Candle,
        balance: float,
        trades: list[TradeResult],
    ) -> float:
        return self._close(trade, candle, candle.close, "End of test", balance, trades)


def _count(counter: dict[str, int], key: str) -> None:
    counter[key] = counter.get(key, 0) + 1
