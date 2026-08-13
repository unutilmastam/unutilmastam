"""SQLAlchemy ORM models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


class Base(DeclarativeBase):
    """Declarative base for every table."""


class Signal(Base):
    """One published trading signal and its lifecycle outcome."""

    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[str] = mapped_column(String(8))
    label: Mapped[str] = mapped_column(String(32), default="")
    score: Mapped[float] = mapped_column(Float, default=0.0)

    price: Mapped[float] = mapped_column(Float, default=0.0)
    entry: Mapped[float] = mapped_column(Float, default=0.0)
    entry_low: Mapped[float] = mapped_column(Float, default=0.0)
    entry_high: Mapped[float] = mapped_column(Float, default=0.0)
    tp1: Mapped[float] = mapped_column(Float, default=0.0)
    tp2: Mapped[float] = mapped_column(Float, default=0.0)
    tp3: Mapped[float] = mapped_column(Float, default=0.0)
    stop_loss: Mapped[float] = mapped_column(Float, default=0.0)
    risk_reward: Mapped[float] = mapped_column(Float, default=0.0)
    atr: Mapped[float] = mapped_column(Float, default=0.0)

    timeframe: Mapped[str] = mapped_column(String(8), default="1m")
    setup: Mapped[str] = mapped_column(String(128), default="")
    trends: Mapped[str] = mapped_column(Text, default="")
    candle_time: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[str] = mapped_column(String(16), default="NEW", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[str] = mapped_column(String(32), default="")
    pnl_percent: Mapped[float] = mapped_column(Float, default=0.0)
    max_favorable_percent: Mapped[float] = mapped_column(Float, default=0.0)
    max_adverse_percent: Mapped[float] = mapped_column(Float, default=0.0)

    reasons: Mapped[list["SignalReason"]] = relationship(
        back_populates="signal",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (Index("ix_signals_symbol_created", "symbol", "created_at"),)


class SignalReason(Base):
    """One scored condition behind a signal, kept for auditability."""

    __tablename__ = "signal_reasons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    signal_id: Mapped[int] = mapped_column(
        ForeignKey("signals.id", ondelete="CASCADE"), index=True
    )
    indicator: Mapped[str] = mapped_column(String(32))
    value: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    max_score: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[str] = mapped_column(String(256), default="")

    signal: Mapped[Signal] = relationship(back_populates="reasons")


class MarketSnapshot(Base):
    """Indicator state captured at signal time (and for later analysis)."""

    __tablename__ = "market_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    timeframe: Mapped[str] = mapped_column(String(8), default="1m")
    price: Mapped[float] = mapped_column(Float, default=0.0)
    volume: Mapped[float] = mapped_column(Float, default=0.0)
    volume_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    rsi: Mapped[float] = mapped_column(Float, default=0.0)
    macd: Mapped[float] = mapped_column(Float, default=0.0)
    macd_signal: Mapped[float] = mapped_column(Float, default=0.0)
    ema9: Mapped[float] = mapped_column(Float, default=0.0)
    ema21: Mapped[float] = mapped_column(Float, default=0.0)
    ema50: Mapped[float] = mapped_column(Float, default=0.0)
    vwap: Mapped[float] = mapped_column(Float, default=0.0)
    atr: Mapped[float] = mapped_column(Float, default=0.0)


class PaperTrade(Base):
    """A virtual position opened from a signal. No real order is ever sent."""

    __tablename__ = "paper_trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    signal_id: Mapped[int | None] = mapped_column(
        ForeignKey("signals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[str] = mapped_column(String(8))

    entry_price: Mapped[float] = mapped_column(Float, default=0.0)
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    remaining_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    stop_loss: Mapped[float] = mapped_column(Float, default=0.0)
    tp1: Mapped[float] = mapped_column(Float, default=0.0)
    tp2: Mapped[float] = mapped_column(Float, default=0.0)
    tp3: Mapped[float] = mapped_column(Float, default=0.0)

    risk_amount: Mapped[float] = mapped_column(Float, default=0.0)
    notional: Mapped[float] = mapped_column(Float, default=0.0)

    status: Mapped[str] = mapped_column(String(16), default="OPEN", index=True)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exit_price: Mapped[float] = mapped_column(Float, default=0.0)
    pnl: Mapped[float] = mapped_column(Float, default=0.0)
    pnl_percent: Mapped[float] = mapped_column(Float, default=0.0)
    fees: Mapped[float] = mapped_column(Float, default=0.0)
    result: Mapped[str] = mapped_column(String(16), default="")
    exit_reason: Mapped[str] = mapped_column(String(64), default="")
    targets_hit: Mapped[int] = mapped_column(Integer, default=0)


class AccountState(Base):
    """Single-row table holding the paper trading balance."""

    __tablename__ = "account_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    balance: Mapped[float] = mapped_column(Float, default=0.0)
    equity_peak: Mapped[float] = mapped_column(Float, default=0.0)
    start_balance: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BotSetting(Base):
    """Runtime toggles that survive a restart (e.g. signals enabled)."""

    __tablename__ = "bot_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(256), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
