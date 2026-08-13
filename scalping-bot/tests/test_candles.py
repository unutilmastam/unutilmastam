"""Candle buffer behaviour: de-duplication, ordering, closed-only history."""

from __future__ import annotations

import pytest

from app.config import Settings
from app.market.candles import Candle, CandleSeries
from app.market.store import MarketStore
from app.utils.helpers import now_ms

from tests.conftest import build_series, make_candle, trending_closes

MINUTE = 60_000


def test_from_rest_parses_a_kline_row():
    row = [
        1_700_000_000_000,
        "100.5",
        "101.0",
        "99.5",
        "100.8",
        "12.5",
        1_700_000_059_999,
        "1260.0",
        42,
    ]
    candle = Candle.from_rest(row)
    assert candle.open == pytest.approx(100.5)
    assert candle.close == pytest.approx(100.8)
    assert candle.trades == 42
    assert candle.is_bullish is True


def test_from_ws_reports_the_closed_flag():
    payload = {
        "t": 1_700_000_000_000,
        "T": 1_700_000_059_999,
        "s": "BTCUSDT",
        "i": "1m",
        "o": "100",
        "h": "102",
        "l": "99",
        "c": "101",
        "v": "5",
        "q": "505",
        "n": 7,
        "x": False,
    }
    candle, is_closed = Candle.from_ws(payload)
    assert is_closed is False
    assert candle.high == pytest.approx(102.0)

    payload["x"] = True
    _, is_closed = Candle.from_ws(payload)
    assert is_closed is True


def test_candle_shape_helpers():
    candle = make_candle(0, 100.0, 105.0, 95.0, 102.0)
    assert candle.body == pytest.approx(2.0)
    assert candle.range == pytest.approx(10.0)
    assert candle.upper_wick == pytest.approx(3.0)
    assert candle.lower_wick == pytest.approx(5.0)
    assert candle.change_percent == pytest.approx(2.0)


def test_add_closed_reports_only_genuinely_new_candles():
    series = CandleSeries("BTCUSDT", "1m", maxlen=10)
    first = make_candle(0, 100, 101, 99, 100.5)
    assert series.add_closed(first) is True
    assert len(series) == 1

    # Same open_time -> replacement, not a new bar.
    replacement = make_candle(0, 100, 102, 99, 101.0)
    assert series.add_closed(replacement) is False
    assert len(series) == 1
    assert series.last_closed.close == pytest.approx(101.0)


def test_out_of_order_candles_are_dropped():
    series = CandleSeries("BTCUSDT", "1m", maxlen=10)
    series.add_closed(make_candle(MINUTE, 100, 101, 99, 100.5))
    assert series.add_closed(make_candle(0, 100, 101, 99, 100.5)) is False
    assert len(series) == 1


def test_buffer_respects_maxlen():
    series = CandleSeries("BTCUSDT", "1m", maxlen=5)
    for candle in build_series([100.0 + index for index in range(20)]):
        series.add_closed(candle)
    assert len(series) == 5
    assert series.last_closed.close == pytest.approx(119.0)


def test_live_candle_is_never_part_of_the_history():
    series = CandleSeries("BTCUSDT", "1m", maxlen=10)
    series.add_closed(make_candle(0, 100, 101, 99, 100.5))
    live = make_candle(MINUTE, 100.5, 108, 100, 107)
    series.set_live(live)

    assert len(series) == 1
    assert series.to_frame()["close"].tolist() == [pytest.approx(100.5)]
    # The live candle still drives the "current price" view.
    assert series.last_price == pytest.approx(107.0)


def test_bulk_load_sorts_and_deduplicates():
    series = CandleSeries("BTCUSDT", "1m", maxlen=50)
    candles = build_series([100.0, 101.0, 102.0])
    added = series.bulk_load(list(reversed(candles)) + [candles[0]])
    assert added == 3
    assert [candle.close for candle in series.candles] == [100.0, 101.0, 102.0]


def test_to_frame_is_cached_until_the_buffer_changes():
    series = CandleSeries("BTCUSDT", "1m", maxlen=10)
    for candle in build_series([100.0, 101.0]):
        series.add_closed(candle)

    first = series.to_frame()
    assert series.to_frame() is first

    series.add_closed(make_candle(2 * MINUTE, 101, 103, 100, 102))
    assert series.to_frame() is not first
    assert len(series.to_frame()) == 3


def test_empty_series_returns_an_empty_frame():
    series = CandleSeries("BTCUSDT", "1m")
    frame = series.to_frame()
    assert frame.empty
    assert series.last_closed is None
    assert series.last_price == 0.0
    assert series.ready(1) is False


# ----------------------------------------------------------------------
# Market store
# ----------------------------------------------------------------------
def test_store_creates_series_for_every_timeframe(settings: Settings):
    store = MarketStore(settings)
    store.set_symbols(["BTCUSDT", "ETHUSDT"])

    assert set(store.symbols) == {"BTCUSDT", "ETHUSDT"}
    for interval in settings.timeframes:
        assert store.series("BTCUSDT", interval) is not None


def test_store_drops_symbols_that_leave_the_universe(settings: Settings):
    store = MarketStore(settings)
    store.set_symbols(["BTCUSDT", "ETHUSDT"])
    store.set_symbols(["BTCUSDT"])

    assert store.symbols == ("BTCUSDT",)
    assert store.series("ETHUSDT", "1m") is None


def test_store_emits_an_event_only_on_a_new_closed_candle(settings: Settings):
    store = MarketStore(settings)
    store.set_symbols(["BTCUSDT"])
    candle = make_candle(0, 100, 101, 99, 100.5)

    assert store.update_kline("BTCUSDT", "1m", candle, is_closed=False) is None
    event = store.update_kline("BTCUSDT", "1m", candle, is_closed=True)
    assert event is not None
    assert event.symbol == "BTCUSDT"
    # Re-delivery of the same closed candle must not fire twice.
    assert store.update_kline("BTCUSDT", "1m", candle, is_closed=True) is None


def test_store_reports_stale_data(settings: Settings):
    store = MarketStore(settings)
    store.set_symbols(["BTCUSDT"])
    assert store.is_stale("BTCUSDT") is True

    fresh = make_candle(now_ms() - MINUTE, 100, 101, 99, 100.5)
    store.update_kline("BTCUSDT", "1m", fresh, is_closed=True)
    assert store.is_stale("BTCUSDT") is False


def test_store_is_ready_only_with_enough_history(settings: Settings):
    store = MarketStore(settings)
    store.set_symbols(["BTCUSDT"])
    assert store.is_ready("BTCUSDT") is False

    closes = trending_closes(80)
    for interval in settings.timeframes:
        series = store.ensure_series("BTCUSDT", interval)
        series.bulk_load(build_series(closes, interval=interval))

    assert store.is_ready("BTCUSDT") is True
