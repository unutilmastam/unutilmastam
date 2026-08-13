"""Strategy conditions and scoring."""

from __future__ import annotations

from dataclasses import replace

import pytest

from app.config import TF_ENTRY, TF_MAIN, TF_MOMENTUM, TF_TREND, Settings
from app.indicators.support_resistance import Levels
from app.strategy.models import (
    SignalSide,
    SignalStrength,
    classify_score,
    signal_label,
)
from app.strategy.scalping_strategy import (
    analyze_timeframe,
    build_analysis,
    buy_conditions,
    sell_conditions,
)
from app.strategy.scoring import MAX_SCORE, WEIGHTS, best_side, score_buy, score_sell

from tests.conftest import make_analysis, make_snapshot, with_timeframe


# ----------------------------------------------------------------------
# Timeframe analysis
# ----------------------------------------------------------------------
def test_analyze_timeframe_needs_enough_candles(uptrend_frame):
    assert analyze_timeframe(uptrend_frame.iloc[:30], "1m") is None
    assert analyze_timeframe(uptrend_frame, "1m") is not None


def test_analyze_timeframe_produces_a_coherent_snapshot(uptrend_frame):
    snapshot = analyze_timeframe(uptrend_frame, "5m")
    assert snapshot is not None
    assert snapshot.interval == "5m"
    assert snapshot.ema9 > 0
    assert snapshot.ema21 > 0
    assert 0 <= snapshot.rsi <= 100
    assert snapshot.atr > 0
    # A sustained uptrend must read as bullish.
    assert snapshot.ema_bullish is True
    assert snapshot.trend_label() in ("Bullish", "Weak Bullish")


def test_build_analysis_requires_every_timeframe(uptrend_frame, settings):
    frames = {interval: uptrend_frame for interval in settings.timeframes}
    analysis = build_analysis("BTCUSDT", frames, price=123.0)
    assert analysis is not None
    assert analysis.complete is True

    frames[TF_TREND] = uptrend_frame.iloc[:10]
    assert build_analysis("BTCUSDT", frames, price=123.0) is None


def test_snapshot_cross_detection():
    crossed = make_snapshot(TF_ENTRY, cross=True)
    assert crossed.cross_up is True
    assert crossed.cross_down is False

    flat = make_snapshot(TF_ENTRY, cross=False)
    assert flat.cross_up is False


# ----------------------------------------------------------------------
# Conditions
# ----------------------------------------------------------------------
def test_buy_conditions_on_a_clean_setup(settings, bullish_analysis):
    conditions = buy_conditions(bullish_analysis, settings)
    assert conditions.trend_full is True
    assert conditions.main_full is True
    assert conditions.momentum_rsi is True
    assert conditions.momentum_macd is True
    assert conditions.entry_cross is True
    assert conditions.entry_confirmed is True
    assert conditions.mandatory_ok is True
    assert conditions.missing() == ()
    assert "EMA crossover" in conditions.setup


def test_sell_conditions_on_a_clean_breakdown(settings, bearish_analysis):
    conditions = sell_conditions(bearish_analysis, settings)
    assert conditions.trend_full is True
    assert conditions.main_full is True
    assert conditions.entry_cross is True
    assert conditions.mandatory_ok is True
    # The book imbalance is inverted for the sell side.
    assert conditions.book_imbalance > 1.0


def test_missing_confirmations_are_reported(settings, bullish_analysis):
    no_trend = with_timeframe(
        bullish_analysis, TF_TREND, ema9=90.0, ema21=95.0, ema50=110.0
    )
    conditions = buy_conditions(no_trend, settings)
    assert conditions.trend_full is False
    assert conditions.mandatory_ok is False
    assert "15m trend" in conditions.missing()


def test_support_rejection_counts_as_an_entry(settings):
    # No EMA cross, but the candle wicks into support and closes bullish.
    analysis = make_analysis(cross=False, supports=(99.0,), atr=1.0)
    entry = analysis.timeframes[TF_ENTRY]
    rejection = replace(
        entry,
        open=99.6,
        close=100.0,
        low=99.1,
        high=100.05,
        levels=Levels(supports=(99.0,), resistances=(105.0,)),
    )
    analysis = with_timeframe(
        analysis,
        TF_ENTRY,
        open=rejection.open,
        close=rejection.close,
        low=rejection.low,
        high=rejection.high,
    )
    conditions = buy_conditions(analysis, settings)
    assert conditions.entry_cross is False
    assert conditions.entry_rejection is True
    assert conditions.entry_confirmed is True


def test_conditions_raise_on_an_incomplete_analysis(settings, bullish_analysis):
    broken = replace(bullish_analysis, timeframes={})
    with pytest.raises(ValueError):
        buy_conditions(broken, settings)


# ----------------------------------------------------------------------
# Scoring
# ----------------------------------------------------------------------
def test_weights_sum_to_one_hundred():
    assert sum(WEIGHTS.values()) == MAX_SCORE


def test_a_perfect_setup_scores_at_the_top(settings, bullish_analysis):
    result = score_buy(bullish_analysis, settings)
    assert result.side is SignalSide.BUY
    assert result.mandatory_passed is True
    assert result.total >= 85
    assert result.total <= MAX_SCORE
    assert result.strength is SignalStrength.VERY_STRONG


def test_every_component_is_reported(settings, bullish_analysis):
    result = score_buy(bullish_analysis, settings)
    assert {component.indicator for component in result.components} == set(WEIGHTS)
    for component in result.components:
        assert 0 <= component.score <= component.max_score


def test_score_falls_when_the_trend_is_lost(settings, bullish_analysis):
    strong = score_buy(bullish_analysis, settings).total
    weakened = with_timeframe(bullish_analysis, TF_TREND, ema9=90.0, ema21=95.0, ema50=110.0)
    assert score_buy(weakened, settings).total < strong


def test_missing_order_book_costs_points_but_does_not_block(settings):
    with_book = make_analysis(with_book=True, imbalance=1.5)
    without_book = make_analysis(with_book=False)

    scored_with = score_buy(with_book, settings)
    scored_without = score_buy(without_book, settings)

    assert scored_with.total > scored_without.total
    assert scored_without.mandatory_passed is True
    assert scored_without.component("order_book").score == 0.0


def test_volume_scoring_is_graded(settings):
    scores = []
    for ratio in (0.8, 1.05, 1.3, 1.7, 2.5):
        analysis = make_analysis(volume_ratio=ratio)
        scores.append(score_buy(analysis, settings).component("volume").score)
    assert scores == sorted(scores)
    assert scores[0] == 0.0
    assert scores[-1] == WEIGHTS["volume"]


def test_best_side_prefers_a_valid_direction(settings, bullish_analysis, bearish_analysis):
    assert best_side(bullish_analysis, settings).side is SignalSide.BUY
    assert best_side(bearish_analysis, settings).side is SignalSide.SELL


def test_best_side_never_returns_a_setup_that_failed_confirmations(settings):
    # Neither direction has its mandatory confirmations.
    analysis = make_analysis(cross=False)
    analysis = with_timeframe(analysis, TF_ENTRY, ema9=100.0, ema21=100.0, prev_ema9=100.0)
    result = best_side(analysis, settings)
    assert result.mandatory_passed is False


def test_a_high_score_without_confirmation_is_still_rejected(settings, bullish_analysis):
    # Strip the 1m trigger but keep everything else strong.
    no_entry = with_timeframe(
        bullish_analysis,
        TF_ENTRY,
        prev_ema9=bullish_analysis.timeframes[TF_ENTRY].ema9,
        low=bullish_analysis.timeframes[TF_ENTRY].close,
        levels=Levels(),
    )
    result = score_buy(no_entry, settings)
    assert result.total >= 50           # plenty of points remain
    assert result.mandatory_passed is False
    assert "1m entry" in result.missing


def test_sell_side_scores_a_breakdown(settings, bearish_analysis):
    result = score_sell(bearish_analysis, settings)
    assert result.side is SignalSide.SELL
    assert result.mandatory_passed is True
    assert result.total >= 75


# ----------------------------------------------------------------------
# Score classification
# ----------------------------------------------------------------------
@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0, SignalStrength.NO_TRADE),
        (49, SignalStrength.NO_TRADE),
        (50, SignalStrength.WEAK),
        (64, SignalStrength.WEAK),
        (65, SignalStrength.NORMAL),
        (74, SignalStrength.NORMAL),
        (75, SignalStrength.STRONG),
        (84, SignalStrength.STRONG),
        (85, SignalStrength.VERY_STRONG),
        (100, SignalStrength.VERY_STRONG),
    ],
)
def test_score_thresholds_match_the_specification(score, expected):
    assert classify_score(score) is expected


def test_signal_labels():
    assert signal_label(SignalSide.BUY, 90) == "VERY STRONG BUY"
    assert signal_label(SignalSide.BUY, 80) == "STRONG BUY"
    assert signal_label(SignalSide.BUY, 70) == "BUY"
    assert signal_label(SignalSide.BUY, 55) == "WEAK BUY"
    assert signal_label(SignalSide.BUY, 20) == "NO TRADE"
    assert signal_label(SignalSide.SELL, 70) == "SELL / EXIT"
    assert signal_label(SignalSide.WAIT, 90) == "NO TRADE"
