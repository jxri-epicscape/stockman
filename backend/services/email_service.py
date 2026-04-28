import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from database import get_db


def get_email_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


def send_email(subject: str, body_html: str) -> bool:
    settings = get_email_settings()
    email_from = settings.get("email_from", "")
    email_password = settings.get("email_password", "")
    email_to = settings.get("email_to", "")
    alerts_enabled = settings.get("alerts_enabled", "1")

    if alerts_enabled != "1":
        return False
    if not email_from or not email_password or not email_to:
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = email_from
        msg["To"] = email_to
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(email_from, email_password)
            server.sendmail(email_from, email_to, msg.as_string())
        return True
    except Exception as e:
        print(f"Email error: {e}")
        return False


def send_hard_stop_alert(ticker: str, shares: float, avg_price: float,
                          current_price: float, stop_price: float,
                          peak_price: float, atr: float):
    pnl = (current_price - avg_price) * shares
    pnl_pct = ((current_price - avg_price) / avg_price) * 100
    drop_from_peak = ((peak_price - current_price) / peak_price) * 100

    subject = f"🔴 HARD STOP HIT: {ticker} — Exit position"
    body = f"""
    <html><body style="font-family: sans-serif; padding: 20px; color: #1a1a2e;">
    <div style="background: #ff4757; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="margin:0">🔴 HARD STOP HIT: {ticker}</h2>
    </div>
    <table style="width:100%; border-collapse:collapse;">
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Ticker</td><td style="padding:10px">{ticker}</td></tr>
        <tr><td style="padding:10px; font-weight:bold">Shares</td><td style="padding:10px">{shares}</td></tr>
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Avg Buy Price</td><td style="padding:10px">${avg_price:.2f}</td></tr>
        <tr><td style="padding:10px; font-weight:bold">Current Price</td><td style="padding:10px"><strong>${current_price:.2f}</strong></td></tr>
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Peak Price</td><td style="padding:10px">${peak_price:.2f}</td></tr>
        <tr><td style="padding:10px; font-weight:bold">Hard Stop Price</td><td style="padding:10px; color:#ff4757"><strong>${stop_price:.2f}</strong></td></tr>
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Drop from Peak</td><td style="padding:10px; color:#ff4757">{drop_from_peak:.1f}%</td></tr>
        <tr><td style="padding:10px; font-weight:bold">ATR</td><td style="padding:10px">${atr:.2f}</td></tr>
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Unrealized P&L</td>
            <td style="padding:10px; color:{'#2ed573' if pnl >= 0 else '#ff4757'}">
                {'+'if pnl >= 0 else ''}${pnl:.2f} ({'+'if pnl_pct >= 0 else ''}{pnl_pct:.1f}%)
            </td>
        </tr>
    </table>
    <div style="margin-top:20px; padding:15px; background:#ffe0e0; border-radius:8px; border-left:4px solid #ff4757;">
        <strong>Action required:</strong> Hard stop has been hit. Consider exiting this position fully.
    </div>
    <p style="color:#888; font-size:12px; margin-top:20px;">Sent by Stockman — your personal portfolio tracker</p>
    </body></html>
    """
    return send_email(subject, body)


def send_warn_alert(ticker: str, shares: float, avg_price: float,
                    current_price: float, warn_price: float, hard_price: float,
                    peak_price: float, atr: float):
    drop_from_peak = ((peak_price - current_price) / peak_price) * 100

    subject = f"🟡 WARNING: Consider Trimming {ticker}"
    body = f"""
    <html><body style="font-family: sans-serif; padding: 20px; color: #1a1a2e;">
    <div style="background: #ffc107; color: #333; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="margin:0">🟡 Warning Level Reached: {ticker}</h2>
        <p style="margin:5px 0 0 0; font-size:14px;">Stock has dropped to warning level (ATR × multiplier)</p>
    </div>
    <table style="width:100%; border-collapse:collapse;">
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Ticker</td><td style="padding:10px">{ticker}</td></tr>
        <tr><td style="padding:10px; font-weight:bold">Shares</td><td style="padding:10px">{shares}</td></tr>
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Avg Buy Price</td><td style="padding:10px">${avg_price:.2f}</td></tr>
        <tr><td style="padding:10px; font-weight:bold">Current Price</td><td style="padding:10px"><strong>${current_price:.2f}</strong></td></tr>
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Peak Price</td><td style="padding:10px">${peak_price:.2f}</td></tr>
        <tr><td style="padding:10px; font-weight:bold">Warning Price</td><td style="padding:10px; color:#e67e00"><strong>${warn_price:.2f}</strong></td></tr>
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">Hard Stop Price</td><td style="padding:10px; color:#ff4757">${hard_price:.2f}</td></tr>
        <tr><td style="padding:10px; font-weight:bold">Drop from Peak</td><td style="padding:10px; color:#e67e00">{drop_from_peak:.1f}%</td></tr>
        <tr style="background:#f8f9fa"><td style="padding:10px; font-weight:bold">ATR</td><td style="padding:10px">${atr:.2f}</td></tr>
    </table>
    <div style="margin-top:20px; padding:15px; background:#fff8e1; border-radius:8px; border-left:4px solid #ffc107;">
        <strong>Action suggested:</strong> Consider trimming 25-50% of position.
        Hard stop is at <strong>${hard_price:.2f}</strong> — if reached, exit fully.
    </div>
    <p style="color:#888; font-size:12px; margin-top:20px;">Sent by Stockman — your personal portfolio tracker</p>
    </body></html>
    """
    return send_email(subject, body)


def send_price_alert(ticker: str, current_price: float, alert_price: float, direction: str):
    direction_word = "above" if direction == "above" else "below"
    subject = f"📈 Price Alert: {ticker} is {direction_word} ${alert_price:.2f}"
    body = f"""
    <html><body style="font-family: sans-serif; padding: 20px;">
    <div style="background:#2ed573; color:white; padding:15px; border-radius:8px; margin-bottom:20px;">
        <h2 style="margin:0">Price Alert: {ticker}</h2>
    </div>
    <p><strong>{ticker}</strong> is now at <strong>${current_price:.2f}</strong></p>
    <p>Your alert was set for when price goes {direction_word} <strong>${alert_price:.2f}</strong></p>
    <p style="color:#888; font-size:12px;">Sent by Stockman</p>
    </body></html>
    """
    return send_email(subject, body)
