"""Backtester: aggregation, absence of look-ahead, and simulation rules."""

from __future__ import annotations

import bisect
from datetime import datetime, timedelta, timezone

import pytest

from app.backtest.engine import (
    ANALYSIS_WINDOW,
    BacktestConfig,
    BacktestEngine,
    aggregate_candles,
)
from app.config import Settings
from app.market.candles import Candle
from app.utils.helpers import interval_ms

from tests.conftest import build_series, make_candle, trending_closes

MINUTE = 60_000


@pytest.fixture
def engine(settings: Settings) -> BacktestEngine:
    # The REST client is never touched by run_on_candles.
    return BacktestEngine(settings, client=None)  # type: ignore[arg-type]


DATA_START_MS = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)


def _config(symbol: str = "BTCUSDT", days: int = 30) -> BacktestConfig:
    """A window that starts where the synthetic candles start."""
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return BacktestConfig(
        symbol=symbol,
        start=start,
        end=start + timedelta(days=days),
        initial_balance=1000.0,
    )


# ----------------------------------------------------------------------
# Aggregation
# ----------------------------------------------------------------------
def test_aggregating_to_5m_groups_five_candles():
    candles = build_series([100.0 + index for index in range(10)], start_time=0)
    aggregated = aggregate_candles(candles, "5m")

    assert len(aggregated) == 2
    first = aggregated[0]
    assert first.open == candles[0].open
    assert first.close == candles[4].close
    assert first.high == max(candle.high for candle in candles[:5])
    assert first.low == min(candle.low for candle in candles[:5])
    assert first.volume == pytest.approx(sum(candle.volume for candle in candles[:5]))


def test_aggregation_aligns_buckets_to_the_epoch():
    # Start midway through a 5m bucket.
    candles = build_series([100.0] * 10, start_time=2 * MINUTE)
    aggregated = aggregate_candles(candles, "5m")
    assert aggregated[0].open_time == 0
    assert aggregated[0].close_time == 5 * MINUTE - 1


def test_aggregating_to_1m_is_a_no_op():
    candles = build_series([100.0, 101.0])
    assert aggregate_candles(candles, "1m") == candles


def test_aggregated_close_time_marks_the_theoretical_bucket_end():
    candles = build_series([100.0] * 3, start_time=0)   # a partial 5m bucket
    aggregated = aggregate_candles(candles, "5m")
    assert len(aggregated) == 1
    # The bucket claims the full 5m span, so a cutoff inside it excludes it.
    assert aggregated[0].close_time == 5 * MINUTE - 1


# ----------------------------------------------------------------------
# No look-ahead
# ----------------------------------------------------------------------
def test_higher_timeframe_windows_exclude_unclosed_buckets(engine, settings):
    candles = build_series(trending_closes(1600), start_time=DATA_START_MS)
    index = 1400
    cutoff = candles[index].close_time

    for interval in settings.timeframes:
        if interval == "1m":
            continue
        aggregated = aggregate_candles(candles, interval)
        close_times = [item.close_time for item in aggregated]

        window = engine.visible_window(aggregated, close_times, cutoff)

        # Nothing visible may close after the moment we are standing at.
        assert all(item.close_time <= cutoff for item in window)
        expected = bisect.bisect_right(close_times, cutoff)
        assert len(window) == min(expected, ANALYSIS_WINDOW)
        # The bucket in progress is excluded.
        assert len(window) < len(aggregated)


def test_a_higher_timeframe_bucket_appears_only_once_it_closes(engine):
    candles = build_series([100.0] * 20, start_time=0)
    aggregated = aggregate_candles(candles, "5m")
    close_times = [item.close_time for item in aggregated]

    # Standing inside the second bucket: only the first one is visible.
    inside = 6 * MINUTE
    assert len(engine.visible_window(aggregated, close_times, inside)) == 1
    # Standing exactly at its close: both are visible.
    at_close = aggregated[1].close_time
    assert len(engine.visible_window(aggregated, close_times, at_close)) == 2


def test_higher_snapshots_are_cached_between_bucket_changes(engine, settings):
    candles = build_series(trending_closes(1600), start_time=DATA_START_MS)
    higher = {
        interval: aggregate_candles(candles, interval)
        for interval in settings.timeframes
        if interval != "1m"
    }
    close_times = {
        interval: [item.close_time for item in values] for interval, values in higher.items()
    }
    cache: dict = {}

    cutoff = candles[1400].close_time
    first = engine._higher_snapshots(higher, close_times, cutoff, cache)
    # One minute later no higher bucket has closed, so the objects are reused.
    second = engine._higher_snapshots(higher, close_times, cutoff + MINUTE, cache)

    assert first is not None and second is not None
    for interval in higher:
        assert first[interval] is second[interval]


def test_the_entry_analysis_only_sees_candles_up_to_now(engine):
    candles = build_series(trending_closes(1600), start_time=DATA_START_MS)

    for index in (1000, 1200, 1599):
        window = candles[max(0, index - ANALYSIS_WINDOW + 1) : index + 1]
        assert window[-1].open_time == candles[index].open_time
        assert all(item.close_time <= candles[index].close_time for item in window)


# ----------------------------------------------------------------------
# Simulation
# ----------------------------------------------------------------------
def test_a_run_over_flat_data_produces_no_trades(engine):
    # A dead-flat market has no trend, so the higher-timeframe gate rejects
    # every bar and no position is ever opened.
    candles = build_series([100.0] * 1500, start_time=DATA_START_MS, wick=0.0)
    result = engine.run_on_candles(_config(), candles)

    assert result.trades == []
    assert result.metrics.total_trades == 0
    assert result.metrics.end_balance == pytest.approx(1000.0)
    assert result.candles_processed > 0


@pytest.fixture(scope="module")
def trending_run():
    """One shared walk-forward run - the simulation is the slow part."""
    from app.config import Settings as _Settings

    local_engine = BacktestEngine(_Settings(), client=None)  # type: ignore[arg-type]
    candles = build_series(trending_closes(1500, seed=5), start_time=DATA_START_MS)
    return local_engine, candles, local_engine.run_on_candles(_config(), candles)


def test_a_run_is_deterministic(trending_run):
    local_engine, candles, result = trending_run
    again = local_engine.run_on_candles(_config(), candles)

    assert again.summary() == result.summary()
    assert len(again.signals) == len(result.signals)


def test_the_simulation_never_produces_a_short(trending_run):
    _, _, result = trending_run
    assert all(trade.side == "BUY" for trade in result.trades)


def test_rejections_are_counted(trending_run):
    _, _, result = trending_run
    assert sum(result.rejected.values()) > 0


def test_every_trade_is_internally_consistent(trending_run):
    _, _, result = trending_run
    for trade in result.trades:
        assert trade.symbol == "BTCUSDT"
        assert trade.quantity > 0
        assert trade.opened_at <= trade.closed_at
        assert trade.exit_reason != ""


def test_summary_contains_the_required_fields(trending_run):
    _, _, result = trending_run
    summary = result.summary()

    for key in (
        "symbol",
        "candles",
        "signals",
        "total_trades",
        "winning_trades",
        "losing_trades",
        "win_rate",
        "profit_factor",
        "total_pnl",
        "max_drawdown",
        "average_trade",
        "best_trade",
        "worst_trade",
    ):
        assert key in summary


def test_a_stop_out_is_resolved_pessimistically(engine, settings):
    """A candle spanning stop and target must be booked as a stop."""
    from app.backtest.engine import _OpenTrade
    from app.strategy.models import SignalSide

    trade = _OpenTrade(
        symbol="BTCUSDT",
        side=SignalSide.BUY,
        entry_price=100.0,
        quantity=5.0,
        remaining=5.0,
        stop_loss=98.0,
        take_profits=(102.0, 103.0, 104.0),
        opened_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        allocations=(0.5, 0.3, 0.2),
    )
    trades: list = []
    # This candle touches both 98 and 104.
    candle = make_candle(0, 100.0, 104.0, 98.0, 101.0)

    closed, balance = engine._manage(trade, candle, 1000.0, trades)

    assert closed is True
    assert trades[0].exit_reason == "Stop loss"
    assert trades[0].pnl < 0
    assert balance < 1000.0


def test_partial_targets_move_the_stop_to_break_even(engine):
    from app.backtest.engine import _OpenTrade
    from app.strategy.models import SignalSide

    trade = _OpenTrade(
        symbol="BTCUSDT",
        side=SignalSide.BUY,
        entry_price=100.0,
        quantity=5.0,
        remaining=5.0,
        stop_loss=98.0,
        take_profits=(102.0, 103.0, 104.0),
        opened_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        allocations=(0.5, 0.3, 0.2),
    )
    trades: list = []
    closed, balance = engine._manage(
        trade, make_candle(0, 100.0, 102.5, 99.5, 102.0), 1000.0, trades
    )

    assert closed is False
    assert trade.targets_hit == 1
    assert trade.remaining == pytest.approx(2.5)
    assert trade.stop_loss == pytest.approx(100.0)
    assert balance > 1000.0


def test_an_open_trade_is_closed_at_the_end_of_the_range(engine):
    from app.backtest.engine import _OpenTrade
    from app.strategy.models import SignalSide

    trade = _OpenTrade(
        symbol="BTCUSDT",
        side=SignalSide.BUY,
        entry_price=100.0,
        quantity=5.0,
        remaining=5.0,
        stop_loss=98.0,
        take_profits=(102.0, 103.0, 104.0),
        opened_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        allocations=(0.5, 0.3, 0.2),
    )
    trades: list = []
    engine._force_close(trade, make_candle(0, 100.0, 101.0, 99.0, 100.5), 1000.0, trades)

    assert trades[0].exit_reason == "End of test"


def test_live_and_backtest_share_the_same_strategy_code():
    """Guards against the two paths drifting apart."""
    import app.backtest.engine as backtest_module
    import app.strategy.scalping_strategy as strategy_module
    import app.strategy.signal_engine as live_module

    assert backtest_module.best_side is live_module.best_side
    assert backtest_module.RiskManager is live_module.RiskManager
    assert backtest_module.analyze_timeframe is strategy_module.analyze_timeframe
    assert live_module.build_analysis is strategy_module.build_analysis
