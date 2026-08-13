"""Persistence layer."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.config import Settings
from app.database.database import Database, _safe_url, as_utc


@pytest.fixture
async def database(tmp_path):
    settings = Settings(
        database_url=f"sqlite+aiosqlite:///{tmp_path}/test.db",
        paper_start_balance=1000.0,
    )
    db = Database(settings)
    await db.init()
    try:
        yield db
    finally:
        await db.close()


def signal_kwargs(symbol: str = "BTCUSDT", score: float = 82.0, side: str = "BUY") -> dict:
    return {
        "symbol": symbol,
        "side": side,
        "label": "STRONG BUY",
        "score": score,
        "price": 100.0,
        "entry": 100.0,
        "entry_low": 99.9,
        "entry_high": 100.1,
        "tp1": 102.0,
        "tp2": 103.0,
        "tp3": 104.0,
        "stop_loss": 98.0,
        "risk_reward": 2.0,
        "atr": 1.0,
        "timeframe": "1m",
        "setup": "EMA crossover",
        "trends": '{"15m":"Bullish"}',
        "candle_time": 1_700_000_000_000,
        "status": "ACTIVE",
        "created_at": datetime.now(tz=timezone.utc),
    }


# ----------------------------------------------------------------------
# Signals
# ----------------------------------------------------------------------
async def test_a_signal_round_trips_with_its_reasons(database):
    signal_id = await database.save_signal(
        **signal_kwargs(),
        reasons=[
            {
                "indicator": "trend_15m",
                "value": 1.0,
                "score": 15.0,
                "max_score": 15.0,
                "description": "15m trend bullish",
            },
            {
                "indicator": "rsi",
                "value": 57.0,
                "score": 10.0,
                "max_score": 10.0,
                "description": "RSI 57",
            },
        ],
    )
    assert signal_id is not None

    record = await database.get_signal(signal_id)
    assert record.symbol == "BTCUSDT"
    assert record.score == pytest.approx(82.0)
    assert record.status == "ACTIVE"
    assert len(record.reasons) == 2
    assert {reason.indicator for reason in record.reasons} == {"trend_15m", "rsi"}


async def test_updating_a_signal_records_the_outcome(database):
    signal_id = await database.save_signal(**signal_kwargs())
    closed_at = datetime.now(tz=timezone.utc)

    assert await database.update_signal_status(
        signal_id,
        "TP2_HIT",
        result="WIN",
        pnl_percent=1.5,
        closed_at=closed_at,
        max_favorable_percent=2.0,
        max_adverse_percent=-0.4,
    )

    record = await database.get_signal(signal_id)
    assert record.status == "TP2_HIT"
    assert record.result == "WIN"
    assert record.pnl_percent == pytest.approx(1.5)
    assert record.max_adverse_percent == pytest.approx(-0.4)
    assert as_utc(record.closed_at) is not None


async def test_recent_signals_are_newest_first_and_filterable(database):
    for index, symbol in enumerate(["BTCUSDT", "ETHUSDT", "BTCUSDT"]):
        kwargs = signal_kwargs(symbol=symbol, score=70 + index)
        kwargs["created_at"] = datetime(2026, 1, 1, 12, index, tzinfo=timezone.utc)
        await database.save_signal(**kwargs)

    recent = await database.recent_signals(limit=10)
    assert len(recent) == 3
    assert recent[0].score == pytest.approx(72.0)

    only_btc = await database.recent_signals(limit=10, symbol="BTCUSDT")
    assert {record.symbol for record in only_btc} == {"BTCUSDT"}
    assert len(only_btc) == 2


async def test_open_signals_exclude_closed_ones(database):
    open_id = await database.save_signal(**signal_kwargs())
    closed_id = await database.save_signal(**signal_kwargs(symbol="ETHUSDT"))
    await database.update_signal_status(closed_id, "STOP_LOSS")

    open_signals = await database.open_signals()
    assert [record.id for record in open_signals] == [open_id]


async def test_signal_stats_aggregate_outcomes(database):
    win = await database.save_signal(**signal_kwargs())
    loss = await database.save_signal(**signal_kwargs(symbol="ETHUSDT"))
    await database.save_signal(**signal_kwargs(symbol="SOLUSDT"))

    now = datetime.now(tz=timezone.utc)
    await database.update_signal_status(win, "TP3_HIT", pnl_percent=2.0, closed_at=now)
    await database.update_signal_status(loss, "STOP_LOSS", pnl_percent=-1.0, closed_at=now)

    stats = await database.signal_stats()
    assert stats["total"] == 3
    assert stats["closed"] == 2
    assert stats["wins"] == 1
    assert stats["losses"] == 1
    assert stats["win_rate"] == pytest.approx(50.0)
    assert stats["open"] == 1
    assert stats["buy"] == 3


async def test_top_symbols_ranks_by_average_outcome(database):
    now = datetime.now(tz=timezone.utc)
    good = await database.save_signal(**signal_kwargs(symbol="SOLUSDT"))
    bad = await database.save_signal(**signal_kwargs(symbol="ADAUSDT"))
    await database.update_signal_status(good, "TP3_HIT", pnl_percent=3.0, closed_at=now)
    await database.update_signal_status(bad, "STOP_LOSS", pnl_percent=-1.0, closed_at=now)

    top = await database.top_symbols(limit=5, days=7)
    assert top[0]["symbol"] == "SOLUSDT"
    assert top[0]["avg_pnl"] == pytest.approx(3.0)


# ----------------------------------------------------------------------
# Snapshots
# ----------------------------------------------------------------------
async def test_snapshots_are_saved_and_pruned(database):
    await database.save_snapshot(
        symbol="BTCUSDT",
        timestamp=datetime(2020, 1, 1, tzinfo=timezone.utc),
        timeframe="1m",
        price=100.0,
        volume=10.0,
        rsi=57.0,
        macd=0.4,
        ema9=99.9,
        ema21=99.7,
        ema50=99.0,
        vwap=99.8,
        atr=1.0,
    )
    assert await database.prune_snapshots(keep_days=14) == 1


# ----------------------------------------------------------------------
# Paper trades and account
# ----------------------------------------------------------------------
async def test_paper_trades_round_trip(database):
    trade_id = await database.create_paper_trade(
        symbol="BTCUSDT",
        side="BUY",
        entry_price=100.0,
        quantity=5.0,
        remaining_quantity=5.0,
        stop_loss=98.0,
        tp1=102.0,
        tp2=103.0,
        tp3=104.0,
        risk_amount=10.0,
        notional=500.0,
        status="OPEN",
        opened_at=datetime.now(tz=timezone.utc),
    )
    assert trade_id is not None
    assert len(await database.open_paper_trades()) == 1

    await database.update_paper_trade(
        trade_id,
        status="CLOSED",
        exit_price=103.0,
        pnl=14.0,
        pnl_percent=2.8,
        closed_at=datetime.now(tz=timezone.utc),
        result="WIN",
    )
    assert await database.open_paper_trades() == []

    closed = await database.closed_paper_trades()
    assert len(closed) == 1
    assert closed[0].pnl == pytest.approx(14.0)


async def test_the_account_row_is_created_once(database):
    account = await database.get_account()
    assert account.balance == pytest.approx(1000.0)

    await database.update_account(balance=1050.0, equity_peak=1075.0)
    refreshed = await database.get_account()
    assert refreshed.id == account.id
    assert refreshed.balance == pytest.approx(1050.0)
    assert refreshed.equity_peak == pytest.approx(1075.0)


async def test_settings_persist(database):
    assert await database.get_setting("signals_enabled", "true") == "true"

    await database.set_setting("signals_enabled", "false")
    assert await database.get_setting("signals_enabled") == "false"

    await database.set_setting("signals_enabled", "true")
    assert await database.get_setting("signals_enabled") == "true"


# ----------------------------------------------------------------------
# Robustness
# ----------------------------------------------------------------------
async def test_a_bad_write_is_logged_rather_than_raised(database):
    # `nonexistent_column` is not a field on the model.
    assert await database.create_paper_trade(nonexistent_column=1) is None
    assert await database.update_signal_status(999_999, "TP1_HIT") is True


async def test_using_the_database_before_init_fails_loudly():
    db = Database(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    with pytest.raises(RuntimeError):
        async with db.session():
            pass


def test_credentials_are_stripped_from_logged_urls():
    masked = _safe_url("postgresql+asyncpg://user:secret@db.internal:5432/bot")
    assert "secret" not in masked
    assert "db.internal:5432/bot" in masked
    assert _safe_url("sqlite+aiosqlite:///./data/signals.db").endswith("signals.db")


def test_naive_timestamps_are_treated_as_utc():
    naive = datetime(2026, 1, 1, 12, 0)
    assert as_utc(naive).tzinfo is timezone.utc
    assert as_utc(None) is None
