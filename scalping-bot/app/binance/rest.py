"""Async Binance Spot REST client (public market data only).

The client never signs a request and never sends an order. The API key, when
configured, is passed as a header purely to benefit from higher rate limits;
the API *secret* is never used here and never leaves the process.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.config import Settings
from app.market.candles import Candle
from app.market.orderbook import BookTicker, OrderBook
from app.market.volume import TickerStats
from app.utils.logger import get_logger

logger = get_logger(__name__)

MAX_KLINES_PER_REQUEST = 1000


class BinanceAPIError(RuntimeError):
    """Raised when Binance answers with an error payload."""

    def __init__(self, status_code: int, message: str, code: int | None = None) -> None:
        super().__init__(f"Binance error {status_code}: {message}")
        self.status_code = status_code
        self.message = message
        self.code = code


class BinanceRestClient:
    """Thin async wrapper around the public market-data endpoints."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.base_url = settings.binance_rest_url
        self._client = client
        self._owns_client = client is None
        # Binance allows 1200 request-weight per minute; a small concurrency
        # cap keeps warm-up bursts comfortably inside that budget.
        self._semaphore = asyncio.Semaphore(8)

    async def __aenter__(self) -> "BinanceRestClient":
        await self.start()
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.close()

    async def start(self) -> None:
        if self._client is None:
            headers = {"Accept": "application/json"}
            if self.settings.binance_api_key:
                headers["X-MBX-APIKEY"] = self.settings.binance_api_key
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(15.0, connect=10.0),
                headers=headers,
                limits=httpx.Limits(max_connections=16, max_keepalive_connections=8),
            )
            self._owns_client = True

    async def close(self) -> None:
        if self._client is not None and self._owns_client:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------------------
    # Core request helper
    # ------------------------------------------------------------------
    async def _request(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        retries: int = 4,
    ) -> Any:
        await self.start()
        assert self._client is not None

        delay = 1.0
        last_error: Exception | None = None

        for attempt in range(1, retries + 1):
            try:
                async with self._semaphore:
                    response = await self._client.get(path, params=params)

                if response.status_code == 200:
                    return response.json()

                # 429 (rate limit) and 418 (ban) must be backed off, honouring
                # Retry-After when Binance supplies it.
                if response.status_code in (418, 429):
                    retry_after = float(response.headers.get("Retry-After", delay))
                    logger.warning(
                        "Rate limited on %s (status %s), sleeping %.1fs",
                        path,
                        response.status_code,
                        retry_after,
                    )
                    await asyncio.sleep(retry_after)
                    delay = min(delay * 2, 60.0)
                    continue

                if 500 <= response.status_code < 600:
                    logger.warning(
                        "Binance server error %s on %s (attempt %d/%d)",
                        response.status_code,
                        path,
                        attempt,
                        retries,
                    )
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 30.0)
                    continue

                payload = _safe_json(response)
                raise BinanceAPIError(
                    response.status_code,
                    str(payload.get("msg", response.text))[:200],
                    payload.get("code"),
                )

            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
                logger.warning(
                    "Network error on %s (attempt %d/%d): %s", path, attempt, retries, exc
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)

        raise BinanceAPIError(0, f"{path} failed after {retries} attempts: {last_error}")

    # ------------------------------------------------------------------
    # Endpoints
    # ------------------------------------------------------------------
    async def ping(self) -> bool:
        """True when the API answers ``/api/v3/ping``."""
        try:
            await self._request("/api/v3/ping", retries=2)
            return True
        except BinanceAPIError as exc:
            logger.error("Binance ping failed: %s", exc)
            return False

    async def server_time(self) -> int:
        payload = await self._request("/api/v3/time")
        return int(payload["serverTime"])

    async def exchange_info(self) -> dict:
        return await self._request("/api/v3/exchangeInfo")

    async def ticker_24hr(self) -> list[TickerStats]:
        payload = await self._request("/api/v3/ticker/24hr")
        stats: list[TickerStats] = []
        for item in payload:
            try:
                stats.append(TickerStats.from_rest(item))
            except (KeyError, TypeError, ValueError):
                continue
        return stats

    async def klines(
        self,
        symbol: str,
        interval: str,
        limit: int = 500,
        start_time: int | None = None,
        end_time: int | None = None,
    ) -> list[Candle]:
        """Fetch klines. Binance returns the still-open candle last, so the
        caller is responsible for dropping it when only closed data is wanted
        (see :meth:`closed_klines`)."""
        params: dict[str, Any] = {
            "symbol": symbol.upper(),
            "interval": interval,
            "limit": min(max(1, limit), MAX_KLINES_PER_REQUEST),
        }
        if start_time is not None:
            params["startTime"] = int(start_time)
        if end_time is not None:
            params["endTime"] = int(end_time)

        payload = await self._request("/api/v3/klines", params)
        candles: list[Candle] = []
        for row in payload:
            try:
                candles.append(Candle.from_rest(row))
            except (IndexError, TypeError, ValueError):
                continue
        return candles

    async def closed_klines(
        self,
        symbol: str,
        interval: str,
        limit: int = 500,
        start_time: int | None = None,
        end_time: int | None = None,
        now_ms_value: int | None = None,
    ) -> list[Candle]:
        """Klines with the currently forming candle removed."""
        from app.utils.helpers import now_ms  # local import keeps the module light

        reference = now_ms_value if now_ms_value is not None else now_ms()
        candles = await self.klines(symbol, interval, limit, start_time, end_time)
        return [candle for candle in candles if candle.close_time < reference]

    async def historical_klines(
        self,
        symbol: str,
        interval: str,
        start_time: int,
        end_time: int,
    ) -> list[Candle]:
        """Page through ``/klines`` to cover an arbitrary time range."""
        collected: list[Candle] = []
        cursor = int(start_time)
        seen: set[int] = set()

        while cursor < end_time:
            batch = await self.klines(
                symbol,
                interval,
                limit=MAX_KLINES_PER_REQUEST,
                start_time=cursor,
                end_time=end_time,
            )
            if not batch:
                break

            fresh = [candle for candle in batch if candle.open_time not in seen]
            if not fresh:
                break
            for candle in fresh:
                seen.add(candle.open_time)
            collected.extend(fresh)

            last_open = batch[-1].open_time
            if last_open <= cursor:
                break
            cursor = last_open + 1

            if len(batch) < MAX_KLINES_PER_REQUEST:
                break

        collected.sort(key=lambda candle: candle.open_time)
        return [candle for candle in collected if candle.close_time <= end_time]

    async def depth(self, symbol: str, limit: int = 20) -> OrderBook:
        # Binance only accepts a fixed set of depth limits.
        allowed = (5, 10, 20, 50, 100, 500, 1000, 5000)
        chosen = min(allowed, key=lambda value: abs(value - limit))
        payload = await self._request(
            "/api/v3/depth", {"symbol": symbol.upper(), "limit": chosen}
        )
        return OrderBook.from_payload(symbol, payload)

    async def book_ticker(self, symbol: str) -> dict:
        return await self._request("/api/v3/ticker/bookTicker", {"symbol": symbol.upper()})

    async def all_book_tickers(self) -> dict[str, BookTicker]:
        """Best bid/ask for every symbol in a single request."""
        payload = await self._request("/api/v3/ticker/bookTicker")
        result: dict[str, BookTicker] = {}
        for item in payload:
            try:
                ticker = BookTicker.from_payload(item)
            except (KeyError, TypeError, ValueError):
                continue
            result[ticker.symbol] = ticker
        return result


def _safe_json(response: httpx.Response) -> dict:
    try:
        payload = response.json()
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}
