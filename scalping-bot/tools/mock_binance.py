"""A local, Binance-compatible mock exchange for offline testing.

It speaks enough of the Binance Spot API for the bot to run end to end with
no internet access and no API keys:

* ``/api/v3/ping`` ``/time`` ``/exchangeInfo`` ``/ticker/24hr``
  ``/ticker/bookTicker`` ``/klines`` ``/depth``
* a combined websocket stream at ``/stream?streams=...`` that pushes kline
  and bookTicker frames

Candles come from :mod:`tools.market_sim`, so REST history and the live
stream are always consistent.

Run it::

    python -m tools.mock_binance --speed 30

then point the bot at it::

    BINANCE_REST_URL=http://127.0.0.1:8100 \
    BINANCE_WS_URL=ws://127.0.0.1:8101 python run.py

``--speed`` compresses time: at 30, one 1m candle closes every 2 seconds, so
a few minutes of running covers hours of market action.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from urllib.parse import parse_qs, urlparse

import uvicorn
import websockets
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse

from app.config import INTERVAL_MS
from app.utils.helpers import interval_ms
from app.utils.logger import get_logger, setup_logging
from tools.market_sim import BASE_PRICES, PathParams, timed_candle

logger = get_logger("mock-binance")

SYMBOLS = list(BASE_PRICES)
INTERVALS = ("1m", "3m", "5m", "15m")

# The synthetic timeline starts this many 1m candles before "now" so the
# bot's warm-up request always finds a deep history.
HISTORY_CANDLES = 6000

# Candles replayed to a new stream client, to cover the warm-up gap.
BACKFILL_CANDLES = 120


class Clock:
    """Maps real elapsed time onto an accelerated synthetic timeline."""

    def __init__(self, speed: float = 30.0) -> None:
        self.speed = max(1.0, speed)
        self.started_at = time.time()
        # Anchor so that candle index HISTORY_CANDLES closes right about now.
        self.epoch_ms = int(self.started_at * 1000) - HISTORY_CANDLES * INTERVAL_MS["1m"]

    def elapsed_ms(self) -> int:
        return int((time.time() - self.started_at) * 1000 * self.speed)

    def now_ms(self) -> int:
        """Current time on the synthetic timeline."""
        return self.epoch_ms + HISTORY_CANDLES * INTERVAL_MS["1m"] + self.elapsed_ms()

    def last_closed_index(self, interval: str) -> int:
        """Index of the newest fully closed candle of ``interval``."""
        step = interval_ms(interval)
        return max(0, (self.now_ms() - self.epoch_ms) // step - 1)


def build_app(clock: Clock, params: PathParams) -> FastAPI:
    api = FastAPI(title="Mock Binance Spot", docs_url=None, redoc_url=None)

    @api.get("/api/v3/ping")
    async def ping() -> dict:
        return {}

    @api.get("/api/v3/time")
    async def server_time() -> dict:
        return {"serverTime": clock.now_ms()}

    @api.get("/api/v3/exchangeInfo")
    async def exchange_info() -> dict:
        return {
            "timezone": "UTC",
            "serverTime": clock.now_ms(),
            "symbols": [
                {
                    "symbol": symbol,
                    "status": "TRADING",
                    "baseAsset": symbol[:-4],
                    "quoteAsset": "USDT",
                    "isSpotTradingAllowed": True,
                    "filters": [
                        {"filterType": "PRICE_FILTER", "tickSize": "0.01000000"},
                        {"filterType": "LOT_SIZE", "stepSize": "0.00001000"},
                        {"filterType": "NOTIONAL", "minNotional": "10.00000000"},
                    ],
                }
                for symbol in SYMBOLS
            ],
        }

    @api.get("/api/v3/ticker/24hr")
    async def ticker_24hr() -> list[dict]:
        index = clock.last_closed_index("1m")
        rows = []
        for position, symbol in enumerate(SYMBOLS):
            candle = timed_candle(symbol, index, "1m", clock.epoch_ms, params, HISTORY_CANDLES)
            day_ago = timed_candle(symbol, max(0, index - 1440), "1m", clock.epoch_ms, params, HISTORY_CANDLES)
            change = (
                (candle.close - day_ago.close) / day_ago.close * 100 if day_ago.close else 0.0
            )
            rows.append(
                {
                    "symbol": symbol,
                    "lastPrice": f"{candle.close:.8f}",
                    "priceChangePercent": f"{change:.2f}",
                    # Descending volume so the scanner's ranking is testable.
                    "quoteVolume": f"{(2_000_000_000 - position * 90_000_000):.2f}",
                    "volume": f"{candle.volume * 1440:.4f}",
                    "highPrice": f"{candle.high:.8f}",
                    "lowPrice": f"{candle.low:.8f}",
                    "count": 500_000,
                }
            )
        return rows

    @api.get("/api/v3/ticker/bookTicker")
    async def book_tickers(symbol: str | None = None) -> list[dict] | dict:
        index = clock.last_closed_index("1m")
        rows = [_book_row(name, index, clock, params) for name in SYMBOLS]
        if symbol:
            wanted = symbol.upper()
            for row in rows:
                if row["symbol"] == wanted:
                    return row
            return JSONResponse({"code": -1121, "msg": "Invalid symbol."}, status_code=400)
        return rows

    @api.get("/api/v3/klines")
    async def klines(
        symbol: str,
        interval: str,
        limit: int = Query(500, ge=1, le=1000),
        startTime: int | None = None,
        endTime: int | None = None,
    ):
        symbol = symbol.upper()
        if symbol not in BASE_PRICES:
            return JSONResponse({"code": -1121, "msg": "Invalid symbol."}, status_code=400)
        if interval not in INTERVAL_MS:
            return JSONResponse({"code": -1120, "msg": "Invalid interval."}, status_code=400)

        step = interval_ms(interval)
        last_index = clock.last_closed_index(interval)

        if startTime is not None:
            first = max(0, (int(startTime) - clock.epoch_ms) // step)
        else:
            first = max(0, last_index - limit + 1)

        if endTime is not None:
            last = min(last_index, (int(endTime) - clock.epoch_ms) // step)
        else:
            last = last_index

        last = min(last, first + limit - 1)
        if last < first:
            return []

        return [
            _kline_row(
                timed_candle(symbol, index, interval, clock.epoch_ms, params, HISTORY_CANDLES)
            )
            for index in range(first, last + 1)
        ]

    @api.get("/api/v3/depth")
    async def depth(symbol: str, limit: int = 20):
        symbol = symbol.upper()
        if symbol not in BASE_PRICES:
            return JSONResponse({"code": -1121, "msg": "Invalid symbol."}, status_code=400)

        index = clock.last_closed_index("1m")
        candle = timed_candle(symbol, index, "1m", clock.epoch_ms, params, HISTORY_CANDLES)
        price = candle.close
        tick = max(price * 0.00002, 1e-8)

        # Slightly bid-heavy, matching the bullish synthetic tape.
        bids = [[f"{price - tick * (i + 1):.8f}", f"{1.4 + i * 0.05:.5f}"] for i in range(limit)]
        asks = [[f"{price + tick * (i + 1):.8f}", f"{1.0 + i * 0.05:.5f}"] for i in range(limit)]
        return {"lastUpdateId": index, "bids": bids, "asks": asks}

    return api


def _book_row(symbol: str, index: int, clock: Clock, params: PathParams) -> dict:
    candle = timed_candle(symbol, index, "1m", clock.epoch_ms, params, HISTORY_CANDLES)
    half = candle.close * 0.00002
    return {
        "symbol": symbol,
        "s": symbol,
        "bidPrice": f"{candle.close - half:.8f}",
        "b": f"{candle.close - half:.8f}",
        "bidQty": "2.50000",
        "B": "2.50000",
        "askPrice": f"{candle.close + half:.8f}",
        "a": f"{candle.close + half:.8f}",
        "askQty": "1.80000",
        "A": "1.80000",
    }


def _kline_row(candle) -> list:
    return [
        candle.open_time,
        f"{candle.open:.8f}",
        f"{candle.high:.8f}",
        f"{candle.low:.8f}",
        f"{candle.close:.8f}",
        f"{candle.volume:.8f}",
        candle.close_time,
        f"{candle.quote_volume:.8f}",
        candle.trades,
        f"{candle.volume / 2:.8f}",
        f"{candle.quote_volume / 2:.8f}",
        "0",
    ]


class StreamServer:
    """Serves the combined websocket stream."""

    def __init__(self, clock: Clock, params: PathParams, host: str, port: int) -> None:
        self.clock = clock
        self.params = params
        self.host = host
        self.port = port

    async def serve(self) -> None:
        async with websockets.serve(self._handle, self.host, self.port, ping_interval=20):
            logger.info("Mock websocket on ws://%s:%d", self.host, self.port)
            await asyncio.Future()

    async def _handle(self, connection) -> None:
        path = getattr(connection, "path", None) or getattr(
            getattr(connection, "request", None), "path", ""
        )
        query = parse_qs(urlparse(path).query)
        streams = [item for group in query.get("streams", []) for item in group.split("/")]
        logger.info("Stream client connected (%d streams)", len(streams))

        klines = []
        books = []
        for stream in streams:
            if "@kline_" in stream:
                symbol, _, interval = stream.partition("@kline_")
                if interval in INTERVALS:
                    klines.append((symbol.upper(), interval))
            elif stream.lower().endswith("@bookticker"):
                books.append(stream.split("@")[0].upper())

        # Remember what has already been sent so a candle closes exactly once.
        # Seeded a little in the past so the first tick backfills the candles
        # that closed between the client's REST warm-up and this connection.
        # Real Binance does not backfill, but under time compression that gap
        # spans many candles and would leave a hole in the client's history.
        sent: dict[tuple[str, str], int] = {
            (symbol, interval): max(-1, self.clock.last_closed_index(interval) - BACKFILL_CANDLES)
            for symbol, interval in klines
        }

        try:
            while True:
                now_index = {
                    interval: self.clock.last_closed_index(interval) for interval in INTERVALS
                }

                for symbol, interval in klines:
                    key = (symbol, interval)
                    latest = now_index[interval]
                    previous = sent.get(key, latest - 1)
                    # Emit every candle that closed since the last tick.
                    for index in range(previous + 1, latest + 1):
                        await self._send_kline(connection, symbol, interval, index, closed=True)
                    sent[key] = latest
                    # …then the still-forming candle.
                    await self._send_kline(
                        connection, symbol, interval, latest + 1, closed=False
                    )

                for symbol in books:
                    await connection.send(
                        json.dumps(
                            {
                                "stream": f"{symbol.lower()}@bookTicker",
                                "data": _book_row(
                                    symbol, now_index["1m"], self.clock, self.params
                                ),
                            }
                        )
                    )

                await asyncio.sleep(0.5)

        except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
            logger.info("Stream client disconnected")

    async def _send_kline(
        self, connection, symbol: str, interval: str, index: int, closed: bool
    ) -> None:
        candle = timed_candle(
            symbol, index, interval, self.clock.epoch_ms, self.params, HISTORY_CANDLES
        )
        await connection.send(
            json.dumps(
                {
                    "stream": f"{symbol.lower()}@kline_{interval}",
                    "data": {
                        "e": "kline",
                        "E": self.clock.now_ms(),
                        "s": symbol,
                        "k": {
                            "t": candle.open_time,
                            "T": candle.close_time,
                            "s": symbol,
                            "i": interval,
                            "o": f"{candle.open:.8f}",
                            "c": f"{candle.close:.8f}",
                            "h": f"{candle.high:.8f}",
                            "l": f"{candle.low:.8f}",
                            "v": f"{candle.volume:.8f}",
                            "q": f"{candle.quote_volume:.8f}",
                            "n": candle.trades,
                            "x": closed,
                        },
                    },
                }
            )
        )


async def run(host: str, rest_port: int, ws_port: int, speed: float) -> None:
    clock = Clock(speed=speed)
    params = PathParams()

    config = uvicorn.Config(
        build_app(clock, params), host=host, port=rest_port, log_level="warning", access_log=False
    )
    rest = uvicorn.Server(config)
    streams = StreamServer(clock, params, host, ws_port)

    logger.info(
        "Mock Binance REST on http://%s:%d (speed x%.0f, %d symbols)",
        host,
        rest_port,
        speed,
        len(SYMBOLS),
    )
    await asyncio.gather(rest.serve(), streams.serve())


def main() -> None:
    parser = argparse.ArgumentParser(description="Local Binance-compatible mock exchange")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--rest-port", type=int, default=8100)
    parser.add_argument("--ws-port", type=int, default=8101)
    parser.add_argument(
        "--speed",
        type=float,
        default=30.0,
        help="time compression; 30 means one 1m candle every 2 seconds",
    )
    args = parser.parse_args()

    setup_logging("INFO", log_file=None)
    try:
        asyncio.run(run(args.host, args.rest_port, args.ws_port, args.speed))
    except KeyboardInterrupt:
        print("\nMock exchange stopped.")


if __name__ == "__main__":
    main()
