from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from services.trailing_stop import check_all_positions, check_watchlist_alerts
from services.market_data import is_market_open, get_stock_details_raw
from database import get_db
from datetime import date
import logging
import threading

logger = logging.getLogger(__name__)


def run_checks():
    if not is_market_open():
        logger.info("Market closed, skipping check.")
        return
    logger.info("Running hourly price check...")
    result = check_all_positions()
    watchlist_result = check_watchlist_alerts()
    logger.info(f"Updated: {result['updated']}, Triggered stops: {result['triggered']}")
    logger.info(f"Watchlist alerts: {watchlist_result}")


def take_snapshots():
    """Store weekly snapshot of short%, float, inst% for all tracked tickers."""
    today = date.today().isoformat()
    conn = get_db()
    tickers = set()
    for row in conn.execute("SELECT ticker FROM positions").fetchall():
        tickers.add(row["ticker"])
    for row in conn.execute("SELECT ticker FROM watchlist").fetchall():
        tickers.add(row["ticker"])
    conn.close()

    logger.info(f"Taking snapshots for {len(tickers)} tickers...")
    for ticker in tickers:
        try:
            d = get_stock_details_raw(ticker)
            conn = get_db()
            conn.execute("""
                INSERT OR REPLACE INTO stock_snapshots
                    (ticker, date, short_pct, float_shares, inst_pct, shares_outstanding)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (ticker, today, d['short_pct'], d['float_shares'], d['inst_pct'], d['shares_outstanding']))
            conn.commit()
            conn.close()
            logger.info(f"Snapshot saved: {ticker}")
        except Exception as e:
            logger.warning(f"Snapshot failed for {ticker}: {e}")


def start_scheduler():
    scheduler = BackgroundScheduler()

    scheduler.add_job(
        run_checks,
        CronTrigger(day_of_week="mon-fri", hour="14-21", minute="0"),
        id="hourly_check",
        replace_existing=True,
    )

    # Weekly snapshot every Monday at 08:00 UTC
    scheduler.add_job(
        take_snapshots,
        CronTrigger(day_of_week="mon", hour="8", minute="0"),
        id="weekly_snapshot",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started — hourly checks Mon-Fri, weekly snapshots Monday 08:00 UTC")

    # Take an immediate snapshot in background on startup (no delay to UI)
    t = threading.Thread(target=take_snapshots, daemon=True)
    t.start()

    return scheduler
