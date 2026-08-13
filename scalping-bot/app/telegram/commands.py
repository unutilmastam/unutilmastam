"""Telegram command handlers.

Handlers receive a :class:`TelegramContext` that carries references to the
running components. Every handler is wrapped by an authorisation check, so an
unknown chat can never read market state or flip a toggle.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

from app.config import Settings
from app.telegram import messages
from app.utils.helpers import humanize_duration
from app.utils.logger import get_logger

logger = get_logger(__name__)

MAX_BACKTEST_DAYS = 30


@dataclass
class TelegramContext:
    """References the command handlers need. Built by ``app.main``."""

    settings: Settings
    store: Any
    engine: Any
    paper: Any
    database: Any
    scanner: Any
    stream_manager: Any
    started_at: datetime
    run_backtest: Callable[[str, int], Awaitable[dict]] | None = None

    @property
    def uptime(self) -> str:
        return humanize_duration(
            (datetime.now(tz=timezone.utc) - self.started_at).total_seconds()
        )


def _authorized(context: TelegramContext, update: Update) -> bool:
    chat = update.effective_chat
    if chat is None:
        return False
    return context.settings.is_chat_authorized(chat.id)


def guarded(
    context: TelegramContext,
    handler: Callable[[Update, ContextTypes.DEFAULT_TYPE], Awaitable[None]],
) -> Callable[[Update, ContextTypes.DEFAULT_TYPE], Awaitable[None]]:
    """Wrap a handler with the chat whitelist and error containment."""

    async def wrapper(update: Update, telegram_context: ContextTypes.DEFAULT_TYPE) -> None:
        if not _authorized(context, update):
            chat = update.effective_chat
            logger.warning("Rejected command from unauthorised chat %s", chat.id if chat else "?")
            if update.effective_message is not None:
                await update.effective_message.reply_text(messages.format_unauthorized())
            return
        try:
            await handler(update, telegram_context)
        except Exception as exc:  # noqa: BLE001 - a bad command must not kill the bot
            logger.exception("Command handler failed: %s", exc)
            if update.effective_message is not None:
                await update.effective_message.reply_text(
                    "⚠️ Something went wrong handling that command. It has been logged."
                )

    return wrapper


async def _reply(update: Update, text: str) -> None:
    if update.effective_message is not None:
        await update.effective_message.reply_text(
            text, parse_mode="HTML", disable_web_page_preview=True
        )


def register_handlers(application: Application, context: TelegramContext) -> None:
    """Attach every command to ``application``."""

    async def start(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        await _reply(update, messages.format_start())

    async def help_command(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        await _reply(update, messages.format_help())

    async def status(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        signal_stats = {}
        if context.database is not None:
            signal_stats = await context.database.signal_stats()
        await _reply(
            update,
            messages.format_status(
                engine_status=context.engine.status(),
                market_status=context.store.status(),
                stream_status=context.stream_manager.status()
                if context.stream_manager
                else {},
                paper_status=context.paper.status() if context.paper else {},
                signal_stats=signal_stats,
                uptime=context.uptime,
            ),
        )

    async def top(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        threshold = context.settings.min_signal_score
        entries = [
            (symbol, result)
            for symbol, result in context.engine.ranked_scores(limit=50)
            if result.total >= threshold and result.mandatory_passed
        ][:10]
        await _reply(update, messages.format_top(entries, threshold, context.settings.quote_asset))

    async def signals(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        if context.database is None:
            await _reply(update, "Database is not available.")
            return
        records = await context.database.recent_signals(limit=10)
        rows = [
            {
                "symbol": record.symbol,
                "side": record.side,
                "score": record.score,
                "status": record.status,
                "pnl_percent": record.pnl_percent,
                "created_at": record.created_at.isoformat() if record.created_at else "",
            }
            for record in records
        ]
        await _reply(update, messages.format_recent_signals(rows, context.settings.quote_asset))

    async def _symbol_report(update: Update, symbol: str) -> None:
        symbol = symbol.upper()
        if not symbol.endswith(context.settings.quote_asset):
            symbol = f"{symbol}{context.settings.quote_asset}"
        result = context.engine.score_for(symbol)
        price = context.store.price(symbol)
        rejection = context.engine.last_rejection.get(symbol, "")
        await _reply(
            update,
            messages.format_symbol_report(
                symbol, result, price, rejection, context.settings.quote_asset
            ),
        )

    async def btc(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        await _symbol_report(update, f"BTC{context.settings.quote_asset}")

    async def eth(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        await _symbol_report(update, f"ETH{context.settings.quote_asset}")

    async def symbol_command(update: Update, tg: ContextTypes.DEFAULT_TYPE) -> None:
        if not tg.args:
            await _reply(update, "Usage: <code>/symbol BTCUSDT</code>")
            return
        await _symbol_report(update, str(tg.args[0]))

    async def paper(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        if context.paper is None:
            await _reply(update, "Paper trading is disabled.")
            return
        await _reply(
            update,
            messages.format_paper_report(
                context.paper.metrics(), len(context.paper.positions)
            ),
        )

    async def settings_command(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        settings = context.settings
        await _reply(
            update,
            messages.format_settings(
                {
                    "Mode": "PAPER (no real orders)" if settings.paper_trading else "ANALYSIS ONLY",
                    "Real trading": "DISABLED" if not settings.real_trading else "ENABLED",
                    "Min signal score": settings.min_signal_score,
                    "Max symbols": settings.max_symbols,
                    "Tracked now": len(context.store.symbols),
                    "Min 24h volume": f"{settings.min_24h_volume:,.0f} {settings.quote_asset}",
                    "Max spread": f"{settings.max_spread_percent}%",
                    "Cooldown": f"{settings.signal_cooldown_minutes} min",
                    "Risk per trade": f"{settings.risk_per_trade * 100:.2f}%",
                    "Min risk/reward": f"1:{settings.min_risk_reward}",
                    "Min volume ratio": settings.min_volume_ratio,
                    "Timeframes": ", ".join(settings.timeframes),
                    "Signals": "enabled" if context.engine.enabled else "disabled",
                }
            ),
        )

    async def enable(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        context.engine.enabled = True
        if context.database is not None:
            await context.database.set_setting("signals_enabled", "true")
        await _reply(update, "🟢 Signal publishing <b>enabled</b>.")

    async def disable(update: Update, _: ContextTypes.DEFAULT_TYPE) -> None:
        context.engine.enabled = False
        if context.database is not None:
            await context.database.set_setting("signals_enabled", "false")
        await _reply(update, "⏸ Signal publishing <b>disabled</b>. Monitoring continues.")

    async def backtest(update: Update, tg: ContextTypes.DEFAULT_TYPE) -> None:
        if context.run_backtest is None:
            await _reply(update, "Backtesting is not available in this deployment.")
            return

        symbol = (
            str(tg.args[0]).upper()
            if tg.args
            else f"BTC{context.settings.quote_asset}"
        )
        if not symbol.endswith(context.settings.quote_asset):
            symbol = f"{symbol}{context.settings.quote_asset}"

        try:
            days = int(tg.args[1]) if len(tg.args) > 1 else 3
        except (TypeError, ValueError):
            await _reply(update, "Usage: <code>/backtest BTCUSDT 3</code>")
            return
        days = max(1, min(days, MAX_BACKTEST_DAYS))

        await _reply(
            update,
            f"🧪 Backtesting <b>{symbol}</b> over the last {days} day(s)… this can take a minute.",
        )
        try:
            summary = await context.run_backtest(symbol, days)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Backtest failed: %s", exc)
            await _reply(update, f"⚠️ Backtest failed: {type(exc).__name__}")
            return
        await _reply(update, messages.format_backtest(summary, context.settings.quote_asset))

    handlers = {
        "start": start,
        "help": help_command,
        "status": status,
        "top": top,
        "signals": signals,
        "btc": btc,
        "eth": eth,
        "symbol": symbol_command,
        "paper": paper,
        "settings": settings_command,
        "enable": enable,
        "disable": disable,
        "backtest": backtest,
    }

    for command, handler in handlers.items():
        application.add_handler(CommandHandler(command, guarded(context, handler)))

    logger.info("Registered %d Telegram commands", len(handlers))


def build_command_list() -> list[tuple[str, str]]:
    """Command menu shown by Telegram's ``/`` autocomplete."""
    return [
        ("start", "Introduction"),
        ("status", "Bot and market health"),
        ("top", "Strongest setups right now"),
        ("signals", "Recent published signals"),
        ("btc", "BTC breakdown"),
        ("eth", "ETH breakdown"),
        ("symbol", "Breakdown for any pair"),
        ("paper", "Paper trading performance"),
        ("settings", "Active configuration"),
        ("enable", "Resume publishing signals"),
        ("disable", "Pause publishing signals"),
        ("backtest", "Run a historical test"),
        ("help", "Command list"),
    ]


async def wait_cancelled(task: asyncio.Task) -> None:
    """Await a cancelled task, swallowing the cancellation."""
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001
        pass


def default_backtest_window(days: int) -> tuple[datetime, datetime]:
    end = datetime.now(tz=timezone.utc)
    return end - timedelta(days=days), end
