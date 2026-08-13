"""Candle model and per-symbol candle buffers.

Only *closed* candles ever land in the history buffer. The still-forming
candle is kept separately as ``live`` and is never fed to the indicators —
that is the rule that prevents repainting signals.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Iterable, Sequence

import pandas as pd

from app.utils.helpers import interval_ms, safe_float
from app.utils.logger import get_logger

logger = get_logger(__name__)

FRAME_COLUMNS = (
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_volume",
    "trades",
)


@dataclass(frozen=True)
class Candle:
    """A single OHLCV candle. Timestamps are epoch milliseconds."""

    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: int
    quote_volume: float = 0.0
    trades: int = 0

    @property
    def is_bullish(self) -> bool:
        return self.close > self.open

    @property
    def is_bearish(self) -> bool:
        return self.close < self.open

    @property
    def body(self) -> float:
        return abs(self.close - self.open)

    @property
    def range(self) -> float:
        return self.high - self.low

    @property
    def upper_wick(self) -> float:
        return self.high - max(self.open, self.close)

    @property
    def lower_wick(self) -> float:
        return min(self.open, self.close) - self.low

    @property
    def change_percent(self) -> float:
        if not self.open:
            return 0.0
        return (self.close - self.open) / self.open * 100.0

    @classmethod
    def from_rest(cls, row: Sequence[object]) -> "Candle":
        """Build a candle from a Binance REST ``/api/v3/klines`` row."""
        return cls(
            open_time=int(row[0]),          # type: ignore[arg-type]
            open=safe_float(row[1]),
            high=safe_float(row[2]),
            low=safe_float(row[3]),
            close=safe_float(row[4]),
            volume=safe_float(row[5]),
            close_time=int(row[6]),         # type: ignore[arg-type]
            quote_volume=safe_float(row[7]),
            trades=int(row[8]) if len(row) > 8 else 0,  # type: ignore[arg-type]
        )

    @classmethod
    def from_ws(cls, payload: dict) -> tuple["Candle", bool]:
        """Build a candle from a websocket kline payload.

        Returns ``(candle, is_closed)``; ``is_closed`` mirrors Binance's
        ``k.x`` flag.
        """
        return (
            cls(
                open_time=int(payload["t"]),
                open=safe_float(payload["o"]),
                high=safe_float(payload["h"]),
                low=safe_float(payload["l"]),
                close=safe_float(payload["c"]),
                volume=safe_float(payload["v"]),
                close_time=int(payload["T"]),
                quote_volume=safe_float(payload.get("q", 0.0)),
                trades=int(payload.get("n", 0) or 0),
            ),
            bool(payload.get("x", False)),
        )

    def as_row(self) -> tuple:
        return (
            self.open_time,
            self.open,
            self.high,
            self.low,
            self.close,
            self.volume,
            self.close_time,
            self.quote_volume,
            self.trades,
        )


class CandleSeries:
    """Ordered, de-duplicated buffer of closed candles for one timeframe."""

    def __init__(self, symbol: str, interval: str, maxlen: int = 400) -> None:
        self.symbol = symbol
        self.interval = interval
        self.maxlen = maxlen
        self.step = interval_ms(interval)
        self._candles: deque[Candle] = deque(maxlen=maxlen)
        self._live: Candle | None = None
        self._frame: pd.DataFrame | None = None
        self._frame_key: tuple[int, int] | None = None

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------
    def add_closed(self, candle: Candle) -> bool:
        """Append a closed candle.

        Returns ``True`` only when the candle is genuinely new, so callers can
        use the return value as a "new bar" trigger. Duplicates replace the
        existing entry (Binance may resend the final update) and out-of-order
        candles are dropped.
        """
        if self._candles:
            last = self._candles[-1]
            if candle.open_time == last.open_time:
                self._candles[-1] = candle
                self._invalidate()
                return False
            if candle.open_time < last.open_time:
                logger.debug(
                    "%s %s: dropping out-of-order candle %s (last %s)",
                    self.symbol,
                    self.interval,
                    candle.open_time,
                    last.open_time,
                )
                return False
            missing = (candle.open_time - last.open_time) // self.step - 1
            if missing > 0:
                logger.warning(
                    "%s %s: %d missing candle(s) before %s",
                    self.symbol,
                    self.interval,
                    missing,
                    candle.open_time,
                )

        self._candles.append(candle)
        self._invalidate()
        return True

    def set_live(self, candle: Candle | None) -> None:
        """Store the currently forming candle (never used by indicators)."""
        self._live = candle

    def bulk_load(self, candles: Iterable[Candle]) -> int:
        """Load a historical batch, keeping ordering and de-duplication."""
        added = 0
        for candle in sorted(candles, key=lambda item: item.open_time):
            if self.add_closed(candle):
                added += 1
        return added

    def clear(self) -> None:
        self._candles.clear()
        self._live = None
        self._invalidate()

    def _invalidate(self) -> None:
        self._frame = None
        self._frame_key = None

    # ------------------------------------------------------------------
    # Access
    # ------------------------------------------------------------------
    def __len__(self) -> int:
        return len(self._candles)

    @property
    def candles(self) -> tuple[Candle, ...]:
        return tuple(self._candles)

    @property
    def live(self) -> Candle | None:
        return self._live

    @property
    def last_closed(self) -> Candle | None:
        return self._candles[-1] if self._candles else None

    @property
    def last_close_time(self) -> int:
        last = self.last_closed
        return last.close_time if last else 0

    @property
    def last_price(self) -> float:
        """Freshest known price: live candle close, else last closed close."""
        if self._live is not None:
            return self._live.close
        last = self.last_closed
        return last.close if last else 0.0

    def ready(self, minimum: int) -> bool:
        """True when enough closed candles exist for the indicator set."""
        return len(self._candles) >= minimum

    def to_frame(self) -> pd.DataFrame:
        """Closed candles as a DataFrame (cached until the buffer changes)."""
        key = (
            self._candles[-1].open_time if self._candles else 0,
            len(self._candles),
        )
        if self._frame is not None and self._frame_key == key:
            return self._frame

        frame = pd.DataFrame(
            [candle.as_row() for candle in self._candles],
            columns=list(FRAME_COLUMNS),
        )
        if frame.empty:
            frame = pd.DataFrame(columns=list(FRAME_COLUMNS))
        else:
            for column in ("open", "high", "low", "close", "volume", "quote_volume"):
                frame[column] = frame[column].astype("float64")

        self._frame = frame
        self._frame_key = key
        return frame
