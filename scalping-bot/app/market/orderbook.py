"""Order book structures: best bid/ask stream plus depth snapshots."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

from app.utils.helpers import now_ms, safe_float


@dataclass(frozen=True)
class BookTicker:
    """Top of book, fed by the ``@bookTicker`` websocket stream."""

    symbol: str
    bid_price: float
    bid_qty: float
    ask_price: float
    ask_qty: float
    timestamp: int = field(default_factory=now_ms)

    @property
    def mid_price(self) -> float:
        if self.bid_price <= 0 or self.ask_price <= 0:
            return 0.0
        return (self.bid_price + self.ask_price) / 2.0

    @property
    def spread(self) -> float:
        return max(0.0, self.ask_price - self.bid_price)

    @property
    def spread_percent(self) -> float:
        mid = self.mid_price
        if mid <= 0:
            return 0.0
        return self.spread / mid * 100.0

    def age_seconds(self, reference_ms: int | None = None) -> float:
        reference = reference_ms if reference_ms is not None else now_ms()
        return max(0.0, (reference - self.timestamp) / 1000.0)

    @classmethod
    def from_payload(cls, payload: dict) -> "BookTicker":
        """Parse a ``bookTicker`` websocket or REST payload."""
        return cls(
            symbol=str(payload["s"]).upper(),
            bid_price=safe_float(payload.get("b")),
            bid_qty=safe_float(payload.get("B")),
            ask_price=safe_float(payload.get("a")),
            ask_qty=safe_float(payload.get("A")),
        )


@dataclass(frozen=True)
class OrderBook:
    """A depth snapshot taken from ``/api/v3/depth``."""

    symbol: str
    bids: tuple[tuple[float, float], ...]
    asks: tuple[tuple[float, float], ...]
    timestamp: int = field(default_factory=now_ms)

    @classmethod
    def from_payload(cls, symbol: str, payload: dict) -> "OrderBook":
        return cls(
            symbol=symbol.upper(),
            bids=_parse_levels(payload.get("bids", [])),
            asks=_parse_levels(payload.get("asks", [])),
        )

    @property
    def best_bid(self) -> float:
        return self.bids[0][0] if self.bids else 0.0

    @property
    def best_ask(self) -> float:
        return self.asks[0][0] if self.asks else 0.0

    @property
    def spread_percent(self) -> float:
        bid, ask = self.best_bid, self.best_ask
        if bid <= 0 or ask <= 0:
            return 0.0
        mid = (bid + ask) / 2.0
        return (ask - bid) / mid * 100.0

    def bid_volume(self, depth: int = 20) -> float:
        """Quote-denominated bid volume over the first ``depth`` levels."""
        return sum(price * qty for price, qty in self.bids[:depth])

    def ask_volume(self, depth: int = 20) -> float:
        """Quote-denominated ask volume over the first ``depth`` levels."""
        return sum(price * qty for price, qty in self.asks[:depth])

    def imbalance(self, depth: int = 20) -> float:
        """Ratio of bid to ask volume. ``> 1`` means buyers dominate.

        Returns ``0.0`` when the book is empty so callers can treat it as
        "no information" rather than as bearish.
        """
        asks = self.ask_volume(depth)
        bids = self.bid_volume(depth)
        if asks <= 0 or bids <= 0:
            return 0.0
        return bids / asks

    def age_seconds(self, reference_ms: int | None = None) -> float:
        reference = reference_ms if reference_ms is not None else now_ms()
        return max(0.0, (reference - self.timestamp) / 1000.0)


def _parse_levels(levels: Sequence[Sequence[object]]) -> tuple[tuple[float, float], ...]:
    parsed: list[tuple[float, float]] = []
    for level in levels:
        if len(level) < 2:
            continue
        price = safe_float(level[0])
        qty = safe_float(level[1])
        if price > 0 and qty > 0:
            parsed.append((price, qty))
    return tuple(parsed)
