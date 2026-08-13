"""Shared fixtures and synthetic market data builders."""

from __future__ import annotations

import math
import random
from dataclasses import replace

import pandas as pd
import pytest

from app.config import TF_ENTRY, TF_MAIN, TF_MOMENTUM, TF_TREND, Settings
from app.indicators.support_resistance import Levels
from app.market.candles import FRAME_COLUMNS, Candle
from app.market.orderbook import BookTicker, OrderBook
from app.strategy.scalping_strategy import MarketAnalysis, TimeframeSnapshot
from app.utils.helpers import interval_ms, now_ms


@pytest.fixture
def settings() -> Settings:
    """Deterministic settings that do not read the environment."""
    return Settings(
        telegram_bot_token="",
        telegram_chat_id="",
        min_signal_score=75,
        signal_cooldown_minutes=5,
        signal_score_delta=8.0,
        risk_per_trade=0.01,
        atr_sl_multiplier=1.2,
        min_risk_reward=1.5,
        paper_start_balance=1000.0,
        database_url="sqlite+aiosqlite:///:memory:",
    )


# ----------------------------------------------------------------------
# Candle builders
# ----------------------------------------------------------------------
def make_candle(
    open_time: int,
    open_price: float,
    high: float,
    low: float,
    close: float,
    volume: float = 100.0,
    interval: str = "1m",
) -> Candle:
    step = interval_ms(interval)
    return Candle(
        open_time=open_time,
        open=open_price,
        high=high,
        low=low,
        close=close,
        volume=volume,
        close_time=open_time + step - 1,
        quote_volume=volume * close,
        trades=10,
    )


def build_series(
    closes: list[float],
    start_time: int = 0,
    interval: str = "1m",
    volumes: list[float] | None = None,
    wick: float = 0.001,
) -> list[Candle]:
    """Turn a list of closes into candles with plausible OHLC."""
    step = interval_ms(interval)
    candles: list[Candle] = []
    previous = closes[0]
    for index, close in enumerate(closes):
        open_price = previous
        high = max(open_price, close) * (1 + wick)
        low = min(open_price, close) * (1 - wick)
        volume = volumes[index] if volumes else 100.0
        candles.append(
            make_candle(
                start_time + index * step,
                open_price,
                high,
                low,
                close,
                volume,
                interval,
            )
        )
        previous = close
    return candles


def trending_closes(
    count: int,
    start: float = 100.0,
    drift: float = 0.0006,
    noise: float = 0.0004,
    seed: int = 7,
) -> list[float]:
    """A reproducible trending price path."""
    rng = random.Random(seed)
    price = start
    closes: list[float] = []
    for index in range(count):
        wobble = math.sin(index / 9.0) * noise
        price *= 1 + drift + wobble + rng.uniform(-noise, noise)
        closes.append(round(price, 6))
    return closes


def frame_from(candles: list[Candle]) -> pd.DataFrame:
    frame = pd.DataFrame([candle.as_row() for candle in candles], columns=list(FRAME_COLUMNS))
    for column in ("open", "high", "low", "close", "volume", "quote_volume"):
        frame[column] = frame[column].astype("float64")
    return frame


@pytest.fixture
def uptrend_candles() -> list[Candle]:
    return build_series(trending_closes(400), start_time=0)


@pytest.fixture
def uptrend_frame(uptrend_candles) -> pd.DataFrame:
    return frame_from(uptrend_candles)


# ----------------------------------------------------------------------
# Analysis builders
# ----------------------------------------------------------------------
def make_snapshot(
    interval: str,
    close: float = 100.0,
    *,
    bullish: bool = True,
    rsi: float = 58.0,
    volume_ratio: float = 1.6,
    atr: float = 0.5,
    cross: bool = False,
    supports: tuple[float, ...] = (),
    resistances: tuple[float, ...] = (),
    open_price: float | None = None,
) -> TimeframeSnapshot:
    """Hand-built timeframe snapshot, so strategy rules can be tested directly."""
    if bullish:
        ema9, ema21, ema50 = close * 0.999, close * 0.997, close * 0.99
        vwap = close * 0.998
        macd_value, macd_signal, hist = 0.4, 0.2, 0.2
        prev_hist = 0.1
    else:
        ema9, ema21, ema50 = close * 1.001, close * 1.003, close * 1.01
        vwap = close * 1.002
        macd_value, macd_signal, hist = -0.4, -0.2, -0.2
        prev_hist = -0.1

    # A cross means the fast EMA was on the other side one bar ago.
    prev_ema9 = ema21 * (0.999 if bullish else 1.001) if cross else ema9
    prev_ema21 = ema21

    opening = open_price if open_price is not None else (
        close * 0.998 if bullish else close * 1.002
    )

    return TimeframeSnapshot(
        interval=interval,
        open_time=1_700_000_000_000,
        close_time=1_700_000_000_000 + interval_ms(interval) - 1,
        open=opening,
        high=max(opening, close) * 1.0005,
        low=min(opening, close) * 0.9995,
        close=close,
        volume=1000.0,
        ema9=ema9,
        ema21=ema21,
        ema50=ema50,
        ema200=close * 0.95,
        prev_ema9=prev_ema9,
        prev_ema21=prev_ema21,
        rsi=rsi,
        prev_rsi=rsi - 2,
        macd=macd_value,
        macd_signal=macd_signal,
        macd_hist=hist,
        prev_macd_hist=prev_hist,
        vwap=vwap,
        atr=atr,
        volume_ratio=volume_ratio,
        levels=Levels(supports=supports, resistances=resistances),
    )


def make_analysis(
    symbol: str = "BTCUSDT",
    price: float = 100.0,
    *,
    bullish: bool = True,
    cross: bool = True,
    rsi: float = 58.0,
    volume_ratio: float = 1.6,
    atr: float = 0.5,
    supports: tuple[float, ...] = (98.0,),
    resistances: tuple[float, ...] = (105.0,),
    with_book: bool = True,
    imbalance: float = 1.5,
    spread_percent: float = 0.01,
) -> MarketAnalysis:
    """A complete, coherent analysis object for scoring/risk tests."""
    timeframes = {
        TF_TREND: make_snapshot(
            TF_TREND, price, bullish=bullish, rsi=rsi, volume_ratio=volume_ratio, atr=atr * 3
        ),
        TF_MAIN: make_snapshot(
            TF_MAIN, price, bullish=bullish, rsi=rsi, volume_ratio=volume_ratio, atr=atr * 2,
            supports=supports, resistances=resistances,
        ),
        TF_MOMENTUM: make_snapshot(
            TF_MOMENTUM, price, bullish=bullish, rsi=rsi, volume_ratio=volume_ratio, atr=atr
        ),
        TF_ENTRY: make_snapshot(
            TF_ENTRY,
            price,
            bullish=bullish,
            rsi=rsi,
            volume_ratio=volume_ratio,
            atr=atr,
            cross=cross,
            supports=supports,
            resistances=resistances,
        ),
    }

    book = None
    order_book = None
    if with_book:
        half_spread = price * spread_percent / 200
        book = BookTicker(
            symbol=symbol,
            bid_price=price - half_spread,
            bid_qty=10.0,
            ask_price=price + half_spread,
            ask_qty=10.0,
            timestamp=now_ms(),
        )
        # Build a book whose bid/ask volumes give the requested imbalance.
        order_book = OrderBook(
            symbol=symbol,
            bids=((price - half_spread, 10.0 * imbalance),),
            asks=((price + half_spread, 10.0),),
            timestamp=now_ms(),
        )

    return MarketAnalysis(
        symbol=symbol,
        price=price,
        timeframes=timeframes,
        book_ticker=book,
        order_book=order_book,
        spread_percent=spread_percent,
        quote_volume_24h=500_000_000.0,
    )


@pytest.fixture
def bullish_analysis() -> MarketAnalysis:
    return make_analysis()


@pytest.fixture
def bearish_analysis() -> MarketAnalysis:
    return make_analysis(
        bullish=False,
        rsi=38.0,
        supports=(95.0,),
        resistances=(102.0,),
        imbalance=1 / 1.5,
    )


def with_timeframe(
    analysis: MarketAnalysis,
    interval: str,
    **changes,
) -> MarketAnalysis:
    """Return a copy of ``analysis`` with one timeframe tweaked."""
    timeframes = dict(analysis.timeframes)
    timeframes[interval] = replace(timeframes[interval], **changes)
    return replace(analysis, timeframes=timeframes)
