from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional
import os
import sys
import shutil
import tempfile
import json

sys.path.insert(0, os.path.dirname(__file__))

from database import init_db, get_db
from services.market_data import get_current_price, get_atr, get_price_history, get_ticker_info, get_fx_rate, get_earnings_date, get_volatility_score, get_stock_details, get_stock_details_raw
from services.trailing_stop import check_all_positions, check_watchlist_alerts, refresh_position, calculate_stop_price
from scheduler import start_scheduler
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

app = FastAPI(title="Stockman API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────────────────

class PositionCreate(BaseModel):
    ticker: str
    shares: float
    avg_price: float
    date_bought: Optional[str] = None
    notes: Optional[str] = None
    trailing_stop_enabled: bool = True
    atr_multiplier: float = 2.5
    atr_period: int = 14
    target_price: Optional[float] = None

class PositionUpdate(BaseModel):
    shares: Optional[float] = None
    avg_price: Optional[float] = None
    date_bought: Optional[str] = None
    notes: Optional[str] = None
    trailing_stop_enabled: Optional[bool] = None
    atr_multiplier: Optional[float] = None
    atr_period: Optional[int] = None
    peak_price: Optional[float] = None
    target_price: Optional[float] = None

class WatchlistCreate(BaseModel):
    ticker: str
    notes: Optional[str] = None
    price_alert_above: Optional[float] = None
    price_alert_below: Optional[float] = None

class WatchlistUpdate(BaseModel):
    notes: Optional[str] = None
    price_alert_above: Optional[float] = None
    price_alert_below: Optional[float] = None
    alerted_above: Optional[bool] = None
    alerted_below: Optional[bool] = None

class JournalCreate(BaseModel):
    date: str
    ticker: str
    action: str  # BUY, SELL, TRIM, NOTE
    shares: Optional[float] = None
    price: Optional[float] = None
    reason: Optional[str] = None
    notes: Optional[str] = None

class SettingsUpdate(BaseModel):
    key: str
    value: str

class AIAnalyzeRequest(BaseModel):
    question: str
    mode: str = "default"

# ── Portfolio ─────────────────────────────────────────────────────────────────

def _enrich_position(pos):
    ticker = pos["ticker"]
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_price = ex.submit(get_current_price, ticker)
        f_earn  = ex.submit(get_earnings_date, ticker)
    price = f_price.result()
    pos["current_price"] = price
    pos["earnings"] = f_earn.result()
    if price:
        pos["market_value"] = round(price * pos["shares"], 2)
        pos["unrealized_pnl"] = round((price - pos["avg_price"]) * pos["shares"], 2)
        pos["unrealized_pnl_pct"] = round(((price - pos["avg_price"]) / pos["avg_price"]) * 100, 2)
        pos["stop_triggered"] = bool(pos["stop_price"] and price <= pos["stop_price"])
        pos["stop_warn_triggered"] = bool(pos.get("warn_price") and price <= pos["warn_price"])
    else:
        pos["market_value"] = pos["unrealized_pnl"] = pos["unrealized_pnl_pct"] = None
        pos["stop_triggered"] = pos["stop_warn_triggered"] = False
    return pos


@app.get("/api/portfolio")
def get_portfolio():
    conn = get_db()
    rows = conn.execute("SELECT * FROM positions ORDER BY created_at DESC").fetchall()
    conn.close()
    positions = [dict(r) for r in rows]
    with ThreadPoolExecutor(max_workers=min(len(positions), 8)) as ex:
        positions = list(ex.map(_enrich_position, positions))
    return positions


@app.post("/api/portfolio")
def add_position(data: PositionCreate):
    ticker = data.ticker.upper().strip()
    conn = get_db()

    # Get initial price data
    current_price = get_current_price(ticker)
    atr = get_atr(ticker, period=data.atr_period)
    peak_price = current_price or data.avg_price
    stop_price = None
    if peak_price and atr:
        stop_price = calculate_stop_price(peak_price, atr, data.atr_multiplier)

    conn.execute("""
        INSERT INTO positions (ticker, shares, avg_price, date_bought, notes,
            trailing_stop_enabled, atr_multiplier, atr_period, peak_price, stop_price, target_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (ticker, data.shares, data.avg_price, data.date_bought, data.notes,
          int(data.trailing_stop_enabled), data.atr_multiplier, data.atr_period,
          peak_price, stop_price, data.target_price))
    conn.commit()
    pos_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    row = conn.execute("SELECT * FROM positions WHERE id = ?", (pos_id,)).fetchone()
    conn.close()
    return dict(row)


@app.put("/api/portfolio/{pos_id}")
def update_position(pos_id: int, data: PositionUpdate):
    conn = get_db()
    pos = conn.execute("SELECT * FROM positions WHERE id = ?", (pos_id,)).fetchone()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")

    fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if "trailing_stop_enabled" in fields:
        fields["trailing_stop_enabled"] = int(fields["trailing_stop_enabled"])
    fields["updated_at"] = datetime.utcnow().isoformat()

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE positions SET {set_clause} WHERE id = ?",
                 list(fields.values()) + [pos_id])
    conn.commit()
    row = conn.execute("SELECT * FROM positions WHERE id = ?", (pos_id,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/portfolio/{pos_id}")
def delete_position(pos_id: int):
    conn = get_db()
    conn.execute("DELETE FROM positions WHERE id = ?", (pos_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/portfolio/{pos_id}/refresh")
def refresh_pos(pos_id: int):
    result = refresh_position(pos_id)
    if not result:
        raise HTTPException(status_code=404, detail="Position not found")
    return result


@app.post("/api/portfolio/{pos_id}/reset-alert")
def reset_alert(pos_id: int):
    conn = get_db()
    conn.execute("UPDATE positions SET alerted = 0 WHERE id = ?", (pos_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# ── Helpers: snapshot trend + data confidence ──────────────────────────────────

def get_snapshot_trend(ticker: str, conn):
    """Return trend direction for short_pct and inst_pct based on last 2 snapshots."""
    rows = conn.execute(
        "SELECT short_pct, inst_pct, date FROM stock_snapshots WHERE ticker=? ORDER BY date DESC LIMIT 2",
        (ticker,)
    ).fetchall()
    if len(rows) < 2:
        return {"short_trend": "tracking", "inst_trend": "tracking", "snapshots": len(rows)}
    latest, prev = dict(rows[0]), dict(rows[1])
    def trend(new, old):
        if new is None or old is None:
            return "unknown"
        diff = new - old
        if abs(diff) < 0.5:
            return "stable"
        return "up" if diff > 0 else "down"
    return {
        "short_trend": trend(latest["short_pct"], prev["short_pct"]),
        "inst_trend": trend(latest["inst_pct"], prev["inst_pct"]),
        "snapshots": len(rows),
        "latest_date": latest["date"],
        "prev_date": prev["date"],
    }


def assess_confidence(short_pct, inst_pct, float_shares, shares_outstanding, days_to_cover=None):
    """Flag data quality issues."""
    issues = []
    if inst_pct is not None and inst_pct > 95:
        issues.append("inst% >95 — likely double-counted")
    if short_pct is not None and inst_pct is not None and (short_pct + inst_pct) > 110:
        issues.append("short%+inst% >110 — data overlap")
    if short_pct is not None and short_pct > 50:
        issues.append("short% >50 — verify source")
    if float_shares is not None and shares_outstanding is not None and float_shares > shares_outstanding * 1.05:
        issues.append("float > outstanding — bad data")
    if float_shares is None:
        issues.append("float unavailable")
    if days_to_cover is not None and days_to_cover > 10:
        issues.append(f"days to cover {days_to_cover:.1f} — shorts are trapped, squeeze risk")
    return {"ok": len(issues) == 0, "issues": issues}


# ── Watchlist ─────────────────────────────────────────────────────────────────

def _enrich_watchlist_item(item):
    ticker = item["ticker"]
    # Fetch all data in parallel for this ticker
    with ThreadPoolExecutor(max_workers=4) as ex:
        f_price   = ex.submit(get_current_price, ticker)
        f_earn    = ex.submit(get_earnings_date, ticker)
        f_vol     = ex.submit(get_volatility_score, ticker)
        f_atr     = ex.submit(get_atr, ticker)
        f_details = ex.submit(get_stock_details_raw, ticker)  # single call covers both formatted + raw
    item["current_price"] = f_price.result()
    item["earnings"]      = f_earn.result()
    item["volatility"]    = f_vol.result()
    item["atr"]           = f_atr.result()
    d = f_details.result()
    item["short_pct"]     = d.get("short_pct")
    item["float"]         = d.get("float")
    item["inst_pct"]      = d.get("inst_pct")
    item["days_to_cover"] = d.get("days_to_cover")
    item["confidence"]    = assess_confidence(
        d.get("short_pct"), d.get("inst_pct"),
        d.get("float_shares"), d.get("shares_outstanding"),
        d.get("days_to_cover")
    )
    snap_conn = get_db()
    item["trend"] = get_snapshot_trend(ticker, snap_conn)
    snap_conn.close()
    return item


@app.get("/api/watchlist")
def get_watchlist():
    conn = get_db()
    rows = conn.execute("SELECT * FROM watchlist ORDER BY created_at DESC").fetchall()
    conn.close()
    items = [dict(r) for r in rows]
    with ThreadPoolExecutor(max_workers=min(len(items), 8)) as ex:
        items = list(ex.map(_enrich_watchlist_item, items))
    return items


@app.post("/api/snapshots/take")
def manual_snapshot():
    from scheduler import take_snapshots
    import threading
    t = threading.Thread(target=take_snapshots, daemon=True)
    t.start()
    return {"ok": True, "message": "Snapshot started in background"}


# ── Export ────────────────────────────────────────────────────────────────────

@app.get("/api/export")
def export_data():
    conn = get_db()

    # Portfolio
    positions = [dict(r) for r in conn.execute("SELECT * FROM positions ORDER BY created_at").fetchall()]
    for p in positions:
        price = p.get("current_price") or get_current_price(p["ticker"])
        p["current_price"] = price
        if price:
            p["market_value_usd"] = round(price * p["shares"], 2)
            p["unrealized_pnl_usd"] = round((price - p["avg_price"]) * p["shares"], 2)
            p["unrealized_pnl_pct"] = round(((price - p["avg_price"]) / p["avg_price"]) * 100, 2)
        p["earnings"] = get_earnings_date(p["ticker"])

    # Journal
    journal = [dict(r) for r in conn.execute("SELECT * FROM journal ORDER BY date DESC").fetchall()]

    # Watchlist
    watchlist = [dict(r) for r in conn.execute("SELECT * FROM watchlist ORDER BY created_at").fetchall()]
    for w in watchlist:
        w["current_price"] = get_current_price(w["ticker"])
        details = get_stock_details(w["ticker"])
        w.update(details)

    # Snapshots grouped by ticker
    snap_rows = conn.execute("SELECT * FROM stock_snapshots ORDER BY ticker, date").fetchall()
    snapshots = {}
    for row in snap_rows:
        d = dict(row)
        t = d.pop("ticker")
        snapshots.setdefault(t, []).append(d)

    conn.close()

    # Summary
    total_value = sum(p.get("market_value_usd") or 0 for p in positions)
    total_pnl = sum(p.get("unrealized_pnl_usd") or 0 for p in positions)
    total_cost = sum(p["avg_price"] * p["shares"] for p in positions)

    return {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "stockman_version": "1.0",
        "instructions_for_ai": (
            "This is a Stockman portfolio export. It contains: portfolio positions with P&L and trailing stop levels, "
            "a trade journal, watchlist with short interest and institutional ownership data, "
            "weekly snapshots of short interest trends, and per-position signal scores (0-100, where >30 = sell signal). "
            "Please analyze this data and answer questions about risk, performance patterns, and decision-making."
        ),
        "summary": {
            "total_positions": len(positions),
            "total_market_value_usd": round(total_value, 2),
            "total_cost_basis_usd": round(total_cost, 2),
            "total_unrealized_pnl_usd": round(total_pnl, 2),
            "total_unrealized_pnl_pct": round((total_pnl / total_cost * 100) if total_cost else 0, 2),
            "watchlist_count": len(watchlist),
            "journal_entries": len(journal),
            "snapshot_tickers": len(snapshots),
        },
        "portfolio": positions,
        "journal": journal,
        "watchlist": watchlist,
        "snapshots": snapshots,
    }


@app.post("/api/watchlist")
def add_watchlist(data: WatchlistCreate):
    ticker = data.ticker.upper().strip()
    conn = get_db()
    conn.execute("""
        INSERT INTO watchlist (ticker, notes, price_alert_above, price_alert_below)
        VALUES (?, ?, ?, ?)
    """, (ticker, data.notes, data.price_alert_above, data.price_alert_below))
    conn.commit()
    item_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    row = conn.execute("SELECT * FROM watchlist WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@app.put("/api/watchlist/{item_id}")
def update_watchlist(item_id: int, data: WatchlistUpdate):
    conn = get_db()
    fields = {k: v for k, v in data.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE watchlist SET {set_clause} WHERE id = ?",
                 list(fields.values()) + [item_id])
    conn.commit()
    row = conn.execute("SELECT * FROM watchlist WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/watchlist/{item_id}")
def delete_watchlist(item_id: int):
    conn = get_db()
    conn.execute("DELETE FROM watchlist WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# ── Journal ───────────────────────────────────────────────────────────────────

@app.get("/api/journal")
def get_journal():
    conn = get_db()
    rows = conn.execute("SELECT * FROM journal ORDER BY date DESC, created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/journal")
def add_journal(data: JournalCreate):
    conn = get_db()
    conn.execute("""
        INSERT INTO journal (date, ticker, action, shares, price, reason, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (data.date, data.ticker.upper(), data.action.upper(),
          data.shares, data.price, data.reason, data.notes))
    conn.commit()
    entry_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    row = conn.execute("SELECT * FROM journal WHERE id = ?", (entry_id,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/journal/{entry_id}")
def delete_journal(entry_id: int):
    conn = get_db()
    conn.execute("DELETE FROM journal WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
def get_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    settings = {r["key"]: r["value"] for r in rows}
    # Never expose password in full
    if settings.get("email_password"):
        settings["email_password_set"] = True
        settings["email_password"] = "••••••••••••••••"
    else:
        settings["email_password_set"] = False
    # Never expose Anthropic API key in full
    if settings.get("anthropic_api_key"):
        settings["anthropic_api_key_set"] = True
        settings["anthropic_api_key"] = "sk-ant-••••••••••••••••"
    else:
        settings["anthropic_api_key_set"] = False
    return settings


@app.post("/api/settings")
def update_settings(data: SettingsUpdate):
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                 (data.key, data.value))
    conn.commit()
    conn.close()
    return {"ok": True}

# ── Market Data ───────────────────────────────────────────────────────────────

@app.get("/api/price/{ticker}")
def get_price(ticker: str):
    price = get_current_price(ticker.upper())
    atr = get_atr(ticker.upper())
    info = get_ticker_info(ticker.upper())
    if price is None:
        raise HTTPException(status_code=404, detail="Ticker not found or market data unavailable")
    return {"ticker": ticker.upper(), "price": price, "atr": atr, "info": info}


@app.get("/api/history/{ticker}")
def get_history(ticker: str, days: int = 60):
    return get_price_history(ticker.upper(), days)


@app.get("/api/fx/eurusd")
def get_eurusd():
    rate = get_fx_rate("EURUSD=X")
    if rate is None:
        raise HTTPException(status_code=503, detail="FX rate unavailable")
    return {"pair": "EURUSD", "rate": rate}


@app.get("/api/volatility/{ticker}")
def get_volatility(ticker: str):
    return get_volatility_score(ticker.upper())


@app.get("/api/details/{ticker}")
def get_details(ticker: str):
    return get_stock_details(ticker.upper())


# ── CSV Import (Nordnet) ──────────────────────────────────────────────────────

@app.post("/api/import/csv/preview")
async def import_csv_preview(file: UploadFile = File(...)):
    import csv, io as _io

    content = await file.read()

    # Nordnet exports UTF-16 LE with BOM, tab-delimited
    try:
        text = content.decode('utf-16')
    except Exception:
        try:
            text = content.decode('utf-8-sig')
        except Exception:
            text = content.decode('latin-1', errors='replace')

    all_rows = list(csv.reader(_io.StringIO(text), delimiter='\t'))

    # Drop empty leading rows (BOM artefact)
    while all_rows and not any(c.strip() for c in all_rows[0]):
        all_rows.pop(0)

    if len(all_rows) < 2:
        raise HTTPException(status_code=400, detail="No data rows found in CSV.")

    # Column indices for Nordnet format (0-based)
    DATE_COL      = 2   # Kauppapäivä
    TYPE_COL      = 5   # Tapahtumatyyppi
    SECURITY_COL  = 6   # Arvopaperi
    ISIN_COL      = 7   # ISIN
    SHARES_COL    = 8   # Määrä
    PRICE_COL     = 9   # Kurssi
    CURRENCY_COL  = 12  # First Valuutta (after Kokonaiskulut)
    FEE_COL       = 26  # Välityspalkkio

    def parse_num(s):
        if not s:
            return None
        s = s.strip().replace('\xa0', '').replace(' ', '').replace(' ', '')
        if not s or s in ('-', ''):
            return None
        if ',' in s and '.' in s:
            s = s.replace('.', '').replace(',', '.')
        elif ',' in s:
            s = s.replace(',', '.')
        try:
            return float(s)
        except ValueError:
            return None

    def safe_col(row, idx):
        return row[idx].strip() if idx < len(row) else ''

    tx_rows = []
    companies = {}  # security_name → suggested_ticker

    for row in all_rows[1:]:
        tx_type = safe_col(row, TYPE_COL)
        if tx_type not in ('OSTO', 'MYYNTI', 'OSINKO'):
            continue

        security = safe_col(row, SECURITY_COL)
        if not security:
            continue

        shares = parse_num(safe_col(row, SHARES_COL))
        price  = parse_num(safe_col(row, PRICE_COL))
        fee    = parse_num(safe_col(row, FEE_COL))
        date   = safe_col(row, DATE_COL)
        isin   = safe_col(row, ISIN_COL)
        currency = safe_col(row, CURRENCY_COL)

        action = {'OSTO': 'BUY', 'MYYNTI': 'SELL', 'OSINKO': 'DIVIDEND'}[tx_type]

        if security not in companies:
            companies[security] = {'ticker': '', 'isin': isin}

        tx_rows.append({
            'date': date,
            'action': action,
            'security_name': security,
            'isin': isin,
            'shares': abs(shares) if shares is not None else None,
            'price': price,
            'currency': currency,
            'fee': fee,
        })

    # Auto-suggest tickers via yfinance search (parallel, capped at 5 concurrent)
    import yfinance as yf

    def guess_ticker(name):
        try:
            results = yf.Search(name, max_results=1).quotes
            if results:
                sym = results[0].get('symbol', '')
                # Prefer plain symbol without exchange suffix
                return sym.split('.')[0] if '.' in sym else sym
        except Exception:
            pass
        return ''

    unique_names = list(companies.keys())
    with ThreadPoolExecutor(max_workers=min(len(unique_names), 5)) as ex:
        tickers = list(ex.map(guess_ticker, unique_names))
    for name, ticker in zip(unique_names, tickers):
        companies[name]['ticker'] = ticker

    return {
        'rows': tx_rows,
        'companies': {k: v['ticker'] for k, v in companies.items()},
        'total': len(tx_rows),
    }


class ImportRow(BaseModel):
    date: str
    action: str
    ticker: str
    security_name: Optional[str] = None
    shares: Optional[float] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    fee: Optional[float] = None

class ImportConfirmRequest(BaseModel):
    rows: list

@app.post("/api/import/csv/confirm")
def import_csv_confirm(data: ImportConfirmRequest):
    conn = get_db()
    added = 0
    skipped = 0
    for row in data.rows:
        ticker = (row.get('ticker') or '').strip().upper()
        date   = (row.get('date') or '').strip()
        action = (row.get('action') or '').strip()
        if not ticker or not date or not action:
            skipped += 1
            continue
        # Map DIVIDEND → NOTE for journal
        journal_action = 'NOTE' if action == 'DIVIDEND' else action
        shares = row.get('shares')
        price  = row.get('price')
        currency = row.get('currency') or ''
        fee    = row.get('fee')
        name   = row.get('security_name') or ''
        fee_str = f" | fee: {fee} {currency}" if fee else ""
        notes  = f"{name}{fee_str}".strip(" |")
        try:
            conn.execute("""
                INSERT INTO journal (date, ticker, action, shares, price, reason, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (date, ticker, journal_action, shares, price, 'CSV import', notes or None))
            added += 1
        except Exception:
            skipped += 1
    conn.commit()
    conn.close()
    return {'added': added, 'skipped': skipped}


@app.post("/api/run-checks")
def manual_run_checks():
    result = check_all_positions()
    watchlist = check_watchlist_alerts()
    return {"positions": result, "watchlist": watchlist}

# ── AI Analysis ──────────────────────────────────────────────────────────────

@app.post("/api/ai-analyze")
def ai_analyze(data: AIAnalyzeRequest):
    conn = get_db()
    key_row = conn.execute("SELECT value FROM settings WHERE key='anthropic_api_key'").fetchone()
    api_key = (key_row["value"] or "").strip() if key_row else ""

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Anthropic API key not configured. Add it in Settings → AI Analysis."
        )

    # Gather portfolio data from DB (fast)
    positions = [dict(r) for r in conn.execute("SELECT * FROM positions ORDER BY created_at").fetchall()]
    journal   = [dict(r) for r in conn.execute("SELECT * FROM journal ORDER BY date DESC LIMIT 100").fetchall()]
    watchlist = [dict(r) for r in conn.execute("SELECT * FROM watchlist ORDER BY created_at").fetchall()]

    # Snapshot trends per watchlist ticker
    snap_rows = conn.execute(
        "SELECT * FROM stock_snapshots ORDER BY ticker, date DESC"
    ).fetchall()
    snapshots = {}
    for row in snap_rows:
        d = dict(row)
        t = d.pop("ticker")
        if t not in snapshots:
            snapshots[t] = []
        if len(snapshots[t]) < 3:          # last 3 snapshots per ticker
            snapshots[t].append(d)
    conn.close()

    # Enrich positions with live prices in parallel
    def _enrich(pos):
        try:
            price = get_current_price(pos["ticker"])
            pos["current_price"] = price
            if price:
                pos["current_value"]     = round(price * pos["shares"], 2)
                pos["unrealized_pnl"]    = round((price - pos["avg_price"]) * pos["shares"], 2)
                pos["unrealized_pnl_pct"]= round(((price - pos["avg_price"]) / pos["avg_price"]) * 100, 2)
                pos["stop_triggered"]    = bool(pos.get("stop_price") and price <= pos["stop_price"])
        except Exception:
            pos["current_price"] = None
        return pos

    with ThreadPoolExecutor(max_workers=min(len(positions), 8)) as ex:
        positions = list(ex.map(_enrich, positions))

    total_cost  = sum(p["avg_price"] * p["shares"] for p in positions)
    total_value = sum((p.get("current_value") or p["avg_price"] * p["shares"]) for p in positions)
    total_pnl   = total_value - total_cost

    portfolio_data = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "summary": {
            "total_positions": len(positions),
            "total_cost_basis": round(total_cost, 2),
            "total_current_value": round(total_value, 2),
            "total_unrealized_pnl": round(total_pnl, 2),
            "total_unrealized_pnl_pct": round((total_pnl / total_cost * 100) if total_cost else 0, 2),
        },
        "positions": positions,
        "journal": journal,
        "watchlist": watchlist,
        "short_interest_snapshots": snapshots,
    }

    if data.mode == "bear":
        system_prompt = (
            "You are a ruthless risk analyst conducting a bear case review of this personal stock portfolio. "
            "Your ONLY job is to find everything that is wrong, weak, or dangerous. "
            "The user already knows what is working — they need brutal honesty about what is not.\n\n"
            "Rules for this analysis:\n"
            "- Do NOT acknowledge strengths or what looks good. Focus entirely on problems.\n"
            "- Be direct and specific — name actual tickers, cite actual numbers, percentages, and stop levels.\n"
            "- Dig into every dimension of risk:\n"
            "  1. MISSING EXIT POINTS — this is critical: check each position for a target_price field. "
            "Any position where target_price is null or missing has NO defined exit plan. "
            "The investor bought without knowing when to sell the winner. Name every position missing a target price. "
            "Explain why this is dangerous: without a profit target, positions are held forever and gains evaporate.\n"
            "  2. OVEREXPOSURE — sector/theme/style concentration, correlated positions that will all fall together\n"
            "  3. STOP RISK — positions closest to trailing stop levels; quantify exactly how much downside is left in dollars and %\n"
            "  4. VALUATION / MOMENTUM — any positions that look extended, parabolic, or showing weakness\n"
            "  5. JOURNAL PATTERNS — bad habits: averaging down, holding losers, cutting winners too early, FOMO entries, overtrading\n"
            "  6. SINGLE POINTS OF FAILURE — what one event or market move would destroy this portfolio?\n"
            "  7. WATCHLIST RISK — are any watched stocks signaling danger (high short interest, deteriorating data)?\n"
            "  8. WHAT SHOULD BE CUT — name specific positions the investor should seriously consider exiting and why\n\n"
            "End with a blunt verdict: overall fragility score (1=robust to 10=fragile) and the single #1 most urgent fix."
        )
    else:
        system_prompt = (
            "You are a financial analysis assistant built into Stockman, a personal stock portfolio tracker. "
            "The user has shared their complete portfolio data including positions with P&L and trailing ATR stops, "
            "a trade journal, watchlist stocks with short interest data, and historical snapshots.\n\n"
            "Your role:\n"
            "- Analyze the data objectively and give clear, actionable insights\n"
            "- Be specific — use actual numbers, tickers, and percentages from the data\n"
            "- Highlight risks: concentration, positions near stops, high short interest, etc.\n"
            "- Flag patterns in the journal (selling too early, overtrading, etc.) if visible\n"
            "- Keep responses well-structured with headers or bullet points where helpful\n"
            "- This is a personal portfolio tracker, not professional financial advice"
        )

    user_msg = f"Here is my current portfolio data:\n\n{json.dumps(portfolio_data, indent=2)}\n\nQuestion: {data.question}"

    def generate():
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            with client.messages.stream(
                model="claude-opus-4-7",
                max_tokens=4096,
                thinking={"type": "adaptive"},
                system=system_prompt,
                messages=[{"role": "user", "content": user_msg}],
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Backup / Restore ─────────────────────────────────────────────────────────

@app.get("/api/backup")
def backup_db():
    from database import DB_PATH
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database not found")
    filename = f"stockman_backup_{datetime.utcnow().strftime('%Y-%m-%d')}.db"
    return FileResponse(DB_PATH, media_type="application/octet-stream", filename=filename)


@app.post("/api/restore")
async def restore_db(file: UploadFile = File(...)):
    from database import DB_PATH, init_db
    # Validate it's a real SQLite file by checking magic bytes
    header = await file.read(16)
    if header[:16] != b"SQLite format 3\x00":
        raise HTTPException(status_code=400, detail="Not a valid SQLite database file")
    await file.seek(0)
    # Write to temp file first, then replace
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    try:
        content = await file.read()
        tmp.write(header + content)
        tmp.close()
        shutil.copy2(tmp.path if hasattr(tmp, 'path') else tmp.name, DB_PATH)
    finally:
        os.unlink(tmp.name)
    return {"ok": True, "message": "Database restored. Restart Stockman to ensure all connections are refreshed."}


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    init_db()
    start_scheduler()

# Serve frontend build
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(frontend_dist, "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        index = os.path.join(frontend_dist, "index.html")
        return FileResponse(index)
