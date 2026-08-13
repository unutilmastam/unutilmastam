"""Signal engine: the full pipeline that runs on every closed 1m candle.

    market data -> multi-timeframe analysis -> scoring -> filters
    -> risk plan -> duplicate check -> signal -> callbacks

Only *closed* candles reach this code, and every level is computed once and
then frozen, so a published signal never repaints.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from app.binance.rest import BinanceRestClient
from app.config import TF_ENTRY, Settings
from app.market.candles import Candle
from app.market.orderbook import OrderBook
from app.market.store import ClosedCandleEvent, MarketStore
from app.strategy.models import (
    ScoreResult,
    Signal,
    SignalSide,
    SignalStatus,
    SignalUpdate,
    signal_label,
)
from app.strategy.risk_manager import RiskManager
from app.strategy.scalping_strategy import MIN_CANDLES, MarketAnalysis, build_analysis
from app.strategy.scoring import best_side, score_buy, score_sell
from app.utils.helpers import now_ms
from app.utils.logger import get_logger

logger = get_logger(__name__)

SignalCallback = Callable[[Signal], Awaitable[None]]
UpdateCallback = Callable[[SignalUpdate], Awaitable[None]]

# An untriggered signal is retired after this long.
MAX_SIGNAL_AGE_MINUTES = 240

# Depth snapshots are reused for this long to keep REST traffic tiny.
DEPTH_CACHE_SECONDS = 5.0

# Only pay for a depth snapshot when the order-book points could still lift
# the score over the threshold.
ORDER_BOOK_MAX_POINTS = 5.0


@dataclass
class PublishRecord:
    """What was last published for a symbol/side pair."""

    published_at: datetime
    score: float
    entry: float
    stop_loss: float
    tp1: float


@dataclass
class EngineStats:
    """Counters surfaced by ``/status``."""

    evaluations: int = 0
    signals_published: int = 0
    rejected_stale: int = 0
    rejected_warmup: int = 0
    rejected_mandatory: int = 0
    rejected_score: int = 0
    rejected_filters: int = 0
    rejected_risk: int = 0
    rejected_duplicate: int = 0
    errors: int = 0
    last_evaluation: datetime | None = None
    filter_reasons: dict[str, int] = field(default_factory=dict)


class SignalEngine:
    """Evaluates symbols and manages the lifecycle of published signals."""

    def __init__(
        self,
        settings: Settings,
        store: MarketStore,
        rest_client: BinanceRestClient | None = None,
        on_signal: SignalCallback | None = None,
        on_update: UpdateCallback | None = None,
    ) -> None:
        self.settings = settings
        self.store = store
        self.rest_client = rest_client
        self.on_signal = on_signal
        self.on_update = on_update
        self.risk = RiskManager(settings)

        self.enabled = True
        self.stats = EngineStats()
        self.active_signals: dict[str, Signal] = {}
        self.latest_scores: dict[str, ScoreResult] = {}
        self.last_rejection: dict[str, str] = {}
        self._published: dict[tuple[str, str], PublishRecord] = {}
        self._depth_cache: dict[str, tuple[float, OrderBook]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    async def on_closed_candle(self, event: ClosedCandleEvent) -> None:
        """Called for every closed candle of every tracked timeframe."""
        # Higher timeframes just refresh the buffers; the pipeline is driven
        # by the 1m close, exactly as the specification requires.
        if event.interval != TF_ENTRY:
            return

        lock = self._locks.setdefault(event.symbol, asyncio.Lock())
        async with lock:
            try:
                await self._monitor_active(event.symbol, event.candle)
                if self.enabled:
                    await self.evaluate(event.symbol)
            except Exception as exc:  # noqa: BLE001 - one symbol must not stop the bot
                self.stats.errors += 1
                logger.exception("Signal pipeline failed for %s: %s", event.symbol, exc)

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------
    def build_frames(self, symbol: str) -> dict[str, "object"] | None:
        """Collect the closed-candle frames for all configured timeframes."""
        frames = {}
        for interval in self.settings.timeframes:
            series = self.store.series(symbol, interval)
            if series is None or len(series) < MIN_CANDLES:
                return None
            frames[interval] = series.to_frame()
        return frames

    def analyze(self, symbol: str, order_book: OrderBook | None = None) -> MarketAnalysis | None:
        """Build the multi-timeframe analysis for ``symbol``."""
        frames = self.build_frames(symbol)
        if frames is None:
            return None

        ticker = self.store.tickers.get(symbol.upper())
        return build_analysis(
            symbol=symbol,
            frames=frames,  # type: ignore[arg-type]
            price=self.store.price(symbol),
            book_ticker=self.store.book_tickers.get(symbol.upper()),
            order_book=order_book,
            quote_volume_24h=ticker.quote_volume if ticker else 0.0,
        )

    async def evaluate(self, symbol: str) -> Signal | None:
        """Run the full pipeline for one symbol. Returns a published signal."""
        symbol = symbol.upper()
        self.stats.evaluations += 1
        self.stats.last_evaluation = datetime.now(tz=timezone.utc)

        # 1. Market data must be fresh.
        if self.store.is_stale(symbol):
            self.stats.rejected_stale += 1
            self._reject(symbol, "market data is stale")
            return None

        # 2-13. Indicators and multi-timeframe conditions.
        analysis = self.analyze(symbol)
        if analysis is None or not analysis.complete:
            self.stats.rejected_warmup += 1
            self._reject(symbol, "not enough candle history yet")
            return None

        # 14-15. Score both directions.
        result = best_side(analysis, self.settings)
        self.latest_scores[symbol] = result

        if not result.mandatory_passed:
            self.stats.rejected_mandatory += 1
            self._reject(symbol, f"missing {', '.join(result.missing) or 'confirmation'}")
            return None

        # The order book is worth at most a few points; only fetch a depth
        # snapshot when those points can still change the outcome.
        if result.total + ORDER_BOOK_MAX_POINTS >= self.settings.min_signal_score:
            order_book = await self._fetch_depth(symbol)
            if order_book is not None:
                analysis = self.analyze(symbol, order_book=order_book)
                if analysis is None:
                    self.stats.rejected_warmup += 1
                    self._reject(symbol, "analysis unavailable")
                    return None
                result = (
                    score_buy(analysis, self.settings)
                    if result.side is SignalSide.BUY
                    else score_sell(analysis, self.settings)
                )
                self.latest_scores[symbol] = result
                if not result.mandatory_passed:
                    self.stats.rejected_mandatory += 1
                    self._reject(symbol, "confirmation lost")
                    return None

        if result.total < self.settings.min_signal_score:
            self.stats.rejected_score += 1
            self._reject(
                symbol,
                f"score {result.total:.0f} below {self.settings.min_signal_score}",
            )
            return None

        # 16. Hard filters.
        filters = self.risk.check_filters(analysis, result.side)
        if not filters.passed:
            self.stats.rejected_filters += 1
            for reason in filters.reasons:
                key = reason.split("(")[0].strip()
                self.stats.filter_reasons[key] = self.stats.filter_reasons.get(key, 0) + 1
            self._reject(symbol, filters.reason_text)
            return None

        # 14. Risk / reward.
        plan, reason = self.risk.build_plan(analysis, result.side)
        if plan is None:
            self.stats.rejected_risk += 1
            self._reject(symbol, reason)
            return None

        # 18. Build the signal object.
        signal = self._make_signal(symbol, analysis, result, plan)

        # 17. Duplicate / cooldown filter.
        duplicate, why = self._is_duplicate(signal)
        if duplicate:
            self.stats.rejected_duplicate += 1
            self._reject(symbol, why)
            return None

        await self._publish(signal)
        return signal

    def _make_signal(
        self,
        symbol: str,
        analysis: MarketAnalysis,
        result: ScoreResult,
        plan,
    ) -> Signal:
        entry_tf = analysis.entry
        assert entry_tf is not None  # guaranteed by analysis.complete

        conditions_setup = (
            result.component("entry_1m").description
            if result.component("entry_1m")
            else "entry trigger"
        )
        volume_component = result.component("volume")
        setup = conditions_setup
        if volume_component is not None and volume_component.passed:
            setup = f"{conditions_setup} + volume confirmation"

        indicators = {
            "rsi": round(entry_tf.rsi, 2),
            "rsi_3m": round(analysis.momentum.rsi, 2) if analysis.momentum else 0.0,
            "macd_hist": round(analysis.main.macd_hist, 8) if analysis.main else 0.0,
            "vwap": round(entry_tf.vwap, 8),
            "volume_ratio": round(entry_tf.volume_ratio, 3),
            "atr": round(plan.atr, 8),
            "order_book": round(analysis.order_book_imbalance(), 3),
            "spread_percent": round(analysis.spread_percent or 0.0, 4),
        }

        return Signal(
            symbol=symbol,
            side=result.side,
            score=result.total,
            label=signal_label(result.side, result.total),
            price=analysis.price,
            entry=plan.entry,
            entry_low=plan.entry_low,
            entry_high=plan.entry_high,
            stop_loss=plan.stop_loss,
            tp1=plan.tp1,
            tp2=plan.tp2,
            tp3=plan.tp3,
            risk_reward=plan.risk_reward,
            atr=plan.atr,
            timeframe=TF_ENTRY,
            setup=setup,
            expected_hold=self.risk.expected_hold(plan, entry_tf),
            status=SignalStatus.NEW,
            candle_time=entry_tf.open_time,
            components=result.components,
            trends=analysis.trend_labels(),
            indicators=indicators,
        )

    # ------------------------------------------------------------------
    # Duplicate filter (specification section 14)
    # ------------------------------------------------------------------
    def _is_duplicate(self, signal: Signal) -> tuple[bool, str]:
        key = (signal.symbol, signal.side.value)
        record = self._published.get(key)
        if record is None:
            return False, ""

        elapsed = datetime.now(tz=timezone.utc) - record.published_at
        cooldown = timedelta(minutes=self.settings.signal_cooldown_minutes)
        if elapsed >= cooldown:
            return False, ""

        # Inside the cooldown a repeat is only allowed when something
        # meaningful changed: the score moved, or the levels moved.
        if abs(signal.score - record.score) >= self.settings.signal_score_delta:
            return False, ""
        if _materially_different(signal.stop_loss, record.stop_loss) or _materially_different(
            signal.tp1, record.tp1
        ):
            return False, ""

        active = self.active_signals.get(signal.symbol)
        if active is not None and active.status is SignalStatus.INVALIDATED:
            return False, ""

        remaining = cooldown - elapsed
        return True, (
            f"duplicate within cooldown ({int(remaining.total_seconds())}s left, "
            f"score {record.score:.0f} -> {signal.score:.0f})"
        )

    # ------------------------------------------------------------------
    # Publication and lifecycle
    # ------------------------------------------------------------------
    async def _publish(self, signal: Signal) -> None:
        signal.status = SignalStatus.ACTIVE
        self.active_signals[signal.symbol] = signal
        self._published[(signal.symbol, signal.side.value)] = PublishRecord(
            published_at=datetime.now(tz=timezone.utc),
            score=signal.score,
            entry=signal.entry,
            stop_loss=signal.stop_loss,
            tp1=signal.tp1,
        )
        self.stats.signals_published += 1
        self.last_rejection.pop(signal.symbol, None)

        logger.info(
            "SIGNAL %s %s | score=%.0f entry=%.8g SL=%.8g TP=%.8g/%.8g/%.8g RR=%.2f | %s",
            signal.side.value,
            signal.symbol,
            signal.score,
            signal.entry,
            signal.stop_loss,
            signal.tp1,
            signal.tp2,
            signal.tp3,
            signal.risk_reward,
            signal.reason_text(),
        )

        if self.on_signal is not None:
            try:
                await self.on_signal(signal)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Signal callback failed for %s: %s", signal.symbol, exc)

    async def _monitor_active(self, symbol: str, candle: Candle) -> None:
        """Advance the lifecycle of the active signal using a closed candle."""
        signal = self.active_signals.get(symbol)
        if signal is None or signal.status.is_closed:
            return

        # Track excursions for post-trade analysis.
        if signal.is_buy:
            favorable = (candle.high - signal.entry) / signal.entry * 100.0
            adverse = (candle.low - signal.entry) / signal.entry * 100.0
        else:
            favorable = (signal.entry - candle.low) / signal.entry * 100.0
            adverse = (signal.entry - candle.high) / signal.entry * 100.0
        signal.indicators["mfe_percent"] = max(
            signal.indicators.get("mfe_percent", 0.0), round(favorable, 4)
        )
        signal.indicators["mae_percent"] = min(
            signal.indicators.get("mae_percent", 0.0), round(adverse, 4)
        )

        # A candle that spans both the stop and a target is resolved
        # pessimistically: assume the stop was reached first.
        if _stop_touched(signal, candle):
            await self._transition(signal, SignalStatus.STOP_LOSS, signal.stop_loss)
            return

        for level, status in (
            (signal.tp3, SignalStatus.TP3_HIT),
            (signal.tp2, SignalStatus.TP2_HIT),
            (signal.tp1, SignalStatus.TP1_HIT),
        ):
            if _target_touched(signal, candle, level) and _is_progress(signal.status, status):
                await self._transition(signal, status, level)
                if status is SignalStatus.TP3_HIT:
                    return
                break

        if signal.status.is_closed:
            return

        # Invalidation: the opposite side now owns the higher timeframes.
        if await self._is_invalidated(signal):
            await self._transition(signal, SignalStatus.INVALIDATED, candle.close)
            return

        age = datetime.now(tz=timezone.utc) - signal.created_at
        if age > timedelta(minutes=MAX_SIGNAL_AGE_MINUTES):
            await self._transition(signal, SignalStatus.EXPIRED, candle.close)

    async def _is_invalidated(self, signal: Signal) -> bool:
        """True when the setup's premise is gone before TP1 was reached."""
        if signal.status in (SignalStatus.TP1_HIT, SignalStatus.TP2_HIT):
            # Once TP1 is banked the trade is managed by its stop, not by
            # trend flips.
            return False

        analysis = self.analyze(signal.symbol)
        if analysis is None or analysis.main is None or analysis.trend is None:
            return False

        if signal.is_buy:
            return analysis.main.ema_bearish and analysis.trend.ema_bearish
        return analysis.main.ema_bullish and analysis.trend.ema_bullish

    async def _transition(self, signal: Signal, status: SignalStatus, price: float) -> None:
        previous = signal.status
        signal.status = status

        if signal.is_buy:
            pnl = (price - signal.entry) / signal.entry * 100.0
        else:
            pnl = (signal.entry - price) / signal.entry * 100.0

        logger.info(
            "%s %s -> %s at %.8g (%.2f%%)",
            signal.symbol,
            previous.value,
            status.value,
            price,
            pnl,
        )

        if status.is_closed:
            self.active_signals.pop(signal.symbol, None)

        if self.on_update is not None:
            try:
                await self.on_update(
                    SignalUpdate(
                        signal=signal,
                        previous_status=previous,
                        new_status=status,
                        price=price,
                        pnl_percent=pnl,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("Update callback failed for %s: %s", signal.symbol, exc)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    async def _fetch_depth(self, symbol: str) -> OrderBook | None:
        """Depth snapshot with a short cache; ``None`` when unavailable."""
        cached = self._depth_cache.get(symbol)
        now = now_ms() / 1000.0
        if cached is not None and now - cached[0] < DEPTH_CACHE_SECONDS:
            return cached[1]

        if self.rest_client is None:
            return None
        try:
            book = await self.rest_client.depth(symbol, limit=20)
        except Exception as exc:  # noqa: BLE001 - the book is optional
            logger.debug("Depth snapshot failed for %s: %s", symbol, exc)
            return None

        self.store.update_depth(book)
        self._depth_cache[symbol] = (now, book)
        return book

    def _reject(self, symbol: str, reason: str) -> None:
        self.last_rejection[symbol] = reason
        logger.debug("%s: no signal (%s)", symbol, reason)

    # ------------------------------------------------------------------
    # Queries used by Telegram and the API
    # ------------------------------------------------------------------
    def top_setups(self, limit: int = 5, minimum: float | None = None) -> list[ScoreResult]:
        """Best current scores, strongest first."""
        threshold = self.settings.min_signal_score if minimum is None else minimum
        ranked = [
            (symbol, result)
            for symbol, result in self.latest_scores.items()
            if result.total >= threshold and result.mandatory_passed
        ]
        ranked.sort(key=lambda item: item[1].total, reverse=True)
        return [result for _, result in ranked[:limit]]

    def ranked_scores(self, limit: int = 10) -> list[tuple[str, ScoreResult]]:
        """All symbols ranked by score, regardless of threshold."""
        ranked = sorted(
            self.latest_scores.items(), key=lambda item: item[1].total, reverse=True
        )
        return ranked[:limit]

    def score_for(self, symbol: str) -> ScoreResult | None:
        return self.latest_scores.get(symbol.upper())

    def status(self) -> dict:
        return {
            "enabled": self.enabled,
            "active_signals": len(self.active_signals),
            "evaluations": self.stats.evaluations,
            "published": self.stats.signals_published,
            "rejected_stale": self.stats.rejected_stale,
            "rejected_warmup": self.stats.rejected_warmup,
            "rejected_mandatory": self.stats.rejected_mandatory,
            "rejected_score": self.stats.rejected_score,
            "rejected_filters": self.stats.rejected_filters,
            "rejected_risk": self.stats.rejected_risk,
            "rejected_duplicate": self.stats.rejected_duplicate,
            "errors": self.stats.errors,
            "last_evaluation": (
                self.stats.last_evaluation.isoformat() if self.stats.last_evaluation else None
            ),
        }


def _materially_different(new: float, old: float, tolerance: float = 0.001) -> bool:
    """True when two levels differ by more than 0.1%."""
    if old == 0:
        return new != 0
    return abs(new - old) / abs(old) > tolerance


def _stop_touched(signal: Signal, candle: Candle) -> bool:
    if signal.is_buy:
        return candle.low <= signal.stop_loss
    return candle.high >= signal.stop_loss


def _target_touched(signal: Signal, candle: Candle, level: float) -> bool:
    if signal.is_buy:
        return candle.high >= level
    return candle.low <= level


_PROGRESS_ORDER = {
    SignalStatus.NEW: 0,
    SignalStatus.ACTIVE: 0,
    SignalStatus.TP1_HIT: 1,
    SignalStatus.TP2_HIT: 2,
    SignalStatus.TP3_HIT: 3,
}


def _is_progress(current: SignalStatus, candidate: SignalStatus) -> bool:
    """Only allow the target ladder to move forward."""
    return _PROGRESS_ORDER.get(candidate, 0) > _PROGRESS_ORDER.get(current, 0)


def trends_to_json(trends: dict[str, str]) -> str:
    try:
        return json.dumps(trends, separators=(",", ":"))
    except (TypeError, ValueError):
        return "{}"
