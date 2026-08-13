"""Resilience paths: socket lifecycle, logging setup, Telegram start/stop.

The specification calls out websocket reconnection and error containment as
requirements, so the loops that implement them are tested directly rather
than only through their happy path.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import pytest

import app.binance.websocket as ws_module
from app.binance.websocket import BinanceStreamManager, StreamConnection
from app.config import Settings
from app.market.store import MarketStore
from app.telegram.bot import TelegramBot
from app.utils.logger import get_logger, setup_logging


# ----------------------------------------------------------------------
# Fake socket plumbing
# ----------------------------------------------------------------------
class FakeSocket:
    """A websocket that yields a scripted list of frames, then closes."""

    def __init__(self, frames: list[str], hang: bool = False) -> None:
        self.frames = list(frames)
        self.hang = hang
        self.closed = False

    async def recv(self) -> str:
        if self.frames:
            return self.frames.pop(0)
        if self.hang:
            # An Event that is never set, rather than a sleep: tests that
            # collapse the reconnect backoff monkeypatch asyncio.sleep
            # globally, and this must stay genuinely silent.
            await asyncio.Event().wait()
        raise ws_module.ConnectionClosed(None, None)

    async def close(self) -> None:
        self.closed = True


class FakeConnect:
    """Async context manager standing in for ``websockets.connect``."""

    def __init__(self, socket: FakeSocket, fail_times: int = 0) -> None:
        self.socket = socket
        self.fail_times = fail_times
        self.attempts = 0

    def __call__(self, *args, **kwargs):
        self.attempts += 1
        return self

    async def __aenter__(self):
        if self.attempts <= self.fail_times:
            raise OSError("connection refused")
        return self.socket

    async def __aexit__(self, *exc) -> bool:
        return False


# ----------------------------------------------------------------------
# StreamConnection
# ----------------------------------------------------------------------
async def test_frames_reach_the_handler(monkeypatch):
    received: list[dict] = []
    socket = FakeSocket(['{"stream":"a","data":{"x":1}}', '{"stream":"b","data":{"x":2}}'])
    monkeypatch.setattr(ws_module.websockets, "connect", FakeConnect(socket))

    connection = StreamConnection("md", "wss://x", ["a"], received.append)
    connection.start()
    await asyncio.sleep(0.05)
    await connection.stop()

    assert received == [{"stream": "a", "data": {"x": 1}}, {"stream": "b", "data": {"x": 2}}]
    assert connection.messages == 2


async def test_a_malformed_frame_does_not_break_the_stream(monkeypatch):
    received: list[dict] = []
    socket = FakeSocket(["not json at all", '{"stream":"a","data":{"x":1}}'])
    monkeypatch.setattr(ws_module.websockets, "connect", FakeConnect(socket))

    connection = StreamConnection("md", "wss://x", ["a"], received.append)
    connection.start()
    await asyncio.sleep(0.05)
    await connection.stop()

    assert received == [{"stream": "a", "data": {"x": 1}}]


async def test_a_throwing_handler_does_not_kill_the_socket(monkeypatch):
    seen: list[dict] = []

    def explode(payload: dict) -> None:
        seen.append(payload)
        raise RuntimeError("handler bug")

    socket = FakeSocket(['{"a":1}', '{"a":2}'])
    monkeypatch.setattr(ws_module.websockets, "connect", FakeConnect(socket))

    connection = StreamConnection("md", "wss://x", ["a"], explode)
    connection.start()
    await asyncio.sleep(0.05)
    await connection.stop()

    assert len(seen) == 2      # the second frame was still delivered


async def test_a_quiet_socket_is_forced_to_reconnect(monkeypatch):
    """Binance can go silent without closing; the client must not sit there."""
    monkeypatch.setattr(ws_module, "IDLE_TIMEOUT_SECONDS", 0.02)
    socket = FakeSocket([], hang=True)
    connect = FakeConnect(socket)
    monkeypatch.setattr(ws_module.websockets, "connect", connect)

    real_sleep = asyncio.sleep

    async def fast_sleep(delay):     # collapse the reconnect backoff
        await real_sleep(0)

    monkeypatch.setattr(ws_module.asyncio, "sleep", fast_sleep)

    connection = StreamConnection("md", "wss://x", ["a"], lambda _: None)
    connection.start()
    await real_sleep(0.15)
    await connection.stop()

    assert socket.closed is True
    assert connect.attempts >= 2       # it came back after the idle timeout


async def test_a_connection_recovers_after_early_failures(monkeypatch):
    received: list[dict] = []
    socket = FakeSocket(['{"ok":1}'])
    connect = FakeConnect(socket, fail_times=2)
    monkeypatch.setattr(ws_module.websockets, "connect", connect)

    real_sleep = asyncio.sleep

    async def fast_sleep(delay):     # collapse the backoff
        await real_sleep(0)

    monkeypatch.setattr(ws_module.asyncio, "sleep", fast_sleep)

    connection = StreamConnection("md", "wss://x", ["a"], received.append)
    connection.start()
    await real_sleep(0.1)
    await connection.stop()

    assert connect.attempts >= 3
    assert connection.reconnects >= 2
    assert received == [{"ok": 1}]


async def test_stopping_marks_the_connection_disconnected(monkeypatch):
    socket = FakeSocket([], hang=True)
    monkeypatch.setattr(ws_module.websockets, "connect", FakeConnect(socket))

    connection = StreamConnection("md", "wss://x", ["a"], lambda _: None)
    connection.start()
    await asyncio.sleep(0.02)
    assert connection.connected is True

    await connection.stop()
    assert connection.connected is False


# ----------------------------------------------------------------------
# Stream manager lifecycle
# ----------------------------------------------------------------------
@pytest.fixture
def manager(settings: Settings) -> BinanceStreamManager:
    store = MarketStore(settings)
    store.set_symbols(["BTCUSDT"])
    return BinanceStreamManager(settings, store)


class RecordingConnection:
    """Replaces StreamConnection so no socket is ever opened."""

    instances: list["RecordingConnection"] = []

    def __init__(self, name, url, streams, on_payload):
        self.name = name
        self.streams = list(streams)
        self.connected = False
        self.reconnects = 0
        self.messages = 0
        self.started = False
        self.stopped = False
        RecordingConnection.instances.append(self)

    def start(self) -> None:
        self.started = True
        self.connected = True

    async def stop(self) -> None:
        self.stopped = True
        self.connected = False


@pytest.fixture(autouse=True)
def recording_connections(monkeypatch):
    RecordingConnection.instances = []
    monkeypatch.setattr(ws_module, "StreamConnection", RecordingConnection)
    yield RecordingConnection.instances


async def test_starting_opens_market_and_ticker_connections(manager, recording_connections):
    await manager.start(["BTCUSDT", "ETHUSDT"])
    try:
        assert len(recording_connections) == 2      # one market chunk + ticker
        assert all(item.started for item in recording_connections)
        assert recording_connections[-1].streams == ["!ticker@arr"]
        assert manager.is_connected is True
    finally:
        await manager.stop()


async def test_restarting_replaces_the_previous_connections(manager, recording_connections):
    await manager.start(["BTCUSDT"])
    first = list(recording_connections)

    await manager.start(["BTCUSDT", "ETHUSDT"])
    try:
        assert all(item.stopped for item in first)
        assert len(manager.connections) == 2
    finally:
        await manager.stop()


async def test_resubscribing_to_the_same_symbols_is_a_no_op(manager, recording_connections):
    await manager.start(["BTCUSDT"])
    count = len(recording_connections)

    await manager.resubscribe(["BTCUSDT"])
    try:
        assert len(recording_connections) == count      # nothing was rebuilt
    finally:
        await manager.stop()


async def test_resubscribing_to_new_symbols_rebuilds(manager, recording_connections):
    await manager.start(["BTCUSDT"])
    count = len(recording_connections)

    await manager.resubscribe(["BTCUSDT", "SOLUSDT"])
    try:
        assert len(recording_connections) > count
    finally:
        await manager.stop()


async def test_starting_with_no_symbols_opens_nothing(manager, recording_connections):
    await manager.start([])
    assert recording_connections == []
    assert manager.is_connected is False


async def test_stopping_shuts_down_the_worker(manager):
    await manager.start(["BTCUSDT"])
    worker = manager._worker
    assert worker is not None

    await manager.stop()
    assert manager.connections == []
    assert manager._worker is None
    assert worker.done() is True


# ----------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------
def test_setup_logging_installs_console_and_file_handlers(tmp_path, monkeypatch):
    monkeypatch.setattr("app.utils.logger._CONFIGURED", False)
    log_file = tmp_path / "nested" / "bot.log"

    setup_logging("DEBUG", str(log_file))

    root = logging.getLogger()
    try:
        assert root.level == logging.DEBUG
        assert len(root.handlers) == 2
        get_logger("test").info("hello")
        assert log_file.exists()
        assert "hello" in log_file.read_text()
        # Third-party noise is turned down.
        assert logging.getLogger("httpx").level == logging.WARNING
    finally:
        for handler in list(root.handlers):
            handler.close()
            root.removeHandler(handler)


def test_setup_logging_runs_once(monkeypatch, tmp_path):
    monkeypatch.setattr("app.utils.logger._CONFIGURED", False)
    setup_logging("INFO", str(tmp_path / "a.log"))
    count = len(logging.getLogger().handlers)

    setup_logging("INFO", str(tmp_path / "b.log"))
    try:
        assert len(logging.getLogger().handlers) == count
        assert not (tmp_path / "b.log").exists()
    finally:
        root = logging.getLogger()
        for handler in list(root.handlers):
            handler.close()
            root.removeHandler(handler)


def test_logging_still_works_without_a_writable_file(monkeypatch, tmp_path):
    """A read-only log path must not stop the bot from starting."""
    monkeypatch.setattr("app.utils.logger._CONFIGURED", False)

    def deny(*args, **kwargs):
        raise OSError("read-only file system")

    monkeypatch.setattr(Path, "mkdir", deny)
    setup_logging("INFO", str(tmp_path / "denied" / "bot.log"))

    root = logging.getLogger()
    try:
        assert any(isinstance(h, logging.StreamHandler) for h in root.handlers)
    finally:
        for handler in list(root.handlers):
            handler.close()
            root.removeHandler(handler)


def test_setup_logging_can_skip_the_file(monkeypatch):
    monkeypatch.setattr("app.utils.logger._CONFIGURED", False)
    setup_logging("INFO", log_file=None)

    root = logging.getLogger()
    try:
        assert len(root.handlers) == 1
    finally:
        for handler in list(root.handlers):
            handler.close()
            root.removeHandler(handler)


# ----------------------------------------------------------------------
# Telegram start-up
# ----------------------------------------------------------------------
class DummyContext:
    settings = Settings()


async def test_an_invalid_token_disables_telegram_without_crashing(monkeypatch):
    from telegram.error import InvalidToken

    settings = Settings(telegram_bot_token="bad", telegram_chat_id="1")
    bot = TelegramBot(settings, DummyContext())  # type: ignore[arg-type]

    class Builder:
        def token(self, _value):
            return self

        def concurrent_updates(self, _value):
            return self

        def build(self):
            raise InvalidToken("nope")

    monkeypatch.setattr("app.telegram.bot.ApplicationBuilder", Builder)

    assert await bot.start() is False
    assert bot.enabled is False
    # And it stays quiet rather than raising on later sends.
    assert await bot.send_text("hi") is False


async def test_an_unexpected_startup_error_disables_telegram(monkeypatch):
    settings = Settings(telegram_bot_token="x", telegram_chat_id="1")
    bot = TelegramBot(settings, DummyContext())  # type: ignore[arg-type]

    class Builder:
        def token(self, _value):
            return self

        def concurrent_updates(self, _value):
            return self

        def build(self):
            raise RuntimeError("event loop problem")

    monkeypatch.setattr("app.telegram.bot.ApplicationBuilder", Builder)

    assert await bot.start() is False
    assert bot.enabled is False


async def test_stop_tears_down_the_application():
    settings = Settings(telegram_bot_token="x", telegram_chat_id="1")
    bot = TelegramBot(settings, DummyContext())  # type: ignore[arg-type]
    calls: list[str] = []

    class Updater:
        running = True

        async def stop(self):
            calls.append("updater.stop")

    class Application:
        updater = Updater()

        async def stop(self):
            calls.append("app.stop")

        async def shutdown(self):
            calls.append("app.shutdown")

    bot.application = Application()  # type: ignore[assignment]
    bot._running = True

    await bot.stop()

    assert calls == ["updater.stop", "app.stop", "app.shutdown"]
    assert bot.application is None


async def test_stop_survives_a_broken_application():
    settings = Settings(telegram_bot_token="x", telegram_chat_id="1")
    bot = TelegramBot(settings, DummyContext())  # type: ignore[arg-type]

    class Application:
        updater = None

        async def stop(self):
            raise RuntimeError("already gone")

        async def shutdown(self):
            raise RuntimeError("already gone")

    bot.application = Application()  # type: ignore[assignment]
    bot._running = True

    await bot.stop()      # must not raise
    assert bot.application is None
