#!/usr/bin/env python3
"""Entry point.

    python run.py                          start the bot
    python run.py scan                     show what the scanner selects
    python run.py backtest BTCUSDT 7       run a historical test
    python run.py test-telegram            send a test message

The bot never places a real order in any of these modes.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from app.config import Settings, set_settings
from app.utils.logger import get_logger, setup_logging


def _bootstrap() -> Settings:
    settings = Settings.from_env()
    set_settings(settings)
    setup_logging(settings.log_level, settings.log_file)
    return settings


async def _run_bot() -> int:
    from app.main import run

    logger = get_logger("run")
    try:
        await run()
        return 0
    except RuntimeError as exc:
        logger.error("Start-up failed: %s", exc)
        return 1


async def _run_scan(settings: Settings) -> int:
    from app.binance.rest import BinanceRestClient
    from app.market.market_scanner import MarketScanner

    logger = get_logger("scan")
    async with BinanceRestClient(settings) as client:
        scanner = MarketScanner(settings, client)
        candidates = await scanner.scan()
        selected = await scanner.select_symbols()

    accepted = [item for item in candidates if item.accepted]
    print(f"\n{len(candidates)} {settings.quote_asset} pairs examined, {len(accepted)} passed\n")
    print(f"{'SYMBOL':<14}{'24H VOLUME':>18}{'SPREAD':>10}   STATUS")
    print("-" * 62)
    for candidate in candidates[:40]:
        spread = (
            f"{candidate.spread_percent:.3f}%" if candidate.spread_percent is not None else "-"
        )
        status = "OK" if candidate.accepted else candidate.rejected_reason
        print(
            f"{candidate.symbol:<14}{candidate.quote_volume:>18,.0f}{spread:>10}   {status}"
        )

    print(f"\nSelected {len(selected)} symbols for tracking:")
    print(", ".join(selected))
    logger.info("Scan finished")
    return 0


async def _run_backtest(settings: Settings, symbol: str, days: int) -> int:
    from app.backtest.engine import BacktestConfig, BacktestEngine
    from app.binance.rest import BinanceRestClient

    logger = get_logger("backtest")
    symbol = symbol.upper()
    if not symbol.endswith(settings.quote_asset):
        symbol = f"{symbol}{settings.quote_asset}"

    end = datetime.now(tz=timezone.utc)
    config = BacktestConfig(
        symbol=symbol,
        start=end - timedelta(days=days),
        end=end,
        initial_balance=settings.paper_start_balance,
    )

    async with BinanceRestClient(settings) as client:
        engine = BacktestEngine(settings, client)
        candles = await engine.load_candles(config)
        if not candles:
            logger.error("No historical data returned for %s", symbol)
            return 1
        result = await asyncio.to_thread(engine.run_on_candles, config, candles)

    summary = result.summary()
    print("\n" + "=" * 60)
    print(f"BACKTEST  {symbol}  ({days} day(s))")
    print("=" * 60)
    for key, value in summary.items():
        if isinstance(value, float):
            print(f"{key:<24}{value:>15,.4f}")
        else:
            print(f"{key:<24}{str(value):>15}")

    if result.rejected:
        print("\nMost common rejections:")
        for reason, count in sorted(
            result.rejected.items(), key=lambda item: item[1], reverse=True
        )[:8]:
            print(f"  {count:>7}  {reason}")

    print("\nPast results do not predict future results.")
    return 0


async def _test_telegram(settings: Settings) -> int:
    from telegram import Bot

    logger = get_logger("telegram-test")
    if not settings.telegram_enabled:
        logger.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be set in .env")
        return 1

    bot = Bot(settings.telegram_bot_token)
    async with bot:
        me = await bot.get_me()
        await bot.send_message(
            chat_id=settings.telegram_chat_id,
            text=(
                "✅ <b>Test message</b>\n\n"
                "Your Binance Spot scalping signal bot is wired up correctly.\n\n"
                "⚠️ Spot signal — not financial advice."
            ),
            parse_mode="HTML",
        )
    print(f"Test message delivered by @{me.username} to chat {settings.telegram_chat_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="run.py",
        description="Binance Spot scalping signal bot (analysis and paper trading only)",
    )
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("scan", help="show the symbols the scanner would track")

    backtest_parser = subparsers.add_parser("backtest", help="run a historical test")
    backtest_parser.add_argument("symbol", nargs="?", default="BTCUSDT")
    backtest_parser.add_argument("days", nargs="?", type=int, default=7)

    subparsers.add_parser("test-telegram", help="send a test message to your chat")

    args = parser.parse_args()
    settings = _bootstrap()

    if args.command == "scan":
        return asyncio.run(_run_scan(settings))
    if args.command == "backtest":
        return asyncio.run(_run_backtest(settings, args.symbol, max(1, args.days)))
    if args.command == "test-telegram":
        return asyncio.run(_test_telegram(settings))

    return asyncio.run(_run_bot())


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(0)
