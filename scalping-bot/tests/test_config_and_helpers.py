"""Configuration loading, security defaults and helper utilities."""

from __future__ import annotations

import pytest

from app.config import INTERVAL_MS, TIMEFRAMES, Settings
from app.utils.helpers import (
    candle_open_time,
    chunked,
    clamp,
    decimals_for,
    format_price,
    humanize_duration,
    interval_ms,
    percent_change,
    round_to_step,
    safe_float,
    to_datetime,
)


# ----------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------
def test_defaults_are_safe():
    settings = Settings()
    assert settings.paper_trading is True
    assert settings.real_trading is False
    assert settings.min_signal_score == 75
    assert settings.timeframes == TIMEFRAMES


def test_settings_are_read_from_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("MIN_SIGNAL_SCORE", "88")
    monkeypatch.setenv("MAX_SYMBOLS", "12")
    monkeypatch.setenv("RISK_PER_TRADE", "0.02")
    monkeypatch.setenv("PAPER_TRADING", "false")
    monkeypatch.setenv("PRIORITY_SYMBOLS", "btcusdt, ethusdt")
    monkeypatch.setenv("TP_ALLOCATION", "0.4,0.4,0.2")

    settings = Settings.from_env(env_file=tmp_path / "missing.env")

    assert settings.min_signal_score == 88
    assert settings.max_symbols == 12
    assert settings.risk_per_trade == pytest.approx(0.02)
    assert settings.paper_trading is False
    assert settings.priority_symbols == ("BTCUSDT", "ETHUSDT")
    assert settings.tp_allocation == (0.4, 0.4, 0.2)


def test_malformed_environment_values_fall_back_to_defaults(monkeypatch, tmp_path):
    monkeypatch.setenv("MIN_SIGNAL_SCORE", "not-a-number")
    monkeypatch.setenv("RISK_PER_TRADE", "")
    monkeypatch.setenv("TP_ALLOCATION", "a,b,c")

    settings = Settings.from_env(env_file=tmp_path / "missing.env")

    assert settings.min_signal_score == 75
    assert settings.risk_per_trade == pytest.approx(0.01)
    assert settings.tp_allocation == (0.5, 0.3, 0.2)


def test_real_trading_stays_off_unless_explicitly_enabled(monkeypatch, tmp_path):
    settings = Settings.from_env(env_file=tmp_path / "missing.env")
    assert settings.real_trading is False

    monkeypatch.setenv("REAL_TRADING", "true")
    assert Settings.from_env(env_file=tmp_path / "missing.env").real_trading is True


def test_telegram_is_disabled_without_both_credentials():
    assert Settings(telegram_bot_token="abc").telegram_enabled is False
    assert Settings(telegram_chat_id="123").telegram_enabled is False
    assert Settings(telegram_bot_token="abc", telegram_chat_id="123").telegram_enabled is True


def test_an_unlisted_chat_is_never_authorised():
    settings = Settings(telegram_chat_id="111", authorized_chat_ids=("222",))

    assert settings.is_chat_authorized("111") is True
    assert settings.is_chat_authorized(222) is True
    assert settings.is_chat_authorized("333") is False


def test_with_no_whitelist_at_all_nobody_is_authorised():
    """Fail closed: an unconfigured bot must not answer strangers."""
    settings = Settings()
    assert settings.allowed_chat_ids == ()
    assert settings.is_chat_authorized("123") is False


def test_settings_are_immutable():
    settings = Settings()
    with pytest.raises(Exception):
        settings.min_signal_score = 10  # type: ignore[misc]


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def test_interval_lookup():
    assert interval_ms("1m") == 60_000
    assert interval_ms("15m") == 900_000
    assert set(TIMEFRAMES) <= set(INTERVAL_MS)
    with pytest.raises(ValueError):
        interval_ms("7m")


def test_candle_open_time_aligns_to_the_bucket():
    assert candle_open_time(1_700_000_123_456, "1m") % 60_000 == 0
    assert candle_open_time(900_001, "15m") == 900_000


def test_safe_float_never_raises():
    assert safe_float("1.5") == pytest.approx(1.5)
    assert safe_float(None) == 0.0
    assert safe_float("abc", default=7.0) == 7.0
    assert safe_float(float("nan")) == 0.0
    assert safe_float(float("inf")) == 0.0


def test_percent_change():
    assert percent_change(100, 110) == pytest.approx(10.0)
    assert percent_change(100, 90) == pytest.approx(-10.0)
    assert percent_change(0, 10) == 0.0


def test_price_formatting_scales_with_magnitude():
    assert decimals_for(50_000) == 2
    assert decimals_for(0.00005) == 8
    assert format_price(112450.0) == "112,450"
    assert format_price(0.5) == "0.5"
    assert format_price(1.23456789) == "1.2346"


def test_round_to_step():
    assert round_to_step(1.23456, 0.001) == pytest.approx(1.234)
    assert round_to_step(5.0, 0) == 5.0


def test_chunked_splits_evenly():
    assert list(chunked(list("abcde"), 2)) == [["a", "b"], ["c", "d"], ["e"]]
    with pytest.raises(ValueError):
        list(chunked(["a"], 0))


def test_clamp():
    assert clamp(5, 0, 10) == 5
    assert clamp(-1, 0, 10) == 0
    assert clamp(11, 0, 10) == 10


def test_humanize_duration():
    assert humanize_duration(45) == "45s"
    assert humanize_duration(125) == "2m 5s"
    assert humanize_duration(7_500) == "2h 5m"
    assert humanize_duration(-5) == "0s"


def test_to_datetime_is_utc():
    assert to_datetime(0).year == 1970
    assert to_datetime(1_700_000_000_000).tzinfo is not None
