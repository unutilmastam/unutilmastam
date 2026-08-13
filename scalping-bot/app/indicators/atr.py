"""Average True Range (Wilder)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    """True range: max of the three classic distances."""
    high = pd.Series(high, dtype="float64").reset_index(drop=True)
    low = pd.Series(low, dtype="float64").reset_index(drop=True)
    close = pd.Series(close, dtype="float64").reset_index(drop=True)

    prev_close = close.shift(1)
    ranges = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    )
    tr = ranges.max(axis=1)
    # The very first bar has no previous close: fall back to high - low.
    tr.iloc[0] = float(high.iloc[0] - low.iloc[0]) if len(high) else np.nan
    return tr


def atr(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 14,
) -> pd.Series:
    """Wilder-smoothed average true range."""
    if period <= 0:
        raise ValueError("period must be positive")

    tr = true_range(high, low, close)
    if len(tr) < period:
        return pd.Series(np.nan, index=tr.index, dtype="float64")

    tr_values = tr.to_numpy(dtype="float64", copy=True)
    values = np.full(len(tr), np.nan, dtype="float64")

    # Seed with the simple mean of the first `period` true ranges.
    current = float(np.mean(tr_values[:period]))
    values[period - 1] = current

    for i in range(period, len(tr)):
        current = (current * (period - 1) + tr_values[i]) / period
        values[i] = current

    return pd.Series(values, index=tr.index, dtype="float64")


def atr_percent(atr_value: float, price: float) -> float:
    """ATR expressed as a percentage of price."""
    if not price:
        return 0.0
    return atr_value / price * 100.0
