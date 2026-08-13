"""In-memory market data store shared by every component.

One instance holds the candle buffers, best bid/ask, 24h stats and the most
recent depth snapshot for every tracked symbol. It is intentionally plain
(no locks): the whole bot runs in a single asyncio event loop, so updates and
reads never interleave mid-operation.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings
from app.market.candles import Candle, CandleSeries
from app.market.orderbook import BookTicker, OrderBook
from app.market.volume import TickerStats
from app.utils.helpers import now_ms
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class ClosedCandleEvent:
    """Emitted when a timeframe prints a new closed candle."""

    symbol: str
    interval: str
    candle: Candle


class MarketStore:
    """Central cache of live market state."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.candles: dict[str, dict[str, CandleSeries]] = {}
        self.book_tickers: dict[str, BookTicker] = {}
        self.tickers: dict[str, TickerStats] = {}
        self.depth: dict[str, OrderBook] = {}
        self._symbols: tuple[str, ...] = ()
        self.last_message_ms: int = 0

    # ------------------------------------------------------------------
    # Symbol universe
    # ------------------------------------------------------------------
    @property
    def symbols(self) -> tuple[str, ...]:
        return self._symbols

    def set_symbols(self, symbols: list[str] | tuple[str, ...]) -> None:
        """Install the tracked universe, keeping buffers of retained symbols."""
        upper = tuple(dict.fromkeys(symbol.upper() for symbol in symbols))
        self._symbols = upper

        for symbol in upper:
            timeframes = self.candles.setdefault(symbol, {})
            for interval in self.settings.timeframes:
                if interval not in timeframes:
                    timeframes[interval] = CandleSeries(
                        symbol, interval, maxlen=self.settings.candle_history
                    )

        # Drop state for symbols that fell out of the universe.
        for symbol in list(self.candles):
            if symbol not in upper:
                self.candles.pop(symbol, None)
                self.book_tickers.pop(symbol, None)
                self.depth.pop(symbol, None)

    def series(self, symbol: str, interval: str) -> CandleSeries | None:
        return self.candles.get(symbol.upper(), {}).get(interval)

    def ensure_series(self, symbol: str, interval: str) -> CandleSeries:
        """Return the buffer for ``symbol``/``interval``, creating it if new."""
        symbol = symbol.upper()
        timeframes = self.candles.setdefault(symbol, {})
        if interval not in timeframes:
            timeframes[interval] = CandleSeries(
                symbol, interval, maxlen=self.settings.candle_history
            )
        return timeframes[interval]

    # ------------------------------------------------------------------
    # Updates
    # ------------------------------------------------------------------
    def update_kline(
        self,
        symbol: str,
        interval: str,
        candle: Candle,
        is_closed: bool,
    ) -> ClosedCandleEvent | None:
        """Apply a kline update; return an event when a candle just closed."""
        self.last_message_ms = now_ms()
        series = self.ensure_series(symbol, interval)
        if not is_closed:
            series.set_live(candle)
            return None

        added = series.add_closed(candle)
        series.set_live(None)
        if not added:
            return None
        return ClosedCandleEvent(symbol=symbol.upper(), interval=interval, candle=candle)

    def update_book_ticker(self, ticker: BookTicker) -> None:
        self.last_message_ms = now_ms()
        self.book_tickers[ticker.symbol] = ticker

    def update_ticker(self, ticker: TickerStats) -> None:
        self.last_message_ms = now_ms()
        self.tickers[ticker.symbol] = ticker

    def update_depth(self, book: OrderBook) -> None:
        self.depth[book.symbol] = book

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------
    def price(self, symbol: str) -> float:
        """Best available current price for ``symbol``."""
        symbol = symbol.upper()
        book = self.book_tickers.get(symbol)
        if book and book.mid_price > 0:
            return book.mid_price
        series = self.series(symbol, self.settings.timeframes[0])
        if series:
            return series.last_price
        ticker = self.tickers.get(symbol)
        return ticker.last_price if ticker else 0.0

    def spread_percent(self, symbol: str) -> float | None:
        book = self.book_tickers.get(symbol.upper())
        return book.spread_percent if book else None

    def data_age_seconds(self, symbol: str) -> float:
        """Seconds since the newest 1m candle for ``symbol`` closed."""
        series = self.series(symbol, self.settings.timeframes[0])
        if series is None or series.last_closed is None:
            return float("inf")
        return max(0.0, (now_ms() - series.last_close_time) / 1000.0)

    def is_stale(self, symbol: str, max_age_seconds: int | None = None) -> bool:
        limit = (
            max_age_seconds
            if max_age_seconds is not None
            else self.settings.max_data_age_seconds
        )
        return self.data_age_seconds(symbol) > limit

    def is_ready(self, symbol: str, minimum: dict[str, int] | None = None) -> bool:
        """True when every timeframe has enough closed candles to analyse."""
        symbol = symbol.upper()
        timeframes = self.candles.get(symbol)
        if not timeframes:
            return False
        for interval in self.settings.timeframes:
            series = timeframes.get(interval)
            required = (minimum or {}).get(interval, 60)
            if series is None or not series.ready(required):
                return False
        return True

    def status(self) -> dict:
        """Compact health summary used by ``/status`` and the dashboard API."""
        ready = [symbol for symbol in self._symbols if self.is_ready(symbol)]
        stale = [symbol for symbol in self._symbols if self.is_stale(symbol)]
        return {
            "symbols_tracked": len(self._symbols),
            "symbols_ready": len(ready),
            "symbols_stale": len(stale),
            "stale_symbols": stale[:10],
            "book_tickers": len(self.book_tickers),
            "last_message_ms": self.last_message_ms,
            "last_message_age_seconds": (
                (now_ms() - self.last_message_ms) / 1000.0 if self.last_message_ms else None
            ),
        }
