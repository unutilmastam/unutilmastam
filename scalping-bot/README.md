# Binance Spot Scalping Signal Bot

A real-time signal bot for the **Binance Spot** market. It watches the most
liquid USDT pairs, scores short-term scalping setups across four timeframes,
and publishes BUY / SELL / WAIT calls to Telegram with entry, stop loss and
three take-profit levels.

> **This bot never places a real order.** It analyses the market, publishes
> signals, and simulates trades on a virtual balance. There is no order
> placement code in this project at all. The Binance API *secret* is never
> read, never logged, and never sent anywhere.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Install Python](#2-install-python)
3. [Virtual environment](#3-virtual-environment)
4. [Install dependencies](#4-install-dependencies)
5. [Create a Binance API key](#5-create-a-binance-api-key-optional)
6. [Create a Telegram bot](#6-create-a-telegram-bot)
7. [Configure `.env`](#7-configure-env)
8. [Run it](#8-run-it)
9. [Telegram commands](#9-telegram-commands)
10. [Paper trading](#10-paper-trading)
11. [Backtesting](#11-backtesting)
12. [Offline demo mode](#12-offline-demo-mode-no-internet-no-keys)
13. [Docker](#13-docker)
14. [Dashboard API](#14-dashboard-api)
15. [How the strategy works](#15-how-the-strategy-works)
16. [Project layout](#16-project-layout)
17. [Tests](#17-tests)
18. [Troubleshooting](#18-troubleshooting)
19. [Risk notice](#19-risk-notice)

---

## 1. What it does

On every closed 1-minute candle, for every tracked symbol:

```
market data → 15m/5m/3m/1m analysis → scoring (0-100) → hard filters
   → risk plan (SL / TP1-3) → duplicate check → signal
   → database + Telegram + paper trade
```

Design rules the code actually enforces:

- **Closed candles only.** The forming candle is stored separately and never
  reaches an indicator, so a published signal never repaints.
- **Score alone is never enough.** A setup must also confirm on 15m, on 5m,
  and produce a 1m entry trigger. Without all three, no signal — whatever the
  score is.
- **Quality over quantity.** When the market is unclear, the answer is
  `NO TRADE`.
- **Backtest and live share one code path.** Both call the same
  `analyze_timeframe` → `best_side` → `RiskManager` functions.

---

## 2. Install Python

Python **3.11 or newer** (3.12+ recommended).

```bash
python3 --version
```

- **Ubuntu/Debian**: `sudo apt update && sudo apt install python3 python3-venv python3-pip`
- **macOS**: `brew install python@3.12`
- **Windows**: install from [python.org](https://www.python.org/downloads/) and
  tick *"Add Python to PATH"*.

---

## 3. Virtual environment

```bash
cd scalping-bot

python3 -m venv .venv

# Linux / macOS
source .venv/bin/activate
# Windows
.venv\Scripts\activate
```

---

## 4. Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Indicators (EMA, RSI, MACD, VWAP, ATR, volume, swing levels) are implemented
directly on pandas/numpy in `app/indicators/`. No `pandas-ta` or `ta`
dependency is needed: the implementations are unit-tested against their
mathematical definitions and avoid version-compatibility breakage.

---

## 5. Create a Binance API key (optional)

**The bot works with no API key at all.** All market data it uses (klines,
depth, tickers, websocket streams) is public.

Add a key only if you want the higher rate limits:

1. Binance → *Account* → *API Management* → *Create API*.
2. Permissions: **Enable Reading only**. Leave *Enable Spot Trading*
   **off** — the bot has no code that could use it.
3. Restrict access to your server IP.
4. Put the key in `.env`.

The secret is only present in config for completeness; no code path reads it
for signing, and nothing is ever sent to Telegram or the dashboard.

---

## 6. Create a Telegram bot

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → follow prompts.
2. Copy the token into `TELEGRAM_BOT_TOKEN`.
3. Get your chat id from [@userinfobot](https://t.me/userinfobot) and put it in
   `TELEGRAM_CHAT_ID`.
4. Send `/start` to your own bot once, so it is allowed to message you.

For a group: add the bot to the group, then use the group's id (it starts with
`-100…`).

**Only whitelisted chats can talk to the bot.** With no whitelist configured,
the bot answers nobody — it fails closed.

---

## 7. Configure `.env`

```bash
cp .env.example .env
```

Then edit it. The minimum for live signals:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
```

Key settings:

| Variable | Default | Meaning |
|---|---|---|
| `MIN_SIGNAL_SCORE` | `75` | Score needed to publish |
| `MAX_SYMBOLS` | `30` | How many pairs to track |
| `MIN_24H_VOLUME` | `50000000` | Liquidity floor (quote volume) |
| `MAX_SPREAD_PERCENT` | `0.06` | Widest spread accepted |
| `SIGNAL_COOLDOWN_MINUTES` | `5` | Anti-spam window per symbol/side |
| `RISK_PER_TRADE` | `0.01` | 1% of paper equity risked per trade |
| `MAX_POSITION_PERCENT` | `0.25` | Largest share of equity in one position |
| `MIN_RISK_REWARD` | `1.5` | Setups below this are discarded |
| `PAPER_TRADING` | `true` | Simulate trades from signals |
| `REAL_TRADING` | `false` | Not implemented; must stay false |
| `AUTHORIZED_CHAT_IDS` | *(empty)* | Extra chats allowed to command the bot |

`.env` is in `.gitignore`. Keep it that way.

---

## 8. Run it

```bash
python run.py
```

Startup sequence, visible in the logs:

1. database created, paper account restored
2. Binance REST reachable
3. scanner picks the tracked symbols
4. warm-up: ~400 closed candles per symbol per timeframe over REST
5. websockets subscribe (a handful of combined connections, not one per symbol)
6. Telegram starts polling and sends a start-up notice
7. dashboard API on `http://localhost:8000`

Then it waits for closed candles and evaluates. `Ctrl+C` shuts down cleanly.

Other entry points:

```bash
python run.py scan            # show what the scanner would track, and why
python run.py backtest BTCUSDT 7
python run.py test-telegram   # send a test message and exit
```

---

## 9. Telegram commands

| Command | Description |
|---|---|
| `/start` | Introduction |
| `/status` | Bot, websocket, market and account health |
| `/signals` | Recent published signals |
| `/top` | Strongest setups right now |
| `/btc`, `/eth` | Full score breakdown for that pair |
| `/symbol SOLUSDT` | Breakdown for any pair |
| `/paper` | Paper trading performance |
| `/settings` | Active configuration (never secrets) |
| `/enable`, `/disable` | Resume / pause publishing (survives restart) |
| `/backtest BTCUSDT 3` | Run a historical test |
| `/help` | Command list |

Example signal:

```
🟢 STRONG BUY

BTC/USDT

━━━━━━━━━━━━━━

💰 Entry: 112,450 - 112,550
🎯 TP1: 112,700
🎯 TP2: 113,000
🎯 TP3: 113,400
🛑 Stop Loss: 112,200
⚖️ Risk/Reward: 1:2.00

📊 Signal: 82/100

📈 Trend:
   🟢 15m Bullish
   🟢 5m Bullish
   🟢 3m Bullish
   🟢 1m Bullish

📊 Indicators:
   RSI: 57
   MACD: Bullish
   VWAP: Above
   Volume: +34%

⚡ Setup: 1m EMA crossover + volume confirmation
⏱ Expected hold: 5-30 min

━━━━━━━━━━━━━━

⚠️ Spot signal — not financial advice.
```

You also get lifecycle alerts: `TP1 HIT`, `TP2 HIT`, `TP3 HIT`,
`STOP LOSS HIT`, `SIGNAL INVALIDATED`.

---

## 10. Paper trading

Enabled by default, starting from `1000 USDT`.

- Position size makes a stop-out cost exactly `RISK_PER_TRADE` of equity.
- Real cash accounting: buying spends the balance, so several open positions
  can never together exceed it. Spot has no leverage.
- Each position is capped at `MAX_POSITION_PERCENT` of equity (default 25%).
  A tight stop makes the risk-based size larger than the whole account, so
  without this cap the first signal would spend everything and block every
  other symbol.
- Targets close the position in tranches (`TP_ALLOCATION`, default 50/30/20).
- After TP1 the stop moves to break-even.
- A 0.1% taker fee is charged on entry and on every exit tranche.
- **SELL means exit, not short.** On spot you cannot short, so a SELL signal
  closes an open virtual position and does nothing if there is none.

`/paper` reports total trades, wins, losses, win rate, average profit and
loss, profit factor, expectancy, max drawdown and total PnL.

---

## 11. Backtesting

```bash
python run.py backtest BTCUSDT 7
```

or `/backtest BTCUSDT 7` in Telegram.

The backtester walks forward one 1m candle at a time and shows the strategy
only the candles that had already closed at that moment. Two rules keep it
honest:

- Higher timeframes are sliced by **close time**, so a 15m candle is invisible
  until it actually completes.
- Trade management starts on the candle **after** the signal candle, and a
  candle that spans both stop and target is booked as a **stop**.

Historical top-of-book and depth do not exist, so the order-book component
scores 0 in a backtest — expect backtest scores about 5 points below live.

Output: total trades, wins, losses, win rate, profit factor, net PnL, max
drawdown, average/best/worst trade, plus a breakdown of why setups were
rejected.

---

## 12. Offline demo mode (no internet, no keys)

A local Binance-compatible mock exchange is included, so you can see the whole
pipeline run without touching the real market:

```bash
# terminal 1 - the fake exchange (one 1m candle every 2 seconds)
python -m tools.mock_binance --speed 30

# terminal 2 - the bot, pointed at it
BINANCE_REST_URL=http://127.0.0.1:8100 \
BINANCE_WS_URL=ws://127.0.0.1:8101 \
python run.py
```

It serves `ping`, `time`, `exchangeInfo`, `ticker/24hr`, `ticker/bookTicker`,
`klines` and `depth`, plus a combined websocket stream. Candles come from a
deterministic synthetic market, so REST history and the live stream always
agree and every run reproduces exactly.

This is also how the delivered build was verified end to end, since public
Binance endpoints are geo-blocked from some networks.

---

## 13. Docker

```bash
cp .env.example .env    # fill in your Telegram token and chat id
docker compose up -d
docker compose logs -f bot
```

The image runs as a non-root user, keeps the SQLite file in `./data` and logs
in `./logs`, and exposes the dashboard on port 8000 with a health check.

For PostgreSQL:

```bash
# uncomment asyncpg in requirements.txt first, then:
docker compose --profile postgres up -d
# and in .env:
# DATABASE_URL=postgresql+asyncpg://bot:bot@postgres:5432/signals
```

---

## 14. Dashboard API

FastAPI, read-only, on `http://localhost:8000` (`/docs` for the OpenAPI page).

| Endpoint | Returns |
|---|---|
| `GET /health` | Liveness and trading mode |
| `GET /api/status` | Engine, market and stream health |
| `GET /api/market` | Tracked symbols and data freshness |
| `GET /api/signals/active` | Currently live signals |
| `GET /api/signals/recent` | Signal history |
| `GET /api/signals/stats` | Win rate and totals |
| `GET /api/top` | Current score leaderboard |
| `GET /api/symbols/{symbol}` | Full score breakdown |
| `GET /api/paper` | Paper balance, positions and metrics |
| `GET /api/top-symbols` | Best performing symbols |

Every route is `GET`. There is no endpoint that can place an order or change
risk settings.

---

## 15. How the strategy works

**Timeframe roles**

| Timeframe | Role |
|---|---|
| 15m | Overall trend |
| 5m | Main scalping trend |
| 3m | Momentum |
| 1m | Entry trigger |

**Scoring (100 points)**

| Component | Points | Passes when |
|---|---|---|
| 15m trend | 15 | EMA9 > EMA21 and price above EMA50 |
| 5m trend | 15 | EMA9 > EMA21 and price above VWAP |
| 3m momentum | 15 | RSI between 50 and 70, MACD bullish |
| 1m entry | 15 | EMA9 crosses EMA21, or a support rejection |
| RSI | 10 | 1m RSI in a healthy band |
| MACD | 10 | 5m MACD aligned |
| VWAP | 5 | Price on the right side of session VWAP |
| Volume | 10 | Volume vs its own 20-bar baseline |
| Order book | 5 | Bid volume outweighs ask volume |

| Score | Meaning |
|---|---|
| 0-49 | NO TRADE |
| 50-64 | WEAK |
| 65-74 | BUY |
| 75-84 | STRONG BUY |
| 85-100 | VERY STRONG BUY |

**Mandatory, regardless of score:** 15m confirmation **and** 5m confirmation
**and** a 1m entry trigger.

**Risk plan**

- Stop from `ATR × 1.2`, widened to sit beyond the protecting swing level.
- TP1/TP2/TP3 at 1R / 1.5R / 2R, pulled in front of opposing structure.
- Rejected if the stop is too tight or too wide, or R:R is below 1.5.
- Entry uses the ask for a buy and the bid for a sell — no assumed mid fill.

**Hard filters** — thin volume, wide spread, an over-extended signal candle,
extreme volatility, RSI beyond 75/25, no room to a target, poor R:R, or stale
market data.

**Duplicate filter** — one signal per symbol/side per cooldown window
(default 5 minutes) unless the score moves materially or the levels change.

---

## 16. Project layout

```
scalping-bot/
├── app/
│   ├── main.py                    application wiring and lifecycle
│   ├── config.py                  settings from environment
│   ├── dashboard.py               read-only FastAPI API
│   ├── binance/
│   │   ├── rest.py                public REST client with retries
│   │   ├── websocket.py           combined streams + reconnection
│   │   └── symbols.py             exchange rules and filtering
│   ├── market/
│   │   ├── candles.py             candle model, de-duplicated buffers
│   │   ├── store.py               shared in-memory market state
│   │   ├── orderbook.py           best bid/ask and depth
│   │   ├── volume.py              24h ticker statistics
│   │   └── market_scanner.py      liquidity screen and universe
│   ├── indicators/                EMA, RSI, MACD, VWAP, ATR, volume, S/R
│   ├── strategy/
│   │   ├── scalping_strategy.py   multi-timeframe conditions
│   │   ├── scoring.py             0-100 scoring
│   │   ├── risk_manager.py        filters, stop, targets, sizing
│   │   ├── signal_engine.py       pipeline and signal lifecycle
│   │   └── models.py              shared value objects
│   ├── telegram/                  bot, commands, message rendering
│   ├── paper/trader.py            virtual trading
│   ├── backtest/                  walk-forward engine and metrics
│   ├── database/                  SQLAlchemy models and queries
│   └── utils/                     logging and helpers
├── tools/
│   ├── mock_binance.py            offline Binance-compatible server
│   └── market_sim.py              deterministic synthetic market
├── tests/
├── Dockerfile
├── docker-compose.yml
└── run.py
```

**Database tables:** `signals`, `signal_reasons` (why each signal scored what
it did), `market_snapshots`, `paper_trades`, `account_state`, `bot_settings`.

---

## 17. Tests

```bash
pytest                       # whole suite
pytest --cov=app             # with coverage
pytest tests/test_strategy.py -v
```

321 tests, 85% overall coverage. They cover indicator maths, the
no-look-ahead property, candle de-duplication, scoring, TP/SL placement,
position sizing, the cooldown and duplicate filters, the signal lifecycle,
paper trading, the backtester, websocket reconnection, REST retries and
rate-limit handling, the Telegram commands and whitelist, and the dashboard.

`tests/test_integration.py` drives the real `ScalpingBot` wiring against a
temporary SQLite database and asserts that a closed candle ends up as rows in
`signals`, `signal_reasons`, `market_snapshots` and `paper_trades`.

---

## 18. Troubleshooting

**`Cannot reach the Binance REST API`**
Binance blocks some regions and cloud providers with HTTP 451/403. Check with
`curl -s -o /dev/null -w "%{http_code}" https://api.binance.com/api/v3/ping`.
If it is not `200`, the network is the problem, not the bot. Use
[offline demo mode](#12-offline-demo-mode-no-internet-no-keys) to verify the
install, or run from an unblocked network.

**`The scanner selected no symbols`**
Your filters are too strict for the current market. Lower `MIN_24H_VOLUME` or
raise `MAX_SPREAD_PERCENT`, then re-check with `python run.py scan`.

**No signals appear**
That is usually correct behaviour — the bot is built to stay out. Check
`/status` for the rejection counters and `/btc` for a per-condition
breakdown. To see more (lower quality) setups, lower `MIN_SIGNAL_SCORE`.

**Telegram is silent**
Run `python run.py test-telegram`. If it fails, the token is wrong. If it
succeeds but signals do not arrive, check `/status` — signals may be paused
via `/disable`, or nothing is passing the threshold.

**`This chat is not authorised`**
Your chat id is not whitelisted. Set `TELEGRAM_CHAT_ID` (and
`AUTHORIZED_CHAT_IDS` for extra chats), then restart.

**Websocket keeps reconnecting**
Normal in small doses — Binance recycles connections roughly daily and the
client reconnects with backoff. Constant reconnects mean an unstable network
or a blocked `wss://stream.binance.com:9443`.

**Warm-up is slow / rate limited**
Start-up fetches history for every symbol and timeframe. Reduce
`MAX_SYMBOLS`, or add a read-only API key for higher limits.

**Database is locked (SQLite)**
Only run one instance against a SQLite file. For multiple instances, use
PostgreSQL.

---

## 19. Risk notice

This software is for **education and research**. It is not financial advice.

- The signal score measures **how many strategy conditions currently line up**.
  It is **not** a probability of profit and must not be read as one.
- Backtest results do not predict future results.
- Crypto markets can move violently; you can lose money.
- No profit is promised, implied, or possible to guarantee.

You alone are responsible for anything you do with these signals.
