"""Deterministic synthetic market used by the offline mock exchange.

The price path is an uptrend with regular shallow pullbacks, which is exactly
the shape the scalping strategy is built for: the higher timeframes stay
bullish while the 1m chart keeps producing fresh EMA crossovers to enter on.

Everything is a pure function of the candle index, so the REST history and
the websocket stream always agree and every run is reproducible.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.market.candles import Candle
from app.utils.helpers import interval_ms

# Base prices per symbol, roughly in line with real market magnitudes.
BASE_PRICES: dict[str, float] = {
    "BTCUSDT": 112_500.0,
    "ETHUSDT": 4_150.0,
    "SOLUSDT": 235.0,
    "BNBUSDT": 890.0,
    "XRPUSDT": 2.45,
    "DOGEUSDT": 0.38,
    "ADAUSDT": 1.05,
    "AVAXUSDT": 48.5,
    "LINKUSDT": 27.4,
    "DOTUSDT": 9.8,
    "MATICUSDT": 0.72,
    "ATOMUSDT": 8.4,
}


@dataclass(frozen=True)
class PathParams:
    """Shape of the synthetic 1m price path."""

    # Steady drift keeps 15m/5m/3m bullish, while a sharp sawtooth pullback
    # every `dip_period` candles cools 1m RSI and pulls EMA9 back toward
    # EMA21 - which is what creates a fresh, tradeable 1m entry. A pullback
    # this short is smoothed away by 3m/5m, so the higher timeframes keep
    # their structure.
    drift: float = 0.00020        # per-candle trend
    swing_amplitude: float = 0.0008   # gentle waviness on top of the sawtooth
    swing_period: float = 47.0
    macro_amplitude: float = 0.008    # slow cycle so the trend is not a ramp
    macro_period: float = 620.0
    noise: float = 0.00030
    wick_factor: float = 0.30     # ordinary candle wicks; drives ATR

    dip_period: int = 23          # candles between pullbacks
    dip_length: int = 6           # candles spent falling
    dip_depth: float = 0.0055     # how far the pullback retraces


DEFAULT_PARAMS = PathParams()


def _hash01(value: int) -> float:
    """Cheap deterministic pseudo-random number in [0, 1)."""
    value = (value ^ 61) ^ (value >> 16)
    value = (value + (value << 3)) & 0xFFFFFFFF
    value ^= value >> 4
    value = (value * 0x27D4EB2D) & 0xFFFFFFFF
    value ^= value >> 15
    return (value & 0xFFFFFF) / 0xFFFFFF


def pullback(index: int, params: PathParams = DEFAULT_PARAMS) -> float:
    """Sawtooth retracement: a sharp dip, then an equally brisk recovery.

    The recovery is deliberately as fast as the dip. A slow grind back would
    leave every entry sitting under the pre-dip high, and the risk manager
    would (correctly) reject those setups for having no room to a target.
    """
    phase = index % params.dip_period
    if phase < params.dip_length:
        return -params.dip_depth * (phase + 1) / params.dip_length

    recovered = (phase - params.dip_length + 1) / params.dip_length
    if recovered >= 1.0:
        return 0.0
    return -params.dip_depth * (1.0 - recovered)


def close_price(
    base: float,
    index: int,
    params: PathParams = DEFAULT_PARAMS,
    anchor: int = 0,
) -> float:
    """Close of the 1m candle at ``index``.

    The trend compounds and every oscillation is applied as a *percentage* of
    the trend level. An additive path would silently shrink the pullbacks as
    the trend accumulated - a 0.55% dip on the starting price is only 0.25%
    once price has doubled - which would flatten RSI and stop the 1m entry
    trigger from ever firing late in a long run.

    ``anchor`` is the index that sits at ``base``, so a caller with a long
    warm-up history can keep present-day prices realistic.
    """
    level = base * math.exp(params.drift * (index - anchor))
    swing = params.swing_amplitude * math.sin(2 * math.pi * index / params.swing_period)
    macro = params.macro_amplitude * math.sin(2 * math.pi * index / params.macro_period)
    jitter = params.noise * (_hash01(index) - 0.5) * 2
    return level * (1.0 + swing + macro + jitter + pullback(index, params))


def volume_at(index: int, params: PathParams = DEFAULT_PARAMS) -> float:
    """Volume expands on the candles that turn the pullback around.

    The burst is narrow on purpose: a smooth volume cycle would lift its own
    20-bar average too, and the strategy compares volume against exactly that
    baseline.
    """
    phase = index % params.dip_period
    turn = phase - params.dip_length
    # Elevated across the whole first half of the recovery, where the entry
    # trigger actually prints - not just on the single turning candle.
    burst = 2.6 if 2 <= turn <= 6 else (1.2 if turn in (0, 1, 7) else 0.0)
    base = 600.0 * (1.0 + burst)
    return base * (0.9 + 0.2 * _hash01(index * 7 + 3))


def one_minute_ohlc(
    base: float,
    index: int,
    params: PathParams = DEFAULT_PARAMS,
    anchor: int = 0,
) -> tuple[float, float, float, float, float]:
    """``(open, high, low, close, volume)`` of a single 1m candle."""
    close = close_price(base, index, params, anchor)
    opening = close_price(base, index - 1, params, anchor) if index else close

    high = max(opening, close)
    low = min(opening, close)
    wick = (high - low) * params.wick_factor + base * 0.00005
    high += wick * _hash01(index * 3 + 1)
    low -= wick * _hash01(index * 3 + 2)

    if index % params.dip_period == params.dip_length:
        # The turn candle: price wicks into the low of the pullback and closes
        # back near its high, leaving the long lower wick the entry rule wants.
        low = min(low, close_price(base, index - 1, params, anchor) * (1.0 - 0.0004))
        opening = min(opening, close - (close - low) * 0.15)
        high = max(high, close)

    return opening, high, low, close, volume_at(index, params)


def candle_at(
    symbol: str,
    index: int,
    interval: str = "1m",
    params: PathParams = DEFAULT_PARAMS,
    anchor: int = 0,
) -> Candle:
    """Build the candle at ``index`` for ``interval``.

    Higher timeframes aggregate the very same 1m candles, so a 5m candle is
    always exactly consistent with the five 1m candles inside it.
    """
    base = BASE_PRICES.get(symbol.upper(), 100.0)
    factor = interval_ms(interval) // interval_ms("1m")
    first = index * factor

    parts = [
        one_minute_ohlc(base, first + offset, params, anchor) for offset in range(factor)
    ]
    close = parts[-1][3]
    volume = sum(part[4] for part in parts)

    return Candle(
        open_time=0,   # filled in by the caller, which owns the clock
        open=round(parts[0][0], 8),
        high=round(max(part[1] for part in parts), 8),
        low=round(min(part[2] for part in parts), 8),
        close=round(close, 8),
        volume=round(volume, 4),
        close_time=0,
        quote_volume=round(volume * close, 4),
        trades=int(120 + 80 * _hash01(first)),
    )


def timed_candle(
    symbol: str,
    index: int,
    interval: str,
    epoch_ms: int,
    params: PathParams = DEFAULT_PARAMS,
    anchor: int = 0,
) -> Candle:
    """A candle stamped onto a real timeline starting at ``epoch_ms``."""
    step = interval_ms(interval)
    candle = candle_at(symbol, index, interval, params, anchor)
    open_time = epoch_ms + index * step
    return Candle(
        open_time=open_time,
        open=candle.open,
        high=candle.high,
        low=candle.low,
        close=candle.close,
        volume=candle.volume,
        close_time=open_time + step - 1,
        quote_volume=candle.quote_volume,
        trades=candle.trades,
    )


def series(
    symbol: str,
    interval: str,
    count: int,
    epoch_ms: int,
    end_index: int,
    params: PathParams = DEFAULT_PARAMS,
) -> list[Candle]:
    """``count`` candles of ``interval`` ending at ``end_index`` (inclusive)."""
    start_index = max(0, end_index - count + 1)
    return [
        timed_candle(symbol, index, interval, epoch_ms, params)
        for index in range(start_index, end_index + 1)
    ]
