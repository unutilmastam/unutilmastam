"""Application configuration.

All tunables are read from environment variables (``.env`` in development).
The dataclass is frozen so that configuration cannot be mutated at runtime by
accident; tests build their own ``Settings`` instances directly.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Timeframe roles used across the whole strategy stack.
TF_TREND = "15m"
TF_MAIN = "5m"
TF_MOMENTUM = "3m"
TF_ENTRY = "1m"
TIMEFRAMES: tuple[str, ...] = (TF_ENTRY, TF_MOMENTUM, TF_MAIN, TF_TREND)

# Number of milliseconds in one candle of each interval.
INTERVAL_MS: dict[str, int] = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
}


def _get(key: str, default: str = "") -> str:
    value = os.getenv(key)
    if value is None:
        return default
    return value.strip()


def _get_int(key: str, default: int) -> int:
    raw = _get(key)
    if not raw:
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def _get_float(key: str, default: float) -> float:
    raw = _get(key)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _get_bool(key: str, default: bool) -> bool:
    raw = _get(key).lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "y", "on"}


def _get_list(key: str, default: Sequence[str] = ()) -> tuple[str, ...]:
    raw = _get(key)
    if not raw:
        return tuple(default)
    return tuple(item.strip().upper() for item in raw.split(",") if item.strip())


def _get_float_list(key: str, default: Sequence[float]) -> tuple[float, ...]:
    raw = _get(key)
    if not raw:
        return tuple(default)
    try:
        return tuple(float(item) for item in raw.split(",") if item.strip())
    except ValueError:
        return tuple(default)


DEFAULT_PRIORITY_SYMBOLS = (
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "ADAUSDT",
    "AVAXUSDT",
    "LINKUSDT",
)


@dataclass(frozen=True)
class Settings:
    """Runtime configuration for the bot."""

    # --- Binance -------------------------------------------------------
    binance_api_key: str = ""
    binance_api_secret: str = ""
    binance_rest_url: str = "https://api.binance.com"
    binance_ws_url: str = "wss://stream.binance.com:9443"

    # --- Telegram ------------------------------------------------------
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    authorized_chat_ids: tuple[str, ...] = ()

    # --- Scanner -------------------------------------------------------
    quote_asset: str = "USDT"
    max_symbols: int = 30
    min_24h_volume: float = 50_000_000.0
    max_spread_percent: float = 0.06
    priority_symbols: tuple[str, ...] = DEFAULT_PRIORITY_SYMBOLS
    blacklist_symbols: tuple[str, ...] = ()
    scanner_refresh_minutes: int = 60

    # --- Signal engine -------------------------------------------------
    min_signal_score: int = 75
    signal_cooldown_minutes: int = 5
    signal_score_delta: float = 8.0
    max_data_age_seconds: int = 90

    # --- Risk ----------------------------------------------------------
    risk_per_trade: float = 0.01
    atr_sl_multiplier: float = 1.2
    min_risk_reward: float = 1.5
    min_stop_distance_percent: float = 0.15
    max_stop_distance_percent: float = 3.0
    max_candle_move_percent: float = 1.5
    max_atr_percent: float = 5.0
    rsi_max: float = 75.0
    rsi_min: float = 25.0
    min_volume_ratio: float = 1.2

    # --- Paper trading -------------------------------------------------
    paper_trading: bool = True
    real_trading: bool = False
    paper_start_balance: float = 1000.0
    tp_allocation: tuple[float, ...] = (0.5, 0.3, 0.2)
    max_position_percent: float = 0.25

    # --- Infrastructure ------------------------------------------------
    database_url: str = "sqlite+aiosqlite:///./data/signals.db"
    log_level: str = "INFO"
    log_file: str = "logs/bot.log"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    enable_api: bool = True

    # --- Derived / static ----------------------------------------------
    timeframes: tuple[str, ...] = TIMEFRAMES
    # How many closed candles are kept per symbol/timeframe. EMA200 on 15m
    # needs a healthy history, 400 gives a comfortable margin.
    candle_history: int = 400

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token and self.telegram_chat_id)

    @property
    def allowed_chat_ids(self) -> tuple[str, ...]:
        """Chat ids permitted to interact with the bot."""
        ids = set(self.authorized_chat_ids)
        if self.telegram_chat_id:
            ids.add(self.telegram_chat_id)
        return tuple(sorted(ids))

    def is_chat_authorized(self, chat_id: object) -> bool:
        allowed = self.allowed_chat_ids
        if not allowed:
            # No whitelist configured -> refuse everyone rather than open up.
            return False
        return str(chat_id) in allowed

    @classmethod
    def from_env(cls, env_file: str | os.PathLike[str] | None = None) -> "Settings":
        """Build settings from environment variables (loading ``.env`` first)."""
        path = Path(env_file) if env_file else BASE_DIR / ".env"
        if path.exists():
            load_dotenv(path, override=False)

        return cls(
            binance_api_key=_get("BINANCE_API_KEY"),
            binance_api_secret=_get("BINANCE_API_SECRET"),
            binance_rest_url=_get("BINANCE_REST_URL", "https://api.binance.com").rstrip("/"),
            binance_ws_url=_get("BINANCE_WS_URL", "wss://stream.binance.com:9443").rstrip("/"),
            telegram_bot_token=_get("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=_get("TELEGRAM_CHAT_ID"),
            authorized_chat_ids=_get_list("AUTHORIZED_CHAT_IDS"),
            quote_asset=_get("QUOTE_ASSET", "USDT").upper(),
            max_symbols=_get_int("MAX_SYMBOLS", 30),
            min_24h_volume=_get_float("MIN_24H_VOLUME", 50_000_000.0),
            max_spread_percent=_get_float("MAX_SPREAD_PERCENT", 0.06),
            priority_symbols=_get_list("PRIORITY_SYMBOLS", DEFAULT_PRIORITY_SYMBOLS),
            blacklist_symbols=_get_list("BLACKLIST_SYMBOLS"),
            scanner_refresh_minutes=_get_int("SCANNER_REFRESH_MINUTES", 60),
            min_signal_score=_get_int("MIN_SIGNAL_SCORE", 75),
            signal_cooldown_minutes=_get_int("SIGNAL_COOLDOWN_MINUTES", 5),
            signal_score_delta=_get_float("SIGNAL_SCORE_DELTA", 8.0),
            max_data_age_seconds=_get_int("MAX_DATA_AGE_SECONDS", 90),
            risk_per_trade=_get_float("RISK_PER_TRADE", 0.01),
            atr_sl_multiplier=_get_float("ATR_SL_MULTIPLIER", 1.2),
            min_risk_reward=_get_float("MIN_RISK_REWARD", 1.5),
            min_stop_distance_percent=_get_float("MIN_STOP_DISTANCE_PERCENT", 0.15),
            max_stop_distance_percent=_get_float("MAX_STOP_DISTANCE_PERCENT", 3.0),
            max_candle_move_percent=_get_float("MAX_CANDLE_MOVE_PERCENT", 1.5),
            max_atr_percent=_get_float("MAX_ATR_PERCENT", 5.0),
            rsi_max=_get_float("RSI_MAX", 75.0),
            rsi_min=_get_float("RSI_MIN", 25.0),
            min_volume_ratio=_get_float("MIN_VOLUME_RATIO", 1.2),
            paper_trading=_get_bool("PAPER_TRADING", True),
            real_trading=_get_bool("REAL_TRADING", False),
            paper_start_balance=_get_float("PAPER_START_BALANCE", 1000.0),
            tp_allocation=_get_float_list("TP_ALLOCATION", (0.5, 0.3, 0.2)),
            max_position_percent=_get_float("MAX_POSITION_PERCENT", 0.25),
            database_url=_get("DATABASE_URL", "sqlite+aiosqlite:///./data/signals.db"),
            log_level=_get("LOG_LEVEL", "INFO").upper(),
            log_file=_get("LOG_FILE", "logs/bot.log"),
            api_host=_get("API_HOST", "0.0.0.0"),
            api_port=_get_int("API_PORT", 8000),
            enable_api=_get_bool("ENABLE_API", True),
        )


_settings: Settings | None = None


def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    global _settings
    if _settings is None:
        _settings = Settings.from_env()
    return _settings


def set_settings(settings: Settings) -> None:
    """Override the singleton (used by tests and by ``run.py``)."""
    global _settings
    _settings = settings
