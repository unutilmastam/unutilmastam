"""End-to-end integration: a closed candle in, rows in the database out.

This drives the real ``ScalpingBot`` wiring against a real (temporary)
SQLite database, with only Telegram and the market analysis stubbed. It is
the deterministic counterpart to running the bot against the mock exchange:
it proves the pipeline persists what it publishes.
"""

from __future__ import annotations

import pytest

from app.config import TF_ENTRY, Settings
from app.database.database import Database
from app.main import ScalpingBot
from app.market.store import ClosedCandleEvent
from app.strategy.models import SignalStatus
from app.utils.helpers import now_ms

from tests.conftest import make_analysis, make_candle

MINUTE = 60_000


class SilentTelegram:
    """Stands in for the Telegram layer."""

    def __init__(self) -> None:
        self.signals: list = []
        self.updates: list = []

    async def send_signal(self, signal) -> bool:
        self.signals.append(signal)
        return True

    async def send_update(self, update) -> bool:
        self.updates.append(update)
        return True


@pytest.fixture
async def bot(tmp_path):
    """A wired bot with a real database and no network."""
    settings = Settings(
        database_url=f"sqlite+aiosqlite:///{tmp_path}/integration.db",
        paper_start_balance=1000.0,
        min_signal_score=75,
        telegram_bot_token="",
        telegram_chat_id="",
    )
    instance = ScalpingBot(settings)
    instance.telegram = SilentTelegram()  # type: ignore[assignment]
    # No network: without this the engine would try to fetch a real depth
    # snapshot from Binance when a setup nears the threshold.
    instance.engine.rest_client = None
    await instance.database.init()

    instance.store.set_symbols(["BTCUSDT"])
    instance.store.update_kline(
        "BTCUSDT",
        TF_ENTRY,
        make_candle(now_ms() - MINUTE, 100, 100.5, 99.5, 100.0),
        is_closed=True,
    )
    # A fixed, strong analysis: the strategy itself is tested elsewhere.
    instance.engine.analyze = lambda symbol, order_book=None: make_analysis()  # type: ignore[assignment]

    try:
        yield instance
    finally:
        await instance.database.close()


async def _row_counts(database: Database) -> dict[str, int]:
    counts = {}
    async with database.session() as session:
        from sqlalchemy import func, select

        from app.database.models import PaperTrade, Signal, SignalReason

        for name, model in (
            ("signals", Signal),
            ("signal_reasons", SignalReason),
            ("paper_trades", PaperTrade),
        ):
            result = await session.execute(select(func.count()).select_from(model))
            counts[name] = int(result.scalar_one())
    return counts


async def test_a_closed_candle_produces_a_persisted_signal_and_paper_trade(bot):
    await bot.engine.on_closed_candle(
        ClosedCandleEvent(
            symbol="BTCUSDT",
            interval=TF_ENTRY,
            candle=make_candle(now_ms() - MINUTE, 100, 100.5, 99.5, 100.0),
        )
    )

    counts = await _row_counts(bot.database)
    assert counts["signals"] == 1
    assert counts["signal_reasons"] == 9      # one row per scored component
    assert counts["paper_trades"] == 1

    stored = (await bot.database.recent_signals(limit=1))[0]
    assert stored.symbol == "BTCUSDT"
    assert stored.side == "BUY"
    assert stored.score >= 75
    assert stored.status == "ACTIVE"
    assert stored.stop_loss < stored.entry < stored.tp1 < stored.tp2 < stored.tp3
    assert stored.risk_reward >= 1.5
    assert "15m" in stored.trends
    assert len(stored.reasons) == 9

    # Telegram received the same signal.
    assert len(bot.telegram.signals) == 1
    assert bot.telegram.signals[0].db_id == stored.id

    # And the paper account opened a position for it.
    assert "BTCUSDT" in bot.paper.positions
    position = bot.paper.positions["BTCUSDT"]
    assert position.signal_id == stored.id
    assert position.quantity > 0


async def test_a_market_snapshot_is_recorded_alongside_the_signal(bot):
    await bot.engine.evaluate("BTCUSDT")

    async with bot.database.session() as session:
        from sqlalchemy import select

        from app.database.models import MarketSnapshot

        rows = (await session.execute(select(MarketSnapshot))).scalars().all()

    assert len(rows) == 1
    assert rows[0].symbol == "BTCUSDT"
    assert rows[0].rsi > 0
    assert rows[0].atr > 0


async def test_the_lifecycle_is_persisted_through_to_the_close(bot):
    signal = await bot.engine.evaluate("BTCUSDT")
    assert signal is not None

    # A candle that reaches every target in turn.
    for level in (signal.tp1, signal.tp2, signal.tp3):
        await bot.engine._monitor_active(
            "BTCUSDT", make_candle(now_ms() - MINUTE, signal.entry, level, signal.entry, level)
        )

    stored = await bot.database.get_signal(signal.db_id)
    assert stored.status == "TP3_HIT"
    assert stored.result == "WIN"
    assert stored.pnl_percent > 0
    assert stored.closed_at is not None

    trades = await bot.database.closed_paper_trades()
    assert len(trades) == 1
    assert trades[0].status == "CLOSED"
    assert trades[0].result == "WIN"
    assert trades[0].pnl > 0
    assert trades[0].targets_hit == 3

    # Cash came back and the account grew by exactly the realised PnL.
    assert bot.paper.positions == {}
    assert bot.paper.balance == pytest.approx(1000.0 + trades[0].pnl)


async def test_a_stop_out_is_persisted_as_a_loss(bot):
    signal = await bot.engine.evaluate("BTCUSDT")
    assert signal is not None

    await bot.engine._monitor_active(
        "BTCUSDT",
        make_candle(now_ms() - MINUTE, signal.entry, signal.entry, signal.stop_loss, signal.stop_loss),
    )

    stored = await bot.database.get_signal(signal.db_id)
    assert stored.status == "STOP_LOSS"
    assert stored.result == "LOSS"
    assert stored.pnl_percent < 0

    trades = await bot.database.closed_paper_trades()
    assert trades[0].result == "LOSS"
    assert bot.paper.balance < 1000.0


async def test_the_duplicate_filter_holds_across_the_whole_stack(bot):
    for _ in range(3):
        await bot.engine.on_closed_candle(
            ClosedCandleEvent(
                symbol="BTCUSDT",
                interval=TF_ENTRY,
                candle=make_candle(now_ms() - MINUTE, 100, 100.5, 99.5, 100.0),
            )
        )

    counts = await _row_counts(bot.database)
    assert counts["signals"] == 1          # only the first one was published
    assert counts["paper_trades"] == 1
    assert len(bot.telegram.signals) == 1


async def test_signal_stats_reflect_the_persisted_history(bot):
    signal = await bot.engine.evaluate("BTCUSDT")
    assert signal is not None
    await bot.engine._monitor_active(
        "BTCUSDT",
        make_candle(now_ms() - MINUTE, signal.entry, signal.tp3, signal.entry, signal.tp3),
    )

    stats = await bot.database.signal_stats()
    assert stats["total"] == 1
    assert stats["closed"] == 1
    assert stats["wins"] == 1
    assert stats["win_rate"] == pytest.approx(100.0)


async def test_every_evaluation_is_accounted_for_in_the_counters(bot):
    """No evaluation may vanish between the counters `/status` reports."""
    await bot.engine.evaluate("BTCUSDT")          # publishes
    await bot.engine.evaluate("BTCUSDT")          # duplicate
    bot.store.candles["BTCUSDT"][TF_ENTRY].clear()
    bot.store.update_kline(
        "BTCUSDT",
        TF_ENTRY,
        make_candle(now_ms() - 3_600_000, 100, 101, 99, 100),
        is_closed=True,
    )
    await bot.engine.evaluate("BTCUSDT")          # stale

    status = bot.engine.status()
    accounted = (
        status["published"]
        + status["rejected_stale"]
        + status["rejected_warmup"]
        + status["rejected_mandatory"]
        + status["rejected_score"]
        + status["rejected_filters"]
        + status["rejected_risk"]
        + status["rejected_duplicate"]
    )
    assert accounted == status["evaluations"] == 3
    assert status["rejected_stale"] == 1
    assert status["rejected_duplicate"] == 1
