"""Telegram command handlers and the delivery layer."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from telegram.error import NetworkError, RetryAfter

from app.config import Settings
from app.telegram.bot import TelegramBot
from app.telegram.commands import TelegramContext, build_command_list, register_handlers

from tests.test_paper_trading import make_signal


# ----------------------------------------------------------------------
# Test doubles
# ----------------------------------------------------------------------
class FakeMessage:
    def __init__(self) -> None:
        self.replies: list[str] = []

    async def reply_text(self, text: str, **kwargs) -> None:
        self.replies.append(text)


class FakeChat:
    def __init__(self, chat_id: int) -> None:
        self.id = chat_id


class FakeUpdate:
    def __init__(self, chat_id: int = 111) -> None:
        self.effective_chat = FakeChat(chat_id)
        self.effective_message = FakeMessage()

    @property
    def replies(self) -> list[str]:
        return self.effective_message.replies


class FakeArgs:
    def __init__(self, *args: str) -> None:
        self.args = list(args)


class FakeApplication:
    def __init__(self) -> None:
        self.handlers: dict[str, object] = {}

    def add_handler(self, handler) -> None:
        for command in handler.commands:
            self.handlers[command] = handler.callback


class FakeEngine:
    def __init__(self) -> None:
        self.enabled = True
        self.last_rejection = {"BTCUSDT": "score 62 below 75"}
        self._scores: list = []

    def status(self) -> dict:
        return {"enabled": self.enabled, "evaluations": 5, "published": 1, "active_signals": 0}

    def ranked_scores(self, limit: int = 10):
        return self._scores[:limit]

    def score_for(self, symbol: str):
        for name, result in self._scores:
            if name == symbol:
                return result
        return None


class FakeStore:
    symbols = ("BTCUSDT", "ETHUSDT")

    def status(self) -> dict:
        return {"symbols_tracked": 2, "symbols_ready": 2, "symbols_stale": 0}

    def price(self, symbol: str) -> float:
        return 100.0


class FakeDatabase:
    def __init__(self) -> None:
        self.settings_written: dict[str, str] = {}

    async def signal_stats(self, days=None) -> dict:
        return {"total": 3, "closed": 2, "win_rate": 50.0}

    async def recent_signals(self, limit: int = 10):
        class Row:
            symbol = "BTCUSDT"
            side = "BUY"
            score = 82.0
            status = "TP1_HIT"
            pnl_percent = 1.2
            created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)

        return [Row()]

    async def set_setting(self, key: str, value: str) -> None:
        self.settings_written[key] = value


class FakePaper:
    positions: dict = {}

    def status(self) -> dict:
        return {"enabled": True, "balance": 1000.0, "open_positions": 0, "total_trades": 0}

    def metrics(self):
        from app.backtest.metrics import compute_metrics

        return compute_metrics([], 1000.0)


@pytest.fixture
def telegram_settings() -> Settings:
    return Settings(telegram_bot_token="token", telegram_chat_id="111")


@pytest.fixture
def context(telegram_settings) -> TelegramContext:
    return TelegramContext(
        settings=telegram_settings,
        store=FakeStore(),
        engine=FakeEngine(),
        paper=FakePaper(),
        database=FakeDatabase(),
        scanner=None,
        stream_manager=None,
        started_at=datetime.now(tz=timezone.utc),
        run_backtest=None,
    )


@pytest.fixture
def handlers(context) -> dict:
    application = FakeApplication()
    register_handlers(application, context)
    return application.handlers


# ----------------------------------------------------------------------
# Authorisation
# ----------------------------------------------------------------------
async def test_every_command_is_registered(handlers):
    for command in (
        "start", "help", "status", "top", "signals",
        "btc", "eth", "symbol", "paper", "settings",
        "enable", "disable", "backtest",
    ):
        assert command in handlers
    assert len(build_command_list()) == len(handlers)


async def test_an_unauthorised_chat_is_refused(handlers):
    update = FakeUpdate(chat_id=999)
    await handlers["status"](update, FakeArgs())

    assert "not authorised" in update.replies[0]


async def test_an_unauthorised_chat_cannot_toggle_the_engine(handlers, context):
    update = FakeUpdate(chat_id=999)
    await handlers["disable"](update, FakeArgs())

    assert context.engine.enabled is True   # unchanged


async def test_an_authorised_chat_is_served(handlers):
    update = FakeUpdate(chat_id=111)
    await handlers["start"](update, FakeArgs())

    assert "Scalping Signal Bot" in update.replies[0]


async def test_a_handler_error_is_reported_not_raised(handlers, context):
    def explode(*_args, **_kwargs):
        raise RuntimeError("boom")

    context.engine.status = explode
    update = FakeUpdate()
    await handlers["status"](update, FakeArgs())

    assert "Something went wrong" in update.replies[0]


# ----------------------------------------------------------------------
# Individual commands
# ----------------------------------------------------------------------
async def test_status_renders(handlers):
    update = FakeUpdate()
    await handlers["status"](update, FakeArgs())
    assert "BOT STATUS" in update.replies[0]


async def test_top_reports_an_empty_board(handlers):
    update = FakeUpdate()
    await handlers["top"](update, FakeArgs())
    assert "No setup is above the threshold" in update.replies[0]


async def test_top_lists_qualifying_setups(handlers, context):
    from tests.test_messages import _score_result

    context.engine._scores = [("BTCUSDT", _score_result(88))]
    update = FakeUpdate()
    await handlers["top"](update, FakeArgs())

    assert "BTC/USDT" in update.replies[0]
    assert "88/100" in update.replies[0]


async def test_signals_lists_history(handlers):
    update = FakeUpdate()
    await handlers["signals"](update, FakeArgs())
    assert "RECENT SIGNALS" in update.replies[0]
    assert "BTC/USDT" in update.replies[0]


async def test_btc_and_eth_shortcuts(handlers):
    for command, pair in (("btc", "BTC/USDT"), ("eth", "ETH/USDT")):
        update = FakeUpdate()
        await handlers[command](update, FakeArgs())
        assert pair in update.replies[0]


async def test_symbol_requires_an_argument(handlers):
    update = FakeUpdate()
    await handlers["symbol"](update, FakeArgs())
    assert "Usage" in update.replies[0]


async def test_symbol_accepts_a_bare_base_asset(handlers):
    update = FakeUpdate()
    await handlers["symbol"](update, FakeArgs("sol"))
    assert "SOL/USDT" in update.replies[0]


async def test_paper_report(handlers):
    update = FakeUpdate()
    await handlers["paper"](update, FakeArgs())
    assert "PAPER TRADING" in update.replies[0]


async def test_settings_show_config_without_secrets(handlers, telegram_settings):
    update = FakeUpdate()
    await handlers["settings"](update, FakeArgs())
    text = update.replies[0]

    assert "SETTINGS" in text
    assert "PAPER (no real orders)" in text
    assert "token" not in text
    assert "API keys are never shown" in text


async def test_enable_and_disable_persist_the_toggle(handlers, context):
    update = FakeUpdate()
    await handlers["disable"](update, FakeArgs())
    assert context.engine.enabled is False
    assert context.database.settings_written["signals_enabled"] == "false"

    await handlers["enable"](update, FakeArgs())
    assert context.engine.enabled is True
    assert context.database.settings_written["signals_enabled"] == "true"


async def test_backtest_is_unavailable_without_a_runner(handlers):
    update = FakeUpdate()
    await handlers["backtest"](update, FakeArgs("BTCUSDT", "3"))
    assert "not available" in update.replies[0]


async def test_backtest_runs_and_renders(handlers, context):
    captured = {}

    async def runner(symbol: str, days: int) -> dict:
        captured["symbol"] = symbol
        captured["days"] = days
        return {"symbol": symbol, "total_trades": 4, "win_rate": 50.0, "profit_factor": 1.2}

    context.run_backtest = runner
    update = FakeUpdate()
    await handlers["backtest"](update, FakeArgs("sol", "5"))

    assert captured == {"symbol": "SOLUSDT", "days": 5}
    assert "BACKTEST RESULT" in update.replies[-1]


async def test_backtest_days_are_bounded(handlers, context):
    captured = {}

    async def runner(symbol: str, days: int) -> dict:
        captured["days"] = days
        return {"symbol": symbol}

    context.run_backtest = runner
    await handlers["backtest"](FakeUpdate(), FakeArgs("BTCUSDT", "9999"))
    assert captured["days"] == 30


async def test_backtest_rejects_a_bad_day_count(handlers, context):
    context.run_backtest = lambda symbol, days: None
    update = FakeUpdate()
    await handlers["backtest"](update, FakeArgs("BTCUSDT", "many"))
    assert "Usage" in update.replies[0]


async def test_a_failing_backtest_is_reported(handlers, context):
    async def broken(symbol: str, days: int) -> dict:
        raise RuntimeError("no data")

    context.run_backtest = broken
    update = FakeUpdate()
    await handlers["backtest"](update, FakeArgs("BTCUSDT", "1"))
    assert "Backtest failed" in update.replies[-1]


# ----------------------------------------------------------------------
# Delivery
# ----------------------------------------------------------------------
class FakeBotApi:
    def __init__(self, failures: list[Exception] | None = None) -> None:
        self.sent: list[dict] = []
        self.failures = failures or []

    async def send_message(self, **kwargs):
        if self.failures:
            raise self.failures.pop(0)
        self.sent.append(kwargs)


class FakeApplicationWithBot:
    def __init__(self, bot: FakeBotApi) -> None:
        self.bot = bot


@pytest.fixture(autouse=True)
def no_sleeping(monkeypatch):
    import app.telegram.bot as module

    async def instant(_delay):
        return None

    monkeypatch.setattr(module.asyncio, "sleep", instant)


def make_bot(context, api: FakeBotApi, settings: Settings | None = None) -> TelegramBot:
    bot = TelegramBot(settings or context.settings, context)
    bot.application = FakeApplicationWithBot(api)  # type: ignore[assignment]
    bot.enabled = True
    return bot


async def test_a_signal_is_delivered_to_the_configured_chat(context):
    api = FakeBotApi()
    bot = make_bot(context, api)

    assert await bot.send_signal(make_signal()) is True
    assert api.sent[0]["chat_id"] == "111"
    assert api.sent[0]["parse_mode"] == "HTML"
    assert "BTC/USDT" in api.sent[0]["text"]


async def test_delivery_retries_on_a_network_error(context):
    api = FakeBotApi(failures=[NetworkError("down")])
    bot = make_bot(context, api)

    assert await bot.send_text("hello") is True
    assert len(api.sent) == 1


async def test_delivery_respects_a_rate_limit(context):
    api = FakeBotApi(failures=[RetryAfter(0)])
    bot = make_bot(context, api)

    assert await bot.send_text("hello") is True


async def test_delivery_gives_up_after_repeated_failures(context):
    api = FakeBotApi(failures=[NetworkError("down")] * 10)
    bot = make_bot(context, api)

    assert await bot.send_text("hello") is False
    assert api.sent == []


async def test_an_unconfigured_bot_never_sends(context):
    settings = Settings()   # no token, no chat id
    bot = TelegramBot(settings, context)

    assert bot.enabled is False
    assert await bot.send_text("hello") is False
    assert await bot.start() is False


async def test_startup_and_shutdown_notices(context):
    api = FakeBotApi()
    bot = make_bot(context, api)

    await bot.send_startup_notice(30)
    await bot.send_shutdown_notice()

    assert "Tracking 30 spot pairs" in api.sent[0]["text"]
    assert "No real orders will be placed." in api.sent[0]["text"]
    assert "stopped" in api.sent[1]["text"]


async def test_stopping_a_bot_that_never_started_is_safe(context):
    bot = TelegramBot(context.settings, context)
    await bot.stop()
