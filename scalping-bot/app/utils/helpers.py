"""Small pure helpers shared across the code base."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Iterable, Sequence

from app.config import INTERVAL_MS


def now_ms() -> int:
    """Current UTC time in milliseconds."""
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


def to_datetime(ms: int) -> datetime:
    """Convert an epoch-milliseconds value to an aware UTC datetime."""
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def interval_ms(interval: str) -> int:
    """Duration of one candle of ``interval`` in milliseconds."""
    try:
        return INTERVAL_MS[interval]
    except KeyError as exc:  # pragma: no cover - guarded by config
        raise ValueError(f"Unsupported interval: {interval}") from exc


def candle_open_time(timestamp_ms: int, interval: str) -> int:
    """Open time of the candle that contains ``timestamp_ms``."""
    step = interval_ms(interval)
    return timestamp_ms - (timestamp_ms % step)


def safe_float(value: object, default: float = 0.0) -> float:
    """Best effort float conversion that never raises."""
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    if math.isnan(result) or math.isinf(result):
        return default
    return result


def percent_change(start: float, end: float) -> float:
    """Percent change from ``start`` to ``end``; 0 when ``start`` is falsy."""
    if not start:
        return 0.0
    return (end - start) / start * 100.0


def decimals_for(value: float) -> int:
    """Pick a sensible number of decimals for displaying a price."""
    value = abs(value)
    if value >= 1000:
        return 2
    if value >= 100:
        return 2
    if value >= 1:
        return 4
    if value >= 0.01:
        return 5
    if value >= 0.0001:
        return 6
    return 8


def format_price(value: float, decimals: int | None = None) -> str:
    """Human readable price with a trailing-zero trim."""
    if value is None:  # pragma: no cover - defensive
        return "-"
    digits = decimals_for(value) if decimals is None else decimals
    text = f"{value:,.{digits}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def round_to_step(value: float, step: float) -> float:
    """Round ``value`` down to a multiple of ``step`` (Binance LOT_SIZE style)."""
    if step <= 0:
        return value
    return math.floor(value / step) * step


def chunked(items: Sequence[str], size: int) -> Iterable[list[str]]:
    """Yield ``items`` in lists of at most ``size`` elements."""
    if size <= 0:
        raise ValueError("size must be positive")
    for index in range(0, len(items), size):
        yield list(items[index : index + size])


def clamp(value: float, low: float, high: float) -> float:
    """Constrain ``value`` to the ``[low, high]`` range."""
    return max(low, min(high, value))


def humanize_duration(seconds: float) -> str:
    """Format a duration such as ``2h 5m``."""
    seconds = int(max(0, seconds))
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m {secs}s"
    return f"{secs}s"
