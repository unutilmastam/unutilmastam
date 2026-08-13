"""Exchange symbol metadata and trading rules."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.utils.helpers import safe_float

# Leveraged tokens (BTCUP/BTCDOWN/…) behave nothing like spot pairs.
_LEVERAGED_RE = re.compile(r"(UP|DOWN|BULL|BEAR)$")

# Stable-to-stable pairs have no scalping range worth trading.
STABLECOINS = {
    "USDT",
    "USDC",
    "BUSD",
    "TUSD",
    "FDUSD",
    "DAI",
    "USDP",
    "EUR",
    "GBP",
    "TRY",
    "BRL",
    "AEUR",
}


@dataclass(frozen=True)
class SymbolInfo:
    """Trading rules for one spot symbol."""

    symbol: str
    base_asset: str
    quote_asset: str
    status: str
    tick_size: float = 0.0
    step_size: float = 0.0
    min_notional: float = 0.0
    is_spot_trading_allowed: bool = True

    @property
    def is_trading(self) -> bool:
        return self.status.upper() == "TRADING" and self.is_spot_trading_allowed

    @property
    def is_leveraged_token(self) -> bool:
        return bool(_LEVERAGED_RE.search(self.base_asset))

    @property
    def is_stable_pair(self) -> bool:
        return self.base_asset in STABLECOINS

    @property
    def display(self) -> str:
        """``BTCUSDT`` rendered as ``BTC/USDT``."""
        return f"{self.base_asset}/{self.quote_asset}"

    @classmethod
    def from_payload(cls, payload: dict) -> "SymbolInfo":
        filters = {item.get("filterType"): item for item in payload.get("filters", [])}
        price_filter = filters.get("PRICE_FILTER", {})
        lot_filter = filters.get("LOT_SIZE", {})
        notional = filters.get("NOTIONAL") or filters.get("MIN_NOTIONAL") or {}

        return cls(
            symbol=str(payload["symbol"]).upper(),
            base_asset=str(payload.get("baseAsset", "")).upper(),
            quote_asset=str(payload.get("quoteAsset", "")).upper(),
            status=str(payload.get("status", "")),
            tick_size=safe_float(price_filter.get("tickSize")),
            step_size=safe_float(lot_filter.get("stepSize")),
            min_notional=safe_float(
                notional.get("minNotional") or notional.get("notional")
            ),
            is_spot_trading_allowed=bool(payload.get("isSpotTradingAllowed", True)),
        )


def display_symbol(symbol: str, quote_asset: str = "USDT") -> str:
    """Format a raw symbol as ``BASE/QUOTE`` without needing exchange info."""
    symbol = symbol.upper()
    if symbol.endswith(quote_asset) and len(symbol) > len(quote_asset):
        return f"{symbol[: -len(quote_asset)]}/{quote_asset}"
    return symbol


def parse_exchange_info(payload: dict, quote_asset: str = "USDT") -> dict[str, SymbolInfo]:
    """Build a ``{symbol: SymbolInfo}`` map for one quote asset."""
    result: dict[str, SymbolInfo] = {}
    for item in payload.get("symbols", []):
        try:
            info = SymbolInfo.from_payload(item)
        except (KeyError, TypeError, ValueError):
            continue
        if quote_asset and info.quote_asset != quote_asset.upper():
            continue
        result[info.symbol] = info
    return result
