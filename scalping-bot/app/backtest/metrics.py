"""Performance metrics shared by paper trading and backtesting."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Sequence


@dataclass(frozen=True)
class TradeResult:
    """A completed trade, real or simulated."""

    symbol: str
    side: str
    entry_price: float
    exit_price: float
    quantity: float
    pnl: float
    pnl_percent: float
    opened_at: datetime | None = None
    closed_at: datetime | None = None
    exit_reason: str = ""
    fees: float = 0.0
    targets_hit: int = 0

    @property
    def is_win(self) -> bool:
        return self.pnl > 0


@dataclass(frozen=True)
class PerformanceMetrics:
    """Aggregate statistics over a set of trades."""

    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    average_profit: float = 0.0
    average_loss: float = 0.0
    average_trade: float = 0.0
    profit_factor: float = 0.0
    expectancy: float = 0.0
    total_pnl: float = 0.0
    total_pnl_percent: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_percent: float = 0.0
    best_trade: float = 0.0
    worst_trade: float = 0.0
    total_fees: float = 0.0
    start_balance: float = 0.0
    end_balance: float = 0.0
    equity_curve: tuple[float, ...] = field(default_factory=tuple)

    def as_dict(self) -> dict[str, float | int]:
        return {
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "win_rate": round(self.win_rate, 2),
            "average_profit": round(self.average_profit, 4),
            "average_loss": round(self.average_loss, 4),
            "average_trade": round(self.average_trade, 4),
            "profit_factor": round(self.profit_factor, 3),
            "expectancy": round(self.expectancy, 4),
            "total_pnl": round(self.total_pnl, 4),
            "total_pnl_percent": round(self.total_pnl_percent, 2),
            "max_drawdown": round(self.max_drawdown, 4),
            "max_drawdown_percent": round(self.max_drawdown_percent, 2),
            "best_trade": round(self.best_trade, 4),
            "worst_trade": round(self.worst_trade, 4),
            "total_fees": round(self.total_fees, 4),
            "start_balance": round(self.start_balance, 2),
            "end_balance": round(self.end_balance, 2),
        }


def compute_metrics(
    trades: Sequence[TradeResult],
    start_balance: float = 1000.0,
) -> PerformanceMetrics:
    """Summarise ``trades`` into the full metric set.

    ``profit_factor`` is gross profit over gross loss; with no losses it is
    reported as ``inf`` only when there is at least one win, otherwise 0.
    """
    if not trades:
        return PerformanceMetrics(
            start_balance=start_balance,
            end_balance=start_balance,
            equity_curve=(start_balance,),
        )

    wins = [trade for trade in trades if trade.pnl > 0]
    losses = [trade for trade in trades if trade.pnl <= 0]

    gross_profit = sum(trade.pnl for trade in wins)
    gross_loss = abs(sum(trade.pnl for trade in losses))
    total_pnl = sum(trade.pnl for trade in trades)

    # Equity curve in chronological order drives the drawdown figures.
    ordered = sorted(
        trades,
        key=lambda trade: (trade.closed_at is None, trade.closed_at or datetime.min),
    )
    equity = [start_balance]
    for trade in ordered:
        equity.append(equity[-1] + trade.pnl)

    peak = equity[0]
    max_drawdown = 0.0
    max_drawdown_percent = 0.0
    for value in equity:
        peak = max(peak, value)
        drawdown = peak - value
        if drawdown > max_drawdown:
            max_drawdown = drawdown
            max_drawdown_percent = (drawdown / peak * 100.0) if peak > 0 else 0.0

    win_rate = len(wins) / len(trades) * 100.0
    average_profit = gross_profit / len(wins) if wins else 0.0
    average_loss = -gross_loss / len(losses) if losses else 0.0

    if gross_loss > 0:
        profit_factor = gross_profit / gross_loss
    else:
        profit_factor = float("inf") if gross_profit > 0 else 0.0

    # Expectancy in currency per trade.
    expectancy = (win_rate / 100.0) * average_profit + (1 - win_rate / 100.0) * average_loss

    return PerformanceMetrics(
        total_trades=len(trades),
        winning_trades=len(wins),
        losing_trades=len(losses),
        win_rate=win_rate,
        average_profit=average_profit,
        average_loss=average_loss,
        average_trade=total_pnl / len(trades),
        profit_factor=profit_factor,
        expectancy=expectancy,
        total_pnl=total_pnl,
        total_pnl_percent=(total_pnl / start_balance * 100.0) if start_balance else 0.0,
        max_drawdown=max_drawdown,
        max_drawdown_percent=max_drawdown_percent,
        best_trade=max(trade.pnl for trade in trades),
        worst_trade=min(trade.pnl for trade in trades),
        total_fees=sum(trade.fees for trade in trades),
        start_balance=start_balance,
        end_balance=start_balance + total_pnl,
        equity_curve=tuple(equity),
    )
