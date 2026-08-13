"""24h ticker statistics used for liquidity filtering."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.utils.helpers import now_ms, safe_float


@dataclass(frozen=True)
class TickerStats:
    """A ``/api/v3/ticker/24hr`` row (or its ``!ticker@arr`` stream twin)."""

    symbol: str
    last_price: float
    price_change_percent: float
    quote_volume: float
    base_volume: float
    high: float
    low: float
    trades: int = 0
    timestamp: int = field(default_factory=now_ms)

    @classmethod
    def from_rest(cls, payload: dict) -> "TickerStats":
        return cls(
            symbol=str(payload["symbol"]).upper(),
            last_price=safe_float(payload.get("lastPrice")),
            price_change_percent=safe_float(payload.get("priceChangePercent")),
            quote_volume=safe_float(payload.get("quoteVolume")),
            base_volume=safe_float(payload.get("volume")),
            high=safe_float(payload.get("highPrice")),
            low=safe_float(payload.get("lowPrice")),
            trades=int(safe_float(payload.get("count"))),
        )

    @classmethod
    def from_ws(cls, payload: dict) -> "TickerStats":
        """Parse one element of the ``!ticker@arr`` stream."""
        return cls(
            symbol=str(payload["s"]).upper(),
            last_price=safe_float(payload.get("c")),
            price_change_percent=safe_float(payload.get("P")),
            quote_volume=safe_float(payload.get("q")),
            base_volume=safe_float(payload.get("v")),
            high=safe_float(payload.get("h")),
            low=safe_float(payload.get("l")),
            trades=int(safe_float(payload.get("n"))),
            timestamp=int(payload.get("E", now_ms())),
        )

    @property
    def daily_range_percent(self) -> float:
        """High-to-low range as a percentage of the low."""
        if self.low <= 0:
            return 0.0
        return (self.high - self.low) / self.low * 100.0

    def age_seconds(self, reference_ms: int | None = None) -> float:
        reference = reference_ms if reference_ms is not None else now_ms()
        return max(0.0, (reference - self.timestamp) / 1000.0)
