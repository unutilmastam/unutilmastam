"""Indicator correctness tests, including no-look-ahead guarantees."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.indicators.atr import atr, true_range
from app.indicators.ema import ema, ema_cross_down, ema_cross_up
from app.indicators.macd import macd
from app.indicators.rsi import rsi
from app.indicators.support_resistance import (
    nearest_resistance,
    nearest_support,
    swing_levels,
)
from app.indicators.volume import average_volume, volume_ratio
from app.indicators.vwap import vwap

from tests.conftest import build_series, frame_from, trending_closes


# ----------------------------------------------------------------------
# EMA
# ----------------------------------------------------------------------
def test_ema_matches_recursive_definition():
    values = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
    result = ema(values, 3)

    alpha = 2 / (3 + 1)
    # Seeded by pandas at the first fully-formed window.
    expected = float(result.iloc[2])
    for value in values.iloc[3:]:
        expected = alpha * value + (1 - alpha) * expected

    assert float(result.iloc[-1]) == pytest.approx(expected)


def test_ema_of_a_constant_series_is_that_constant():
    values = pd.Series([50.0] * 30)
    assert float(ema(values, 9).iloc[-1]) == pytest.approx(50.0)


def test_ema_needs_a_full_window():
    result = ema(pd.Series([1.0, 2.0, 3.0]), 5)
    assert result.isna().all()


def test_ema_rejects_a_non_positive_period():
    with pytest.raises(ValueError):
        ema(pd.Series([1.0, 2.0]), 0)


def test_ema_cross_detection():
    rising_fast = pd.Series([1.0, 3.0])
    flat_slow = pd.Series([2.0, 2.0])
    assert ema_cross_up(rising_fast, flat_slow) is True
    assert ema_cross_down(rising_fast, flat_slow) is False

    falling_fast = pd.Series([3.0, 1.0])
    assert ema_cross_down(falling_fast, flat_slow) is True
    assert ema_cross_up(falling_fast, flat_slow) is False


def test_ema_cross_is_false_without_a_crossing():
    fast = pd.Series([3.0, 4.0])
    slow = pd.Series([1.0, 1.0])
    assert ema_cross_up(fast, slow) is False
    assert ema_cross_down(fast, slow) is False


def test_ema_cross_needs_two_bars():
    assert ema_cross_up(pd.Series([1.0]), pd.Series([2.0])) is False


# ----------------------------------------------------------------------
# RSI
# ----------------------------------------------------------------------
def test_rsi_of_a_pure_uptrend_is_one_hundred():
    closes = pd.Series([float(value) for value in range(1, 40)])
    assert float(rsi(closes, 14).iloc[-1]) == pytest.approx(100.0)


def test_rsi_of_a_pure_downtrend_is_zero():
    closes = pd.Series([float(value) for value in range(40, 1, -1)])
    assert float(rsi(closes, 14).iloc[-1]) == pytest.approx(0.0)


def test_rsi_stays_within_bounds():
    closes = pd.Series(trending_closes(200, seed=3))
    values = rsi(closes, 14).dropna()
    assert not values.empty
    assert values.min() >= 0.0
    assert values.max() <= 100.0


def test_rsi_is_undefined_before_the_seed_window():
    closes = pd.Series(trending_closes(30))
    result = rsi(closes, 14)
    assert result.iloc[:14].isna().all()
    assert not np.isnan(result.iloc[14])


def test_rsi_returns_all_nan_when_series_too_short():
    assert rsi(pd.Series([1.0, 2.0, 3.0]), 14).isna().all()


# ----------------------------------------------------------------------
# MACD
# ----------------------------------------------------------------------
def test_macd_histogram_is_line_minus_signal():
    closes = pd.Series(trending_closes(120))
    result = macd(closes)
    difference = result.macd - result.signal
    pd.testing.assert_series_equal(
        result.histogram.dropna(), difference.dropna(), check_names=False
    )


def test_macd_is_bullish_in_an_uptrend():
    closes = pd.Series(trending_closes(200, drift=0.002, noise=0.0001))
    result = macd(closes)
    assert result.is_bullish() is True
    assert result.is_bearish() is False


def test_macd_line_is_negative_in_a_downtrend():
    closes = pd.Series(trending_closes(200, drift=-0.002, noise=0.0001))
    assert float(macd(closes).macd.iloc[-1]) < 0


def test_macd_is_bearish_when_the_decline_accelerates():
    # A constant *percentage* decline decelerates in absolute terms, which
    # lifts the histogram. Bearish momentum needs widening absolute steps.
    closes = pd.Series([1000.0 - 0.01 * index**2 for index in range(200)])
    result = macd(closes)
    assert result.is_bearish() is True
    assert result.is_bullish() is False


def test_macd_rejects_inverted_periods():
    with pytest.raises(ValueError):
        macd(pd.Series([1.0, 2.0]), fast=26, slow=12)


# ----------------------------------------------------------------------
# ATR
# ----------------------------------------------------------------------
def test_true_range_uses_the_widest_distance():
    high = pd.Series([10.0, 12.0])
    low = pd.Series([9.0, 11.0])
    close = pd.Series([9.5, 11.5])
    result = true_range(high, low, close)
    # Second bar: high-low = 1, |high-prevClose| = 2.5, |low-prevClose| = 1.5
    assert float(result.iloc[1]) == pytest.approx(2.5)


def test_atr_of_constant_range_candles_equals_that_range():
    size = 40
    high = pd.Series([101.0] * size)
    low = pd.Series([99.0] * size)
    close = pd.Series([100.0] * size)
    assert float(atr(high, low, close, 14).iloc[-1]) == pytest.approx(2.0)


def test_atr_is_positive_and_seeded_at_the_right_index():
    candles = build_series(trending_closes(80))
    frame = frame_from(candles)
    result = atr(frame["high"], frame["low"], frame["close"], 14)
    assert result.iloc[:13].isna().all()
    assert float(result.iloc[-1]) > 0


# ----------------------------------------------------------------------
# VWAP
# ----------------------------------------------------------------------
def test_vwap_of_a_flat_market_equals_price():
    size = 10
    high = pd.Series([100.0] * size)
    low = pd.Series([100.0] * size)
    close = pd.Series([100.0] * size)
    volume = pd.Series([5.0] * size)
    assert float(vwap(high, low, close, volume).iloc[-1]) == pytest.approx(100.0)


def test_vwap_is_volume_weighted():
    high = pd.Series([10.0, 20.0])
    low = pd.Series([10.0, 20.0])
    close = pd.Series([10.0, 20.0])
    volume = pd.Series([1.0, 3.0])
    # (10*1 + 20*3) / 4 = 17.5
    assert float(vwap(high, low, close, volume).iloc[-1]) == pytest.approx(17.5)


def test_vwap_resets_each_utc_session():
    day = 86_400_000
    high = pd.Series([10.0, 10.0, 20.0])
    low = pd.Series([10.0, 10.0, 20.0])
    close = pd.Series([10.0, 10.0, 20.0])
    volume = pd.Series([1.0, 1.0, 1.0])
    open_time = pd.Series([0, 60_000, day])

    result = vwap(high, low, close, volume, open_time)
    # The third candle starts a new session, so VWAP restarts at its own price.
    assert float(result.iloc[-1]) == pytest.approx(20.0)


# ----------------------------------------------------------------------
# Volume
# ----------------------------------------------------------------------
def test_average_volume_is_a_rolling_mean():
    volume = pd.Series([float(value) for value in range(1, 25)])
    assert float(average_volume(volume, 20).iloc[-1]) == pytest.approx(
        sum(range(5, 25)) / 20
    )


def test_volume_ratio_excludes_the_current_bar_from_the_baseline():
    volume = pd.Series([10.0] * 20 + [20.0])
    assert volume_ratio(volume, 20) == pytest.approx(2.0)


def test_volume_ratio_needs_enough_history():
    assert volume_ratio(pd.Series([10.0] * 5), 20) == 0.0


def test_volume_ratio_handles_a_zero_baseline():
    assert volume_ratio(pd.Series([0.0] * 20 + [5.0]), 20) == 0.0


# ----------------------------------------------------------------------
# Support / resistance
# ----------------------------------------------------------------------
def test_swing_levels_finds_a_pivot_high_and_low():
    high = pd.Series([1.0, 2.0, 5.0, 2.0, 1.0, 1.0, 1.0])
    low = pd.Series([1.0, 1.0, 1.0, 1.0, 0.5, 1.0, 1.0])
    levels = swing_levels(high, low, left=2, right=2)
    assert 5.0 in levels.resistances
    assert 0.5 in levels.supports


def test_swing_levels_ignores_unconfirmed_recent_bars():
    # The final bar is the highest, but it has no bars to its right yet,
    # so it must not be reported as resistance.
    high = pd.Series([1.0, 2.0, 1.0, 1.0, 1.0, 9.0])
    low = pd.Series([1.0, 1.0, 1.0, 1.0, 1.0, 1.0])
    levels = swing_levels(high, low, left=2, right=2)
    assert 9.0 not in levels.resistances


def test_swing_levels_needs_a_minimum_window():
    levels = swing_levels(pd.Series([1.0, 2.0]), pd.Series([1.0, 1.0]))
    assert levels.supports == ()
    assert levels.resistances == ()


def test_swing_levels_rejects_bad_arguments():
    with pytest.raises(ValueError):
        swing_levels(pd.Series([1.0]), pd.Series([1.0]), left=0)


def test_nearest_level_helpers():
    from app.indicators.support_resistance import Levels

    levels = Levels(supports=(90.0, 95.0), resistances=(105.0, 110.0))
    assert nearest_support(levels, 100.0) == 95.0
    assert nearest_resistance(levels, 100.0) == 105.0
    assert nearest_support(levels, 80.0) is None
    assert nearest_resistance(levels, 120.0) is None


# ----------------------------------------------------------------------
# No look-ahead
# ----------------------------------------------------------------------
@pytest.mark.parametrize("cut", [120, 160, 200])
def test_indicators_do_not_change_when_future_candles_arrive(cut):
    """The value at bar N must be identical with or without bars after N."""
    candles = build_series(trending_closes(300, seed=11))
    frame = frame_from(candles)
    truncated = frame.iloc[: cut + 1]

    for compute in (
        lambda data: ema(data["close"], 21),
        lambda data: rsi(data["close"], 14),
        lambda data: macd(data["close"]).histogram,
        lambda data: atr(data["high"], data["low"], data["close"], 14),
        lambda data: vwap(
            data["high"], data["low"], data["close"], data["volume"], data["open_time"]
        ),
    ):
        full_value = float(compute(frame).iloc[cut])
        partial_value = float(compute(truncated).iloc[cut])
        assert full_value == pytest.approx(partial_value, rel=1e-9)
