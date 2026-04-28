# Stockman 📈
### *the sharpest tool in your finance toolbox*

A local-first personal stock investment tracker built for serious retail investors. Stockman runs entirely on your machine — no subscriptions, no cloud, no data sharing. Just you and your portfolio.

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-lightgrey?logo=sqlite)

---

## Why I built this

I was managing a real stock portfolio and couldn't find a tool that combined trailing stops, signal-based decision making, and short interest data in one place — without paying for a Bloomberg terminal. So I built it myself over a weekend that turned into several weeks.

The core insight: **emotion is the enemy of good investing**. Stockman replaces gut feelings with a structured checklist and automates the one thing most retail investors forget — knowing when to get out.

---

## Features

### 🛡️ ATR Trailing Stops
- Stop price automatically rises as the stock goes up, never moves down
- Two-tier alerts: **warning** (early heads-up) and **hard stop** (act now)
- Six presets from Tight (1.5×) to Very Loose (4.5×) with descriptive names
- Email alerts via Gmail when stops are triggered

### 📊 Portfolio Tracking
- Real positions: ticker, shares, average buy price
- Live prices fetched via yfinance with TTL caching
- Unrealized P&L, market value, stop status per position
- EUR/USD toggle for European investors
- Drag-and-drop row reordering, column rearranging

### 🧠 Signal Score System
A structured checklist that scores each position objectively:
- **Sell signals** (20pts each): deteriorating fundamentals, stop triggered, short interest rising, etc.
- **Trim signals** (10pts): partial exit reasons
- **Conviction bonus** (−10pts): "I still believe long-term"
- Score displayed as % — removes emotion from sell decisions

### 🔍 Watchlist with Short Data
- Short interest %, float, institutional ownership %, days-to-cover
- Weekly trend arrows (↑/↓) based on snapshot history
- Data confidence warnings (flags unrealistic institutional % values, etc.)
- Volatility badge, ATR, earnings countdown

### 📅 Weekly Snapshots
- Automatic Monday snapshots of all short/institutional data
- Trend arrows appear after 2+ weeks of data
- Manual snapshot trigger available

### 💼 Risk Management
- Total downside risk if all stops hit simultaneously
- Stop-out portfolio value (worst-case floor)
- Risk as % of portfolio (color-coded: green/yellow/red)
- Risk concentration bar chart per position

### 📓 Journal
- Log every buy, sell, and trim with reasons
- Win/loss stats: completed trades, win rate %, avg win %, avg loss %

### 📖 Guide
Built-in finance theory reference covering:
- Trailing stop mechanics and why they matter
- ATR explained with examples
- Short interest, float, institutional ownership deep dives
- Finnish capital gains tax notes (30%/34%, OST account)
- Seasonality timeline (monthly market patterns)
- The AXTI lesson: why selling with a system beats holding on emotion

### ⚡ Performance
- TTL caching per data type (5min prices → 24h stock details)
- Parallel fetching with ThreadPoolExecutor
- ~3–5s load for full portfolio, near-instant on cache hits

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLite, APScheduler |
| Frontend | React 18, Vite, Tailwind CSS |
| Market Data | yfinance |
| Charts | Recharts |
| Icons | Lucide React |
| Email | Gmail SMTP + App Passwords |

---

## Getting Started

### Requirements
- Python 3.10+
- Node.js 18+

### Install & Run

```bash
git clone https://github.com/YOUR_USERNAME/stockman.git
cd stockman
start.bat
```

`start.bat` handles everything automatically:
- Creates Python venv and installs dependencies on first run
- Builds the frontend if not already built
- Starts the server and opens your browser

App runs at **http://localhost:8888**

### Configure Email Alerts

1. Open the app → **Settings**
2. Enter your Gmail address and an [App Password](https://support.google.com/accounts/answer/185833)
3. Save — alerts will fire automatically on an hourly schedule

> Email alerts use Gmail App Passwords, not your main password. Your credentials are stored only in your local SQLite database and never leave your machine.

---

## Architecture

```
stockman/
├── backend/
│   ├── main.py              # FastAPI routes, business logic
│   ├── database.py          # SQLite schema, migrations
│   ├── scheduler.py         # Hourly price checks, weekly snapshots
│   └── services/
│       ├── market_data.py   # yfinance wrapper with TTL cache
│       ├── trailing_stop.py # ATR stop calculations
│       └── email_service.py # Gmail SMTP alerts
├── frontend/
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── Portfolio.jsx
│           ├── Watchlist.jsx
│           ├── Journal.jsx
│           ├── Guide.jsx
│           └── SettingsPanel.jsx
└── start.bat                # One-click launcher
```

---

## Privacy

- All data stays on your machine
- `stockman.db` is gitignored — your positions never touch the internet
- Market data is fetched read-only from Yahoo Finance
- The only outbound connection is email alerts sent to yourself

---

## License

MIT — use it, fork it, build on it.
