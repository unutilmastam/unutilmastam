"""Relative Strength Index (Wilder's smoothing)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Classic Wilder RSI.

    The first averages are simple means of the first ``period`` gains/losses,
    subsequent values use Wilder's recursive smoothing. This matches the RSI
    drawn by TradingView and Binance.
    """
    if period <= 0:
        raise ValueError("period must be positive")

    close = pd.Series(series, dtype="float64").reset_index(drop=True)
    if len(close) <= period:
        return pd.Series(np.nan, index=close.index, dtype="float64")

    delta = close.diff()
    gain_values = delta.clip(lower=0.0).to_numpy(dtype="float64", copy=True)
    loss_values = (-delta).clip(lower=0.0).to_numpy(dtype="float64", copy=True)

    out = np.full(len(close), np.nan, dtype="float64")

    # Seed with the simple average of the first `period` changes.
    avg_gain = float(np.mean(gain_values[1 : period + 1]))
    avg_loss = float(np.mean(loss_values[1 : period + 1]))
    out[period] = _rsi_value(avg_gain, avg_loss)

    for i in range(period + 1, len(close)):
        avg_gain = (avg_gain * (period - 1) + gain_values[i]) / period
        avg_loss = (avg_loss * (period - 1) + loss_values[i]) / period
        out[i] = _rsi_value(avg_gain, avg_loss)

    return pd.Series(out, index=close.index, dtype="float64")


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    if avg_loss == 0.0:
        return 100.0 if avg_gain > 0.0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))
