"""Moving Average Convergence Divergence."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.indicators.ema import ema


@dataclass(frozen=True)
class MacdResult:
    """MACD line, signal line and histogram."""

    macd: pd.Series
    signal: pd.Series
    histogram: pd.Series

    @property
    def last(self) -> tuple[float, float, float]:
        """Latest ``(macd, signal, histogram)`` triple as plain floats."""
        return (
            _last(self.macd),
            _last(self.signal),
            _last(self.histogram),
        )

    def is_bullish(self) -> bool:
        """MACD above its signal line with a positive histogram."""
        macd_value, signal_value, hist = self.last
        return macd_value > signal_value and hist > 0

    def is_bearish(self) -> bool:
        """MACD below its signal line with a negative histogram."""
        macd_value, signal_value, hist = self.last
        return macd_value < signal_value and hist < 0

    def histogram_rising(self) -> bool:
        """Histogram larger than on the previous bar (momentum building)."""
        if len(self.histogram) < 2:
            return False
        prev, last = self.histogram.iloc[-2], self.histogram.iloc[-1]
        if pd.isna(prev) or pd.isna(last):
            return False
        return float(last) > float(prev)


def _last(series: pd.Series) -> float:
    if len(series) == 0:
        return 0.0
    value = series.iloc[-1]
    return 0.0 if pd.isna(value) else float(value)


def macd(
    series: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> MacdResult:
    """Standard 12/26/9 MACD."""
    if fast >= slow:
        raise ValueError("fast period must be shorter than slow period")

    close = pd.Series(series, dtype="float64")
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = macd_line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    histogram = macd_line - signal_line
    return MacdResult(macd=macd_line, signal=signal_line, histogram=histogram)
