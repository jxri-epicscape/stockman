import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta, timezone
import time

# ── Simple TTL cache ───────────────────────────────────────────────────────────
_cache: dict = {}

def _cached(key: str, ttl: int, fn):
    now = time.time()
    if key in _cache:
        val, ts = _cache[key]
        if now - ts < ttl:
            return val
    val = fn()
    _cache[key] = (val, now)
    return val


def get_current_price(ticker: str) -> float | None:
    def _fetch():
        try:
            t = yf.Ticker(ticker)
            data = t.history(period="1d", interval="1m")
            if not data.empty:
                return round(float(data["Close"].iloc[-1]), 4)
            info = t.fast_info
            return round(float(info.last_price), 4)
        except Exception:
            return None
    return _cached(f"price:{ticker}", 300, _fetch)  # 5 min


def get_atr(ticker: str, period: int = 14) -> float | None:
    def _fetch():
        try:
            t = yf.Ticker(ticker)
            data = t.history(period=f"{period + 10}d")
            if len(data) < period + 1:
                return None
            high, low, close = data["High"], data["Low"], data["Close"]
            prev_close = close.shift(1)
            tr = pd.concat([
                high - low,
                (high - prev_close).abs(),
                (low - prev_close).abs()
            ], axis=1).max(axis=1)
            return round(float(tr.rolling(window=period).mean().iloc[-1]), 4)
        except Exception:
            return None
    return _cached(f"atr:{ticker}:{period}", 3600, _fetch)  # 1 hour


def get_price_history(ticker: str, days: int = 60) -> list[dict]:
    try:
        t = yf.Ticker(ticker)
        data = t.history(period=f"{days}d")
        result = []
        for date, row in data.iterrows():
            result.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 4),
                "high": round(float(row["High"]), 4),
                "low": round(float(row["Low"]), 4),
                "close": round(float(row["Close"]), 4),
                "volume": int(row["Volume"]),
            })
        return result
    except Exception:
        return []


def get_ticker_info(ticker: str) -> dict | None:
    try:
        t = yf.Ticker(ticker)
        info = t.info
        return {
            "name": info.get("longName") or info.get("shortName", ticker),
            "sector": info.get("sector", ""),
            "currency": info.get("currency", "USD"),
        }
    except Exception:
        return None


def get_earnings_date(ticker: str) -> dict | None:
    return _cached(f"earnings:{ticker}", 14400, lambda: _fetch_earnings(ticker))  # 4 hours

def _fetch_earnings(ticker: str) -> dict | None:
    """Return next earnings date and days until it."""
    try:
        t = yf.Ticker(ticker)
        now = datetime.now(timezone.utc)

        # Try calendar first (most reliable for next date)
        cal = t.calendar
        if cal and "Earnings Date" in cal:
            dates = cal["Earnings Date"]
            if not isinstance(dates, list):
                dates = [dates]
            # Pick the first future date
            for d in sorted(dates):
                if hasattr(d, 'tzinfo') and d.tzinfo is None:
                    d = d.replace(tzinfo=timezone.utc)
                elif not hasattr(d, 'tzinfo'):
                    d = datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc)
                if d >= now:
                    days = (d.date() - now.date()).days
                    return {"date": d.strftime("%Y-%m-%d"), "days": days}

        # Fallback: earnings_dates DataFrame
        ed = t.earnings_dates
        if ed is not None and not ed.empty:
            for idx in ed.index:
                if hasattr(idx, 'tzinfo') and idx.tzinfo is None:
                    idx_aware = idx.replace(tzinfo=timezone.utc)
                else:
                    idx_aware = idx
                if idx_aware >= now:
                    days = (idx_aware.date() - now.date()).days
                    return {"date": idx_aware.strftime("%Y-%m-%d"), "days": days}

        return None
    except Exception:
        return None


def _fetch_all_details(ticker: str) -> dict:
    """Single yfinance call returning both raw and formatted details."""
    try:
        info = yf.Ticker(ticker).info
        short_pct = info.get('shortPercentOfFloat')
        float_shares = info.get('floatShares')
        inst_pct = info.get('institutionsPercentHeld') or info.get('heldPercentInstitutions')
        shares_outstanding = info.get('sharesOutstanding')
        days_to_cover = info.get('shortRatio')

        def fmt_large(n):
            if n is None: return None
            if n >= 1_000_000_000: return f"{n/1_000_000_000:.1f}B"
            if n >= 1_000_000: return f"{n/1_000_000:.1f}M"
            return f"{int(n):,}"

        return {
            # formatted
            'short_pct': round(short_pct * 100, 1) if short_pct is not None else None,
            'float': fmt_large(float_shares),
            'inst_pct': round(inst_pct * 100, 1) if inst_pct is not None else None,
            'days_to_cover': round(days_to_cover, 1) if days_to_cover is not None else None,
            # raw
            'float_shares': float(float_shares) if float_shares is not None else None,
            'shares_outstanding': float(shares_outstanding) if shares_outstanding is not None else None,
        }
    except Exception:
        return {'short_pct': None, 'float': None, 'inst_pct': None, 'days_to_cover': None,
                'float_shares': None, 'shares_outstanding': None}


def get_stock_details_raw(ticker: str) -> dict:
    return _cached(f"details:{ticker}", 86400, lambda: _fetch_all_details(ticker))  # 24 hours


def get_stock_details(ticker: str) -> dict:
    """Return short %, float shares, and institutional ownership %."""
    return _cached(f"details:{ticker}", 86400, lambda: _fetch_all_details(ticker))  # reuses same cache


def get_fx_rate(pair: str = "EURUSD=X") -> float | None:
    """Return e.g. 1.08 meaning 1 EUR = 1.08 USD."""
    try:
        t = yf.Ticker(pair)
        data = t.history(period="1d", interval="1m")
        if not data.empty:
            return round(float(data["Close"].iloc[-1]), 6)
        info = t.fast_info
        return round(float(info.last_price), 6)
    except Exception:
        return None


def get_volatility_score(ticker: str) -> dict:
    def _fetch():
        try:
            t = yf.Ticker(ticker)
            data = t.history(period="1y")
            if len(data) < 20:
                return {"count": 0, "level": "green", "label": "Low"}
            closes = data["Close"]
            daily_returns = closes.pct_change().dropna()
            big_moves = int((daily_returns.abs() > 0.05).sum())
            if big_moves >= 50:
                level, label = "red", "High"
            elif big_moves >= 10:
                level, label = "orange", "Med"
            else:
                level, label = "green", "Low"
            return {"count": big_moves, "level": level, "label": label}
        except Exception:
            return {"count": 0, "level": "green", "label": "?"}
    return _cached(f"vol:{ticker}", 21600, _fetch)  # 6 hours


def is_market_open() -> bool:
    now = datetime.utcnow()
    # NYSE hours: 9:30 AM - 4:00 PM ET (UTC-4 or UTC-5)
    # Simplified: Mon-Fri, 13:30 - 21:00 UTC
    if now.weekday() >= 5:  # Saturday or Sunday
        return False
    market_open = now.replace(hour=13, minute=30, second=0, microsecond=0)
    market_close = now.replace(hour=21, minute=0, second=0, microsecond=0)
    return market_open <= now <= market_close
