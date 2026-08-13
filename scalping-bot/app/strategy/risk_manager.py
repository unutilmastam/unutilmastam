"""Risk management: entry zone, ATR/structure stop, R-multiple targets.

Everything here is deterministic and side-effect free so the backtester and
the live engine produce byte-identical plans from identical inputs.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings
from app.strategy.models import SignalSide, TradePlan
from app.strategy.scalping_strategy import MarketAnalysis, TimeframeSnapshot
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Risk multiples for the three targets.
TP_MULTIPLES: tuple[float, float, float] = (1.0, 1.5, 2.0)

# Stop is pushed this fraction of ATR beyond the protecting swing level.
STRUCTURE_BUFFER_ATR = 0.25

# Targets stop this fraction of ATR short of an opposing level.
LEVEL_BUFFER_ATR = 0.10

# Half-width of the suggested entry zone, as a fraction of ATR.
ENTRY_BAND_ATR = 0.20


@dataclass(frozen=True)
class FilterResult:
    """Outcome of the pre-trade filter battery."""

    passed: bool
    reasons: tuple[str, ...] = ()

    @property
    def reason_text(self) -> str:
        return "; ".join(self.reasons)


class RiskManager:
    """Builds trade plans and applies the hard trade filters."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    # ------------------------------------------------------------------
    # Filters (specification section 13)
    # ------------------------------------------------------------------
    def check_filters(self, analysis: MarketAnalysis, side: SignalSide) -> FilterResult:
        """Reject conditions in which no signal should ever be produced."""
        settings = self.settings
        reasons: list[str] = []

        entry = analysis.entry
        main = analysis.main
        if entry is None or main is None:
            return FilterResult(False, ("incomplete analysis",))

        if entry.volume_ratio < settings.min_volume_ratio:
            reasons.append(
                f"volume ratio {entry.volume_ratio:.2f} below {settings.min_volume_ratio:.2f}"
            )

        spread = analysis.spread_percent
        if spread is not None and spread > settings.max_spread_percent:
            reasons.append(
                f"spread {spread:.3f}% above {settings.max_spread_percent:.3f}%"
            )

        move = abs(entry.change_percent)
        if move > settings.max_candle_move_percent:
            reasons.append(
                f"signal candle already moved {move:.2f}% "
                f"(max {settings.max_candle_move_percent:.2f}%)"
            )

        atr_percent = main.atr_percent
        if atr_percent > settings.max_atr_percent:
            reasons.append(
                f"volatility too high: 5m ATR {atr_percent:.2f}% "
                f"(max {settings.max_atr_percent:.2f}%)"
            )

        if entry.rsi > settings.rsi_max:
            reasons.append(f"RSI {entry.rsi:.0f} overbought (max {settings.rsi_max:.0f})")
        if entry.rsi < settings.rsi_min:
            reasons.append(f"RSI {entry.rsi:.0f} oversold (min {settings.rsi_min:.0f})")

        if analysis.price <= 0:
            reasons.append("no valid price")

        return FilterResult(passed=not reasons, reasons=tuple(reasons))

    # ------------------------------------------------------------------
    # Trade plan
    # ------------------------------------------------------------------
    def build_plan(
        self,
        analysis: MarketAnalysis,
        side: SignalSide,
    ) -> tuple[TradePlan | None, str]:
        """Return ``(plan, reason)``; ``plan`` is ``None`` when rejected."""
        if side is SignalSide.WAIT:
            return None, "no direction"

        entry_tf = analysis.entry
        main_tf = analysis.main
        if entry_tf is None or main_tf is None:
            return None, "incomplete analysis"

        atr = main_tf.atr if main_tf.atr > 0 else entry_tf.atr * 2.0
        if atr <= 0:
            return None, "ATR unavailable"

        entry_price = self._entry_price(analysis, side)
        if entry_price <= 0:
            return None, "no valid entry price"

        stop_loss, stop_reason = self._stop_loss(entry_price, atr, side, entry_tf, main_tf)
        if stop_loss is None:
            return None, "stop loss could not be placed"

        risk_per_unit = abs(entry_price - stop_loss)
        if risk_per_unit <= 0:
            return None, "zero stop distance"

        stop_distance_percent = risk_per_unit / entry_price * 100.0
        if stop_distance_percent < self.settings.min_stop_distance_percent:
            return None, (
                f"stop too tight ({stop_distance_percent:.2f}% < "
                f"{self.settings.min_stop_distance_percent:.2f}%)"
            )
        if stop_distance_percent > self.settings.max_stop_distance_percent:
            return None, (
                f"stop too wide ({stop_distance_percent:.2f}% > "
                f"{self.settings.max_stop_distance_percent:.2f}%)"
            )

        targets, target_reason = self._take_profits(
            entry_price, risk_per_unit, atr, side, entry_tf, main_tf
        )
        if targets is None:
            return None, "not enough room to the next level for a valid target"

        risk_reward = abs(targets[2] - entry_price) / risk_per_unit
        if risk_reward < self.settings.min_risk_reward:
            return None, (
                f"risk/reward {risk_reward:.2f} below {self.settings.min_risk_reward:.2f}"
            )

        band = min(atr * ENTRY_BAND_ATR, entry_price * 0.0015)
        reasons = tuple(item for item in (stop_reason, target_reason) if item)

        plan = TradePlan(
            entry=entry_price,
            entry_low=entry_price - band,
            entry_high=entry_price + band,
            stop_loss=stop_loss,
            take_profits=targets,
            risk_per_unit=risk_per_unit,
            risk_reward=risk_reward,
            atr=atr,
            stop_distance_percent=stop_distance_percent,
            reasons=reasons,
        )
        return plan, ""

    def _entry_price(self, analysis: MarketAnalysis, side: SignalSide) -> float:
        """Best executable price at signal time.

        A buyer lifts the ask and a seller hits the bid, so using the correct
        side of the book keeps the plan honest instead of assuming a mid fill.
        """
        book = analysis.book_ticker
        if book is not None:
            if side is SignalSide.BUY and book.ask_price > 0:
                return book.ask_price
            if side is SignalSide.SELL and book.bid_price > 0:
                return book.bid_price
        if analysis.price > 0:
            return analysis.price
        entry_tf = analysis.entry
        return entry_tf.close if entry_tf else 0.0

    def _stop_loss(
        self,
        entry: float,
        atr: float,
        side: SignalSide,
        entry_tf: TimeframeSnapshot,
        main_tf: TimeframeSnapshot,
    ) -> tuple[float | None, str]:
        """ATR stop, widened to sit beyond the protecting swing level."""
        atr_stop = (
            entry - atr * self.settings.atr_sl_multiplier
            if side is SignalSide.BUY
            else entry + atr * self.settings.atr_sl_multiplier
        )
        buffer = atr * STRUCTURE_BUFFER_ATR

        if side is SignalSide.BUY:
            levels = [
                level
                for level in (*entry_tf.levels.supports, *main_tf.levels.supports)
                if 0 < level < entry
            ]
            if not levels:
                return atr_stop, "stop from ATR"
            structure_stop = max(levels) - buffer
            stop = min(atr_stop, structure_stop)
            reason = (
                "stop below support"
                if structure_stop <= atr_stop
                else "stop from ATR"
            )
            return (stop if stop > 0 else None), reason

        levels = [
            level
            for level in (*entry_tf.levels.resistances, *main_tf.levels.resistances)
            if level > entry
        ]
        if not levels:
            return atr_stop, "stop from ATR"
        structure_stop = min(levels) + buffer
        stop = max(atr_stop, structure_stop)
        reason = "stop above resistance" if structure_stop >= atr_stop else "stop from ATR"
        return stop, reason

    def _take_profits(
        self,
        entry: float,
        risk: float,
        atr: float,
        side: SignalSide,
        entry_tf: TimeframeSnapshot,
        main_tf: TimeframeSnapshot,
    ) -> tuple[tuple[float, float, float] | None, str]:
        """R-multiple targets, pulled in front of opposing structure."""
        buffer = atr * LEVEL_BUFFER_ATR
        capped = False

        if side is SignalSide.BUY:
            blockers = sorted(
                level
                for level in (*entry_tf.levels.resistances, *main_tf.levels.resistances)
                if level > entry
            )
        else:
            blockers = sorted(
                (
                    level
                    for level in (*entry_tf.levels.supports, *main_tf.levels.supports)
                    if 0 < level < entry
                ),
                reverse=True,
            )

        targets: list[float] = []
        for multiple in TP_MULTIPLES:
            raw = (
                entry + risk * multiple
                if side is SignalSide.BUY
                else entry - risk * multiple
            )
            adjusted = raw
            for level in blockers:
                if side is SignalSide.BUY and entry < level < raw:
                    adjusted = min(adjusted, level - buffer)
                    capped = True
                    break
                if side is SignalSide.SELL and raw < level < entry:
                    adjusted = max(adjusted, level + buffer)
                    capped = True
                    break
            targets.append(adjusted)

        # Keep the ladder strictly ordered and on the right side of entry.
        ordered: list[float] = []
        for index, value in enumerate(targets):
            floor = ordered[-1] if ordered else entry
            if side is SignalSide.BUY:
                if value <= floor:
                    value = floor + max(risk * 0.1, atr * 0.05)
            else:
                if value >= floor:
                    value = floor - max(risk * 0.1, atr * 0.05)
            ordered.append(value)

        if side is SignalSide.BUY and ordered[0] <= entry:
            return None, ""
        if side is SignalSide.SELL and (ordered[0] >= entry or ordered[2] <= 0):
            return None, ""

        reason = "targets capped by structure" if capped else "targets from risk multiples"
        return (ordered[0], ordered[1], ordered[2]), reason

    # ------------------------------------------------------------------
    # Position sizing
    # ------------------------------------------------------------------
    def position_size(
        self,
        balance: float,
        entry: float,
        stop_loss: float,
        risk_fraction: float | None = None,
    ) -> float:
        """Quantity to trade so that hitting the stop costs ``risk`` of balance.

        Spot has no leverage, so the notional is additionally capped at the
        available balance.
        """
        fraction = self.settings.risk_per_trade if risk_fraction is None else risk_fraction
        distance = abs(entry - stop_loss)
        if balance <= 0 or entry <= 0 or distance <= 0 or fraction <= 0:
            return 0.0

        risk_amount = balance * fraction
        quantity = risk_amount / distance

        max_quantity = balance / entry
        return min(quantity, max_quantity)

    # ------------------------------------------------------------------
    # Presentation helper
    # ------------------------------------------------------------------
    @staticmethod
    def expected_hold(plan: TradePlan, entry_tf: TimeframeSnapshot) -> str:
        """Rough hold-time estimate from how many 1m ATRs the target is away."""
        per_minute = entry_tf.atr
        if per_minute <= 0:
            return "5-30 min"
        distance = abs(plan.tp2 - plan.entry)
        minutes = distance / per_minute
        low = max(3, int(minutes * 0.6))
        high = max(low + 5, int(minutes * 2.5))
        return f"{low}-{min(high, 180)} min"
