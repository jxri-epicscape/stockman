import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "stockman.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            shares REAL NOT NULL,
            avg_price REAL NOT NULL,
            date_bought TEXT,
            notes TEXT,
            trailing_stop_enabled INTEGER DEFAULT 1,
            atr_multiplier REAL DEFAULT 2.5,
            atr_period INTEGER DEFAULT 14,
            peak_price REAL,
            stop_price REAL,
            alerted INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            notes TEXT,
            price_alert_above REAL,
            price_alert_below REAL,
            alerted_above INTEGER DEFAULT 0,
            alerted_below INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            ticker TEXT NOT NULL,
            action TEXT NOT NULL,
            shares REAL,
            price REAL,
            reason TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Default settings
    defaults = [
        ("email_to", ""),
        ("email_from", ""),
        ("email_password", ""),
        ("default_atr_multiplier", "2.5"),
        ("default_atr_period", "14"),
        ("alerts_enabled", "1"),
    ]
    for key, value in defaults:
        c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))

    c.execute("""
        CREATE TABLE IF NOT EXISTS stock_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            date TEXT NOT NULL,
            short_pct REAL,
            float_shares REAL,
            inst_pct REAL,
            shares_outstanding REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticker, date)
        )
    """)

    # Migrations
    try:
        c.execute("ALTER TABLE positions ADD COLUMN alerted_warn INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        c.execute("ALTER TABLE positions ADD COLUMN warn_price REAL")
    except Exception:
        pass

    conn.commit()
    conn.close()
