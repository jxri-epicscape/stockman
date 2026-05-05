from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import os
import sys
import shutil
import tempfile

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

class PositionUpdate(BaseModel):
    shares: Optional[float] = None
    avg_price: Optional[float] = None
    date_bought: Optional[str] = None
    notes: Optional[str] = None
    trailing_stop_enabled: Optional[bool] = None
    atr_multiplier: Optional[float] = None
    atr_period: Optional[int] = None
    peak_price: Optional[float] = None

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
            trailing_stop_enabled, atr_multiplier, atr_period, peak_price, stop_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (ticker, data.shares, data.avg_price, data.date_bought, data.notes,
          int(data.trailing_stop_enabled), data.atr_multiplier, data.atr_period,
          peak_price, stop_price))
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


@app.post("/api/run-checks")
def manual_run_checks():
    result = check_all_positions()
    watchlist = check_watchlist_alerts()
    return {"positions": result, "watchlist": watchlist}

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
