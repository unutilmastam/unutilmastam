"""Paper trading engine and performance metrics."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.backtest.metrics import TradeResult, compute_metrics
from app.config import Settings
from app.paper.trader import FEE_RATE, PaperTrader, _normalize_allocations
from app.strategy.models import Signal, SignalSide, SignalStatus, SignalUpdate


def make_signal(
    symbol: str = "BTCUSDT",
    side: SignalSide = SignalSide.BUY,
    entry: float = 100.0,
    stop_loss: float = 98.0,
) -> Signal:
    risk = entry - stop_loss
    return Signal(
        symbol=symbol,
        side=side,
        score=85.0,
        price=entry,
        entry=entry,
        entry_low=entry * 0.999,
        entry_high=entry * 1.001,
        stop_loss=stop_loss,
        tp1=entry + risk,
        tp2=entry + risk * 1.5,
        tp3=entry + risk * 2,
        risk_reward=2.0,
        atr=1.0,
    )


@pytest.fixture
def uncapped(settings: Settings) -> Settings:
    """Settings without the allocation cap, to test pure risk-based sizing."""
    return Settings(**{**settings.__dict__, "max_position_percent": 1.0})


def update_for(signal: Signal, status: SignalStatus, price: float) -> SignalUpdate:
    return SignalUpdate(
        signal=signal,
        previous_status=SignalStatus.ACTIVE,
        new_status=status,
        price=price,
        pnl_percent=(price - signal.entry) / signal.entry * 100.0,
    )


# ----------------------------------------------------------------------
# Opening positions
# ----------------------------------------------------------------------
async def test_a_buy_signal_opens_a_sized_position(uncapped):
    trader = PaperTrader(uncapped)
    signal = make_signal()

    position = await trader.on_signal(signal)

    assert position is not None
    # 1% of 1000 = 10 USDT risk over a 2.0 stop distance -> 5 units.
    assert position.quantity == pytest.approx(5.0)
    assert position.remaining == pytest.approx(5.0)
    assert trader.positions["BTCUSDT"] is position
    assert position.risk_amount == pytest.approx(10.0)
    # Buying spends cash: 500 USDT of notional plus the taker fee.
    assert trader.balance == pytest.approx(1000.0 - 500.0 - 500.0 * FEE_RATE)
    # Equity is unchanged by opening a position, only its form is.
    assert trader.equity() == pytest.approx(1000.0 - 500.0 * FEE_RATE)


async def test_no_real_order_is_ever_placed(settings):
    """The trader has no exchange client at all - that is the guarantee."""
    trader = PaperTrader(settings)
    assert not hasattr(trader, "client")
    assert not hasattr(trader, "rest")
    assert settings.real_trading is False


async def test_a_second_signal_for_an_open_symbol_is_ignored(settings):
    trader = PaperTrader(settings)
    await trader.on_signal(make_signal())
    assert await trader.on_signal(make_signal()) is None
    assert len(trader.positions) == 1


async def test_paper_trading_can_be_switched_off(settings):
    disabled = Settings(**{**settings.__dict__, "paper_trading": False})
    trader = PaperTrader(disabled)
    assert await trader.on_signal(make_signal()) is None


async def test_a_tiny_position_is_skipped(settings):
    """Below Binance's 10 USDT notional a trade would not be placeable."""
    small = Settings(**{**settings.__dict__, "paper_start_balance": 5.0})
    trader = PaperTrader(small)
    assert await trader.on_signal(make_signal()) is None


async def test_a_sell_signal_closes_an_open_position_instead_of_shorting(settings):
    trader = PaperTrader(settings)
    await trader.on_signal(make_signal())

    exit_signal = make_signal(side=SignalSide.SELL, entry=103.0, stop_loss=105.0)
    exit_signal.price = 103.0
    assert await trader.on_signal(exit_signal) is None

    assert trader.positions == {}
    assert len(trader.closed_trades) == 1
    assert trader.closed_trades[0].exit_reason == "SELL signal"
    assert trader.closed_trades[0].pnl > 0


async def test_a_sell_signal_without_a_position_does_nothing(settings):
    trader = PaperTrader(settings)
    assert await trader.on_signal(make_signal(side=SignalSide.SELL)) is None
    assert trader.closed_trades == []


# ----------------------------------------------------------------------
# Managing positions
# ----------------------------------------------------------------------
async def test_targets_close_the_position_in_tranches(uncapped):
    trader = PaperTrader(uncapped)
    signal = make_signal()
    position = await trader.on_signal(signal)
    assert position is not None
    quantity = position.quantity

    await trader.on_update(update_for(signal, SignalStatus.TP1_HIT, signal.tp1))
    assert position.remaining == pytest.approx(quantity * 0.5)
    # The stop moves to break-even once TP1 pays out.
    assert position.stop_loss == pytest.approx(signal.entry)

    await trader.on_update(update_for(signal, SignalStatus.TP2_HIT, signal.tp2))
    assert position.remaining == pytest.approx(quantity * 0.2)

    await trader.on_update(update_for(signal, SignalStatus.TP3_HIT, signal.tp3))
    assert trader.positions == {}
    assert len(trader.closed_trades) == 1
    assert trader.closed_trades[0].pnl > 0
    assert trader.balance > uncapped.paper_start_balance


async def test_a_stop_out_loses_about_the_configured_risk(uncapped):
    trader = PaperTrader(uncapped)
    signal = make_signal()
    await trader.on_signal(signal)

    await trader.on_update(update_for(signal, SignalStatus.STOP_LOSS, signal.stop_loss))

    trade = trader.closed_trades[0]
    assert trade.pnl < 0
    # 10 USDT of risk plus fees, never dramatically more.
    assert -12.0 < trade.pnl < -9.0
    assert trader.balance < uncapped.paper_start_balance


async def test_an_invalidated_signal_closes_the_position(settings):
    trader = PaperTrader(settings)
    signal = make_signal()
    await trader.on_signal(signal)

    await trader.on_update(update_for(signal, SignalStatus.INVALIDATED, 100.5))

    assert trader.positions == {}
    assert trader.closed_trades[0].exit_reason == "Invalidated"


async def test_updates_for_unknown_symbols_are_ignored(settings):
    trader = PaperTrader(settings)
    await trader.on_update(update_for(make_signal("ETHUSDT"), SignalStatus.TP1_HIT, 105.0))
    assert trader.closed_trades == []


async def test_equity_marks_open_positions_to_market(uncapped):
    trader = PaperTrader(uncapped)
    signal = make_signal()
    position = await trader.on_signal(signal)
    assert position is not None

    at_cost = trader.equity({"BTCUSDT": signal.entry})
    assert trader.equity({"BTCUSDT": 102.0}) > at_cost
    assert trader.equity({"BTCUSDT": 99.0}) < at_cost
    # A 2 USDT move on 5 units is worth 10 USDT of equity.
    assert trader.equity({"BTCUSDT": 102.0}) - at_cost == pytest.approx(10.0)


async def test_open_positions_can_never_exceed_the_balance(settings):
    """Spot has no leverage: eight signals must not buy eight full accounts."""
    trader = PaperTrader(settings)

    for index in range(8):
        await trader.on_signal(make_signal(symbol=f"SYM{index}USDT"))

    invested = sum(
        position.entry_price * position.remaining for position in trader.positions.values()
    )
    assert trader.balance >= -1e-6
    assert invested <= settings.paper_start_balance
    assert trader.equity() <= settings.paper_start_balance


async def test_a_single_position_cannot_hog_the_account(settings):
    """A tight stop asks for more than the account; the cap keeps room free."""
    trader = PaperTrader(settings)
    position = await trader.on_signal(make_signal())

    assert position is not None
    cap = settings.paper_start_balance * settings.max_position_percent
    assert position.notional <= cap * 1.0001
    # Other symbols can still be traded.
    assert trader.balance > cap


async def test_the_allocation_cap_allows_several_concurrent_positions(settings):
    trader = PaperTrader(settings)
    for index in range(4):
        await trader.on_signal(make_signal(symbol=f"SYM{index}USDT"))

    assert len(trader.positions) >= 3


async def test_cash_returns_in_full_when_a_position_closes(uncapped):
    trader = PaperTrader(uncapped)
    signal = make_signal()
    await trader.on_signal(signal)

    await trader.on_update(update_for(signal, SignalStatus.TP3_HIT, signal.tp3))

    # All cash is free again, and it grew by exactly the realised PnL.
    assert trader.positions == {}
    assert trader.balance == pytest.approx(
        uncapped.paper_start_balance + trader.closed_trades[0].pnl
    )


async def test_status_and_metrics_are_reported(settings):
    trader = PaperTrader(settings)
    signal = make_signal()
    await trader.on_signal(signal)
    await trader.on_update(update_for(signal, SignalStatus.TP3_HIT, signal.tp3))

    status = trader.status()
    assert status["total_trades"] == 1
    assert status["winning_trades"] == 1
    assert status["win_rate"] == 100.0
    assert status["enabled"] is True


# ----------------------------------------------------------------------
# Allocations
# ----------------------------------------------------------------------
def test_allocations_are_normalised():
    assert _normalize_allocations((1.0, 1.0, 2.0)) == pytest.approx((0.25, 0.25, 0.5))
    assert sum(_normalize_allocations((0.5, 0.3, 0.2))) == pytest.approx(1.0)
    assert _normalize_allocations(()) == (0.5, 0.3, 0.2)


# ----------------------------------------------------------------------
# Metrics
# ----------------------------------------------------------------------
def _trade(pnl: float, index: int = 0) -> TradeResult:
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return TradeResult(
        symbol="BTCUSDT",
        side="BUY",
        entry_price=100.0,
        exit_price=100.0 + pnl,
        quantity=1.0,
        pnl=pnl,
        pnl_percent=pnl,
        opened_at=base + timedelta(minutes=index),
        closed_at=base + timedelta(minutes=index + 1),
    )


def test_metrics_of_an_empty_set():
    metrics = compute_metrics([], start_balance=1000.0)
    assert metrics.total_trades == 0
    assert metrics.end_balance == 1000.0
    assert metrics.profit_factor == 0.0


def test_metrics_summarise_wins_and_losses():
    trades = [_trade(10, 0), _trade(-5, 1), _trade(20, 2), _trade(-5, 3)]
    metrics = compute_metrics(trades, start_balance=1000.0)

    assert metrics.total_trades == 4
    assert metrics.winning_trades == 2
    assert metrics.losing_trades == 2
    assert metrics.win_rate == pytest.approx(50.0)
    assert metrics.total_pnl == pytest.approx(20.0)
    assert metrics.profit_factor == pytest.approx(30 / 10)
    assert metrics.average_profit == pytest.approx(15.0)
    assert metrics.average_loss == pytest.approx(-5.0)
    assert metrics.best_trade == 20.0
    assert metrics.worst_trade == -5.0
    assert metrics.end_balance == pytest.approx(1020.0)


def test_max_drawdown_is_measured_from_the_equity_peak():
    # +100 (peak 1100), then -60 and -40 -> a 100 drawdown from the peak.
    trades = [_trade(100, 0), _trade(-60, 1), _trade(-40, 2)]
    metrics = compute_metrics(trades, start_balance=1000.0)

    assert metrics.max_drawdown == pytest.approx(100.0)
    assert metrics.max_drawdown_percent == pytest.approx(100 / 1100 * 100)


def test_profit_factor_is_infinite_without_losses():
    metrics = compute_metrics([_trade(5, 0), _trade(7, 1)], start_balance=1000.0)
    assert metrics.profit_factor == float("inf")


def test_expectancy_matches_the_win_loss_mix():
    trades = [_trade(10, 0), _trade(10, 1), _trade(-10, 2), _trade(-10, 3)]
    metrics = compute_metrics(trades, start_balance=1000.0)
    assert metrics.expectancy == pytest.approx(0.0)
