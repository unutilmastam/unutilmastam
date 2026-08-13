"""FastAPI dashboard API.

Read-only JSON endpoints that expose exactly what a future frontend needs.
No endpoint can place an order, change risk settings or reveal a secret.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query

from app.utils.logger import get_logger

if TYPE_CHECKING:  # pragma: no cover - typing only
    from app.main import ScalpingBot

logger = get_logger(__name__)


def create_dashboard(bot: "ScalpingBot") -> FastAPI:
    """Build the FastAPI application bound to a running bot."""
    api = FastAPI(
        title="Binance Spot Scalping Signal Bot",
        description="Read-only dashboard API. This service never places orders.",
        version="1.0.0",
    )

    @api.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok" if bot.ready else "starting",
            "ready": bot.ready,
            "paper_trading": bot.settings.paper_trading,
            "real_trading": bot.settings.real_trading,
        }

    @api.get("/api/status")
    async def status() -> dict[str, Any]:
        return bot.status()

    @api.get("/api/market")
    async def market() -> dict[str, Any]:
        return {
            "symbols": list(bot.store.symbols),
            **bot.store.status(),
        }

    @api.get("/api/signals/active")
    async def active_signals() -> list[dict[str, Any]]:
        return [_signal_to_dict(signal) for signal in bot.engine.active_signals.values()]

    @api.get("/api/signals/recent")
    async def recent_signals(
        limit: int = Query(20, ge=1, le=200),
        symbol: str | None = None,
    ) -> list[dict[str, Any]]:
        records = await bot.database.recent_signals(limit=limit, symbol=symbol)
        return [
            {
                "id": record.id,
                "symbol": record.symbol,
                "side": record.side,
                "label": record.label,
                "score": record.score,
                "entry": record.entry,
                "stop_loss": record.stop_loss,
                "tp1": record.tp1,
                "tp2": record.tp2,
                "tp3": record.tp3,
                "risk_reward": record.risk_reward,
                "status": record.status,
                "result": record.result,
                "pnl_percent": record.pnl_percent,
                "setup": record.setup,
                "created_at": record.created_at.isoformat() if record.created_at else None,
                "closed_at": record.closed_at.isoformat() if record.closed_at else None,
            }
            for record in records
        ]

    @api.get("/api/signals/stats")
    async def signal_stats(days: int | None = Query(None, ge=1, le=365)) -> dict[str, Any]:
        return await bot.database.signal_stats(days)

    @api.get("/api/top")
    async def top(limit: int = Query(10, ge=1, le=50)) -> list[dict[str, Any]]:
        return [
            {
                "symbol": symbol,
                "side": result.side.value,
                "label": result.label,
                "score": result.total,
                "mandatory_passed": result.mandatory_passed,
                "missing": list(result.missing),
            }
            for symbol, result in bot.engine.ranked_scores(limit=limit)
        ]

    @api.get("/api/symbols/{symbol}")
    async def symbol_detail(symbol: str) -> dict[str, Any]:
        symbol = symbol.upper()
        result = bot.engine.score_for(symbol)
        if result is None and symbol not in bot.store.symbols:
            raise HTTPException(status_code=404, detail=f"{symbol} is not tracked")

        return {
            "symbol": symbol,
            "price": bot.store.price(symbol),
            "spread_percent": bot.store.spread_percent(symbol),
            "data_age_seconds": bot.store.data_age_seconds(symbol),
            "rejection": bot.engine.last_rejection.get(symbol, ""),
            "score": None
            if result is None
            else {
                "side": result.side.value,
                "label": result.label,
                "total": result.total,
                "mandatory_passed": result.mandatory_passed,
                "missing": list(result.missing),
                "components": [
                    {
                        "indicator": component.indicator,
                        "score": component.score,
                        "max_score": component.max_score,
                        "value": component.value,
                        "description": component.description,
                        "passed": component.passed,
                    }
                    for component in result.components
                ],
            },
        }

    @api.get("/api/paper")
    async def paper() -> dict[str, Any]:
        metrics = bot.paper.metrics()
        return {
            "balance": bot.paper.balance,
            "start_balance": bot.paper.start_balance,
            "open_positions": [
                {
                    "symbol": position.symbol,
                    "side": position.side.value,
                    "entry_price": position.entry_price,
                    "quantity": position.quantity,
                    "remaining": position.remaining,
                    "stop_loss": position.stop_loss,
                    "targets_hit": position.targets_hit,
                    "unrealized": position.unrealized(bot.store.price(symbol)),
                }
                for symbol, position in bot.paper.positions.items()
            ],
            "metrics": metrics.as_dict(),
        }

    @api.get("/api/top-symbols")
    async def top_symbols(
        limit: int = Query(5, ge=1, le=25),
        days: int = Query(7, ge=1, le=365),
    ) -> list[dict[str, Any]]:
        return await bot.database.top_symbols(limit=limit, days=days)

    return api


def _signal_to_dict(signal) -> dict[str, Any]:
    return {
        "symbol": signal.symbol,
        "side": signal.side.value,
        "label": signal.label,
        "score": signal.score,
        "entry": signal.entry,
        "entry_low": signal.entry_low,
        "entry_high": signal.entry_high,
        "stop_loss": signal.stop_loss,
        "tp1": signal.tp1,
        "tp2": signal.tp2,
        "tp3": signal.tp3,
        "risk_reward": signal.risk_reward,
        "status": signal.status.value,
        "setup": signal.setup,
        "trends": signal.trends,
        "indicators": signal.indicators,
        "created_at": signal.created_at.isoformat(),
    }


async def serve_dashboard(bot: "ScalpingBot") -> None:
    """Run uvicorn inside the bot's event loop."""
    config = uvicorn.Config(
        create_dashboard(bot),
        host=bot.settings.api_host,
        port=bot.settings.api_port,
        log_level=bot.settings.log_level.lower(),
        access_log=False,
    )
    server = uvicorn.Server(config)
    logger.info(
        "Dashboard API on http://%s:%d (docs at /docs)",
        bot.settings.api_host,
        bot.settings.api_port,
    )
    try:
        await server.serve()
    except asyncio.CancelledError:
        await server.shutdown()
        raise
