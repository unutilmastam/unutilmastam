"""Websocket stream manager: subscriptions, dispatch and reconnection."""

from __future__ import annotations

import asyncio

import pytest

from app.binance.websocket import (
    MAX_STREAMS_PER_CONNECTION,
    BinanceStreamManager,
    StreamConnection,
)
from app.config import Settings
from app.market.store import MarketStore
from app.utils.helpers import now_ms


@pytest.fixture
def store(settings: Settings) -> MarketStore:
    store = MarketStore(settings)
    store.set_symbols(["BTCUSDT", "ETHUSDT"])
    return store


@pytest.fixture
def manager(settings: Settings, store: MarketStore) -> BinanceStreamManager:
    return BinanceStreamManager(settings, store)


def kline_frame(
    symbol: str = "BTCUSDT",
    interval: str = "1m",
    closed: bool = True,
    open_time: int = 1_700_000_000_000,
    close: str = "101",
) -> dict:
    return {
        "stream": f"{symbol.lower()}@kline_{interval}",
        "data": {
            "e": "kline",
            "s": symbol,
            "k": {
                "t": open_time,
                "T": open_time + 59_999,
                "s": symbol,
                "i": interval,
                "o": "100",
                "h": "102",
                "l": "99",
                "c": close,
                "v": "12",
                "q": "1200",
                "n": 8,
                "x": closed,
            },
        },
    }


# ----------------------------------------------------------------------
# Stream construction
# ----------------------------------------------------------------------
def test_streams_cover_every_timeframe_and_the_book(manager, settings):
    streams = manager.build_streams(["BTCUSDT"])
    for interval in settings.timeframes:
        assert f"btcusdt@kline_{interval}" in streams
    assert "btcusdt@bookTicker" in streams
    assert len(streams) == len(settings.timeframes) + 1


def test_streams_are_chunked_across_connections(settings, store):
    """50 symbols must not open 50 sockets."""
    many = [f"SYM{index}USDT" for index in range(50)]
    manager = BinanceStreamManager(settings, store)
    streams = manager.build_streams(many)

    assert len(streams) == 50 * (len(settings.timeframes) + 1)
    chunks = -(-len(streams) // MAX_STREAMS_PER_CONNECTION)
    assert chunks < 10


def test_the_endpoint_is_a_combined_stream_url():
    connection = StreamConnection(
        "md-1", "wss://example", ["btcusdt@kline_1m", "btcusdt@bookTicker"], lambda _: None
    )
    assert connection.endpoint == (
        "wss://example/stream?streams=btcusdt@kline_1m/btcusdt@bookTicker"
    )


# ----------------------------------------------------------------------
# Dispatch
# ----------------------------------------------------------------------
def test_a_closed_kline_is_stored_and_queued(manager, store):
    manager._symbols = ("BTCUSDT",)
    manager._dispatch(kline_frame())

    series = store.series("BTCUSDT", "1m")
    assert len(series) == 1
    assert manager._queue.qsize() == 1


def test_an_open_kline_updates_the_live_candle_only(manager, store):
    manager._dispatch(kline_frame(closed=False))

    series = store.series("BTCUSDT", "1m")
    assert len(series) == 0
    assert series.live is not None
    assert manager._queue.qsize() == 0


def test_a_repeated_closed_kline_is_queued_once(manager):
    manager._dispatch(kline_frame())
    manager._dispatch(kline_frame())
    assert manager._queue.qsize() == 1


def test_unknown_timeframes_are_ignored(manager, store):
    manager._dispatch(kline_frame(interval="1h"))
    assert store.series("BTCUSDT", "1h") is None


def test_book_ticker_frames_update_the_store(manager, store):
    manager._dispatch(
        {
            "stream": "btcusdt@bookTicker",
            "data": {"s": "BTCUSDT", "b": "99.9", "B": "3", "a": "100.1", "A": "4"},
        }
    )
    book = store.book_tickers["BTCUSDT"]
    assert book.bid_price == pytest.approx(99.9)
    assert book.spread_percent > 0


def test_the_all_market_ticker_array_is_filtered_to_tracked_symbols(manager, store):
    manager._symbols = ("BTCUSDT",)
    manager._dispatch(
        {
            "stream": "!ticker@arr",
            "data": [
                {"e": "24hrTicker", "s": "BTCUSDT", "c": "100", "P": "1", "q": "5e8",
                 "v": "5e6", "h": "101", "l": "99", "n": 100, "E": now_ms()},
                {"e": "24hrTicker", "s": "ETHBTC", "c": "0.05", "P": "1", "q": "100",
                 "v": "10", "h": "0.06", "l": "0.04", "n": 5, "E": now_ms()},
            ],
        }
    )
    assert "BTCUSDT" in store.tickers
    assert "ETHBTC" not in store.tickers


def test_malformed_frames_do_not_raise(manager):
    for payload in (
        {"stream": "btcusdt@kline_1m", "data": {"e": "kline", "k": "not a dict"}},
        {"stream": "btcusdt@kline_1m", "data": {"e": "kline", "k": {"t": "bad"}}},
        {"data": None},
        {"stream": "x", "data": []},
        {},
    ):
        manager._dispatch(payload)   # must not raise


def test_a_full_queue_drops_instead_of_blocking(settings, store):
    manager = BinanceStreamManager(settings, store)
    manager._queue = asyncio.Queue(maxsize=1)

    manager._dispatch(kline_frame(open_time=1_700_000_000_000))
    manager._dispatch(kline_frame(open_time=1_700_000_060_000))
    manager._dispatch(kline_frame(open_time=1_700_000_120_000))

    assert manager._queue.qsize() == 1   # the rest were dropped, not blocked


# ----------------------------------------------------------------------
# Callback worker
# ----------------------------------------------------------------------
async def test_closed_candles_reach_the_callback(settings, store):
    received = []

    async def on_candle(event):
        received.append(event)

    manager = BinanceStreamManager(settings, store, on_closed_candle=on_candle)
    worker = asyncio.create_task(manager._drain_queue())

    manager._dispatch(kline_frame())
    await asyncio.sleep(0.05)
    worker.cancel()

    assert len(received) == 1
    assert received[0].symbol == "BTCUSDT"
    assert received[0].interval == "1m"


async def test_a_failing_callback_does_not_kill_the_worker(settings, store):
    calls = []

    async def flaky(event):
        calls.append(event)
        raise RuntimeError("handler exploded")

    manager = BinanceStreamManager(settings, store, on_closed_candle=flaky)
    worker = asyncio.create_task(manager._drain_queue())

    manager._dispatch(kline_frame(open_time=1_700_000_000_000))
    await asyncio.sleep(0.02)
    manager._dispatch(kline_frame(open_time=1_700_000_060_000))
    await asyncio.sleep(0.02)

    assert worker.done() is False
    assert len(calls) == 2
    worker.cancel()


# ----------------------------------------------------------------------
# Reconnection
# ----------------------------------------------------------------------
async def test_a_dropped_connection_is_retried_with_backoff(monkeypatch):
    """The socket keeps failing; the loop must retry and back off, not exit."""
    attempts = []
    sleeps = []

    class FailingConnect:
        def __init__(self, *args, **kwargs):
            attempts.append(1)

        async def __aenter__(self):
            raise OSError("connection refused")

        async def __aexit__(self, *exc):
            return False

    import app.binance.websocket as module

    monkeypatch.setattr(module.websockets, "connect", FailingConnect)

    real_sleep = asyncio.sleep

    async def fake_sleep(delay):
        sleeps.append(delay)
        if len(sleeps) >= 3:
            raise asyncio.CancelledError
        await real_sleep(0)

    monkeypatch.setattr(module.asyncio, "sleep", fake_sleep)

    connection = StreamConnection("md-1", "wss://example", ["btcusdt@kline_1m"], lambda _: None)
    connection.start()
    await real_sleep(0.05)
    await connection.stop()

    assert len(attempts) >= 3
    assert connection.reconnects >= 2
    # Backoff grows between attempts.
    assert sleeps[1] > sleeps[0]
    assert connection.connected is False


async def test_stopping_a_connection_is_idempotent():
    connection = StreamConnection("md-1", "wss://example", ["btcusdt@kline_1m"], lambda _: None)
    await connection.stop()
    await connection.stop()
    assert connection.connected is False


def test_status_reports_connection_health(manager):
    manager.connections = [
        StreamConnection("a", "wss://x", ["s"], lambda _: None),
        StreamConnection("b", "wss://x", ["s"], lambda _: None),
    ]
    manager.connections[0].connected = True
    manager.connections[0].messages = 5
    manager.connections[1].reconnects = 2

    status = manager.status()
    assert status == {
        "connections": 2,
        "connected": 1,
        "reconnects": 2,
        "messages": 5,
        "queue_size": 0,
    }
    assert manager.is_connected is True
