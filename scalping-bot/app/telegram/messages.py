"""Telegram message rendering.

Pure functions: they take data and return a string, which keeps the exact
wording under unit test and keeps the bot layer free of formatting logic.
Messages are sent with ``parse_mode=HTML``, so every interpolated value is
HTML-escaped.
"""

from __future__ import annotations

from html import escape
from typing import Iterable, Sequence

from app.backtest.metrics import PerformanceMetrics
from app.binance.symbols import display_symbol
from app.strategy.models import (
    ScoreResult,
    Signal,
    SignalSide,
    SignalStatus,
    SignalUpdate,
)
from app.utils.helpers import format_price

DIVIDER = "━━━━━━━━━━━━━━"

DISCLAIMER = "⚠️ Spot signal — not financial advice."

SIDE_EMOJI = {
    SignalSide.BUY: "🟢",
    SignalSide.SELL: "🔴",
    SignalSide.WAIT: "⚪",
}

STATUS_EMOJI = {
    SignalStatus.TP1_HIT: "✅",
    SignalStatus.TP2_HIT: "✅",
    SignalStatus.TP3_HIT: "🏆",
    SignalStatus.STOP_LOSS: "🛑",
    SignalStatus.INVALIDATED: "⚠️",
    SignalStatus.EXPIRED: "⌛",
}

TREND_EMOJI = {
    "Bullish": "🟢",
    "Weak Bullish": "🟡",
    "Neutral": "⚪",
    "Weak Bearish": "🟠",
    "Bearish": "🔴",
}


def _pair(symbol: str, quote_asset: str = "USDT") -> str:
    return escape(display_symbol(symbol, quote_asset))


def _pct(value: float) -> str:
    return f"{value:+.2f}%"


def format_signal(signal: Signal, quote_asset: str = "USDT") -> str:
    """The main BUY/SELL card."""
    emoji = SIDE_EMOJI.get(signal.side, "⚪")
    lines = [
        f"{emoji} <b>{escape(signal.label)}</b>",
        "",
        f"<b>{_pair(signal.symbol, quote_asset)}</b>",
        "",
        DIVIDER,
        "",
        f"💰 <b>Entry:</b> {format_price(signal.entry_low)} - {format_price(signal.entry_high)}",
        "",
        f"🎯 <b>TP1:</b> {format_price(signal.tp1)}",
        f"🎯 <b>TP2:</b> {format_price(signal.tp2)}",
        f"🎯 <b>TP3:</b> {format_price(signal.tp3)}",
        "",
        f"🛑 <b>Stop Loss:</b> {format_price(signal.stop_loss)}",
        f"⚖️ <b>Risk/Reward:</b> 1:{signal.risk_reward:.2f}",
        "",
        f"📊 <b>Signal:</b> {signal.score:.0f}/100",
        "",
        "📈 <b>Trend:</b>",
    ]

    for interval in ("15m", "5m", "3m", "1m"):
        label = signal.trends.get(interval)
        if label:
            lines.append(f"   {TREND_EMOJI.get(label, '⚪')} {interval} {escape(label)}")

    volume_ratio = signal.indicators.get("volume_ratio", 0.0)
    macd_hist = signal.indicators.get("macd_hist", 0.0)
    lines += [
        "",
        "📊 <b>Indicators:</b>",
        f"   RSI: {signal.indicators.get('rsi', 0):.0f}",
        f"   MACD: {'Bullish' if macd_hist > 0 else 'Bearish'}",
        f"   VWAP: {'Above' if signal.price >= signal.indicators.get('vwap', 0) else 'Below'}",
        f"   Volume: {(volume_ratio - 1) * 100:+.0f}%",
        "",
        f"⚡ <b>Setup:</b> {escape(signal.setup)}",
        f"⏱ <b>Expected hold:</b> {escape(signal.expected_hold)}",
        "",
        DIVIDER,
        "",
        DISCLAIMER,
    ]
    return "\n".join(lines)


def format_update(update: SignalUpdate, quote_asset: str = "USDT") -> str:
    """A lifecycle notification (TP hit, stop, invalidation)."""
    emoji = STATUS_EMOJI.get(update.new_status, "ℹ️")
    titles = {
        SignalStatus.TP1_HIT: "TP1 HIT",
        SignalStatus.TP2_HIT: "TP2 HIT",
        SignalStatus.TP3_HIT: "TP3 HIT",
        SignalStatus.STOP_LOSS: "STOP LOSS HIT",
        SignalStatus.INVALIDATED: "SIGNAL INVALIDATED",
        SignalStatus.EXPIRED: "SIGNAL EXPIRED",
    }
    title = titles.get(update.new_status, update.new_status.value)
    signal = update.signal

    lines = [
        f"{emoji} <b>{escape(title)}</b>",
        "",
        f"<b>{_pair(signal.symbol, quote_asset)}</b> · {escape(signal.side.value)}",
        "",
        f"Entry: {format_price(signal.entry)}",
        f"Price: {format_price(update.price)}",
        f"Result: <b>{_pct(update.pnl_percent)}</b>",
    ]
    if update.new_status is SignalStatus.INVALIDATED:
        lines.append("")
        lines.append("Setup premise is gone — stand aside.")
    return "\n".join(lines)


def format_no_trade(symbol: str, score: float, reason: str, quote_asset: str = "USDT") -> str:
    """The explicit WAIT answer required by the specification."""
    return "\n".join(
        [
            "⚪ <b>NO TRADE</b>",
            "",
            f"<b>{_pair(symbol, quote_asset)}</b>",
            "",
            f"📊 Score: {score:.0f}/100",
            f"📝 {escape(reason)}" if reason else "",
            "",
            "Market conditions are not strong enough.",
        ]
    ).replace("\n\n\n", "\n\n")


def format_top(
    entries: Sequence[tuple[str, ScoreResult]],
    threshold: float,
    quote_asset: str = "USDT",
) -> str:
    """The ``/top`` leaderboard."""
    if not entries:
        return "\n".join(
            [
                "🔥 <b>TOP SCALPING SETUPS</b>",
                "",
                "No setup is above the threshold right now.",
                f"Minimum score: {threshold:.0f}/100",
                "",
                "⚪ Patience is a position.",
            ]
        )

    lines = ["🔥 <b>TOP SCALPING SETUPS</b>", ""]
    for index, (symbol, result) in enumerate(entries, start=1):
        emoji = SIDE_EMOJI.get(result.side, "⚪")
        lines.append(
            f"{index}. {emoji} <b>{_pair(symbol, quote_asset)}</b>"
        )
        lines.append(f"    {escape(result.label)} {result.total:.0f}/100")
    lines.append("")
    lines.append(DISCLAIMER)
    return "\n".join(lines)


def format_symbol_report(
    symbol: str,
    result: ScoreResult | None,
    price: float,
    rejection: str = "",
    quote_asset: str = "USDT",
) -> str:
    """Detailed per-symbol view used by ``/btc``, ``/eth`` and ``/signals``."""
    header = f"📊 <b>{_pair(symbol, quote_asset)}</b>"
    if result is None:
        return "\n".join(
            [
                header,
                "",
                f"Price: {format_price(price)}",
                "",
                "Not enough data yet — the bot is still warming up.",
            ]
        )

    emoji = SIDE_EMOJI.get(result.side, "⚪")
    lines = [
        header,
        "",
        f"Price: {format_price(price)}",
        f"{emoji} <b>{escape(result.label)}</b> · {result.total:.0f}/100",
        "",
        "<b>Breakdown:</b>",
    ]
    for component in result.components:
        mark = "✅" if component.passed else ("➖" if component.score > 0 else "❌")
        lines.append(
            f"   {mark} {escape(component.indicator)}: "
            f"{component.score:.0f}/{component.max_score:.0f} — {escape(component.description)}"
        )

    if result.missing:
        lines += ["", f"⚠️ Missing: {escape(', '.join(result.missing))}"]
    if rejection:
        lines += ["", f"📝 {escape(rejection)}"]

    lines += ["", DISCLAIMER]
    return "\n".join(lines)


def format_status(
    engine_status: dict,
    market_status: dict,
    stream_status: dict,
    paper_status: dict,
    signal_stats: dict,
    uptime: str,
) -> str:
    """The ``/status`` health card."""
    connected = stream_status.get("connected", 0)
    total_connections = stream_status.get("connections", 0)
    ws_emoji = "🟢" if connected and connected == total_connections else (
        "🟡" if connected else "🔴"
    )
    engine_emoji = "🟢" if engine_status.get("enabled") else "⏸"

    lines = [
        "🤖 <b>BOT STATUS</b>",
        "",
        f"⏱ Uptime: {escape(uptime)}",
        f"{engine_emoji} Signals: {'enabled' if engine_status.get('enabled') else 'disabled'}",
        f"{ws_emoji} Websockets: {connected}/{total_connections} connected",
        f"   Reconnects: {stream_status.get('reconnects', 0)}",
        "",
        "<b>Market data</b>",
        f"   Symbols tracked: {market_status.get('symbols_tracked', 0)}",
        f"   Ready: {market_status.get('symbols_ready', 0)}",
        f"   Stale: {market_status.get('symbols_stale', 0)}",
        "",
        "<b>Signal engine</b>",
        f"   Evaluations: {engine_status.get('evaluations', 0)}",
        f"   Published: {engine_status.get('published', 0)}",
        f"   Active: {engine_status.get('active_signals', 0)}",
        f"   Rejected (confirmation): {engine_status.get('rejected_mandatory', 0)}",
        f"   Rejected (score): {engine_status.get('rejected_score', 0)}",
        f"   Rejected (filters): {engine_status.get('rejected_filters', 0)}",
        f"   Rejected (risk): {engine_status.get('rejected_risk', 0)}",
        f"   Rejected (duplicate): {engine_status.get('rejected_duplicate', 0)}",
        "",
        "<b>Signal history</b>",
        f"   Total: {signal_stats.get('total', 0)}",
        f"   Closed: {signal_stats.get('closed', 0)}",
        f"   Win rate: {signal_stats.get('win_rate', 0):.1f}%",
        "",
        "<b>Paper account</b>",
        f"   Mode: {'PAPER' if paper_status.get('enabled') else 'OFF'} (no real orders)",
        f"   Balance: {paper_status.get('balance', 0):.2f} USDT",
        f"   Open positions: {paper_status.get('open_positions', 0)}",
        f"   Trades: {paper_status.get('total_trades', 0)}",
    ]
    return "\n".join(lines)


def format_paper_report(metrics: PerformanceMetrics, open_positions: int) -> str:
    """Paper trading performance summary."""
    profit_factor = (
        "∞" if metrics.profit_factor == float("inf") else f"{metrics.profit_factor:.2f}"
    )
    return "\n".join(
        [
            "📈 <b>PAPER TRADING</b>",
            "",
            f"Balance: <b>{metrics.end_balance:.2f} USDT</b>",
            f"Start: {metrics.start_balance:.2f} USDT",
            f"Total PnL: <b>{metrics.total_pnl:+.2f} USDT</b> ({metrics.total_pnl_percent:+.2f}%)",
            "",
            f"Open positions: {open_positions}",
            f"Total trades: {metrics.total_trades}",
            f"Wins: {metrics.winning_trades}",
            f"Losses: {metrics.losing_trades}",
            f"Win rate: {metrics.win_rate:.1f}%",
            "",
            f"Average profit: {metrics.average_profit:+.2f}",
            f"Average loss: {metrics.average_loss:+.2f}",
            f"Average trade: {metrics.average_trade:+.2f}",
            f"Expectancy: {metrics.expectancy:+.2f} / trade",
            f"Profit factor: {profit_factor}",
            f"Max drawdown: {metrics.max_drawdown:.2f} ({metrics.max_drawdown_percent:.2f}%)",
            f"Fees paid: {metrics.total_fees:.2f}",
            "",
            "Paper trading only — no real orders are sent.",
        ]
    )


def format_backtest(summary: dict, quote_asset: str = "USDT") -> str:
    """Backtest result card."""
    profit_factor = summary.get("profit_factor", 0.0)
    profit_text = "∞" if profit_factor == float("inf") else f"{profit_factor:.2f}"
    return "\n".join(
        [
            "🧪 <b>BACKTEST RESULT</b>",
            "",
            f"<b>{_pair(str(summary.get('symbol', '')), quote_asset)}</b>",
            f"{escape(str(summary.get('start', ''))[:10])} → "
            f"{escape(str(summary.get('end', ''))[:10])}",
            f"Candles: {summary.get('candles', 0):,}",
            "",
            f"Signals: {summary.get('signals', 0)}",
            f"Total trades: {summary.get('total_trades', 0)}",
            f"Wins: {summary.get('winning_trades', 0)}",
            f"Losses: {summary.get('losing_trades', 0)}",
            f"Win rate: {summary.get('win_rate', 0):.1f}%",
            "",
            f"Net PnL: <b>{summary.get('total_pnl', 0):+.2f} USDT</b> "
            f"({summary.get('total_pnl_percent', 0):+.2f}%)",
            f"Profit factor: {profit_text}",
            f"Max drawdown: {summary.get('max_drawdown', 0):.2f} "
            f"({summary.get('max_drawdown_percent', 0):.2f}%)",
            f"Average trade: {summary.get('average_trade', 0):+.2f}",
            f"Best trade: {summary.get('best_trade', 0):+.2f}",
            f"Worst trade: {summary.get('worst_trade', 0):+.2f}",
            "",
            "Past results do not predict future results.",
        ]
    )


def format_recent_signals(rows: Iterable[dict], quote_asset: str = "USDT") -> str:
    """``/signals`` history list."""
    rows = list(rows)
    if not rows:
        return "📭 <b>RECENT SIGNALS</b>\n\nNo signals have been published yet."

    lines = ["📋 <b>RECENT SIGNALS</b>", ""]
    for row in rows:
        side = str(row.get("side", ""))
        emoji = "🟢" if side == "BUY" else "🔴"
        status = str(row.get("status", ""))
        pnl = float(row.get("pnl_percent", 0.0) or 0.0)
        created = str(row.get("created_at", ""))[:16].replace("T", " ")
        lines.append(
            f"{emoji} <b>{_pair(str(row.get('symbol', '')), quote_asset)}</b> "
            f"{escape(side)} {float(row.get('score', 0)):.0f}/100"
        )
        lines.append(f"    {escape(created)} · {escape(status)} · {_pct(pnl)}")
    return "\n".join(lines)


def format_settings(settings_dict: dict) -> str:
    """``/settings`` view. Secrets are never included."""
    lines = ["⚙️ <b>SETTINGS</b>", ""]
    for key, value in settings_dict.items():
        lines.append(f"   <b>{escape(str(key))}</b>: {escape(str(value))}")
    lines += ["", "API keys are never shown here or sent over Telegram."]
    return "\n".join(lines)


def format_start() -> str:
    return "\n".join(
        [
            "👋 <b>Binance Spot Scalping Signal Bot</b>",
            "",
            "I watch the Binance spot market in real time and publish",
            "multi-timeframe scalping setups with entry, stop loss and targets.",
            "",
            "This bot <b>never places a real order</b>. It analyses and signals only.",
            "",
            "Send /help to see every command.",
            "",
            DISCLAIMER,
        ]
    )


def format_help() -> str:
    return "\n".join(
        [
            "📖 <b>COMMANDS</b>",
            "",
            "/start — introduction",
            "/status — bot, websocket and account health",
            "/signals — recent published signals",
            "/top — strongest setups right now",
            "/btc — full BTC/USDT breakdown",
            "/eth — full ETH/USDT breakdown",
            "/symbol &lt;PAIR&gt; — breakdown for any tracked pair",
            "/paper — paper trading performance",
            "/settings — active configuration",
            "/enable — resume publishing signals",
            "/disable — pause publishing signals",
            "/backtest &lt;PAIR&gt; &lt;days&gt; — run a historical test",
            "/help — this message",
            "",
            DISCLAIMER,
        ]
    )


def format_unauthorized() -> str:
    return "⛔️ This chat is not authorised to use this bot."
