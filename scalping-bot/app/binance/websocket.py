"""Binance Spot websocket streams with automatic reconnection.

Streams are spread across a small number of *combined* connections so that
30-50 symbols cost a handful of sockets rather than one socket per symbol.
Each connection reconnects on its own with exponential backoff and is forced
to reconnect when it goes quiet for too long.
"""

from __future__ import annotations

import asyncio
import json
import random
from typing import Awaitable, Callable, Iterable, Sequence

import websockets
from websockets.exceptions import ConnectionClosed, InvalidStatus

from app.config import Settings
from app.market.candles import Candle
from app.market.orderbook import BookTicker
from app.market.store import ClosedCandleEvent, MarketStore
from app.market.volume import TickerStats
from app.utils.helpers import chunked
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Binance accepts up to 1024 streams per connection; staying well below that
# keeps each socket's message rate reasonable.
MAX_STREAMS_PER_CONNECTION = 180

# Force a reconnect when a socket produces nothing for this long.
IDLE_TIMEOUT_SECONDS = 120.0

ClosedCandleCallback = Callable[[ClosedCandleEvent], Awaitable[None]]


class StreamConnection:
    """One combined-stream websocket connection with a reconnect loop."""

    def __init__(
        self,
        name: str,
        url: str,
        streams: Sequence[str],
        on_payload: Callable[[dict], None],
    ) -> None:
        self.name = name
        self.url = url
        self.streams = list(streams)
        self.on_payload = on_payload
        self.connected = False
        self.reconnects = 0
        self.messages = 0
        self._task: asyncio.Task | None = None
        self._stopping = False

    @property
    def endpoint(self) -> str:
        joined = "/".join(self.streams)
        return f"{self.url}/stream?streams={joined}"

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stopping = False
            self._task = asyncio.create_task(self._run(), name=f"ws-{self.name}")

    async def stop(self) -> None:
        self._stopping = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._task = None
        self.connected = False

    async def _run(self) -> None:
        backoff = 1.0
        while not self._stopping:
            try:
                async with websockets.connect(
                    self.endpoint,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=5,
                    max_queue=2048,
                ) as socket:
                    self.connected = True
                    backoff = 1.0
                    logger.info(
                        "[%s] websocket connected (%d streams)", self.name, len(self.streams)
                    )
                    await self._consume(socket)

            except asyncio.CancelledError:
                raise
            except (ConnectionClosed, OSError, InvalidStatus) as exc:
                logger.warning("[%s] websocket closed: %s", self.name, exc)
            except Exception as exc:  # noqa: BLE001 - the loop must never die
                logger.exception("[%s] unexpected websocket error: %s", self.name, exc)

            self.connected = False
            if self._stopping:
                break

            self.reconnects += 1
            # Exponential backoff with jitter, capped at one minute.
            sleep_for = min(backoff, 60.0) * (1.0 + random.random() * 0.25)
            logger.info("[%s] reconnecting in %.1fs", self.name, sleep_for)
            await asyncio.sleep(sleep_for)
            backoff = min(backoff * 2, 60.0)

    async def _consume(self, socket) -> None:
        while not self._stopping:
            try:
                raw = await asyncio.wait_for(socket.recv(), timeout=IDLE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                logger.warning(
                    "[%s] no data for %.0fs, forcing reconnect", self.name, IDLE_TIMEOUT_SECONDS
                )
                await socket.close()
                return

            self.messages += 1
            try:
                payload = json.loads(raw)
            except (TypeError, ValueError):
                logger.debug("[%s] dropping malformed frame", self.name)
                continue

            try:
                self.on_payload(payload)
            except Exception as exc:  # noqa: BLE001 - one bad frame must not kill the socket
                logger.exception("[%s] handler error: %s", self.name, exc)


class BinanceStreamManager:
    """Builds, owns and dispatches all market data streams."""

    def __init__(
        self,
        settings: Settings,
        store: MarketStore,
        on_closed_candle: ClosedCandleCallback | None = None,
    ) -> None:
        self.settings = settings
        self.store = store
        self.on_closed_candle = on_closed_candle
        self.connections: list[StreamConnection] = []
        self._symbols: tuple[str, ...] = ()
        self._queue: asyncio.Queue[ClosedCandleEvent] = asyncio.Queue(maxsize=10_000)
        self._worker: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def build_streams(self, symbols: Iterable[str]) -> list[str]:
        """Stream names for the kline timeframes plus the best bid/ask feed."""
        streams: list[str] = []
        for symbol in symbols:
            lower = symbol.lower()
            for interval in self.settings.timeframes:
                streams.append(f"{lower}@kline_{interval}")
            streams.append(f"{lower}@bookTicker")
        return streams

    async def start(self, symbols: Sequence[str]) -> None:
        """Open connections for ``symbols`` (replacing any existing ones)."""
        await self.stop_connections()

        self._symbols = tuple(symbol.upper() for symbol in symbols)
        if not self._symbols:
            logger.warning("No symbols to subscribe to")
            return

        streams = self.build_streams(self._symbols)
        for index, chunk in enumerate(chunked(streams, MAX_STREAMS_PER_CONNECTION), start=1):
            connection = StreamConnection(
                name=f"md-{index}",
                url=self.settings.binance_ws_url,
                streams=chunk,
                on_payload=self._dispatch,
            )
            connection.start()
            self.connections.append(connection)

        # The all-market ticker feed is a single stream that covers every
        # symbol at once - far cheaper than one 24h ticker per symbol.
        ticker_connection = StreamConnection(
            name="ticker",
            url=self.settings.binance_ws_url,
            streams=["!ticker@arr"],
            on_payload=self._dispatch,
        )
        ticker_connection.start()
        self.connections.append(ticker_connection)

        if self._worker is None or self._worker.done():
            self._worker = asyncio.create_task(self._drain_queue(), name="candle-worker")

        logger.info(
            "Subscribed to %d symbols over %d websocket connections",
            len(self._symbols),
            len(self.connections),
        )

    async def stop_connections(self) -> None:
        for connection in self.connections:
            await connection.stop()
        self.connections = []

    async def stop(self) -> None:
        await self.stop_connections()
        if self._worker is not None:
            self._worker.cancel()
            try:
                await self._worker
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._worker = None

    async def resubscribe(self, symbols: Sequence[str]) -> None:
        """Restart the feeds when the symbol universe changes."""
        new_symbols = tuple(symbol.upper() for symbol in symbols)
        if new_symbols == self._symbols:
            return
        logger.info("Symbol universe changed, resubscribing")
        await self.start(new_symbols)

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------
    def _dispatch(self, payload: dict) -> None:
        """Route one combined-stream frame to the right handler."""
        data = payload.get("data", payload)
        stream = str(payload.get("stream", ""))

        if isinstance(data, list):
            self._handle_ticker_array(data)
            return
        if not isinstance(data, dict):
            return

        event_type = data.get("e")
        if event_type == "kline":
            self._handle_kline(data)
        elif event_type == "24hrTicker":
            self._handle_ticker(data)
        elif "@bookticker" in stream.lower() or ("b" in data and "a" in data and "s" in data):
            self._handle_book_ticker(data)

    def _handle_kline(self, data: dict) -> None:
        kline = data.get("k")
        if not isinstance(kline, dict):
            return
        symbol = str(kline.get("s") or data.get("s", "")).upper()
        interval = str(kline.get("i", ""))
        if not symbol or interval not in self.settings.timeframes:
            return

        try:
            candle, is_closed = Candle.from_ws(kline)
        except (KeyError, TypeError, ValueError):
            logger.debug("Malformed kline payload for %s %s", symbol, interval)
            return

        event = self.store.update_kline(symbol, interval, candle, is_closed)
        if event is not None:
            try:
                self._queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("Closed-candle queue is full, dropping %s %s", symbol, interval)

    def _handle_book_ticker(self, data: dict) -> None:
        try:
            self.store.update_book_ticker(BookTicker.from_payload(data))
        except (KeyError, TypeError, ValueError):
            logger.debug("Malformed bookTicker payload")

    def _handle_ticker(self, data: dict) -> None:
        try:
            self.store.update_ticker(TickerStats.from_ws(data))
        except (KeyError, TypeError, ValueError):
            logger.debug("Malformed ticker payload")

    def _handle_ticker_array(self, rows: list) -> None:
        tracked = set(self._symbols)
        for row in rows:
            if not isinstance(row, dict):
                continue
            symbol = str(row.get("s", "")).upper()
            # The all-market feed carries ~2500 symbols; keep only ours plus
            # anything the scanner might promote later (USDT pairs).
            if tracked and symbol not in tracked:
                if not symbol.endswith(self.settings.quote_asset):
                    continue
            try:
                self.store.update_ticker(TickerStats.from_ws(row))
            except (KeyError, TypeError, ValueError):
                continue

    async def _drain_queue(self) -> None:
        """Serialise closed-candle callbacks so analysis never runs twice."""
        while True:
            event = await self._queue.get()
            try:
                if self.on_closed_candle is not None:
                    await self.on_closed_candle(event)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the worker alive
                logger.exception(
                    "Error handling closed candle %s %s: %s", event.symbol, event.interval, exc
                )
            finally:
                self._queue.task_done()

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------
    @property
    def is_connected(self) -> bool:
        return any(connection.connected for connection in self.connections)

    def status(self) -> dict:
        return {
            "connections": len(self.connections),
            "connected": sum(1 for item in self.connections if item.connected),
            "reconnects": sum(item.reconnects for item in self.connections),
            "messages": sum(item.messages for item in self.connections),
            "queue_size": self._queue.qsize(),
        }
