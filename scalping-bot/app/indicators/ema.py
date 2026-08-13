"""Exponential moving average and crossover helpers."""

from __future__ import annotations

import pandas as pd


def ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average with ``alpha = 2 / (period + 1)``.

    ``adjust=False`` gives the recursive formulation used by trading
    platforms: ``ema[i] = alpha * x[i] + (1 - alpha) * ema[i-1]``.
    """
    if period <= 0:
        raise ValueError("period must be positive")
    series = pd.Series(series, dtype="float64")
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def ema_cross_up(fast: pd.Series, slow: pd.Series) -> bool:
    """True when ``fast`` crossed above ``slow`` on the most recent bar."""
    if len(fast) < 2 or len(slow) < 2:
        return False
    prev_fast, last_fast = float(fast.iloc[-2]), float(fast.iloc[-1])
    prev_slow, last_slow = float(slow.iloc[-2]), float(slow.iloc[-1])
    if any(pd.isna(value) for value in (prev_fast, last_fast, prev_slow, last_slow)):
        return False
    return prev_fast <= prev_slow and last_fast > last_slow


def ema_cross_down(fast: pd.Series, slow: pd.Series) -> bool:
    """True when ``fast`` crossed below ``slow`` on the most recent bar."""
    if len(fast) < 2 or len(slow) < 2:
        return False
    prev_fast, last_fast = float(fast.iloc[-2]), float(fast.iloc[-1])
    prev_slow, last_slow = float(slow.iloc[-2]), float(slow.iloc[-1])
    if any(pd.isna(value) for value in (prev_fast, last_fast, prev_slow, last_slow)):
        return False
    return prev_fast >= prev_slow and last_fast < last_slow
