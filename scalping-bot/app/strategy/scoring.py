"""Signal scoring: turns strategy conditions into a 0-100 score.

Point budget (100 total), straight from the specification::

    15m trend      15      RSI          10
    5m trend       15      MACD         10
    3m momentum    15      VWAP          5
    1m entry       15      Volume       10
                           Order book    5

A high score is *not* a probability of profit. It only expresses how many of
the strategy's conditions currently line up.
"""

from __future__ import annotations

from app.config import Settings
from app.strategy.models import ScoreComponent, ScoreResult, SignalSide
from app.strategy.scalping_strategy import Conditions, MarketAnalysis, buy_conditions, sell_conditions

MAX_SCORE = 100.0

WEIGHTS: dict[str, float] = {
    "trend_15m": 15.0,
    "trend_5m": 15.0,
    "momentum_3m": 15.0,
    "entry_1m": 15.0,
    "rsi": 10.0,
    "macd": 10.0,
    "vwap": 5.0,
    "volume": 10.0,
    "order_book": 5.0,
}


def _component(
    indicator: str,
    value: float,
    score: float,
    description: str,
    passed: bool,
) -> ScoreComponent:
    return ScoreComponent(
        indicator=indicator,
        value=round(value, 6),
        score=round(score, 2),
        max_score=WEIGHTS[indicator],
        description=description,
        passed=passed,
    )


def score_conditions(
    conditions: Conditions,
    side: SignalSide,
    settings: Settings,
) -> ScoreResult:
    """Score one direction from its evaluated conditions."""
    direction = "Bullish" if side is SignalSide.BUY else "Bearish"
    components: list[ScoreComponent] = []

    # --- 15m trend ------------------------------------------------------
    if conditions.trend_full:
        components.append(
            _component("trend_15m", 1.0, 15.0, f"15m trend {direction.lower()}", True)
        )
    elif conditions.trend_partial:
        components.append(
            _component("trend_15m", 0.5, 7.0, "15m EMA aligned, price against EMA50", False)
        )
    else:
        components.append(_component("trend_15m", 0.0, 0.0, "15m trend not aligned", False))

    # --- 5m trend -------------------------------------------------------
    if conditions.main_full:
        components.append(
            _component("trend_5m", 1.0, 15.0, f"5m trend {direction.lower()} vs VWAP", True)
        )
    elif conditions.main_partial:
        components.append(
            _component("trend_5m", 0.5, 7.0, "5m partially aligned", False)
        )
    else:
        components.append(_component("trend_5m", 0.0, 0.0, "5m trend not aligned", False))

    # --- 3m momentum ----------------------------------------------------
    if conditions.momentum_rsi and conditions.momentum_macd:
        components.append(
            _component("momentum_3m", 1.0, 15.0, "3m RSI and MACD momentum", True)
        )
    elif conditions.momentum_rsi:
        components.append(_component("momentum_3m", 0.5, 8.0, "3m RSI momentum only", False))
    elif conditions.momentum_macd:
        components.append(_component("momentum_3m", 0.5, 7.0, "3m MACD momentum only", False))
    else:
        components.append(_component("momentum_3m", 0.0, 0.0, "3m momentum missing", False))

    # --- 1m entry -------------------------------------------------------
    if conditions.entry_cross:
        label = "1m EMA crossover" if side is SignalSide.BUY else "1m EMA breakdown"
        components.append(_component("entry_1m", 1.0, 15.0, label, True))
    elif conditions.entry_rejection:
        label = (
            "1m support rejection" if side is SignalSide.BUY else "1m resistance rejection"
        )
        components.append(_component("entry_1m", 0.95, 14.0, label, True))
    elif conditions.entry_continuation:
        components.append(
            _component("entry_1m", 0.5, 7.0, "1m continuation only, no trigger", False)
        )
    else:
        components.append(_component("entry_1m", 0.0, 0.0, "no 1m entry trigger", False))

    # --- RSI ------------------------------------------------------------
    if conditions.rsi_ideal:
        components.append(
            _component("rsi", conditions.rsi_value, 10.0, f"RSI {conditions.rsi_value:.0f}", True)
        )
    elif conditions.rsi_acceptable:
        components.append(
            _component(
                "rsi", conditions.rsi_value, 6.0, f"RSI {conditions.rsi_value:.0f} acceptable", False
            )
        )
    else:
        components.append(
            _component(
                "rsi", conditions.rsi_value, 0.0, f"RSI {conditions.rsi_value:.0f} unfavourable", False
            )
        )

    # --- MACD -----------------------------------------------------------
    if conditions.macd_aligned:
        components.append(_component("macd", 1.0, 10.0, f"MACD {direction.lower()}", True))
    elif conditions.macd_hist_improving:
        components.append(_component("macd", 0.5, 5.0, "MACD histogram turning", False))
    else:
        components.append(_component("macd", 0.0, 0.0, "MACD not aligned", False))

    # --- VWAP -----------------------------------------------------------
    if conditions.vwap_aligned:
        position = "above" if side is SignalSide.BUY else "below"
        components.append(_component("vwap", 1.0, 5.0, f"price {position} VWAP", True))
    else:
        components.append(_component("vwap", 0.0, 0.0, "VWAP not aligned", False))

    # --- Volume ----------------------------------------------------------
    ratio = conditions.volume_ratio
    volume_score, volume_passed = _volume_score(ratio, settings.min_volume_ratio)
    components.append(
        _component(
            "volume",
            ratio,
            volume_score,
            f"volume {(ratio - 1) * 100:+.0f}% vs 20-bar average",
            volume_passed,
        )
    )

    # --- Order book -------------------------------------------------------
    imbalance = conditions.book_imbalance
    book_score, book_passed, book_text = _order_book_score(imbalance)
    components.append(_component("order_book", imbalance, book_score, book_text, book_passed))

    total = sum(item.score for item in components)
    return ScoreResult(
        side=side,
        total=round(min(total, MAX_SCORE), 2),
        components=tuple(components),
        mandatory_passed=conditions.mandatory_ok,
        missing=conditions.missing(),
    )


def _volume_score(ratio: float, minimum: float) -> tuple[float, bool]:
    if ratio >= 2.0:
        return 10.0, True
    if ratio >= 1.5:
        return 8.0, True
    if ratio >= minimum:
        return 6.0, True
    if ratio >= 1.0:
        return 3.0, False
    return 0.0, False


def _order_book_score(imbalance: float) -> tuple[float, bool, str]:
    if imbalance <= 0:
        return 0.0, False, "order book unavailable"
    if imbalance >= 1.3:
        return 5.0, True, f"order book {imbalance:.2f}x in favour"
    if imbalance >= 1.15:
        return 4.0, True, f"order book {imbalance:.2f}x in favour"
    if imbalance >= 1.0:
        return 2.0, False, f"order book balanced ({imbalance:.2f}x)"
    return 0.0, False, f"order book against ({imbalance:.2f}x)"


def score_buy(analysis: MarketAnalysis, settings: Settings) -> ScoreResult:
    return score_conditions(buy_conditions(analysis, settings), SignalSide.BUY, settings)


def score_sell(analysis: MarketAnalysis, settings: Settings) -> ScoreResult:
    return score_conditions(sell_conditions(analysis, settings), SignalSide.SELL, settings)


def best_side(analysis: MarketAnalysis, settings: Settings) -> ScoreResult:
    """Score both directions and return the stronger, valid one.

    A side that fails the mandatory confirmations can never win, no matter how
    high its raw score - that is the "score alone is not enough" rule.
    """
    buy = score_buy(analysis, settings)
    sell = score_sell(analysis, settings)

    candidates = [result for result in (buy, sell) if result.mandatory_passed]
    if not candidates:
        # Return the higher score anyway so /status and the dashboard can show
        # how close the market is, but the engine will reject it.
        return buy if buy.total >= sell.total else sell

    return max(candidates, key=lambda result: result.total)
