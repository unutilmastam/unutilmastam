"""Symbol scanner and exchange metadata parsing."""

from __future__ import annotations

import pytest

from app.binance.symbols import SymbolInfo, display_symbol, parse_exchange_info
from app.config import Settings
from app.market.market_scanner import MarketScanner
from app.market.orderbook import BookTicker
from app.market.volume import TickerStats


def symbol_payload(
    symbol: str,
    base: str,
    quote: str = "USDT",
    status: str = "TRADING",
) -> dict:
    return {
        "symbol": symbol,
        "baseAsset": base,
        "quoteAsset": quote,
        "status": status,
        "isSpotTradingAllowed": True,
        "filters": [
            {"filterType": "PRICE_FILTER", "tickSize": "0.01"},
            {"filterType": "LOT_SIZE", "stepSize": "0.00001"},
            {"filterType": "NOTIONAL", "minNotional": "10.0"},
        ],
    }


class FakeRestClient:
    """Stands in for BinanceRestClient with canned market data."""

    def __init__(self, symbols: list[dict], tickers: dict[str, float], spreads=None):
        self._symbols = symbols
        self._tickers = tickers
        self._spreads = spreads or {}
        self.calls = 0

    async def exchange_info(self) -> dict:
        self.calls += 1
        return {"symbols": self._symbols}

    async def ticker_24hr(self) -> list[TickerStats]:
        return [
            TickerStats(
                symbol=symbol,
                last_price=100.0,
                price_change_percent=1.0,
                quote_volume=volume,
                base_volume=volume / 100,
                high=101.0,
                low=99.0,
            )
            for symbol, volume in self._tickers.items()
        ]

    async def all_book_tickers(self) -> dict[str, BookTicker]:
        books = {}
        for symbol in self._tickers:
            spread = self._spreads.get(symbol, 0.01)
            half = 100.0 * spread / 200
            books[symbol] = BookTicker(symbol, 100.0 - half, 5.0, 100.0 + half, 5.0)
        return books


@pytest.fixture
def scanner_settings() -> Settings:
    return Settings(
        quote_asset="USDT",
        max_symbols=3,
        min_24h_volume=1_000_000.0,
        max_spread_percent=0.05,
        priority_symbols=("BTCUSDT", "ETHUSDT"),
    )


# ----------------------------------------------------------------------
# Exchange info
# ----------------------------------------------------------------------
def test_parse_exchange_info_keeps_only_the_quote_asset():
    payload = {
        "symbols": [
            symbol_payload("BTCUSDT", "BTC"),
            symbol_payload("ETHBTC", "ETH", quote="BTC"),
        ]
    }
    parsed = parse_exchange_info(payload, "USDT")
    assert set(parsed) == {"BTCUSDT"}
    assert parsed["BTCUSDT"].tick_size == pytest.approx(0.01)
    assert parsed["BTCUSDT"].min_notional == pytest.approx(10.0)


def test_symbol_info_classifies_special_pairs():
    leveraged = SymbolInfo("BTCUPUSDT", "BTCUP", "USDT", "TRADING")
    assert leveraged.is_leveraged_token is True

    stable = SymbolInfo("USDCUSDT", "USDC", "USDT", "TRADING")
    assert stable.is_stable_pair is True

    halted = SymbolInfo("XYZUSDT", "XYZ", "USDT", "BREAK")
    assert halted.is_trading is False

    normal = SymbolInfo("BTCUSDT", "BTC", "USDT", "TRADING")
    assert normal.is_trading is True
    assert normal.display == "BTC/USDT"


def test_display_symbol_without_exchange_info():
    assert display_symbol("SOLUSDT") == "SOL/USDT"
    assert display_symbol("WEIRD") == "WEIRD"


def test_malformed_symbol_rows_are_skipped():
    payload = {"symbols": [{"nope": True}, symbol_payload("BTCUSDT", "BTC")]}
    assert set(parse_exchange_info(payload, "USDT")) == {"BTCUSDT"}


# ----------------------------------------------------------------------
# Scanning
# ----------------------------------------------------------------------
async def test_illiquid_symbols_are_rejected(scanner_settings):
    client = FakeRestClient(
        [symbol_payload("BTCUSDT", "BTC"), symbol_payload("TINYUSDT", "TINY")],
        {"BTCUSDT": 900_000_000.0, "TINYUSDT": 5_000.0},
    )
    scanner = MarketScanner(scanner_settings, client)  # type: ignore[arg-type]

    candidates = {item.symbol: item for item in await scanner.scan()}
    assert candidates["BTCUSDT"].accepted is True
    assert candidates["TINYUSDT"].accepted is False
    assert "24h volume" in candidates["TINYUSDT"].rejected_reason


async def test_a_wide_spread_is_rejected(scanner_settings):
    client = FakeRestClient(
        [symbol_payload("BTCUSDT", "BTC"), symbol_payload("WIDEUSDT", "WIDE")],
        {"BTCUSDT": 900_000_000.0, "WIDEUSDT": 800_000_000.0},
        spreads={"WIDEUSDT": 0.5},
    )
    scanner = MarketScanner(scanner_settings, client)  # type: ignore[arg-type]

    candidates = {item.symbol: item for item in await scanner.scan()}
    assert candidates["WIDEUSDT"].accepted is False
    assert "spread" in candidates["WIDEUSDT"].rejected_reason


async def test_leveraged_tokens_stablecoins_and_halted_pairs_are_rejected(scanner_settings):
    client = FakeRestClient(
        [
            symbol_payload("BTCUPUSDT", "BTCUP"),
            symbol_payload("USDCUSDT", "USDC"),
            symbol_payload("HALTUSDT", "HALT", status="BREAK"),
            symbol_payload("BTCUSDT", "BTC"),
        ],
        {
            "BTCUPUSDT": 900_000_000.0,
            "USDCUSDT": 900_000_000.0,
            "HALTUSDT": 900_000_000.0,
            "BTCUSDT": 900_000_000.0,
        },
    )
    scanner = MarketScanner(scanner_settings, client)  # type: ignore[arg-type]

    candidates = {item.symbol: item for item in await scanner.scan()}
    assert candidates["BTCUPUSDT"].rejected_reason == "leveraged token"
    assert candidates["USDCUSDT"].rejected_reason == "stablecoin pair"
    assert "BREAK" in candidates["HALTUSDT"].rejected_reason
    assert candidates["BTCUSDT"].accepted is True


async def test_blacklisted_symbols_are_rejected(scanner_settings):
    settings = Settings(**{**scanner_settings.__dict__, "blacklist_symbols": ("BTCUSDT",)})
    client = FakeRestClient([symbol_payload("BTCUSDT", "BTC")], {"BTCUSDT": 900_000_000.0})
    scanner = MarketScanner(settings, client)  # type: ignore[arg-type]

    candidates = {item.symbol: item for item in await scanner.scan()}
    assert candidates["BTCUSDT"].rejected_reason == "blacklisted"


# ----------------------------------------------------------------------
# Selection
# ----------------------------------------------------------------------
async def test_priority_symbols_come_first(scanner_settings):
    client = FakeRestClient(
        [
            symbol_payload("SOLUSDT", "SOL"),
            symbol_payload("BTCUSDT", "BTC"),
            symbol_payload("ETHUSDT", "ETH"),
        ],
        # SOL has the highest volume but is not a priority pair.
        {"SOLUSDT": 999_000_000.0, "BTCUSDT": 500_000_000.0, "ETHUSDT": 400_000_000.0},
    )
    scanner = MarketScanner(scanner_settings, client)  # type: ignore[arg-type]

    selected = await scanner.select_symbols()
    assert selected[:2] == ["BTCUSDT", "ETHUSDT"]
    assert "SOLUSDT" in selected


async def test_selection_respects_max_symbols(scanner_settings):
    payloads = [symbol_payload(f"C{index}USDT", f"C{index}") for index in range(10)]
    volumes = {f"C{index}USDT": 900_000_000.0 - index for index in range(10)}
    client = FakeRestClient(payloads, volumes)
    scanner = MarketScanner(scanner_settings, client)  # type: ignore[arg-type]

    selected = await scanner.select_symbols()
    assert len(selected) == scanner_settings.max_symbols


async def test_selection_is_ordered_by_volume(scanner_settings):
    settings = Settings(**{**scanner_settings.__dict__, "priority_symbols": ()})
    payloads = [symbol_payload(f"C{index}USDT", f"C{index}") for index in range(5)]
    volumes = {f"C{index}USDT": (index + 1) * 100_000_000.0 for index in range(5)}
    client = FakeRestClient(payloads, volumes)
    scanner = MarketScanner(settings, client)  # type: ignore[arg-type]

    selected = await scanner.select_symbols()
    assert selected == ["C4USDT", "C3USDT", "C2USDT"]


async def test_an_illiquid_priority_symbol_is_dropped(scanner_settings):
    client = FakeRestClient(
        [symbol_payload("BTCUSDT", "BTC"), symbol_payload("ETHUSDT", "ETH")],
        {"BTCUSDT": 900_000_000.0, "ETHUSDT": 100.0},   # ETH below the floor
    )
    scanner = MarketScanner(scanner_settings, client)  # type: ignore[arg-type]

    selected = await scanner.select_symbols()
    assert "BTCUSDT" in selected
    assert "ETHUSDT" not in selected


async def test_the_scanner_survives_a_book_ticker_outage(scanner_settings):
    class Broken(FakeRestClient):
        async def all_book_tickers(self):
            raise RuntimeError("book ticker endpoint down")

    client = Broken([symbol_payload("BTCUSDT", "BTC")], {"BTCUSDT": 900_000_000.0})
    scanner = MarketScanner(scanner_settings, client)  # type: ignore[arg-type]

    candidates = {item.symbol: item for item in await scanner.scan()}
    # The spread screen is skipped rather than failing the whole scan.
    assert candidates["BTCUSDT"].accepted is True
    assert candidates["BTCUSDT"].spread_percent is None


async def test_describe_formats_a_pair(scanner_settings):
    client = FakeRestClient([symbol_payload("BTCUSDT", "BTC")], {"BTCUSDT": 900_000_000.0})
    scanner = MarketScanner(scanner_settings, client)  # type: ignore[arg-type]
    await scanner.refresh_exchange_info()

    assert scanner.describe("BTCUSDT") == "BTC/USDT"
    assert scanner.describe("SOLUSDT") == "SOL/USDT"
