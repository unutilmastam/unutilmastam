"""Signal engine: pipeline, duplicate filter and signal lifecycle."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.config import TF_ENTRY, TF_MAIN, TF_TREND, Settings
from app.market.candles import Candle
from app.market.store import ClosedCandleEvent, MarketStore
from app.strategy.models import SignalSide, SignalStatus
from app.strategy.signal_engine import SignalEngine
from app.utils.helpers import now_ms

from tests.conftest import make_analysis, make_candle, with_timeframe

pytestmark = pytest.mark.asyncio

MINUTE = 60_000


class Recorder:
    """Collects the engine's callbacks."""

    def __init__(self) -> None:
        self.signals = []
        self.updates = []

    async def on_signal(self, signal) -> None:
        self.signals.append(signal)

    async def on_update(self, update) -> None:
        self.updates.append(update)


def build_engine(settings: Settings, analysis=None) -> tuple[SignalEngine, Recorder]:
    """An engine whose analysis step is replaced by a fixed result."""
    store = MarketStore(settings)
    store.set_symbols(["BTCUSDT"])
    # A fresh 1m candle keeps the staleness guard happy.
    store.update_kline(
        "BTCUSDT",
        TF_ENTRY,
        make_candle(now_ms() - MINUTE, 100, 100.5, 99.5, 100.0),
        is_closed=True,
    )

    recorder = Recorder()
    engine = SignalEngine(
        settings=settings,
        store=store,
        rest_client=None,
        on_signal=recorder.on_signal,
        on_update=recorder.on_update,
    )
    fixed = analysis if analysis is not None else make_analysis()
    engine.analyze = lambda symbol, order_book=None: fixed  # type: ignore[assignment]
    return engine, recorder


# ----------------------------------------------------------------------
# Pipeline
# ----------------------------------------------------------------------
async def test_a_strong_setup_publishes_a_signal(settings):
    engine, recorder = build_engine(settings)

    signal = await engine.evaluate("BTCUSDT")

    assert signal is not None
    assert signal.side is SignalSide.BUY
    assert signal.score >= settings.min_signal_score
    assert signal.status is SignalStatus.ACTIVE
    assert signal.stop_loss < signal.entry < signal.tp1 < signal.tp2 < signal.tp3
    assert signal.risk_reward >= settings.min_risk_reward
    assert recorder.signals == [signal]
    assert engine.active_signals["BTCUSDT"] is signal


async def test_the_published_signal_carries_its_reasoning(settings):
    engine, _ = build_engine(settings)
    signal = await engine.evaluate("BTCUSDT")

    assert signal is not None
    assert len(signal.components) == 9
    assert signal.trends[TF_TREND] in ("Bullish", "Weak Bullish")
    assert "rsi" in signal.indicators
    assert signal.reason_text() != ""
    assert signal.expected_hold.endswith("min")


async def test_stale_market_data_blocks_everything(settings):
    engine, recorder = build_engine(settings)
    # Push the newest candle far into the past.
    engine.store.candles["BTCUSDT"][TF_ENTRY].clear()
    engine.store.update_kline(
        "BTCUSDT",
        TF_ENTRY,
        make_candle(now_ms() - 3_600_000, 100, 101, 99, 100),
        is_closed=True,
    )

    assert await engine.evaluate("BTCUSDT") is None
    assert recorder.signals == []
    assert "stale" in engine.last_rejection["BTCUSDT"]


async def test_a_setup_below_the_threshold_is_not_published(settings):
    strict = Settings(**{**settings.__dict__, "min_signal_score": 99})
    engine, recorder = build_engine(strict)

    assert await engine.evaluate("BTCUSDT") is None
    assert recorder.signals == []
    assert engine.stats.rejected_score == 1


async def test_missing_confirmation_blocks_a_high_score(settings):
    # Remove the 15m trend: the score stays decent but the setup is invalid.
    analysis = with_timeframe(make_analysis(), TF_TREND, ema9=90.0, ema21=95.0, ema50=110.0)
    engine, recorder = build_engine(settings, analysis)

    assert await engine.evaluate("BTCUSDT") is None
    assert recorder.signals == []
    assert engine.stats.rejected_mandatory == 1
    assert "15m trend" in engine.last_rejection["BTCUSDT"]


async def test_filters_reject_a_thin_volume_setup(settings):
    engine, recorder = build_engine(settings, make_analysis(volume_ratio=0.5))

    assert await engine.evaluate("BTCUSDT") is None
    assert recorder.signals == []
    assert engine.stats.rejected_filters == 1


async def test_a_disabled_engine_still_tracks_but_never_publishes(settings):
    engine, recorder = build_engine(settings)
    engine.enabled = False

    await engine.on_closed_candle(
        ClosedCandleEvent(
            symbol="BTCUSDT",
            interval=TF_ENTRY,
            candle=make_candle(now_ms() - MINUTE, 100, 101, 99, 100.5),
        )
    )
    assert recorder.signals == []


async def test_higher_timeframe_candles_do_not_drive_the_pipeline(settings):
    engine, recorder = build_engine(settings)

    await engine.on_closed_candle(
        ClosedCandleEvent(
            symbol="BTCUSDT",
            interval=TF_MAIN,
            candle=make_candle(now_ms() - MINUTE, 100, 101, 99, 100.5, interval="5m"),
        )
    )
    assert recorder.signals == []
    assert engine.stats.evaluations == 0


# ----------------------------------------------------------------------
# Duplicate / cooldown filter
# ----------------------------------------------------------------------
async def test_the_same_setup_is_not_republished_inside_the_cooldown(settings):
    engine, recorder = build_engine(settings)

    first = await engine.evaluate("BTCUSDT")
    second = await engine.evaluate("BTCUSDT")

    assert first is not None
    assert second is None
    assert len(recorder.signals) == 1
    assert engine.stats.rejected_duplicate == 1
    assert "cooldown" in engine.last_rejection["BTCUSDT"]


async def test_a_signal_is_republished_after_the_cooldown(settings):
    engine, recorder = build_engine(settings)
    await engine.evaluate("BTCUSDT")

    record = engine._published[("BTCUSDT", "BUY")]
    record.published_at = datetime.now(tz=timezone.utc) - timedelta(
        minutes=settings.signal_cooldown_minutes + 1
    )

    assert await engine.evaluate("BTCUSDT") is not None
    assert len(recorder.signals) == 2


async def test_a_materially_better_score_breaks_the_cooldown(settings):
    engine, recorder = build_engine(settings)
    await engine.evaluate("BTCUSDT")

    record = engine._published[("BTCUSDT", "BUY")]
    record.score = record.score - settings.signal_score_delta - 1

    assert await engine.evaluate("BTCUSDT") is not None
    assert len(recorder.signals) == 2


async def test_new_levels_break_the_cooldown(settings):
    engine, recorder = build_engine(settings)
    await engine.evaluate("BTCUSDT")

    record = engine._published[("BTCUSDT", "BUY")]
    record.stop_loss *= 0.9   # the plan moved materially

    assert await engine.evaluate("BTCUSDT") is not None
    assert len(recorder.signals) == 2


# ----------------------------------------------------------------------
# Lifecycle
# ----------------------------------------------------------------------
async def _publish(settings):
    engine, recorder = build_engine(settings)
    signal = await engine.evaluate("BTCUSDT")
    assert signal is not None
    engine.enabled = False          # isolate the lifecycle from new signals
    return engine, recorder, signal


def _candle(high: float, low: float, close: float) -> Candle:
    return make_candle(now_ms() - MINUTE, close, high, low, close)


async def test_targets_are_hit_in_order(settings):
    engine, recorder, signal = await _publish(settings)

    await engine._monitor_active("BTCUSDT", _candle(signal.tp1, signal.entry, signal.tp1))
    assert signal.status is SignalStatus.TP1_HIT

    await engine._monitor_active("BTCUSDT", _candle(signal.tp2, signal.entry, signal.tp2))
    assert signal.status is SignalStatus.TP2_HIT

    await engine._monitor_active("BTCUSDT", _candle(signal.tp3, signal.entry, signal.tp3))
    assert signal.status is SignalStatus.TP3_HIT

    assert [update.new_status for update in recorder.updates] == [
        SignalStatus.TP1_HIT,
        SignalStatus.TP2_HIT,
        SignalStatus.TP3_HIT,
    ]
    assert "BTCUSDT" not in engine.active_signals
    assert recorder.updates[-1].pnl_percent > 0


async def test_a_target_is_never_re_reported(settings):
    engine, recorder, signal = await _publish(settings)

    for _ in range(3):
        await engine._monitor_active("BTCUSDT", _candle(signal.tp1, signal.entry, signal.tp1))

    assert [update.new_status for update in recorder.updates] == [SignalStatus.TP1_HIT]


async def test_a_stop_out_closes_the_signal(settings):
    engine, recorder, signal = await _publish(settings)

    await engine._monitor_active(
        "BTCUSDT", _candle(signal.entry, signal.stop_loss, signal.stop_loss)
    )

    assert signal.status is SignalStatus.STOP_LOSS
    assert recorder.updates[-1].pnl_percent < 0
    assert "BTCUSDT" not in engine.active_signals


async def test_a_candle_spanning_both_resolves_as_a_stop(settings):
    """Pessimistic resolution: the stop is assumed to have come first."""
    engine, recorder, signal = await _publish(settings)

    await engine._monitor_active(
        "BTCUSDT", _candle(signal.tp3, signal.stop_loss, signal.entry)
    )

    assert signal.status is SignalStatus.STOP_LOSS
    assert [update.new_status for update in recorder.updates] == [SignalStatus.STOP_LOSS]


async def test_a_flipped_trend_invalidates_an_untriggered_signal(settings):
    engine, recorder, signal = await _publish(settings)

    # The higher timeframes now point the other way.
    flipped = make_analysis(bullish=False, rsi=38.0)
    engine.analyze = lambda symbol, order_book=None: flipped  # type: ignore[assignment]

    await engine._monitor_active("BTCUSDT", _candle(signal.entry, signal.entry, signal.entry))

    assert signal.status is SignalStatus.INVALIDATED
    assert recorder.updates[-1].new_status is SignalStatus.INVALIDATED


async def test_a_trend_flip_after_tp1_does_not_invalidate(settings):
    engine, recorder, signal = await _publish(settings)
    await engine._monitor_active("BTCUSDT", _candle(signal.tp1, signal.entry, signal.tp1))

    flipped = make_analysis(bullish=False, rsi=38.0)
    engine.analyze = lambda symbol, order_book=None: flipped  # type: ignore[assignment]
    await engine._monitor_active("BTCUSDT", _candle(signal.entry, signal.entry, signal.entry))

    assert signal.status is SignalStatus.TP1_HIT


async def test_an_untriggered_signal_expires(settings):
    engine, recorder, signal = await _publish(settings)
    signal.created_at = datetime.now(tz=timezone.utc) - timedelta(hours=10)

    await engine._monitor_active("BTCUSDT", _candle(signal.entry, signal.entry, signal.entry))

    assert signal.status is SignalStatus.EXPIRED


async def test_excursions_are_tracked(settings):
    engine, _, signal = await _publish(settings)

    await engine._monitor_active(
        "BTCUSDT",
        _candle(signal.entry * 1.01, signal.entry * 0.995, signal.entry),
    )
    assert signal.indicators["mfe_percent"] > 0
    assert signal.indicators["mae_percent"] < 0


# ----------------------------------------------------------------------
# Queries
# ----------------------------------------------------------------------
async def test_top_setups_only_lists_valid_setups_above_the_threshold(settings):
    engine, _ = build_engine(settings)
    await engine.evaluate("BTCUSDT")

    top = engine.top_setups(limit=5)
    assert len(top) == 1
    assert top[0].side is SignalSide.BUY

    ranked = engine.ranked_scores()
    assert ranked[0][0] == "BTCUSDT"
    assert engine.score_for("btcusdt") is not None


async def test_status_reports_counters(settings):
    engine, _ = build_engine(settings)
    await engine.evaluate("BTCUSDT")
    await engine.evaluate("BTCUSDT")

    status = engine.status()
    assert status["published"] == 1
    assert status["rejected_duplicate"] == 1
    assert status["active_signals"] == 1
    assert status["enabled"] is True


async def test_pipeline_errors_are_contained(settings):
    engine, recorder = build_engine(settings)

    def explode(symbol, order_book=None):
        raise RuntimeError("indicator blew up")

    engine.analyze = explode  # type: ignore[assignment]

    await engine.on_closed_candle(
        ClosedCandleEvent(
            symbol="BTCUSDT",
            interval=TF_ENTRY,
            candle=make_candle(now_ms() - MINUTE, 100, 101, 99, 100.5),
        )
    )

    assert engine.stats.errors == 1
    assert recorder.signals == []
