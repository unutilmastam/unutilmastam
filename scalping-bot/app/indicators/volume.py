"""Volume based indicators."""

from __future__ import annotations

import pandas as pd


def average_volume(volume: pd.Series, period: int = 20) -> pd.Series:
    """Rolling simple average of volume."""
    if period <= 0:
        raise ValueError("period must be positive")
    series = pd.Series(volume, dtype="float64")
    return series.rolling(window=period, min_periods=period).mean()


def volume_ratio(volume: pd.Series, period: int = 20) -> float:
    """Latest volume divided by the average of the ``period`` preceding bars.

    The average deliberately excludes the current bar, so a high-volume
    candle is compared against its own recent baseline rather than against a
    baseline it inflates.
    """
    series = pd.Series(volume, dtype="float64").dropna()
    if len(series) < period + 1:
        return 0.0

    current = float(series.iloc[-1])
    baseline = float(series.iloc[-(period + 1) : -1].mean())
    if baseline <= 0:
        return 0.0
    return current / baseline
