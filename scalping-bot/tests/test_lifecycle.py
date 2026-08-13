"""Application lifecycle: start-up, warm-up, background loops, shutdown.

These are the paths that decide whether ``python run.py`` works at all, so
they are exercised against fakes rather than left to the first live run.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.config import Settings
from app.main import ScalpingBot
from app.market.candles import Candle

from tests.conftest import build_series, trending_closes


# ----------------------------------------------------------------------
# Fakes
# ----------------------------------------------------------------------
class FakeRest:
    """Stands in for BinanceRestClient."""

    def __init__(self, reachable: bool = True, failing_symbols: set[str] | None = None) -> None:
        self.reachable = reachable
        self.failing_symbols = failing_symbols or set()
        self.started = False
        self.closed = False
        self.kline_calls: list[tuple[str, str]] = []

    async def start(self) -> None:
        self.started = True

    async def close(self) -> None:
        self.closed = True

    async def ping(self) -> bool:
        return self.reachable

    async def closed_klines(self, symbol: str, interval: str, limit: int = 500) -> list[Candle]:
        self.kline_calls.append((symbol, interval))
        if symbol in self.failing_symbols:
            raise RuntimeError(f"no data for {symbol}")
        return build_series(trending_closes(120, seed=len(symbol)), interval=interval)


class FakeScanner:
    def __init__(self, symbols: list[str]) -> None:
        self.symbols = symbols
        self.refreshes = 0
        self.selects = 0

    async def refresh_exchange_info(self) -> dict:
        self.refreshes += 1
        return {}

    async def select_symbols(self) -> list[str]:
        self.selects += 1
        return list(self.symbols)


class FakeStreams:
    def __init__(self) -> None:
        self.started_with: list[list[str]] = []
        self.resubscribed_with: list[list[str]] = []
        self.stopped = False

    async def start(self, symbols) -> None:
        self.started_with.append(list(symbols))

    async def resubscribe(self, symbols) -> None:
        self.resubscribed_with.append(list(symbols))

    async def stop(self) -> None:
        self.stopped = True

    def status(self) -> dict:
        return {"connections": 1, "connected": 1, "reconnects": 0, "messages": 0}


class FakeTelegram:
    def __init__(self) -> None:
        self.started = False
        self.stopped = False
        self.startup_notice: int | None = None
        self.shutdown_notice = False

    async def start(self) -> bool:
        self.started = True
        return True

    async def stop(self) -> None:
        self.stopped = True

    async def send_startup_notice(self, count: int) -> bool:
        self.startup_notice = count
        return True

    async def send_shutdown_notice(self) -> bool:
        self.shutdown_notice = True
        return True

    async def send_signal(self, signal) -> bool:
        return True

    async def send_update(self, update) -> bool:
        return True


class FakeDatabase:
    def __init__(self) -> None:
        self.initialised = False
        self.closed = False
        self.settings: dict[str, str] = {}
        self.pruned = 0

    async def init(self) -> None:
        self.initialised = True

    async def close(self) -> None:
        self.closed = True

    async def get_setting(self, key: str, default: str = "") -> str:
        return self.settings.get(key, default)

    async def set_setting(self, key: str, value: str) -> None:
        self.settings[key] = value

    async def prune_snapshots(self, keep_days: int = 14) -> int:
        self.pruned += 1
        return 3

    async def update_account(self, balance: float, equity_peak: float) -> None:
        return None

    async def get_account(self):
        raise AssertionError("not needed in these tests")


@pytest.fixture
def bot(settings: Settings) -> ScalpingBot:
    """A bot whose every outbound dependency is a fake."""
    tuned = Settings(**{**settings.__dict__, "scanner_refresh_minutes": 5})
    instance = ScalpingBot(tuned)
    instance.rest = FakeRest()                       # type: ignore[assignment]
    instance.scanner = FakeScanner(["BTCUSDT", "ETHUSDT"])  # type: ignore[assignment]
    instance.streams = FakeStreams()                 # type: ignore[assignment]
    instance.telegram = FakeTelegram()               # type: ignore[assignment]
    instance.database = FakeDatabase()               # type: ignore[assignment]
    instance.paper.database = None
    instance.engine.rest_client = None
    return instance


# ----------------------------------------------------------------------
# Warm-up
# ----------------------------------------------------------------------
async def test_warmup_fills_every_symbol_and_timeframe(bot):
    symbols = ["BTCUSDT", "ETHUSDT"]
    bot.store.set_symbols(symbols)

    await bot.warmup(symbols)

    expected = {(s, i) for s in symbols for i in bot.settings.timeframes}
    assert set(bot.rest.kline_calls) == expected
    for symbol in symbols:
        for interval in bot.settings.timeframes:
            assert len(bot.store.series(symbol, interval)) == 120


async def test_warmup_survives_a_symbol_with_no_data(bot):
    """One bad symbol must not abort start-up for the rest."""
    bot.rest = FakeRest(failing_symbols={"ETHUSDT"})  # type: ignore[assignment]
    symbols = ["BTCUSDT", "ETHUSDT"]
    bot.store.set_symbols(symbols)

    await bot.warmup(symbols)

    assert len(bot.store.series("BTCUSDT", "1m")) == 120
    assert len(bot.store.series("ETHUSDT", "1m")) == 0


# ----------------------------------------------------------------------
# Start-up
# ----------------------------------------------------------------------
async def test_startup_brings_every_component_up_in_order(bot):
    await bot.startup()
    try:
        assert bot.database.initialised is True
        assert bot.rest.started is True
        assert bot.scanner.selects == 1
        assert bot.store.symbols == ("BTCUSDT", "ETHUSDT")
        assert bot.streams.started_with == [["BTCUSDT", "ETHUSDT"]]
        assert bot.telegram.started is True
        assert bot.telegram.startup_notice == 2
        assert bot.ready is True
        # The candle buffers are populated before the streams are consumed.
        assert bot.store.is_ready("BTCUSDT") is True
    finally:
        await bot.shutdown()


async def test_startup_fails_loudly_when_binance_is_unreachable(bot):
    bot.rest = FakeRest(reachable=False)  # type: ignore[assignment]

    with pytest.raises(RuntimeError, match="Binance REST API"):
        await bot.startup()
    assert bot.ready is False


async def test_startup_fails_loudly_when_no_symbol_passes_the_filters(bot):
    bot.scanner = FakeScanner([])  # type: ignore[assignment]

    with pytest.raises(RuntimeError, match="no symbols"):
        await bot.startup()


async def test_a_disabled_engine_survives_a_restart(bot):
    bot.database.settings["signals_enabled"] = "false"

    await bot.startup()
    try:
        assert bot.engine.enabled is False
    finally:
        await bot.shutdown()


async def test_signals_are_enabled_by_default(bot):
    await bot.startup()
    try:
        assert bot.engine.enabled is True
    finally:
        await bot.shutdown()


# ----------------------------------------------------------------------
# Shutdown
# ----------------------------------------------------------------------
async def test_shutdown_stops_everything(bot):
    await bot.startup()
    await bot.shutdown()

    assert bot.ready is False
    assert bot.streams.stopped is True
    assert bot.telegram.shutdown_notice is True
    assert bot.telegram.stopped is True
    assert bot.rest.closed is True
    assert bot.database.closed is True
    assert bot._tasks == []


async def test_shutdown_is_idempotent(bot):
    await bot.startup()
    await bot.shutdown()
    await bot.shutdown()   # must not raise


async def test_background_tasks_do_not_outlive_shutdown(bot):
    await bot.startup()
    tasks = list(bot._tasks)
    assert len(tasks) == 2

    await bot.shutdown()
    await asyncio.sleep(0)
    assert all(task.done() for task in tasks)


# ----------------------------------------------------------------------
# Background loops
# ----------------------------------------------------------------------
async def test_a_rescan_adopts_a_changed_universe(bot):
    bot.store.set_symbols(["BTCUSDT"])
    bot.scanner = FakeScanner(["BTCUSDT", "SOLUSDT"])  # type: ignore[assignment]

    changed = await bot.rescan_once()

    assert changed is True
    assert bot.store.symbols == ("BTCUSDT", "SOLUSDT")
    # Only the newly added symbol is warmed up; the existing one keeps its data.
    assert {symbol for symbol, _ in bot.rest.kline_calls} == {"SOLUSDT"}
    assert len(bot.store.series("SOLUSDT", "1m")) == 120
    assert bot.streams.resubscribed_with == [["BTCUSDT", "SOLUSDT"]]


async def test_a_rescan_that_changes_nothing_does_not_resubscribe(bot):
    bot.store.set_symbols(["BTCUSDT", "ETHUSDT"])

    assert await bot.rescan_once() is False
    assert bot.streams.resubscribed_with == []
    assert bot.rest.kline_calls == []


async def test_a_rescan_drops_symbols_that_fell_out(bot):
    bot.store.set_symbols(["BTCUSDT", "ETHUSDT", "DOGEUSDT"])
    bot.scanner = FakeScanner(["BTCUSDT", "ETHUSDT"])  # type: ignore[assignment]

    assert await bot.rescan_once() is True
    assert bot.store.symbols == ("BTCUSDT", "ETHUSDT")
    assert bot.store.series("DOGEUSDT", "1m") is None


async def test_an_empty_rescan_keeps_the_current_universe(bot):
    """A scanner blip must not leave the bot tracking nothing."""
    bot.store.set_symbols(["BTCUSDT"])
    bot.scanner = FakeScanner([])  # type: ignore[assignment]

    assert await bot.rescan_once() is False
    assert bot.store.symbols == ("BTCUSDT",)
    assert bot.streams.resubscribed_with == []


async def test_a_failing_rescan_is_contained(bot):
    class BrokenScanner(FakeScanner):
        async def select_symbols(self):
            raise RuntimeError("exchange info unavailable")

    bot.store.set_symbols(["BTCUSDT"])
    bot.scanner = BrokenScanner(["BTCUSDT"])  # type: ignore[assignment]

    assert await bot.rescan_once() is False
    assert bot.store.symbols == ("BTCUSDT",)


async def test_maintenance_prunes_old_snapshots(bot):
    assert await bot.maintenance_once() == 3
    assert bot.database.pruned == 1


async def test_a_failing_maintenance_run_is_contained(bot):
    async def broken(keep_days: int = 14) -> int:
        raise RuntimeError("database locked")

    bot.database.prune_snapshots = broken  # type: ignore[assignment]
    assert await bot.maintenance_once() == 0


async def test_the_rescan_loop_exits_promptly_when_stopping(bot):
    bot._stopping.set()
    await asyncio.wait_for(bot._rescan_loop(), timeout=1.0)


async def test_the_maintenance_loop_exits_promptly_when_stopping(bot):
    bot._stopping.set()
    await asyncio.wait_for(bot._maintenance_loop(), timeout=1.0)


# ----------------------------------------------------------------------
# Backtest entry point
# ----------------------------------------------------------------------
async def test_run_backtest_returns_a_summary(bot, monkeypatch):
    captured = {}

    class FakeBacktestEngine:
        def __init__(self, settings, client):
            captured["client"] = client

        async def load_candles(self, config):
            captured["config"] = config
            return build_series(trending_closes(300), interval="1m")

        def run_on_candles(self, config, candles):
            captured["candles"] = len(candles)

            class Result:
                def summary(self) -> dict:
                    return {"symbol": config.symbol, "total_trades": 0}

            return Result()

    monkeypatch.setattr("app.main.BacktestEngine", FakeBacktestEngine)

    summary = await bot.run_backtest("btcusdt", days=3)

    assert summary == {"symbol": "BTCUSDT", "total_trades": 0}
    assert captured["candles"] == 300
    window = captured["config"].end - captured["config"].start
    assert window == timedelta(days=3)


# ----------------------------------------------------------------------
# Status
# ----------------------------------------------------------------------
async def test_status_reports_the_trading_mode_and_health(bot):
    await bot.startup()
    try:
        status = bot.status()
        assert status["ready"] is True
        assert status["paper_trading"] is True
        assert status["real_trading"] is False
        assert status["uptime_seconds"] >= 0
        assert status["market"]["symbols_tracked"] == 2
        assert "engine" in status and "streams" in status and "paper" in status
    finally:
        await bot.shutdown()


def test_signal_handlers_install_without_error(bot):
    loop = asyncio.new_event_loop()
    try:
        bot.install_signal_handlers(loop)
    finally:
        loop.close()


def test_real_trading_is_off_and_no_order_code_exists(bot):
    """The strongest guarantee available: grep the shipped package."""
    import pathlib

    assert bot.settings.real_trading is False

    package = pathlib.Path(__file__).resolve().parent.parent / "app"
    banned = ("/api/v3/order", "create_order", "new_order", "place_order")
    for path in package.rglob("*.py"):
        text = path.read_text()
        for needle in banned:
            assert needle not in text, f"{path.name} references {needle}"
