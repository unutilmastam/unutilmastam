"""Shared strategy value objects.

These live in their own module so the strategy, database, Telegram and paper
trading layers can all depend on them without importing each other.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class SignalSide(str, Enum):
    """Direction of a signal. Spot only, so SELL means *exit*, not short."""

    BUY = "BUY"
    SELL = "SELL"
    WAIT = "WAIT"


class SignalStatus(str, Enum):
    """Lifecycle state of a signal."""

    NEW = "NEW"
    ACTIVE = "ACTIVE"
    TP1_HIT = "TP1_HIT"
    TP2_HIT = "TP2_HIT"
    TP3_HIT = "TP3_HIT"
    STOP_LOSS = "STOP_LOSS"
    INVALIDATED = "INVALIDATED"
    EXPIRED = "EXPIRED"

    @property
    def is_closed(self) -> bool:
        return self in {
            SignalStatus.TP3_HIT,
            SignalStatus.STOP_LOSS,
            SignalStatus.INVALIDATED,
            SignalStatus.EXPIRED,
        }


class SignalStrength(str, Enum):
    """Human readable bucket derived from the numeric score."""

    NO_TRADE = "NO TRADE"
    WEAK = "WEAK"
    NORMAL = "NORMAL"
    STRONG = "STRONG"
    VERY_STRONG = "VERY STRONG"


# Score thresholds from the strategy specification.
SCORE_THRESHOLDS: tuple[tuple[float, SignalStrength], ...] = (
    (85.0, SignalStrength.VERY_STRONG),
    (75.0, SignalStrength.STRONG),
    (65.0, SignalStrength.NORMAL),
    (50.0, SignalStrength.WEAK),
    (0.0, SignalStrength.NO_TRADE),
)


def classify_score(score: float) -> SignalStrength:
    """Map a 0-100 score onto its strength bucket."""
    for threshold, strength in SCORE_THRESHOLDS:
        if score >= threshold:
            return strength
    return SignalStrength.NO_TRADE


def signal_label(side: SignalSide, score: float) -> str:
    """Telegram-facing label such as ``STRONG BUY`` or ``SELL / EXIT``."""
    strength = classify_score(score)
    if side is SignalSide.WAIT or strength is SignalStrength.NO_TRADE:
        return "NO TRADE"
    if side is SignalSide.BUY:
        if strength is SignalStrength.NORMAL:
            return "BUY"
        if strength is SignalStrength.WEAK:
            return "WEAK BUY"
        return f"{strength.value} BUY"
    # SELL on spot is an exit instruction.
    if strength is SignalStrength.NORMAL:
        return "SELL / EXIT"
    if strength is SignalStrength.WEAK:
        return "WEAK SELL"
    return f"{strength.value} SELL / EXIT"


@dataclass(frozen=True)
class ScoreComponent:
    """One scored condition, kept for transparency and for the database."""

    indicator: str
    value: float
    score: float
    max_score: float
    description: str
    passed: bool = False

    @property
    def ratio(self) -> float:
        if self.max_score <= 0:
            return 0.0
        return self.score / self.max_score


@dataclass(frozen=True)
class ScoreResult:
    """Outcome of scoring one side of the market."""

    side: SignalSide
    total: float
    components: tuple[ScoreComponent, ...] = ()
    mandatory_passed: bool = False
    missing: tuple[str, ...] = ()

    @property
    def strength(self) -> SignalStrength:
        return classify_score(self.total)

    @property
    def label(self) -> str:
        return signal_label(self.side, self.total)

    def component(self, indicator: str) -> ScoreComponent | None:
        for item in self.components:
            if item.indicator == indicator:
                return item
        return None


@dataclass(frozen=True)
class TradePlan:
    """Entry, stop and targets produced by the risk manager."""

    entry: float
    entry_low: float
    entry_high: float
    stop_loss: float
    take_profits: tuple[float, float, float]
    risk_per_unit: float
    risk_reward: float
    atr: float
    stop_distance_percent: float
    reasons: tuple[str, ...] = ()

    @property
    def tp1(self) -> float:
        return self.take_profits[0]

    @property
    def tp2(self) -> float:
        return self.take_profits[1]

    @property
    def tp3(self) -> float:
        return self.take_profits[2]


@dataclass
class Signal:
    """A fully formed trading signal ready to be stored and published."""

    symbol: str
    side: SignalSide
    score: float
    price: float
    entry: float
    entry_low: float
    entry_high: float
    stop_loss: float
    tp1: float
    tp2: float
    tp3: float
    risk_reward: float
    atr: float
    timeframe: str = "1m"
    label: str = ""
    setup: str = ""
    expected_hold: str = "5-30 min"
    status: SignalStatus = SignalStatus.NEW
    candle_time: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))
    components: tuple[ScoreComponent, ...] = ()
    trends: dict[str, str] = field(default_factory=dict)
    indicators: dict[str, float] = field(default_factory=dict)
    db_id: int | None = None

    def __post_init__(self) -> None:
        if not self.label:
            self.label = signal_label(self.side, self.score)

    @property
    def strength(self) -> SignalStrength:
        return classify_score(self.score)

    @property
    def is_buy(self) -> bool:
        return self.side is SignalSide.BUY

    @property
    def targets(self) -> tuple[float, float, float]:
        return (self.tp1, self.tp2, self.tp3)

    def reason_text(self, limit: int = 4) -> str:
        """Short summary of the strongest passing conditions."""
        passed = [item for item in self.components if item.passed]
        passed.sort(key=lambda item: item.score, reverse=True)
        return " + ".join(item.description for item in passed[:limit])


@dataclass(frozen=True)
class SignalUpdate:
    """A lifecycle transition for an already published signal."""

    signal: Signal
    previous_status: SignalStatus
    new_status: SignalStatus
    price: float
    pnl_percent: float
    note: str = ""
