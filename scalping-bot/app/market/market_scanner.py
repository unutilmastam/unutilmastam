"""Symbol universe scanner.

Rather than analysing every Binance pair, the bot tracks a bounded set of the
most liquid ones. Selection runs once at start-up and then periodically, so a
pair that dries up is dropped and a newly liquid pair can be picked up.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.binance.rest import BinanceRestClient
from app.binance.symbols import SymbolInfo, parse_exchange_info
from app.config import Settings
from app.market.orderbook import BookTicker
from app.market.volume import TickerStats
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class SymbolCandidate:
    """A symbol that passed (or failed) the liquidity screen."""

    symbol: str
    info: SymbolInfo
    stats: TickerStats
    spread_percent: float | None
    is_priority: bool
    rejected_reason: str = ""

    @property
    def accepted(self) -> bool:
        return not self.rejected_reason

    @property
    def quote_volume(self) -> float:
        return self.stats.quote_volume

    @property
    def display(self) -> str:
        return self.info.display


class MarketScanner:
    """Picks the tradable symbol universe from exchange info + 24h stats."""

    def __init__(self, settings: Settings, client: BinanceRestClient) -> None:
        self.settings = settings
        self.client = client
        self.symbol_info: dict[str, SymbolInfo] = {}
        self.last_candidates: tuple[SymbolCandidate, ...] = ()

    async def refresh_exchange_info(self) -> dict[str, SymbolInfo]:
        payload = await self.client.exchange_info()
        self.symbol_info = parse_exchange_info(payload, self.settings.quote_asset)
        logger.info(
            "Loaded %d %s symbols from exchange info",
            len(self.symbol_info),
            self.settings.quote_asset,
        )
        return self.symbol_info

    async def scan(self) -> tuple[SymbolCandidate, ...]:
        """Evaluate every quote-asset pair against the liquidity filters."""
        if not self.symbol_info:
            await self.refresh_exchange_info()

        tickers = {stats.symbol: stats for stats in await self.client.ticker_24hr()}
        try:
            books = await self.client.all_book_tickers()
        except Exception as exc:  # noqa: BLE001 - spread screen is best effort
            logger.warning("Could not load book tickers for spread filter: %s", exc)
            books = {}

        priority = set(self.settings.priority_symbols)
        blacklist = set(self.settings.blacklist_symbols)
        candidates: list[SymbolCandidate] = []

        for symbol, info in self.symbol_info.items():
            stats = tickers.get(symbol)
            if stats is None:
                continue
            book: BookTicker | None = books.get(symbol)
            spread = book.spread_percent if book else None

            reason = self._reject_reason(info, stats, spread, blacklist)
            candidates.append(
                SymbolCandidate(
                    symbol=symbol,
                    info=info,
                    stats=stats,
                    spread_percent=spread,
                    is_priority=symbol in priority,
                    rejected_reason=reason,
                )
            )

        candidates.sort(key=lambda item: item.quote_volume, reverse=True)
        self.last_candidates = tuple(candidates)
        return self.last_candidates

    def _reject_reason(
        self,
        info: SymbolInfo,
        stats: TickerStats,
        spread: float | None,
        blacklist: set[str],
    ) -> str:
        if info.symbol in blacklist:
            return "blacklisted"
        if not info.is_trading:
            return f"status {info.status}"
        if info.is_leveraged_token:
            return "leveraged token"
        if info.is_stable_pair:
            return "stablecoin pair"
        if stats.quote_volume < self.settings.min_24h_volume:
            return (
                f"24h volume {stats.quote_volume:,.0f} below "
                f"{self.settings.min_24h_volume:,.0f}"
            )
        if spread is not None and spread > self.settings.max_spread_percent:
            return f"spread {spread:.3f}% above {self.settings.max_spread_percent:.3f}%"
        if stats.last_price <= 0:
            return "no price"
        return ""

    async def select_symbols(self) -> list[str]:
        """Final tracked universe: priority pairs first, then by 24h volume."""
        candidates = await self.scan()
        accepted = [item for item in candidates if item.accepted]

        selected: list[str] = []
        by_symbol = {item.symbol: item for item in accepted}

        # Priority symbols keep their configured order and jump the queue,
        # but they still have to pass the liquidity screen.
        for symbol in self.settings.priority_symbols:
            candidate = by_symbol.get(symbol)
            if candidate is not None and symbol not in selected:
                selected.append(symbol)
            elif symbol in self.symbol_info and candidate is None:
                logger.info("Priority symbol %s did not pass the liquidity filter", symbol)

        for candidate in accepted:
            if len(selected) >= self.settings.max_symbols:
                break
            if candidate.symbol not in selected:
                selected.append(candidate.symbol)

        selected = selected[: self.settings.max_symbols]
        logger.info(
            "Scanner selected %d/%d symbols (%d passed filters)",
            len(selected),
            len(candidates),
            len(accepted),
        )
        return selected

    def describe(self, symbol: str) -> str:
        """``BTC/USDT`` style label for a raw symbol."""
        info = self.symbol_info.get(symbol.upper())
        if info is not None:
            return info.display
        from app.binance.symbols import display_symbol

        return display_symbol(symbol, self.settings.quote_asset)
