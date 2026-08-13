"""Application wiring and lifecycle.

``ScalpingBot`` owns every component and connects them:

    scanner -> websockets -> market store -> signal engine
                                   |-> database
                                   |-> Telegram
                                   `-> paper trader
"""

from __future__ import annotations

import asyncio
import json
import signal as os_signal
from datetime import datetime, timedelta, timezone

from app.backtest.engine import BacktestConfig, BacktestEngine
from app.binance.rest import BinanceRestClient
from app.binance.websocket import BinanceStreamManager
from app.config import Settings, get_settings
from app.database.database import Database
from app.market.market_scanner import MarketScanner
from app.market.store import ClosedCandleEvent, MarketStore
from app.paper.trader import PaperTrader
from app.strategy.models import Signal, SignalUpdate
from app.strategy.signal_engine import SignalEngine
from app.telegram.bot import TelegramBot
from app.telegram.commands import TelegramContext
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Closed candles pulled per timeframe at start-up. 400 covers EMA200 on 15m.
WARMUP_CANDLES = 400

# Snapshots older than this are pruned once a day.
SNAPSHOT_RETENTION_DAYS = 14


class ScalpingBot:
    """The whole bot: start it, and it runs until stopped."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.started_at = datetime.now(tz=timezone.utc)

        self.rest = BinanceRestClient(self.settings)
        self.store = MarketStore(self.settings)
        self.scanner = MarketScanner(self.settings, self.rest)
        self.database = Database(self.settings)
        self.paper = PaperTrader(self.settings, self.database)

        self.engine = SignalEngine(
            settings=self.settings,
            store=self.store,
            rest_client=self.rest,
            on_signal=self.handle_signal,
            on_update=self.handle_update,
        )
        self.streams = BinanceStreamManager(
            settings=self.settings,
            store=self.store,
            on_closed_candle=self._on_closed_candle,
        )

        self.telegram_context = TelegramContext(
            settings=self.settings,
            store=self.store,
            engine=self.engine,
            paper=self.paper,
            database=self.database,
            scanner=self.scanner,
            stream_manager=self.streams,
            started_at=self.started_at,
            run_backtest=self.run_backtest,
        )
        self.telegram = TelegramBot(self.settings, self.telegram_context)

        self._tasks: list[asyncio.Task] = []
        self._stopping = asyncio.Event()
        self.ready = False

    # ------------------------------------------------------------------
    # Start-up
    # ------------------------------------------------------------------
    async def startup(self) -> None:
        logger.info("=" * 70)
        logger.info("Binance Spot Scalping Signal Bot starting")
        logger.info(
            "Mode: %s | real trading: %s",
            "PAPER TRADING" if self.settings.paper_trading else "ANALYSIS ONLY",
            "ENABLED" if self.settings.real_trading else "DISABLED",
        )
        logger.info("=" * 70)

        if self.settings.real_trading:
            logger.warning(
                "REAL_TRADING is set, but this build never places orders. "
                "Only analysis and paper trading are implemented."
            )

        await self.database.init()
        await self.paper.load()

        stored = await self.database.get_setting("signals_enabled", "true")
        self.engine.enabled = stored.lower() != "false"

        await self.rest.start()
        if not await self.rest.ping():
            raise RuntimeError("Cannot reach the Binance REST API")
        logger.info("Binance REST reachable")

        symbols = await self.scanner.select_symbols()
        if not symbols:
            raise RuntimeError("The scanner selected no symbols; relax the liquidity filters")
        self.store.set_symbols(symbols)
        logger.info("Tracking: %s", ", ".join(symbols))

        await self.warmup(symbols)
        await self.streams.start(symbols)

        await self.telegram.start()
        await self.telegram.send_startup_notice(len(symbols))

        self._tasks = [
            asyncio.create_task(self._rescan_loop(), name="rescan"),
            asyncio.create_task(self._maintenance_loop(), name="maintenance"),
        ]
        self.ready = True
        logger.info("Start-up complete; waiting for closed candles")

    async def warmup(self, symbols: list[str]) -> None:
        """Fill the candle buffers from REST so analysis can start at once."""
        logger.info(
            "Warming up %d symbols x %d timeframes…", len(symbols), len(self.settings.timeframes)
        )

        async def load(symbol: str, interval: str) -> int:
            try:
                candles = await self.rest.closed_klines(
                    symbol, interval, limit=WARMUP_CANDLES
                )
            except Exception as exc:  # noqa: BLE001 - one gap must not stop start-up
                logger.warning("Warm-up failed for %s %s: %s", symbol, interval, exc)
                return 0
            series = self.store.ensure_series(symbol, interval)
            return series.bulk_load(candles)

        tasks = [
            load(symbol, interval)
            for symbol in symbols
            for interval in self.settings.timeframes
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        loaded = sum(value for value in results if isinstance(value, int))

        ready = [symbol for symbol in symbols if self.store.is_ready(symbol)]
        logger.info("Warm-up loaded %d candles; %d/%d symbols ready", loaded, len(ready), len(symbols))

    # ------------------------------------------------------------------
    # Event handling
    # ------------------------------------------------------------------
    async def _on_closed_candle(self, event: ClosedCandleEvent) -> None:
        await self.engine.on_closed_candle(event)

    async def handle_signal(self, signal: Signal) -> None:
        """Persist, publish and paper-trade a new signal."""
        signal.db_id = await self.database.save_signal(
            symbol=signal.symbol,
            side=signal.side.value,
            label=signal.label,
            score=signal.score,
            price=signal.price,
            entry=signal.entry,
            entry_low=signal.entry_low,
            entry_high=signal.entry_high,
            tp1=signal.tp1,
            tp2=signal.tp2,
            tp3=signal.tp3,
            stop_loss=signal.stop_loss,
            risk_reward=signal.risk_reward,
            atr=signal.atr,
            timeframe=signal.timeframe,
            setup=signal.setup,
            trends=json.dumps(signal.trends, separators=(",", ":")),
            candle_time=signal.candle_time,
            status=signal.status.value,
            created_at=signal.created_at,
            reasons=[
                {
                    "indicator": component.indicator,
                    "value": component.value,
                    "score": component.score,
                    "max_score": component.max_score,
                    "description": component.description,
                }
                for component in signal.components
            ],
        )

        await self._save_snapshot(signal)
        await self.telegram.send_signal(signal)
        await self.paper.on_signal(signal)

    async def handle_update(self, update: SignalUpdate) -> None:
        """Persist and publish a lifecycle transition."""
        signal = update.signal
        if signal.db_id is not None:
            await self.database.update_signal_status(
                signal.db_id,
                update.new_status.value,
                result=(
                    "WIN"
                    if update.pnl_percent > 0
                    else ("LOSS" if update.new_status.is_closed else "")
                ),
                pnl_percent=update.pnl_percent,
                closed_at=(
                    datetime.now(tz=timezone.utc) if update.new_status.is_closed else None
                ),
                max_favorable_percent=signal.indicators.get("mfe_percent", 0.0),
                max_adverse_percent=signal.indicators.get("mae_percent", 0.0),
            )

        await self.telegram.send_update(update)
        await self.paper.on_update(update)

    async def _save_snapshot(self, signal: Signal) -> None:
        analysis = self.engine.analyze(signal.symbol)
        if analysis is None or analysis.entry is None:
            return
        entry = analysis.entry
        await self.database.save_snapshot(
            symbol=signal.symbol,
            timestamp=signal.created_at,
            timeframe=signal.timeframe,
            price=signal.price,
            volume=entry.volume,
            volume_ratio=entry.volume_ratio,
            rsi=entry.rsi,
            macd=entry.macd,
            macd_signal=entry.macd_signal,
            ema9=entry.ema9,
            ema21=entry.ema21,
            ema50=entry.ema50,
            vwap=entry.vwap,
            atr=entry.atr,
        )

    # ------------------------------------------------------------------
    # Background loops
    # ------------------------------------------------------------------
    async def _rescan_loop(self) -> None:
        """Periodically refresh the tracked symbol universe."""
        interval = max(5, self.settings.scanner_refresh_minutes) * 60
        while not self._stopping.is_set():
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=interval)
                return
            except asyncio.TimeoutError:
                pass
            await self.rescan_once()

    async def rescan_once(self) -> bool:
        """Re-run the scanner and adopt the new universe.

        Returns ``True`` when the tracked symbols changed. Kept separate from
        the timing loop so it can be driven directly.
        """
        try:
            await self.scanner.refresh_exchange_info()
            symbols = await self.scanner.select_symbols()
            if not symbols:
                logger.warning("Rescan produced no symbols; keeping the current universe")
                return False

            if set(symbols) == set(self.store.symbols):
                return False

            added = [item for item in symbols if item not in self.store.symbols]
            dropped = [item for item in self.store.symbols if item not in symbols]
            logger.info(
                "Symbol universe changed: +%s -%s",
                ",".join(added) or "none",
                ",".join(dropped) or "none",
            )

            self.store.set_symbols(symbols)
            if added:
                await self.warmup(added)
            await self.streams.resubscribe(symbols)
            return True

        except Exception as exc:  # noqa: BLE001
            logger.exception("Symbol rescan failed: %s", exc)
            return False

    async def _maintenance_loop(self) -> None:
        """Daily housekeeping."""
        while not self._stopping.is_set():
            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=86_400)
                return
            except asyncio.TimeoutError:
                pass
            await self.maintenance_once()

    async def maintenance_once(self) -> int:
        """Prune old snapshots. Returns how many rows were removed."""
        try:
            removed = await self.database.prune_snapshots(SNAPSHOT_RETENTION_DAYS)
            if removed:
                logger.info("Pruned %d old market snapshots", removed)
            return removed
        except Exception as exc:  # noqa: BLE001
            logger.exception("Maintenance failed: %s", exc)
            return 0

    # ------------------------------------------------------------------
    # Backtesting
    # ------------------------------------------------------------------
    async def run_backtest(self, symbol: str, days: int) -> dict:
        """Run a backtest off the event loop and return its summary."""
        engine = BacktestEngine(self.settings, self.rest)
        end = datetime.now(tz=timezone.utc)
        config = BacktestConfig(
            symbol=symbol.upper(),
            start=end - timedelta(days=days),
            end=end,
            initial_balance=self.settings.paper_start_balance,
        )
        candles = await engine.load_candles(config)
        # The simulation is CPU-bound; keep the event loop responsive.
        result = await asyncio.to_thread(engine.run_on_candles, config, candles)
        return result.summary()

    # ------------------------------------------------------------------
    # Shutdown
    # ------------------------------------------------------------------
    async def shutdown(self) -> None:
        if self._stopping.is_set():
            return
        logger.info("Shutting down…")
        self._stopping.set()
        self.ready = False

        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._tasks = []

        await self.streams.stop()
        await self.telegram.send_shutdown_notice()
        await self.telegram.stop()
        await self.rest.close()
        await self.database.close()
        logger.info("Shutdown complete")

    async def run_forever(self) -> None:
        """Start everything and block until a stop signal arrives."""
        await self.startup()
        await self._stopping.wait()

    def install_signal_handlers(self, loop: asyncio.AbstractEventLoop) -> None:
        """Stop cleanly on SIGINT / SIGTERM."""

        def request_stop(name: str) -> None:
            logger.info("Received %s", name)
            self._stopping.set()

        for sig_name in ("SIGINT", "SIGTERM"):
            sig = getattr(os_signal, sig_name, None)
            if sig is None:
                continue
            try:
                loop.add_signal_handler(sig, request_stop, sig_name)
            except (NotImplementedError, RuntimeError):  # pragma: no cover - Windows
                pass

    def status(self) -> dict:
        return {
            "ready": self.ready,
            "uptime_seconds": (
                datetime.now(tz=timezone.utc) - self.started_at
            ).total_seconds(),
            "paper_trading": self.settings.paper_trading,
            "real_trading": self.settings.real_trading,
            "engine": self.engine.status(),
            "market": self.store.status(),
            "streams": self.streams.status(),
            "paper": self.paper.status(),
        }


async def run() -> None:
    """Entry point used by ``run.py``."""
    from app.dashboard import serve_dashboard

    bot = ScalpingBot()
    loop = asyncio.get_running_loop()
    bot.install_signal_handlers(loop)

    api_task: asyncio.Task | None = None
    try:
        await bot.startup()
        if bot.settings.enable_api:
            api_task = asyncio.create_task(serve_dashboard(bot), name="dashboard")
        await bot._stopping.wait()
    except KeyboardInterrupt:  # pragma: no cover - interactive
        logger.info("Interrupted")
    finally:
        if api_task is not None:
            api_task.cancel()
            try:
                await api_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        await bot.shutdown()
