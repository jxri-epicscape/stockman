from services.market_data import get_current_price, get_atr
from database import get_db
from services.email_service import send_hard_stop_alert, send_warn_alert, send_price_alert
from datetime import datetime


def calculate_stop_price(peak_price: float, atr: float, multiplier: float) -> float:
    return round(peak_price - (atr * multiplier), 4)


def calculate_warn_price(peak_price: float, atr: float, multiplier: float) -> float:
    return round(peak_price - (atr * multiplier), 4)


def check_all_positions():
    """Called by scheduler every hour. Updates peak prices and checks stops."""
    conn = get_db()
    positions = conn.execute(
        "SELECT * FROM positions WHERE trailing_stop_enabled = 1"
    ).fetchall()

    updated = []
    triggered = []

    for pos in positions:
        ticker = pos["ticker"]
        current_price = get_current_price(ticker)
        if current_price is None:
            continue

        atr = get_atr(ticker, period=pos["atr_period"])
        if atr is None:
            continue

        peak_price = pos["peak_price"] or pos["avg_price"]

        # Update peak if price is higher
        new_peak = max(peak_price, current_price)
        multiplier = pos["atr_multiplier"]

        # warning stop = peak - (atr × multiplier)
        warn_price = calculate_warn_price(new_peak, atr, multiplier)
        # hard stop = peak - (atr × (multiplier + 1.0))
        stop_price = calculate_stop_price(new_peak, atr, multiplier + 1.0)

        # Check trigger states
        stop_triggered = current_price <= stop_price
        warn_triggered = current_price <= warn_price and current_price > stop_price
        already_alerted = bool(pos["alerted"])
        already_warned = bool(pos["alerted_warn"]) if "alerted_warn" in pos.keys() else False

        conn.execute("""
            UPDATE positions
            SET peak_price = ?, stop_price = ?, warn_price = ?, updated_at = ?
            WHERE id = ?
        """, (new_peak, stop_price, warn_price, datetime.utcnow().isoformat(), pos["id"]))

        if stop_triggered and not already_alerted:
            conn.execute("UPDATE positions SET alerted = 1 WHERE id = ?", (pos["id"],))
            send_hard_stop_alert(
                ticker=ticker,
                shares=pos["shares"],
                avg_price=pos["avg_price"],
                current_price=current_price,
                stop_price=stop_price,
                peak_price=new_peak,
                atr=atr,
            )
            triggered.append(ticker)
        elif not stop_triggered and already_alerted:
            # Reset hard alert if price recovers above hard stop
            conn.execute("UPDATE positions SET alerted = 0 WHERE id = ?", (pos["id"],))

        if warn_triggered and not already_warned:
            conn.execute("UPDATE positions SET alerted_warn = 1 WHERE id = ?", (pos["id"],))
            send_warn_alert(
                ticker=ticker,
                shares=pos["shares"],
                avg_price=pos["avg_price"],
                current_price=current_price,
                warn_price=warn_price,
                hard_price=stop_price,
                peak_price=new_peak,
                atr=atr,
            )
        elif not warn_triggered and already_warned:
            # Reset warn alert if price recovers above warn stop
            conn.execute("UPDATE positions SET alerted_warn = 0 WHERE id = ?", (pos["id"],))

        updated.append(ticker)

    conn.commit()
    conn.close()

    return {"updated": updated, "triggered": triggered}


def check_watchlist_alerts():
    """Check price alerts on watchlist items."""
    conn = get_db()
    items = conn.execute("SELECT * FROM watchlist").fetchall()

    triggered = []
    for item in items:
        ticker = item["ticker"]
        current_price = get_current_price(ticker)
        if current_price is None:
            continue

        if item["price_alert_above"] and not item["alerted_above"]:
            if current_price >= item["price_alert_above"]:
                send_price_alert(ticker, current_price, item["price_alert_above"], "above")
                conn.execute("UPDATE watchlist SET alerted_above = 1 WHERE id = ?", (item["id"],))
                triggered.append(f"{ticker} above {item['price_alert_above']}")

        if item["price_alert_below"] and not item["alerted_below"]:
            if current_price <= item["price_alert_below"]:
                send_price_alert(ticker, current_price, item["price_alert_below"], "below")
                conn.execute("UPDATE watchlist SET alerted_below = 1 WHERE id = ?", (item["id"],))
                triggered.append(f"{ticker} below {item['price_alert_below']}")

    conn.commit()
    conn.close()
    return triggered


def refresh_position(position_id: int):
    """Refresh a single position's price and stop data."""
    conn = get_db()
    pos = conn.execute("SELECT * FROM positions WHERE id = ?", (position_id,)).fetchone()
    if not pos:
        conn.close()
        return None

    ticker = pos["ticker"]
    current_price = get_current_price(ticker)
    atr = get_atr(ticker, period=pos["atr_period"])

    if current_price and atr:
        peak_price = max(pos["peak_price"] or pos["avg_price"], current_price)
        multiplier = pos["atr_multiplier"]
        warn_price = calculate_warn_price(peak_price, atr, multiplier)
        stop_price = calculate_stop_price(peak_price, atr, multiplier + 1.0)
        conn.execute("""
            UPDATE positions SET peak_price = ?, stop_price = ?, warn_price = ?, updated_at = ? WHERE id = ?
        """, (peak_price, stop_price, warn_price, datetime.utcnow().isoformat(), position_id))
        conn.commit()

    conn.close()
    return {"current_price": current_price, "atr": atr}
