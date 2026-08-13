"""Telegram message rendering."""

from __future__ import annotations

from app.backtest.metrics import compute_metrics
from app.strategy.models import (
    ScoreComponent,
    ScoreResult,
    Signal,
    SignalSide,
    SignalStatus,
    SignalUpdate,
)
from app.telegram import messages

from tests.test_paper_trading import make_signal


def _signal() -> Signal:
    signal = make_signal()
    signal.score = 82.0
    signal.trends = {"15m": "Bullish", "5m": "Bullish", "3m": "Bullish", "1m": "Bullish"}
    signal.indicators = {"rsi": 57.0, "macd_hist": 0.2, "vwap": 99.0, "volume_ratio": 1.34}
    signal.setup = "EMA crossover + volume confirmation"
    return signal


def test_a_buy_card_contains_every_required_field():
    text = messages.format_signal(_signal())

    assert "STRONG BUY" in text
    assert "BTC/USDT" in text
    assert "Entry:" in text
    assert "TP1:" in text and "TP2:" in text and "TP3:" in text
    assert "Stop Loss:" in text
    assert "82/100" in text
    assert "RSI: 57" in text
    assert "MACD: Bullish" in text
    assert "VWAP: Above" in text
    assert "Volume: +34%" in text
    assert "EMA crossover" in text
    assert "Expected hold:" in text
    assert messages.DISCLAIMER in text


def test_the_trend_block_lists_every_timeframe():
    text = messages.format_signal(_signal())
    for interval in ("15m", "5m", "3m", "1m"):
        assert f"{interval} Bullish" in text


def test_no_secret_ever_reaches_a_message():
    text = messages.format_signal(_signal())
    lowered = text.lower()
    for forbidden in ("api", "secret", "token", "key"):
        assert forbidden not in lowered


def test_lifecycle_messages():
    signal = _signal()
    for status, expected in (
        (SignalStatus.TP1_HIT, "TP1 HIT"),
        (SignalStatus.TP2_HIT, "TP2 HIT"),
        (SignalStatus.TP3_HIT, "TP3 HIT"),
        (SignalStatus.STOP_LOSS, "STOP LOSS HIT"),
        (SignalStatus.INVALIDATED, "SIGNAL INVALIDATED"),
    ):
        update = SignalUpdate(
            signal=signal,
            previous_status=SignalStatus.ACTIVE,
            new_status=status,
            price=102.0,
            pnl_percent=2.0,
        )
        text = messages.format_update(update)
        assert expected in text
        assert "BTC/USDT" in text
        assert "+2.00%" in text


def test_the_no_trade_message_says_so_plainly():
    text = messages.format_no_trade("BTCUSDT", 58.0, "score below threshold")
    assert "NO TRADE" in text
    assert "58/100" in text
    assert "Market conditions are not strong enough." in text


def _score_result(total: float = 82.0, side: SignalSide = SignalSide.BUY) -> ScoreResult:
    return ScoreResult(
        side=side,
        total=total,
        components=(
            ScoreComponent("trend_15m", 1.0, 15.0, 15.0, "15m trend bullish", True),
            ScoreComponent("rsi", 57.0, 10.0, 10.0, "RSI 57", True),
            ScoreComponent("order_book", 0.0, 0.0, 5.0, "order book unavailable", False),
        ),
        mandatory_passed=True,
    )


def test_the_top_board_ranks_setups():
    entries = [("BTCUSDT", _score_result(87)), ("SOLUSDT", _score_result(82))]
    text = messages.format_top(entries, threshold=75)

    assert "TOP SCALPING SETUPS" in text
    assert "1. 🟢 <b>BTC/USDT</b>" in text
    assert "87/100" in text
    assert text.index("BTC/USDT") < text.index("SOL/USDT")


def test_an_empty_top_board_explains_itself():
    text = messages.format_top([], threshold=75)
    assert "No setup is above the threshold" in text
    assert "75/100" in text


def test_the_symbol_report_shows_the_score_breakdown():
    text = messages.format_symbol_report("BTCUSDT", _score_result(), price=100.0)
    assert "BTC/USDT" in text
    assert "Breakdown:" in text
    assert "trend_15m" in text
    assert "15/15" in text
    assert "order book unavailable" in text


def test_the_symbol_report_handles_a_warming_up_symbol():
    text = messages.format_symbol_report("ADAUSDT", None, price=0.5)
    assert "still warming up" in text


def test_the_status_card_reports_health():
    text = messages.format_status(
        engine_status={"enabled": True, "evaluations": 10, "published": 2, "active_signals": 1},
        market_status={"symbols_tracked": 30, "symbols_ready": 29, "symbols_stale": 1},
        stream_status={"connections": 2, "connected": 2, "reconnects": 0},
        paper_status={"enabled": True, "balance": 1012.5, "open_positions": 1, "total_trades": 4},
        signal_stats={"total": 12, "closed": 8, "win_rate": 62.5},
        uptime="2h 5m",
    )
    assert "BOT STATUS" in text
    assert "2h 5m" in text
    assert "2/2 connected" in text
    assert "1012.50 USDT" in text
    assert "no real orders" in text


def test_the_paper_report_covers_every_metric():
    from tests.test_paper_trading import _trade

    metrics = compute_metrics([_trade(10, 0), _trade(-5, 1)], start_balance=1000.0)
    text = messages.format_paper_report(metrics, open_positions=1)

    for label in (
        "Balance:",
        "Total PnL:",
        "Win rate:",
        "Expectancy:",
        "Profit factor:",
        "Max drawdown:",
    ):
        assert label in text
    assert "no real orders" in text


def test_an_infinite_profit_factor_renders():
    from tests.test_paper_trading import _trade

    metrics = compute_metrics([_trade(10, 0)], start_balance=1000.0)
    assert "∞" in messages.format_paper_report(metrics, open_positions=0)


def test_the_backtest_card_renders():
    text = messages.format_backtest(
        {
            "symbol": "BTCUSDT",
            "start": "2026-01-01T00:00:00+00:00",
            "end": "2026-01-08T00:00:00+00:00",
            "candles": 10080,
            "signals": 12,
            "total_trades": 12,
            "winning_trades": 7,
            "losing_trades": 5,
            "win_rate": 58.3,
            "profit_factor": 1.8,
            "total_pnl": 34.2,
            "total_pnl_percent": 3.42,
            "max_drawdown": 12.0,
            "max_drawdown_percent": 1.2,
            "average_trade": 2.85,
            "best_trade": 15.0,
            "worst_trade": -8.0,
        }
    )
    assert "BACKTEST RESULT" in text
    assert "BTC/USDT" in text
    assert "2026-01-01" in text
    assert "Past results do not predict future results." in text


def test_the_recent_signal_list_renders():
    text = messages.format_recent_signals(
        [
            {
                "symbol": "BTCUSDT",
                "side": "BUY",
                "score": 82,
                "status": "TP1_HIT",
                "pnl_percent": 1.2,
                "created_at": "2026-01-01T10:00:00+00:00",
            }
        ]
    )
    assert "BTC/USDT" in text
    assert "TP1_HIT" in text
    assert "+1.20%" in text


def test_an_empty_signal_list_renders():
    assert "No signals" in messages.format_recent_signals([])


def test_the_settings_view_never_leaks_credentials():
    text = messages.format_settings({"Min signal score": 75, "Cooldown": "5 min"})
    assert "75" in text
    assert "API keys are never shown" in text


def test_start_and_help_cards():
    start = messages.format_start()
    assert "never places a real order" in start

    help_text = messages.format_help()
    for command in ("/start", "/status", "/top", "/btc", "/eth", "/backtest", "/help"):
        assert command in help_text


def test_html_is_escaped_in_dynamic_values():
    signal = _signal()
    signal.setup = "<script>alert(1)</script>"
    text = messages.format_signal(signal)
    assert "<script>" not in text
    assert "&lt;script&gt;" in text
