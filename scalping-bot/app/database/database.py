"""Async database access layer.

Every write goes through a short transaction and is wrapped so that a
database problem degrades the bot (a lost record) instead of killing it.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Sequence

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.database.models import (
    AccountState,
    Base,
    BotSetting,
    MarketSnapshot,
    PaperTrade,
    Signal,
    SignalReason,
)
from app.utils.logger import get_logger

logger = get_logger(__name__)

OPEN_SIGNAL_STATUSES = ("NEW", "ACTIVE", "TP1_HIT", "TP2_HIT")


def _ensure_sqlite_dir(url: str) -> None:
    """Create the directory for a file-backed SQLite database."""
    marker = "sqlite+aiosqlite:///"
    if not url.startswith(marker):
        return
    raw_path = url[len(marker) :]
    if not raw_path or raw_path == ":memory:":
        return
    path = Path(raw_path)
    if path.parent and str(path.parent) not in ("", "."):
        path.parent.mkdir(parents=True, exist_ok=True)


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite drops tzinfo; re-attach UTC so comparisons stay safe."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class Database:
    """Owns the engine and exposes the queries the bot needs."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.url = settings.database_url
        self._engine = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def init(self) -> None:
        """Create the engine and the schema."""
        _ensure_sqlite_dir(self.url)
        self._engine = create_async_engine(self.url, echo=False, future=True, pool_pre_ping=True)
        self._session_factory = async_sessionmaker(
            self._engine, expire_on_commit=False, class_=AsyncSession
        )
        async with self._engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        logger.info("Database ready (%s)", _safe_url(self.url))

    async def close(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
            self._session_factory = None

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        if self._session_factory is None:
            raise RuntimeError("Database.init() must be awaited before use")
        async with self._session_factory() as session:
            yield session

    # ------------------------------------------------------------------
    # Signals
    # ------------------------------------------------------------------
    async def save_signal(
        self,
        *,
        symbol: str,
        side: str,
        label: str,
        score: float,
        price: float,
        entry: float,
        entry_low: float,
        entry_high: float,
        tp1: float,
        tp2: float,
        tp3: float,
        stop_loss: float,
        risk_reward: float,
        atr: float,
        timeframe: str,
        setup: str,
        trends: str,
        candle_time: int,
        status: str,
        created_at: datetime,
        reasons: Sequence[dict[str, Any]] = (),
    ) -> int | None:
        """Insert a signal with its scoring breakdown; returns the new id."""
        try:
            async with self.session() as session:
                async with session.begin():
                    record = Signal(
                        symbol=symbol,
                        side=side,
                        label=label,
                        score=score,
                        price=price,
                        entry=entry,
                        entry_low=entry_low,
                        entry_high=entry_high,
                        tp1=tp1,
                        tp2=tp2,
                        tp3=tp3,
                        stop_loss=stop_loss,
                        risk_reward=risk_reward,
                        atr=atr,
                        timeframe=timeframe,
                        setup=setup,
                        trends=trends,
                        candle_time=candle_time,
                        status=status,
                        created_at=created_at,
                    )
                    for reason in reasons:
                        record.reasons.append(
                            SignalReason(
                                indicator=str(reason.get("indicator", "")),
                                value=float(reason.get("value", 0.0)),
                                score=float(reason.get("score", 0.0)),
                                max_score=float(reason.get("max_score", 0.0)),
                                description=str(reason.get("description", ""))[:256],
                            )
                        )
                    session.add(record)
                return record.id
        except Exception as exc:  # noqa: BLE001 - persistence must not crash the bot
            logger.exception("Failed to save signal for %s: %s", symbol, exc)
            return None

    async def update_signal_status(
        self,
        signal_id: int,
        status: str,
        *,
        result: str | None = None,
        pnl_percent: float | None = None,
        closed_at: datetime | None = None,
        max_favorable_percent: float | None = None,
        max_adverse_percent: float | None = None,
    ) -> bool:
        values: dict[str, Any] = {"status": status}
        if result is not None:
            values["result"] = result
        if pnl_percent is not None:
            values["pnl_percent"] = pnl_percent
        if closed_at is not None:
            values["closed_at"] = closed_at
        if max_favorable_percent is not None:
            values["max_favorable_percent"] = max_favorable_percent
        if max_adverse_percent is not None:
            values["max_adverse_percent"] = max_adverse_percent

        try:
            async with self.session() as session:
                async with session.begin():
                    await session.execute(
                        update(Signal).where(Signal.id == signal_id).values(**values)
                    )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to update signal %s: %s", signal_id, exc)
            return False

    async def get_signal(self, signal_id: int) -> Signal | None:
        async with self.session() as session:
            return await session.get(Signal, signal_id)

    async def recent_signals(
        self,
        limit: int = 10,
        symbol: str | None = None,
        side: str | None = None,
    ) -> list[Signal]:
        query = select(Signal).order_by(Signal.created_at.desc()).limit(limit)
        if symbol:
            query = query.where(Signal.symbol == symbol.upper())
        if side:
            query = query.where(Signal.side == side.upper())
        async with self.session() as session:
            result = await session.execute(query)
            return list(result.scalars().all())

    async def open_signals(self) -> list[Signal]:
        query = (
            select(Signal)
            .where(Signal.status.in_(OPEN_SIGNAL_STATUSES))
            .order_by(Signal.created_at.desc())
        )
        async with self.session() as session:
            result = await session.execute(query)
            return list(result.scalars().all())

    async def signal_stats(self, days: int | None = None) -> dict[str, Any]:
        """Aggregate signal outcomes for ``/status`` and the dashboard."""
        query = select(Signal)
        if days is not None:
            since = datetime.now(tz=timezone.utc) - timedelta(days=days)
            query = query.where(Signal.created_at >= since)

        async with self.session() as session:
            result = await session.execute(query)
            signals = list(result.scalars().all())

        total = len(signals)
        closed = [item for item in signals if item.closed_at is not None]
        wins = [item for item in closed if item.pnl_percent > 0]
        losses = [item for item in closed if item.pnl_percent <= 0]

        return {
            "total": total,
            "open": sum(1 for item in signals if item.status in OPEN_SIGNAL_STATUSES),
            "closed": len(closed),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": (len(wins) / len(closed) * 100.0) if closed else 0.0,
            "avg_pnl_percent": (
                sum(item.pnl_percent for item in closed) / len(closed) if closed else 0.0
            ),
            "buy": sum(1 for item in signals if item.side == "BUY"),
            "sell": sum(1 for item in signals if item.side == "SELL"),
        }

    async def top_symbols(self, limit: int = 5, days: int = 7) -> list[dict[str, Any]]:
        """Symbols with the best realised outcome over the recent window."""
        since = datetime.now(tz=timezone.utc) - timedelta(days=days)
        query = (
            select(
                Signal.symbol,
                func.count(Signal.id).label("count"),
                func.avg(Signal.pnl_percent).label("avg_pnl"),
            )
            .where(Signal.created_at >= since, Signal.closed_at.is_not(None))
            .group_by(Signal.symbol)
            .order_by(func.avg(Signal.pnl_percent).desc())
            .limit(limit)
        )
        async with self.session() as session:
            result = await session.execute(query)
            return [
                {"symbol": row.symbol, "count": row.count, "avg_pnl": float(row.avg_pnl or 0.0)}
                for row in result
            ]

    # ------------------------------------------------------------------
    # Market snapshots
    # ------------------------------------------------------------------
    async def save_snapshot(self, **values: Any) -> None:
        try:
            async with self.session() as session:
                async with session.begin():
                    session.add(MarketSnapshot(**values))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to save market snapshot: %s", exc)

    async def prune_snapshots(self, keep_days: int = 14) -> int:
        """Drop old snapshots so a long-running bot does not grow forever."""
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=keep_days)
        try:
            async with self.session() as session:
                async with session.begin():
                    result = await session.execute(
                        delete(MarketSnapshot).where(MarketSnapshot.timestamp < cutoff)
                    )
            return int(result.rowcount or 0)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to prune snapshots: %s", exc)
            return 0

    # ------------------------------------------------------------------
    # Paper trades
    # ------------------------------------------------------------------
    async def create_paper_trade(self, **values: Any) -> int | None:
        try:
            async with self.session() as session:
                async with session.begin():
                    trade = PaperTrade(**values)
                    session.add(trade)
                return trade.id
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to create paper trade: %s", exc)
            return None

    async def update_paper_trade(self, trade_id: int, **values: Any) -> bool:
        try:
            async with self.session() as session:
                async with session.begin():
                    await session.execute(
                        update(PaperTrade).where(PaperTrade.id == trade_id).values(**values)
                    )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to update paper trade %s: %s", trade_id, exc)
            return False

    async def open_paper_trades(self) -> list[PaperTrade]:
        query = select(PaperTrade).where(PaperTrade.status == "OPEN")
        async with self.session() as session:
            result = await session.execute(query)
            return list(result.scalars().all())

    async def closed_paper_trades(self, limit: int | None = None) -> list[PaperTrade]:
        query = (
            select(PaperTrade)
            .where(PaperTrade.status == "CLOSED")
            .order_by(PaperTrade.closed_at.asc())
        )
        if limit:
            query = query.limit(limit)
        async with self.session() as session:
            result = await session.execute(query)
            return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Account + settings
    # ------------------------------------------------------------------
    async def get_account(self) -> AccountState:
        """Fetch (or lazily create) the single account row."""
        async with self.session() as session:
            async with session.begin():
                result = await session.execute(select(AccountState).limit(1))
                account = result.scalar_one_or_none()
                if account is None:
                    account = AccountState(
                        balance=self.settings.paper_start_balance,
                        equity_peak=self.settings.paper_start_balance,
                        start_balance=self.settings.paper_start_balance,
                    )
                    session.add(account)
            return account

    async def update_account(self, balance: float, equity_peak: float) -> None:
        try:
            account = await self.get_account()
            async with self.session() as session:
                async with session.begin():
                    await session.execute(
                        update(AccountState)
                        .where(AccountState.id == account.id)
                        .values(
                            balance=balance,
                            equity_peak=equity_peak,
                            updated_at=datetime.now(tz=timezone.utc),
                        )
                    )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to update account: %s", exc)

    async def get_setting(self, key: str, default: str = "") -> str:
        async with self.session() as session:
            record = await session.get(BotSetting, key)
            return record.value if record is not None else default

    async def set_setting(self, key: str, value: str) -> None:
        try:
            async with self.session() as session:
                async with session.begin():
                    record = await session.get(BotSetting, key)
                    if record is None:
                        session.add(BotSetting(key=key, value=value))
                    else:
                        record.value = value
                        record.updated_at = datetime.now(tz=timezone.utc)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to store setting %s: %s", key, exc)


def _safe_url(url: str) -> str:
    """Hide credentials before a database URL reaches the logs."""
    if "@" not in url:
        return url
    scheme, _, rest = url.partition("://")
    _, _, host = rest.rpartition("@")
    return f"{scheme}://***@{host}"
