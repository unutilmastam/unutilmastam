"""Technical indicators.

Every indicator here is *causal*: the value at index ``i`` is derived only
from data at indices ``<= i``. That property is what keeps the backtester
free of look-ahead bias and keeps live signals from repainting.
"""

from app.indicators.atr import atr, atr_percent, true_range
from app.indicators.ema import ema, ema_cross_up, ema_cross_down
from app.indicators.macd import MacdResult, macd
from app.indicators.rsi import rsi
from app.indicators.support_resistance import (
    Levels,
    nearest_resistance,
    nearest_support,
    swing_levels,
)
from app.indicators.volume import average_volume, volume_ratio
from app.indicators.vwap import vwap

__all__ = [
    "atr",
    "atr_percent",
    "true_range",
    "ema",
    "ema_cross_up",
    "ema_cross_down",
    "macd",
    "MacdResult",
    "rsi",
    "Levels",
    "swing_levels",
    "nearest_support",
    "nearest_resistance",
    "average_volume",
    "volume_ratio",
    "vwap",
]
