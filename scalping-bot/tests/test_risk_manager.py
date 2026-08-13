"""Risk manager: filters, stop placement, targets and position sizing."""

from __future__ import annotations

import pytest

from app.config import TF_ENTRY, TF_MAIN, Settings
from app.indicators.support_resistance import Levels
from app.strategy.models import SignalSide
from app.strategy.risk_manager import TP_MULTIPLES, RiskManager

from tests.conftest import make_analysis, with_timeframe


@pytest.fixture
def risk(settings: Settings) -> RiskManager:
    return RiskManager(settings)


# ----------------------------------------------------------------------
# Filters
# ----------------------------------------------------------------------
def test_a_clean_setup_passes_every_filter(risk, bullish_analysis):
    result = risk.check_filters(bullish_analysis, SignalSide.BUY)
    assert result.passed is True
    assert result.reasons == ()


def test_low_volume_is_rejected(risk, settings):
    analysis = make_analysis(volume_ratio=0.9)
    result = risk.check_filters(analysis, SignalSide.BUY)
    assert result.passed is False
    assert any("volume ratio" in reason for reason in result.reasons)


def test_a_wide_spread_is_rejected(risk, settings):
    analysis = make_analysis(spread_percent=settings.max_spread_percent * 5)
    result = risk.check_filters(analysis, SignalSide.BUY)
    assert result.passed is False
    assert any("spread" in reason for reason in result.reasons)


def test_an_overextended_signal_candle_is_rejected(risk, bullish_analysis, settings):
    # The 1m candle already ran 3% - too late to join.
    analysis = with_timeframe(bullish_analysis, TF_ENTRY, open=97.0, close=100.0)
    result = risk.check_filters(analysis, SignalSide.BUY)
    assert result.passed is False
    assert any("already moved" in reason for reason in result.reasons)


def test_extreme_volatility_is_rejected(risk, bullish_analysis, settings):
    analysis = with_timeframe(bullish_analysis, TF_MAIN, atr=50.0)  # 50% of price
    result = risk.check_filters(analysis, SignalSide.BUY)
    assert result.passed is False
    assert any("volatility" in reason for reason in result.reasons)


@pytest.mark.parametrize("rsi_value", [80.0, 15.0])
def test_extreme_rsi_is_rejected(risk, rsi_value):
    analysis = make_analysis(rsi=rsi_value)
    result = risk.check_filters(analysis, SignalSide.BUY)
    assert result.passed is False
    assert any("RSI" in reason for reason in result.reasons)


# ----------------------------------------------------------------------
# Stop loss
# ----------------------------------------------------------------------
def test_stop_uses_atr_when_there_is_no_nearby_support(risk, settings):
    analysis = make_analysis(price=100.0, atr=0.5, supports=(), resistances=(110.0,))
    plan, reason = risk.build_plan(analysis, SignalSide.BUY)

    assert plan is not None, reason
    # 5m ATR is atr*2 = 1.0, multiplier 1.2 -> stop 1.2 below entry.
    assert plan.stop_loss == pytest.approx(plan.entry - 1.2, rel=1e-3)
    assert "ATR" in " ".join(plan.reasons)


def test_stop_is_pushed_below_a_nearby_support(risk):
    # Support sits below the ATR stop, so the stop must go under the support.
    analysis = make_analysis(price=100.0, atr=0.5, supports=(98.0,), resistances=(110.0,))
    plan, reason = risk.build_plan(analysis, SignalSide.BUY)

    assert plan is not None, reason
    assert plan.stop_loss < 98.0
    assert "support" in " ".join(plan.reasons)


def test_stop_is_above_resistance_for_an_exit_signal(risk):
    analysis = make_analysis(
        price=100.0, bullish=False, rsi=38.0, atr=0.5, supports=(90.0,), resistances=(102.0,)
    )
    plan, reason = risk.build_plan(analysis, SignalSide.SELL)

    assert plan is not None, reason
    assert plan.stop_loss > 102.0


def test_a_too_tight_stop_is_rejected(risk, settings):
    tight = Settings(**{**settings.__dict__, "min_stop_distance_percent": 5.0})
    manager = RiskManager(tight)
    analysis = make_analysis(price=100.0, atr=0.1, supports=(), resistances=(110.0,))

    plan, reason = manager.build_plan(analysis, SignalSide.BUY)
    assert plan is None
    assert "too tight" in reason


def test_a_too_wide_stop_is_rejected(risk, settings):
    narrow = Settings(**{**settings.__dict__, "max_stop_distance_percent": 0.5})
    manager = RiskManager(narrow)
    analysis = make_analysis(price=100.0, atr=2.0, supports=(), resistances=(200.0,))

    plan, reason = manager.build_plan(analysis, SignalSide.BUY)
    assert plan is None
    assert "too wide" in reason


# ----------------------------------------------------------------------
# Take profits
# ----------------------------------------------------------------------
def test_targets_follow_the_risk_multiples(risk):
    analysis = make_analysis(price=100.0, atr=0.5, supports=(), resistances=(500.0,))
    plan, reason = risk.build_plan(analysis, SignalSide.BUY)

    assert plan is not None, reason
    risk_unit = plan.risk_per_unit
    for target, multiple in zip(plan.take_profits, TP_MULTIPLES):
        assert target == pytest.approx(plan.entry + risk_unit * multiple, rel=1e-6)
    assert plan.risk_reward == pytest.approx(2.0, rel=1e-6)


def test_targets_are_capped_in_front_of_resistance(risk):
    # Resistance at 101 sits between entry and the nominal TP2/TP3.
    analysis = make_analysis(price=100.0, atr=0.5, supports=(), resistances=(101.0,))
    plan, reason = risk.build_plan(analysis, SignalSide.BUY)

    if plan is None:
        # Capping can legitimately push R:R under the minimum.
        assert "risk/reward" in reason
        return
    assert plan.tp3 <= 101.0
    assert "structure" in " ".join(plan.reasons)


def test_targets_stay_strictly_ordered(risk):
    analysis = make_analysis(price=100.0, atr=0.5, supports=(), resistances=(100.6, 100.9))
    plan, _ = risk.build_plan(analysis, SignalSide.BUY)
    if plan is not None:
        assert plan.tp1 < plan.tp2 < plan.tp3
        assert plan.tp1 > plan.entry


def test_a_poor_risk_reward_is_rejected(settings):
    demanding = Settings(**{**settings.__dict__, "min_risk_reward": 5.0})
    manager = RiskManager(demanding)
    analysis = make_analysis(price=100.0, atr=0.5, supports=(), resistances=(500.0,))

    plan, reason = manager.build_plan(analysis, SignalSide.BUY)
    assert plan is None
    assert "risk/reward" in reason


def test_sell_plan_targets_point_downwards(risk):
    analysis = make_analysis(
        price=100.0, bullish=False, rsi=38.0, atr=0.5, supports=(80.0,), resistances=(102.0,)
    )
    plan, reason = risk.build_plan(analysis, SignalSide.SELL)

    assert plan is not None, reason
    assert plan.tp1 < plan.entry
    assert plan.tp1 > plan.tp2 > plan.tp3
    assert plan.stop_loss > plan.entry


def test_wait_side_produces_no_plan(risk, bullish_analysis):
    plan, reason = risk.build_plan(bullish_analysis, SignalSide.WAIT)
    assert plan is None
    assert reason == "no direction"


def test_entry_uses_the_ask_for_a_buy_and_the_bid_for_a_sell(risk):
    analysis = make_analysis(price=100.0, spread_percent=0.1)
    buy_plan, _ = risk.build_plan(analysis, SignalSide.BUY)
    assert buy_plan is not None
    assert buy_plan.entry == pytest.approx(analysis.book_ticker.ask_price)

    bearish = make_analysis(
        price=100.0, bullish=False, rsi=38.0, spread_percent=0.1,
        supports=(90.0,), resistances=(102.0,),
    )
    sell_plan, _ = risk.build_plan(bearish, SignalSide.SELL)
    assert sell_plan is not None
    assert sell_plan.entry == pytest.approx(bearish.book_ticker.bid_price)


def test_entry_band_brackets_the_entry(risk):
    analysis = make_analysis(price=100.0, atr=0.5, supports=(), resistances=(500.0,))
    plan, _ = risk.build_plan(analysis, SignalSide.BUY)
    assert plan is not None
    assert plan.entry_low < plan.entry < plan.entry_high


# ----------------------------------------------------------------------
# Position sizing
# ----------------------------------------------------------------------
def test_position_size_risks_exactly_the_configured_fraction(risk):
    # 1% of 1000 = 10 USDT risk, stop 2 away -> 5 units.
    quantity = risk.position_size(balance=1000.0, entry=100.0, stop_loss=98.0)
    assert quantity == pytest.approx(5.0)
    assert quantity * 2.0 == pytest.approx(10.0)


def test_position_size_is_capped_by_the_balance(risk):
    # A very tight stop would ask for more than the account can buy on spot.
    quantity = risk.position_size(balance=1000.0, entry=100.0, stop_loss=99.99)
    assert quantity == pytest.approx(1000.0 / 100.0)


def test_position_size_honours_an_explicit_risk_fraction(risk):
    quantity = risk.position_size(1000.0, 100.0, 98.0, risk_fraction=0.02)
    assert quantity == pytest.approx(10.0)


@pytest.mark.parametrize(
    ("balance", "entry", "stop"),
    [(0.0, 100.0, 98.0), (1000.0, 0.0, 98.0), (1000.0, 100.0, 100.0)],
)
def test_position_size_degrades_to_zero_on_bad_inputs(risk, balance, entry, stop):
    assert risk.position_size(balance, entry, stop) == 0.0


def test_expected_hold_scales_with_volatility(risk):
    analysis = make_analysis(price=100.0, atr=0.5, supports=(), resistances=(500.0,))
    plan, _ = risk.build_plan(analysis, SignalSide.BUY)
    assert plan is not None

    entry_tf = analysis.timeframes[TF_ENTRY]
    text = risk.expected_hold(plan, entry_tf)
    assert "min" in text
