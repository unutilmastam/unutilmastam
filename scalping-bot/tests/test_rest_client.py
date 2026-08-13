"""Binance REST client: parsing, retries and rate-limit handling."""

from __future__ import annotations

import httpx
import pytest

from app.binance.rest import MAX_KLINES_PER_REQUEST, BinanceAPIError, BinanceRestClient
from app.config import Settings


@pytest.fixture(autouse=True)
def no_sleeping(monkeypatch):
    """Make backoff instant so retry tests stay fast."""
    import app.binance.rest as module

    async def instant(_delay):
        return None

    monkeypatch.setattr(module.asyncio, "sleep", instant)


def make_client(handler, settings: Settings | None = None) -> BinanceRestClient:
    transport = httpx.MockTransport(handler)
    http = httpx.AsyncClient(transport=transport, base_url="https://api.binance.test")
    return BinanceRestClient(settings or Settings(), client=http)


def kline_row(open_time: int, close: str = "101", close_time: int | None = None) -> list:
    return [
        open_time,
        "100",
        "102",
        "99",
        close,
        "10",
        close_time if close_time is not None else open_time + 59_999,
        "1010",
        7,
        "5",
        "505",
        "0",
    ]


# ----------------------------------------------------------------------
# Basic endpoints
# ----------------------------------------------------------------------
async def test_ping_succeeds():
    client = make_client(lambda request: httpx.Response(200, json={}))
    assert await client.ping() is True


async def test_ping_reports_failure_rather_than_raising():
    client = make_client(lambda request: httpx.Response(400, json={"msg": "nope", "code": -1}))
    assert await client.ping() is False


async def test_klines_are_parsed():
    def handler(request):
        assert request.url.params["symbol"] == "BTCUSDT"
        assert request.url.params["interval"] == "1m"
        return httpx.Response(200, json=[kline_row(0), kline_row(60_000)])

    candles = await make_client(handler).klines("btcusdt", "1m")

    assert len(candles) == 2
    assert candles[0].close == pytest.approx(101.0)
    assert candles[0].trades == 7


async def test_the_kline_limit_is_capped():
    seen = {}

    def handler(request):
        seen["limit"] = int(request.url.params["limit"])
        return httpx.Response(200, json=[])

    await make_client(handler).klines("BTCUSDT", "1m", limit=99_999)
    assert seen["limit"] == MAX_KLINES_PER_REQUEST


async def test_closed_klines_drop_the_forming_candle():
    now = 10_000_000
    def handler(request):
        return httpx.Response(
            200,
            json=[
                kline_row(0, close_time=now - 1),        # closed
                kline_row(60_000, close_time=now + 500), # still forming
            ],
        )

    candles = await make_client(handler).closed_klines(
        "BTCUSDT", "1m", now_ms_value=now
    )
    assert len(candles) == 1
    assert candles[0].close_time < now


async def test_malformed_kline_rows_are_skipped():
    def handler(request):
        return httpx.Response(200, json=[kline_row(0), ["garbage"], None])

    candles = await make_client(handler).klines("BTCUSDT", "1m")
    assert len(candles) == 1


async def test_historical_klines_page_through_the_range():
    pages = {0: [kline_row(index * 60_000) for index in range(MAX_KLINES_PER_REQUEST)]}
    last_open = (MAX_KLINES_PER_REQUEST - 1) * 60_000
    pages[last_open + 1] = [kline_row(last_open + 60_000)]

    def handler(request):
        start = int(request.url.params["startTime"])
        return httpx.Response(200, json=pages.get(start, []))

    candles = await make_client(handler).historical_klines(
        "BTCUSDT", "1m", start_time=0, end_time=10**13
    )

    assert len(candles) == MAX_KLINES_PER_REQUEST + 1
    open_times = [candle.open_time for candle in candles]
    assert open_times == sorted(open_times)
    assert len(set(open_times)) == len(open_times)   # no duplicates across pages


async def test_historical_klines_stop_on_an_empty_page():
    client = make_client(lambda request: httpx.Response(200, json=[]))
    assert await client.historical_klines("BTCUSDT", "1m", 0, 10**13) == []


async def test_depth_snaps_to_an_allowed_limit():
    seen = {}

    def handler(request):
        seen["limit"] = int(request.url.params["limit"])
        return httpx.Response(200, json={"bids": [["99", "2"]], "asks": [["101", "1"]]})

    book = await make_client(handler).depth("BTCUSDT", limit=17)

    assert seen["limit"] == 20
    assert book.best_bid == pytest.approx(99.0)
    assert book.imbalance() == pytest.approx((99 * 2) / (101 * 1))


async def test_all_book_tickers_are_indexed_by_symbol():
    def handler(request):
        return httpx.Response(
            200,
            json=[
                {"symbol": "BTCUSDT", "s": "BTCUSDT", "b": "99", "B": "1", "a": "101", "A": "1"},
                {"nonsense": True},
            ],
        )

    books = await make_client(handler).all_book_tickers()
    assert set(books) == {"BTCUSDT"}


async def test_ticker_24hr_skips_bad_rows():
    def handler(request):
        return httpx.Response(
            200,
            json=[
                {
                    "symbol": "BTCUSDT",
                    "lastPrice": "100",
                    "priceChangePercent": "1",
                    "quoteVolume": "500000000",
                    "volume": "5000",
                    "highPrice": "101",
                    "lowPrice": "99",
                    "count": 100,
                },
                {"broken": True},
            ],
        )

    stats = await make_client(handler).ticker_24hr()
    assert len(stats) == 1
    assert stats[0].symbol == "BTCUSDT"


async def test_server_time_and_exchange_info():
    def handler(request):
        if request.url.path.endswith("/time"):
            return httpx.Response(200, json={"serverTime": 1_700_000_000_000})
        return httpx.Response(200, json={"symbols": []})

    client = make_client(handler)
    assert await client.server_time() == 1_700_000_000_000
    assert await client.exchange_info() == {"symbols": []}


# ----------------------------------------------------------------------
# Retries and errors
# ----------------------------------------------------------------------
async def test_a_rate_limit_is_retried_after_the_advertised_delay():
    calls = {"count": 0}

    def handler(request):
        calls["count"] += 1
        if calls["count"] == 1:
            return httpx.Response(429, headers={"Retry-After": "0"}, json={})
        return httpx.Response(200, json={"ok": True})

    assert await make_client(handler)._request("/api/v3/ping") == {"ok": True}
    assert calls["count"] == 2


async def test_a_server_error_is_retried():
    calls = {"count": 0}

    def handler(request):
        calls["count"] += 1
        if calls["count"] < 3:
            return httpx.Response(503, json={})
        return httpx.Response(200, json={"ok": True})

    assert await make_client(handler)._request("/api/v3/ping") == {"ok": True}
    assert calls["count"] == 3


async def test_a_client_error_raises_immediately():
    calls = {"count": 0}

    def handler(request):
        calls["count"] += 1
        return httpx.Response(400, json={"code": -1121, "msg": "Invalid symbol."})

    with pytest.raises(BinanceAPIError) as info:
        await make_client(handler).klines("NOPEUSDT", "1m")

    assert info.value.status_code == 400
    assert info.value.code == -1121
    assert "Invalid symbol" in info.value.message
    assert calls["count"] == 1   # no retry on a client error


async def test_network_errors_are_retried_then_reported():
    calls = {"count": 0}

    def handler(request):
        calls["count"] += 1
        raise httpx.ConnectError("no route to host")

    with pytest.raises(BinanceAPIError) as info:
        await make_client(handler)._request("/api/v3/ping", retries=3)

    assert calls["count"] == 3
    assert "failed after 3 attempts" in str(info.value)


async def test_a_non_json_error_body_is_handled():
    def handler(request):
        return httpx.Response(403, text="<html>blocked</html>")

    with pytest.raises(BinanceAPIError):
        await make_client(handler)._request("/api/v3/ping")


# ----------------------------------------------------------------------
# Credentials
# ----------------------------------------------------------------------
async def test_the_api_key_is_sent_but_the_secret_never_is():
    settings = Settings(
        binance_api_key="public-key",
        binance_api_secret="TOP-SECRET",
        binance_rest_url="https://api.binance.test",
    )
    seen = {}

    def handler(request):
        seen["headers"] = dict(request.headers)
        seen["url"] = str(request.url)
        return httpx.Response(200, json={})

    client = BinanceRestClient(settings)
    # Let the client build its own AsyncClient so header setup is exercised.
    await client.start()
    client._client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url=settings.binance_rest_url,
        headers=dict(client._client.headers),
    )
    await client._request("/api/v3/ping")
    await client.close()

    assert seen["headers"].get("x-mbx-apikey") == "public-key"
    assert "TOP-SECRET" not in str(seen["headers"])
    assert "TOP-SECRET" not in seen["url"]


async def test_the_client_works_as_an_async_context_manager():
    settings = Settings(binance_rest_url="https://api.binance.test")
    async with BinanceRestClient(settings) as client:
        assert client._client is not None
    # Closing twice must be safe.
    await client.close()
