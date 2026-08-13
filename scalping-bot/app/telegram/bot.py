"""Telegram delivery layer.

Wraps ``python-telegram-bot`` so the rest of the application only sees
``send_signal`` / ``send_update`` / ``send_text``. Delivery failures are
retried with backoff and never propagate into the trading loop - a Telegram
outage must not stop market analysis.
"""

from __future__ import annotations

import asyncio

from telegram import BotCommand
from telegram.error import Forbidden, InvalidToken, NetworkError, RetryAfter, TimedOut
from telegram.ext import Application, ApplicationBuilder

from app.config import Settings
from app.strategy.models import Signal, SignalUpdate
from app.telegram import messages
from app.telegram.commands import TelegramContext, build_command_list, register_handlers
from app.utils.logger import get_logger

logger = get_logger(__name__)

SEND_RETRIES = 4


class TelegramBot:
    """Owns the Telegram application and all outbound messaging."""

    def __init__(self, settings: Settings, context: TelegramContext) -> None:
        self.settings = settings
        self.context = context
        self.application: Application | None = None
        self.enabled = settings.telegram_enabled
        self._running = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> bool:
        """Start polling. Returns ``False`` when Telegram is not configured."""
        if not self.enabled:
            logger.warning(
                "Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing); "
                "signals will only be logged"
            )
            return False

        try:
            self.application = (
                ApplicationBuilder()
                .token(self.settings.telegram_bot_token)
                .concurrent_updates(True)
                .build()
            )
            register_handlers(self.application, self.context)

            await self.application.initialize()
            await self.application.start()
            if self.application.updater is not None:
                await self.application.updater.start_polling(drop_pending_updates=True)

            try:
                await self.application.bot.set_my_commands(
                    [BotCommand(name, description) for name, description in build_command_list()]
                )
            except Exception as exc:  # noqa: BLE001 - cosmetic only
                logger.debug("Could not set the command menu: %s", exc)

            self._running = True
            me = await self.application.bot.get_me()
            logger.info("Telegram bot @%s is polling", me.username)
            return True

        except InvalidToken:
            logger.error("TELEGRAM_BOT_TOKEN is invalid; Telegram delivery is disabled")
            self.enabled = False
            return False
        except Exception as exc:  # noqa: BLE001 - never block start-up on Telegram
            logger.exception("Could not start the Telegram bot: %s", exc)
            self.enabled = False
            return False

    async def stop(self) -> None:
        if self.application is None:
            return
        try:
            if self.application.updater is not None and self.application.updater.running:
                await self.application.updater.stop()
            if self._running:
                await self.application.stop()
            await self.application.shutdown()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Error while stopping the Telegram bot: %s", exc)
        finally:
            self._running = False
            self.application = None

    # ------------------------------------------------------------------
    # Sending
    # ------------------------------------------------------------------
    async def send_text(self, text: str, chat_id: str | None = None) -> bool:
        """Send a message with retry/backoff. Never raises."""
        if not self.enabled or self.application is None:
            logger.debug("Telegram disabled, message not sent: %s", text.splitlines()[0])
            return False

        target = chat_id or self.settings.telegram_chat_id
        if not target:
            return False

        delay = 1.0
        for attempt in range(1, SEND_RETRIES + 1):
            try:
                await self.application.bot.send_message(
                    chat_id=target,
                    text=text,
                    parse_mode="HTML",
                    disable_web_page_preview=True,
                )
                return True

            except RetryAfter as exc:
                wait_for = float(getattr(exc, "retry_after", delay)) + 0.5
                logger.warning("Telegram rate limit, retrying in %.1fs", wait_for)
                await asyncio.sleep(wait_for)
            except (TimedOut, NetworkError) as exc:
                logger.warning(
                    "Telegram network error (attempt %d/%d): %s", attempt, SEND_RETRIES, exc
                )
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)
            except Forbidden as exc:
                logger.error("Telegram refused delivery to %s: %s", target, exc)
                return False
            except Exception as exc:  # noqa: BLE001
                logger.exception("Unexpected Telegram error: %s", exc)
                return False

        logger.error("Giving up on a Telegram message after %d attempts", SEND_RETRIES)
        return False

    async def send_signal(self, signal: Signal) -> bool:
        return await self.send_text(
            messages.format_signal(signal, self.settings.quote_asset)
        )

    async def send_update(self, update: SignalUpdate) -> bool:
        return await self.send_text(
            messages.format_update(update, self.settings.quote_asset)
        )

    async def send_startup_notice(self, symbol_count: int) -> bool:
        text = "\n".join(
            [
                "🚀 <b>Scalping bot started</b>",
                "",
                f"Tracking {symbol_count} spot pairs.",
                f"Minimum signal score: {self.settings.min_signal_score}/100",
                f"Mode: {'PAPER TRADING' if self.settings.paper_trading else 'ANALYSIS ONLY'}",
                "",
                "No real orders will be placed.",
            ]
        )
        return await self.send_text(text)

    async def send_shutdown_notice(self) -> bool:
        return await self.send_text("🛑 <b>Scalping bot stopped.</b>")
