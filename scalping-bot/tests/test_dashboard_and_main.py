"""Dashboard API endpoints and the application wiring in ``app.main``."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.dashboard import create_dashboard
from app.main import ScalpingBot
from app.market.store import MarketStore
from app.paper.trader import PaperTrader
from app.strategy.models import SignalStatus, SignalUpdate
from app.strategy.signal_engine import SignalEngine

from tests.conftest import make_analysis, make_candle
from tests.test_paper_trading import make_signal
from tests.test_telegram import FakeDatabase


class FakeBot:
    """The minimum surface the dashboard needs."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.ready = True
        self.store = MarketStore(settings)
        self.store.set_symbols(["BTCUSDT"])
        self.engine = SignalEngine(settings, self.store)
        self.paper = PaperTrader(settings)
        self.database = DashboardDatabase()

    def status(self) -> dict:
        return {"ready": self.ready, "engine": self.engine.status()}


class DashboardDatabase(FakeDatabase):
    async def recent_signals(self, limit: int = 10, symbol: str | None = None):
        rows = await FakeDatabase.recent_signals(self, limit=limit)
        for row in rows:
            row.id = 1
            row.label = "STRONG BUY"
            row.entry = 100.0
            row.stop_loss = 98.0
            row.tp1, row.tp2, row.tp3 = 102.0, 103.0, 104.0
            row.risk_reward = 2.0
            row.result = "WIN"
            row.setup = "EMA crossover"
            row.closed_at = None
        return rows

    async def top_symbols(self, limit: int = 5, days: int = 7):
        return [{"symbol": "BTCUSDT", "count": 3, "avg_pnl": 1.2}]


@pytest.fixture
def api_client(settings: Settings):
    bot = FakeBot(settings)
    with TestClient(create_dashboard(bot)) as client:
        yield client, bot


# ----------------------------------------------------------------------
# Dashboard
# ----------------------------------------------------------------------
def test_health_reports_the_trading_mode(api_client):
    client, _ = api_client
    payload = client.get("/health").json()

    assert payload["status"] == "ok"
    assert payload["paper_trading"] is True
    assert payload["real_trading"] is False


def test_status_and_market_endpoints(api_client):
    client, _ = api_client

    assert client.get("/api/status").json()["ready"] is True
    market = client.get("/api/market").json()
    assert market["symbols"] == ["BTCUSDT"]
    assert market["symbols_tracked"] == 1


def test_active_signals_are_exposed(api_client):
    client, bot = api_client
    signal = make_signal()
    bot.engine.active_signals["BTCUSDT"] = signal

    rows = client.get("/api/signals/active").json()
    assert len(rows) == 1
    assert rows[0]["symbol"] == "BTCUSDT"
    assert rows[0]["tp1"] == pytest.approx(signal.tp1)


def test_recent_signals_and_stats(api_client):
    client, _ = api_client

    rows = client.get("/api/signals/recent?limit=5").json()
    assert rows[0]["symbol"] == "BTCUSDT"

    stats = client.get("/api/signals/stats").json()
    assert stats["total"] == 3


def test_the_top_endpoint_ranks_scores(api_client, settings):
    client, bot = api_client
    from app.strategy.scoring import score_buy

    bot.engine.latest_scores["BTCUSDT"] = score_buy(make_analysis(), settings)

    rows = client.get("/api/top").json()
    assert rows[0]["symbol"] == "BTCUSDT"
    assert rows[0]["side"] == "BUY"
    assert rows[0]["mandatory_passed"] is True


def test_symbol_detail_includes_the_breakdown(api_client, settings):
    client, bot = api_client
    from app.strategy.scoring import score_buy

    bot.engine.latest_scores["BTCUSDT"] = score_buy(make_analysis(), settings)

    payload = client.get("/api/symbols/btcusdt").json()
    assert payload["symbol"] == "BTCUSDT"
    assert len(payload["score"]["components"]) == 9


def test_an_untracked_symbol_returns_404(api_client):
    client, _ = api_client
    assert client.get("/api/symbols/NOPEUSDT").status_code == 404


def test_the_paper_endpoint_reports_the_account(api_client):
    client, _ = api_client
    payload = client.get("/api/paper").json()

    assert payload["balance"] == pytest.approx(1000.0)
    assert payload["open_positions"] == []
    assert "metrics" in payload


def test_top_symbols_endpoint(api_client):
    client, _ = api_client
    assert client.get("/api/top-symbols").json()[0]["symbol"] == "BTCUSDT"


def test_no_endpoint_can_place_an_order(api_client):
    """The API is read-only by construction."""
    client, _ = api_client
    routes = client.app.routes

    for route in routes:
        methods = getattr(route, "methods", set())
        assert methods <= {"GET", "HEAD"}


def test_no_endpoint_leaks_a_secret(settings):
    revealing = Settings(
        **{
            **settings.__dict__,
            "binance_api_key": "PUBLIC-KEY",
            "binance_api_secret": "TOP-SECRET",
            "telegram_bot_token": "BOT-TOKEN",
        }
    )
    bot = FakeBot(revealing)
    with TestClient(create_dashboard(bot)) as client:
        for path in ("/health", "/api/status", "/api/market", "/api/paper"):
            body = client.get(path).text
            assert "TOP-SECRET" not in body
            assert "BOT-TOKEN" not in body
            assert "PUBLIC-KEY" not in body


# ----------------------------------------------------------------------
# Application wiring
# ----------------------------------------------------------------------
class RecordingTelegram:
    def __init__(self) -> None:
        self.signals: list = []
        self.updates: list = []

    async def send_signal(self, signal) -> bool:
        self.signals.append(signal)
        return True

    async def send_update(self, update) -> bool:
        self.updates.append(update)
        return True


class RecordingDatabase:
    def __init__(self) -> None:
        self.saved: list[dict] = []
        self.updated: list[tuple] = []
        self.snapshots: list[dict] = []

    async def save_signal(self, **kwargs):
        self.saved.append(kwargs)
        return 42

    async def update_signal_status(self, signal_id, status, **kwargs):
        self.updated.append((signal_id, status, kwargs))
        return True

    async def save_snapshot(self, **kwargs) -> None:
        self.snapshots.append(kwargs)


@pytest.fixture
def wired_bot(settings: Settings) -> ScalpingBot:
    bot = ScalpingBot(settings)
    bot.database = RecordingDatabase()  # type: ignore[assignment]
    bot.telegram = RecordingTelegram()  # type: ignore[assignment]
    bot.paper = PaperTrader(settings)
    # A fixed analysis so the snapshot step has something to write.
    bot.engine.analyze = lambda symbol, order_book=None: make_analysis()  # type: ignore[assignment]
    return bot


async def test_a_new_signal_is_persisted_published_and_paper_traded(wired_bot):
    signal = make_signal()

    await wired_bot.handle_signal(signal)

    assert signal.db_id == 42
    saved = wired_bot.database.saved[0]
    assert saved["symbol"] == "BTCUSDT"
    assert saved["side"] == "BUY"
    assert saved["reasons"] == []
    assert wired_bot.database.snapshots[0]["symbol"] == "BTCUSDT"
    assert wired_bot.telegram.signals == [signal]
    assert "BTCUSDT" in wired_bot.paper.positions


async def test_the_scoring_breakdown_is_persisted(wired_bot, settings):
    from app.strategy.scoring import score_buy

    signal = make_signal()
    signal.components = score_buy(make_analysis(), settings).components

    await wired_bot.handle_signal(signal)

    reasons = wired_bot.database.saved[0]["reasons"]
    assert len(reasons) == 9
    assert {reason["indicator"] for reason in reasons} >= {"trend_15m", "rsi", "volume"}


async def test_a_lifecycle_update_is_persisted_and_published(wired_bot):
    signal = make_signal()
    await wired_bot.handle_signal(signal)

    update = SignalUpdate(
        signal=signal,
        previous_status=SignalStatus.ACTIVE,
        new_status=SignalStatus.TP3_HIT,
        price=signal.tp3,
        pnl_percent=4.0,
    )
    await wired_bot.handle_update(update)

    signal_id, status, kwargs = wired_bot.database.updated[0]
    assert signal_id == 42
    assert status == "TP3_HIT"
    assert kwargs["result"] == "WIN"
    assert kwargs["closed_at"] is not None
    assert wired_bot.telegram.updates == [update]
    # The paper position was closed by the same update.
    assert wired_bot.paper.positions == {}


async def test_a_stop_out_is_recorded_as_a_loss(wired_bot):
    signal = make_signal()
    await wired_bot.handle_signal(signal)

    await wired_bot.handle_update(
        SignalUpdate(
            signal=signal,
            previous_status=SignalStatus.ACTIVE,
            new_status=SignalStatus.STOP_LOSS,
            price=signal.stop_loss,
            pnl_percent=-2.0,
        )
    )

    _, status, kwargs = wired_bot.database.updated[0]
    assert status == "STOP_LOSS"
    assert kwargs["result"] == "LOSS"


def test_the_bot_reports_its_mode(settings):
    bot = ScalpingBot(settings)
    status = bot.status()

    assert status["paper_trading"] is True
    assert status["real_trading"] is False
    assert status["ready"] is False


def test_the_bot_wires_the_stream_callback_to_the_engine(settings):
    bot = ScalpingBot(settings)
    assert bot.streams.on_closed_candle == bot._on_closed_candle
    assert bot.engine.on_signal == bot.handle_signal
    assert bot.engine.on_update == bot.handle_update
    assert bot.telegram_context.engine is bot.engine
