"""Swing based support and resistance detection.

A swing high needs ``right`` bars to its right before it can be confirmed,
so the last ``right`` bars are intentionally excluded from the search. That
is what stops levels from repainting once new candles arrive.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Levels:
    """Confirmed swing levels, each sorted from newest to oldest."""

    supports: tuple[float, ...] = field(default_factory=tuple)
    resistances: tuple[float, ...] = field(default_factory=tuple)


def swing_levels(
    high: pd.Series,
    low: pd.Series,
    left: int = 2,
    right: int = 2,
    max_levels: int = 6,
) -> Levels:
    """Find confirmed swing highs (resistance) and swing lows (support)."""
    if left < 1 or right < 1:
        raise ValueError("left and right must be >= 1")

    # Work on raw numpy arrays: this runs once per candle per timeframe, and
    # pandas slicing inside the pivot loop dominated the whole strategy.
    highs = np.asarray(high, dtype="float64")
    lows = np.asarray(low, dtype="float64")
    size = len(highs)
    if size < left + right + 1:
        return Levels()

    resistances: list[float] = []
    supports: list[float] = []

    # Walk backwards so the freshest levels come first.
    for i in range(size - right - 1, left - 1, -1):
        start = i - left
        stop = i + right + 1

        if len(resistances) < max_levels:
            pivot_high = highs[i]
            if pivot_high >= highs[start:stop].max():
                resistances.append(float(pivot_high))

        if len(supports) < max_levels:
            pivot_low = lows[i]
            if pivot_low <= lows[start:stop].min():
                supports.append(float(pivot_low))

        if len(resistances) >= max_levels and len(supports) >= max_levels:
            break

    return Levels(supports=tuple(supports), resistances=tuple(resistances))


def nearest_support(levels: Levels, price: float) -> float | None:
    """Closest confirmed support strictly below ``price``."""
    below = [level for level in levels.supports if level < price]
    if not below:
        return None
    return max(below)


def nearest_resistance(levels: Levels, price: float) -> float | None:
    """Closest confirmed resistance strictly above ``price``."""
    above = [level for level in levels.resistances if level > price]
    if not above:
        return None
    return min(above)
