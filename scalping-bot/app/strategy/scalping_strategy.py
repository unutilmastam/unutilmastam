"""Multi-timeframe scalping analysis.

This module turns raw closed candles into indicator snapshots and evaluates
the directional conditions from the strategy specification. It contains no
scoring and no risk logic - those live in ``scoring.py`` and
``risk_manager.py`` - which keeps every piece independently testable and lets
the backtester reuse exactly the same code path as the live engine.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import pandas as pd

from app.config import TF_ENTRY, TF_MAIN, TF_MOMENTUM, TF_TREND, Settings
from app.indicators.atr import atr as atr_indicator
from app.indicators.ema import ema
from app.indicators.macd import macd as macd_indicator
from app.indicators.rsi import rsi as rsi_indicator
from app.indicators.support_resistance import (
    Levels,
    nearest_resistance,
    nearest_support,
    swing_levels,
)
from app.indicators.volume import volume_ratio as volume_ratio_indicator
from app.indicators.vwap import vwap as vwap_indicator
from app.market.orderbook import BookTicker, OrderBook
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Enough history for EMA50, MACD(26,9), RSI14, ATR14 and volume(20).
MIN_CANDLES = 60

# How close to a level a wick must come before it counts as a test of it,
# expressed as a fraction of ATR.
LEVEL_TOLERANCE_ATR = 0.35


def _f(value: object, default: float = 0.0) -> float:
    """Convert an indicator cell to a plain float, mapping NaN to a default."""
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    if math.isnan(result) or math.isinf(result):
        return default
    return result


@dataclass(frozen=True)
class TimeframeSnapshot:
    """Indicator state of one timeframe at its most recent closed candle."""

    interval: str
    open_time: int
    close_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    ema9: float
    ema21: float
    ema50: float
    ema200: float
    prev_ema9: float
    prev_ema21: float
    rsi: float
    prev_rsi: float
    macd: float
    macd_signal: float
    macd_hist: float
    prev_macd_hist: float
    vwap: float
    atr: float
    volume_ratio: float
    levels: Levels = field(default_factory=Levels)

    # -- trend -----------------------------------------------------------
    @property
    def ema_bullish(self) -> bool:
        return self.ema9 > self.ema21

    @property
    def ema_bearish(self) -> bool:
        return self.ema9 < self.ema21

    @property
    def above_ema50(self) -> bool:
        return self.ema50 > 0 and self.close > self.ema50

    @property
    def below_ema50(self) -> bool:
        return self.ema50 > 0 and self.close < self.ema50

    @property
    def above_vwap(self) -> bool:
        return self.vwap > 0 and self.close > self.vwap

    @property
    def below_vwap(self) -> bool:
        return self.vwap > 0 and self.close < self.vwap

    @property
    def cross_up(self) -> bool:
        """EMA9 crossed above EMA21 on this candle."""
        return self.prev_ema9 <= self.prev_ema21 and self.ema9 > self.ema21

    @property
    def cross_down(self) -> bool:
        """EMA9 crossed below EMA21 on this candle."""
        return self.prev_ema9 >= self.prev_ema21 and self.ema9 < self.ema21

    # -- momentum ---------------------------------------------------------
    @property
    def macd_bullish(self) -> bool:
        return self.macd > self.macd_signal and self.macd_hist > 0

    @property
    def macd_bearish(self) -> bool:
        return self.macd < self.macd_signal and self.macd_hist < 0

    @property
    def macd_hist_rising(self) -> bool:
        return self.macd_hist > self.prev_macd_hist

    @property
    def macd_hist_falling(self) -> bool:
        return self.macd_hist < self.prev_macd_hist

    # -- candle shape ------------------------------------------------------
    @property
    def is_bullish_candle(self) -> bool:
        return self.close > self.open

    @property
    def is_bearish_candle(self) -> bool:
        return self.close < self.open

    @property
    def body(self) -> float:
        return abs(self.close - self.open)

    @property
    def lower_wick(self) -> float:
        return min(self.open, self.close) - self.low

    @property
    def upper_wick(self) -> float:
        return self.high - max(self.open, self.close)

    @property
    def change_percent(self) -> float:
        if not self.open:
            return 0.0
        return (self.close - self.open) / self.open * 100.0

    @property
    def atr_percent(self) -> float:
        if not self.close:
            return 0.0
        return self.atr / self.close * 100.0

    def trend_label(self) -> str:
        """``Bullish`` / ``Bearish`` / ``Neutral`` for the Telegram card."""
        if self.ema_bullish and self.above_ema50:
            return "Bullish"
        if self.ema_bearish and self.below_ema50:
            return "Bearish"
        if self.ema_bullish:
            return "Weak Bullish"
        if self.ema_bearish:
            return "Weak Bearish"
        return "Neutral"

    def support(self) -> float | None:
        return nearest_support(self.levels, self.close)

    def resistance(self) -> float | None:
        return nearest_resistance(self.levels, self.close)


def analyze_timeframe(frame: pd.DataFrame, interval: str) -> TimeframeSnapshot | None:
    """Compute every indicator for one timeframe from *closed* candles only."""
    if frame is None or len(frame) < MIN_CANDLES:
        return None

    close = frame["close"]
    high = frame["high"]
    low = frame["low"]
    volume = frame["volume"]

    try:
        ema9 = ema(close, 9)
        ema21 = ema(close, 21)
        ema50 = ema(close, 50)
        ema200 = ema(close, 200) if len(frame) >= 200 else pd.Series([float("nan")])
        rsi_series = rsi_indicator(close, 14)
        macd_result = macd_indicator(close, 12, 26, 9)
        vwap_series = vwap_indicator(high, low, close, volume, frame["open_time"])
        atr_series = atr_indicator(high, low, close, 14)
        ratio = volume_ratio_indicator(volume, 20)
        levels = swing_levels(high, low, left=2, right=2, max_levels=6)
    except Exception as exc:  # noqa: BLE001 - never let one symbol break the loop
        logger.exception("Indicator calculation failed for %s: %s", interval, exc)
        return None

    last = frame.iloc[-1]

    return TimeframeSnapshot(
        interval=interval,
        open_time=int(last["open_time"]),
        close_time=int(last["close_time"]),
        open=_f(last["open"]),
        high=_f(last["high"]),
        low=_f(last["low"]),
        close=_f(last["close"]),
        volume=_f(last["volume"]),
        ema9=_f(ema9.iloc[-1]),
        ema21=_f(ema21.iloc[-1]),
        ema50=_f(ema50.iloc[-1]),
        ema200=_f(ema200.iloc[-1]) if len(ema200) else 0.0,
        prev_ema9=_f(ema9.iloc[-2]) if len(ema9) > 1 else 0.0,
        prev_ema21=_f(ema21.iloc[-2]) if len(ema21) > 1 else 0.0,
        rsi=_f(rsi_series.iloc[-1], 50.0),
        prev_rsi=_f(rsi_series.iloc[-2], 50.0) if len(rsi_series) > 1 else 50.0,
        macd=_f(macd_result.macd.iloc[-1]),
        macd_signal=_f(macd_result.signal.iloc[-1]),
        macd_hist=_f(macd_result.histogram.iloc[-1]),
        prev_macd_hist=(
            _f(macd_result.histogram.iloc[-2]) if len(macd_result.histogram) > 1 else 0.0
        ),
        vwap=_f(vwap_series.iloc[-1]),
        atr=_f(atr_series.iloc[-1]),
        volume_ratio=ratio,
        levels=levels,
    )


@dataclass(frozen=True)
class MarketAnalysis:
    """Everything the scorer needs to judge one symbol."""

    symbol: str
    price: float
    timeframes: dict[str, TimeframeSnapshot]
    book_ticker: BookTicker | None = None
    order_book: OrderBook | None = None
    spread_percent: float | None = None
    quote_volume_24h: float = 0.0

    def tf(self, interval: str) -> TimeframeSnapshot | None:
        return self.timeframes.get(interval)

    @property
    def entry(self) -> TimeframeSnapshot | None:
        return self.timeframes.get(TF_ENTRY)

    @property
    def momentum(self) -> TimeframeSnapshot | None:
        return self.timeframes.get(TF_MOMENTUM)

    @property
    def main(self) -> TimeframeSnapshot | None:
        return self.timeframes.get(TF_MAIN)

    @property
    def trend(self) -> TimeframeSnapshot | None:
        return self.timeframes.get(TF_TREND)

    @property
    def complete(self) -> bool:
        return all(
            self.timeframes.get(interval) is not None
            for interval in (TF_ENTRY, TF_MOMENTUM, TF_MAIN, TF_TREND)
        )

    def order_book_imbalance(self) -> float:
        """Bid/ask volume ratio; ``0.0`` when no book data is available."""
        if self.order_book is not None:
            imbalance = self.order_book.imbalance()
            if imbalance > 0:
                return imbalance
        if self.book_ticker is not None:
            bid = self.book_ticker.bid_price * self.book_ticker.bid_qty
            ask = self.book_ticker.ask_price * self.book_ticker.ask_qty
            if bid > 0 and ask > 0:
                return bid / ask
        return 0.0

    def trend_labels(self) -> dict[str, str]:
        return {
            interval: snapshot.trend_label()
            for interval, snapshot in self.timeframes.items()
        }


def build_analysis(
    symbol: str,
    frames: dict[str, pd.DataFrame],
    price: float,
    book_ticker: BookTicker | None = None,
    order_book: OrderBook | None = None,
    quote_volume_24h: float = 0.0,
) -> MarketAnalysis | None:
    """Analyse every timeframe; returns ``None`` if any timeframe is short."""
    snapshots: dict[str, TimeframeSnapshot] = {}
    for interval, frame in frames.items():
        snapshot = analyze_timeframe(frame, interval)
        if snapshot is None:
            return None
        snapshots[interval] = snapshot

    return MarketAnalysis(
        symbol=symbol.upper(),
        price=price or (snapshots[TF_ENTRY].close if TF_ENTRY in snapshots else 0.0),
        timeframes=snapshots,
        book_ticker=book_ticker,
        order_book=order_book,
        spread_percent=book_ticker.spread_percent if book_ticker else None,
        quote_volume_24h=quote_volume_24h,
    )


@dataclass(frozen=True)
class Conditions:
    """Boolean/numeric outcome of every strategy rule for one direction."""

    # 15m trend
    trend_full: bool
    trend_partial: bool
    # 5m trend
    main_full: bool
    main_partial: bool
    # 3m momentum
    momentum_rsi: bool
    momentum_macd: bool
    # 1m entry
    entry_cross: bool
    entry_rejection: bool
    entry_continuation: bool
    # standalone components
    rsi_value: float
    rsi_ideal: bool
    rsi_acceptable: bool
    macd_aligned: bool
    macd_hist_improving: bool
    vwap_aligned: bool
    volume_ratio: float
    book_imbalance: float
    setup: str

    @property
    def entry_confirmed(self) -> bool:
        """The mandatory 1m confirmation: a fresh cross or a level rejection."""
        return self.entry_cross or self.entry_rejection

    @property
    def mandatory_ok(self) -> bool:
        """15m trend + 5m trend + 1m entry, as required by the spec."""
        return self.trend_full and self.main_full and self.entry_confirmed

    def missing(self) -> tuple[str, ...]:
        gaps: list[str] = []
        if not self.trend_full:
            gaps.append("15m trend")
        if not self.main_full:
            gaps.append("5m trend")
        if not self.entry_confirmed:
            gaps.append("1m entry")
        return tuple(gaps)


def buy_trend_full(trend: TimeframeSnapshot) -> bool:
    """15m long confirmation: EMA9 > EMA21 and price above EMA50."""
    return trend.ema_bullish and trend.above_ema50


def buy_main_full(main: TimeframeSnapshot) -> bool:
    """5m long confirmation: EMA9 > EMA21 and price above VWAP."""
    return main.ema_bullish and main.above_vwap


def sell_trend_full(trend: TimeframeSnapshot) -> bool:
    """15m exit confirmation: EMA9 < EMA21 and price below EMA50."""
    return trend.ema_bearish and trend.below_ema50


def sell_main_full(main: TimeframeSnapshot) -> bool:
    """5m exit confirmation: EMA9 < EMA21 and price below VWAP."""
    return main.ema_bearish and main.below_vwap


def higher_timeframes_allow_a_setup(
    trend: TimeframeSnapshot,
    main: TimeframeSnapshot,
) -> bool:
    """True when 15m+5m line up for at least one direction.

    Both mandatory higher-timeframe confirmations are decided by these two
    snapshots alone, so a caller can use this as a cheap gate before paying
    for the 1m analysis. It reuses the very same predicates the full
    condition evaluation uses, so the gate can never disagree with it.
    """
    return (buy_trend_full(trend) and buy_main_full(main)) or (
        sell_trend_full(trend) and sell_main_full(main)
    )


def _tested_support(entry: TimeframeSnapshot) -> bool:
    """Bullish rejection: the candle wicked into support and closed above it."""
    support = nearest_support(entry.levels, entry.close)
    if support is None or entry.atr <= 0:
        return False
    tolerance = entry.atr * LEVEL_TOLERANCE_ATR
    touched = entry.low <= support + tolerance
    closed_above = entry.close > support
    rejected = entry.lower_wick >= entry.body * 0.8 and entry.lower_wick > 0
    return touched and closed_above and entry.is_bullish_candle and rejected


def _tested_resistance(entry: TimeframeSnapshot) -> bool:
    """Bearish rejection: the candle wicked into resistance and closed below."""
    resistance = nearest_resistance(entry.levels, entry.close)
    if resistance is None or entry.atr <= 0:
        return False
    tolerance = entry.atr * LEVEL_TOLERANCE_ATR
    touched = entry.high >= resistance - tolerance
    closed_below = entry.close < resistance
    rejected = entry.upper_wick >= entry.body * 0.8 and entry.upper_wick > 0
    return touched and closed_below and entry.is_bearish_candle and rejected


def buy_conditions(analysis: MarketAnalysis, settings: Settings) -> Conditions:
    """Evaluate every long-side rule."""
    trend, main, momentum, entry = (
        analysis.trend,
        analysis.main,
        analysis.momentum,
        analysis.entry,
    )
    if trend is None or main is None or momentum is None or entry is None:
        raise ValueError("analysis is incomplete")

    entry_cross = entry.cross_up
    entry_rejection = _tested_support(entry)
    entry_continuation = entry.ema_bullish and entry.is_bullish_candle

    if entry_cross:
        setup = "EMA crossover"
    elif entry_rejection:
        setup = "Support rejection"
    elif entry_continuation:
        setup = "Trend continuation"
    else:
        setup = "No entry trigger"
    if entry.volume_ratio >= settings.min_volume_ratio:
        setup = f"{setup} + volume confirmation"

    return Conditions(
        trend_full=buy_trend_full(trend),
        trend_partial=trend.ema_bullish,
        main_full=buy_main_full(main),
        main_partial=main.ema_bullish or main.above_vwap,
        momentum_rsi=50.0 < momentum.rsi < 70.0,
        momentum_macd=momentum.macd_bullish,
        entry_cross=entry_cross,
        entry_rejection=entry_rejection,
        entry_continuation=entry_continuation,
        rsi_value=entry.rsi,
        rsi_ideal=50.0 <= entry.rsi <= 65.0,
        rsi_acceptable=45.0 <= entry.rsi <= 70.0,
        macd_aligned=main.macd_bullish,
        macd_hist_improving=main.macd_hist_rising,
        vwap_aligned=entry.above_vwap,
        volume_ratio=entry.volume_ratio,
        book_imbalance=analysis.order_book_imbalance(),
        setup=setup,
    )


def sell_conditions(analysis: MarketAnalysis, settings: Settings) -> Conditions:
    """Evaluate every exit-side rule (spot SELL means close the position)."""
    trend, main, momentum, entry = (
        analysis.trend,
        analysis.main,
        analysis.momentum,
        analysis.entry,
    )
    if trend is None or main is None or momentum is None or entry is None:
        raise ValueError("analysis is incomplete")

    entry_cross = entry.cross_down
    entry_rejection = _tested_resistance(entry)
    entry_continuation = entry.ema_bearish and entry.is_bearish_candle

    if entry_cross:
        setup = "EMA breakdown"
    elif entry_rejection:
        setup = "Resistance rejection"
    elif entry_continuation:
        setup = "Downtrend continuation"
    else:
        setup = "No exit trigger"
    if entry.volume_ratio >= settings.min_volume_ratio:
        setup = f"{setup} + volume confirmation"

    imbalance = analysis.order_book_imbalance()
    # For the sell side the favourable imbalance is inverted (asks dominate).
    inverted = 1.0 / imbalance if imbalance > 0 else 0.0

    return Conditions(
        trend_full=sell_trend_full(trend),
        trend_partial=trend.ema_bearish,
        main_full=sell_main_full(main),
        main_partial=main.ema_bearish or main.below_vwap,
        momentum_rsi=momentum.rsi < 45.0,
        momentum_macd=momentum.macd_bearish,
        entry_cross=entry_cross,
        entry_rejection=entry_rejection,
        entry_continuation=entry_continuation,
        rsi_value=entry.rsi,
        rsi_ideal=35.0 <= entry.rsi <= 45.0,
        rsi_acceptable=30.0 <= entry.rsi <= 50.0,
        macd_aligned=main.macd_bearish,
        macd_hist_improving=main.macd_hist_falling,
        vwap_aligned=entry.below_vwap,
        volume_ratio=entry.volume_ratio,
        book_imbalance=inverted,
        setup=setup,
    )
