import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Check, Bell, BellOff, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getWatchlist, addWatchlist, updateWatchlist, deleteWatchlist } from '../api.js'

const EMPTY = { ticker: '', notes: '', price_alert_above: '', price_alert_below: '' }

function fmt(n, dec = 2) {
  if (n == null) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function pct(n) { return n != null ? n.toFixed(1) + '%' : '—' }

function VolBadge({ data }) {
  if (!data) return null
  const colors = {
    green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    red: 'bg-red-500/20 text-red-400 border-red-500/40',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors[data.level] || colors.green}`}
      title={`${data.count} days with >5% moves in past year`}>
      {data.label}
    </span>
  )
}

function EarningsBadge({ e }) {
  if (!e) return <span className="text-slate-600 text-xs">—</span>
  const urgent = e.days <= 14
  const soon = e.days <= 30
  return (
    <span className={`text-xs font-medium ${urgent ? 'text-red-400' : soon ? 'text-yellow-400' : 'text-slate-400'}`}
      title={`Earnings: ${e.date}`}>
      {e.days === 0 ? 'Today!' : e.days === 1 ? 'Tomorrow' : `${e.days}d`}
      <span className="text-slate-600 ml-1 text-[10px]">{e.date}</span>
    </span>
  )
}

// Trend arrow for short% (up=bad=red, down=good=green) or inst% (up=good=green, down=bad=red)
function TrendArrow({ direction, invert = false }) {
  if (direction === 'tracking') return <span className="text-[10px] text-slate-600" title="Need 2+ weekly snapshots">tracking…</span>
  if (direction === 'unknown' || direction === 'stable') return <Minus size={11} className="text-slate-600 inline" title="Stable" />
  const isUp = direction === 'up'
  const isGood = invert ? isUp : !isUp  // for inst%: up=good; for short%: up=bad
  return isUp
    ? <TrendingUp size={12} className={`inline ${isGood ? 'text-emerald-400' : 'text-red-400'}`} />
    : <TrendingDown size={12} className={`inline ${isGood ? 'text-emerald-400' : 'text-red-400'}`} />
}

function ConfidenceBar({ confidence }) {
  if (!confidence || confidence.ok) return null
  return (
    <div className="flex items-start gap-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1.5 mt-2">
      <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
      <div className="text-[11px] text-yellow-300 space-y-0.5">
        {confidence.issues.map((issue, i) => <div key={i}>{issue}</div>)}
        <div className="text-yellow-600 text-[10px]">Focus on trend direction, not absolute values</div>
      </div>
    </div>
  )
}

function StatRow({ items }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-2">
      {items.map(({ label, value, sub, subColor }) => (
        <div key={label} className="flex flex-col min-w-0">
          <span className="text-[10px] text-slate-600 uppercase tracking-wide">{label}</span>
          <span className="text-sm text-slate-200 font-medium">{value}</span>
          {sub && <span className={`text-[10px] ${subColor || 'text-slate-600'}`}>{sub}</span>}
        </div>
      ))}
    </div>
  )
}

export default function Watchlist() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try { setItems(await getWatchlist()) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await addWatchlist({
        ticker: form.ticker.toUpperCase(),
        notes: form.notes || null,
        price_alert_above: form.price_alert_above ? parseFloat(form.price_alert_above) : null,
        price_alert_below: form.price_alert_below ? parseFloat(form.price_alert_below) : null,
      })
      setShowForm(false)
      setForm(EMPTY)
      await load()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Remove from watchlist?')) return
    await deleteWatchlist(id)
    setItems(i => i.filter(x => x.id !== id))
  }

  async function resetAlert(id, type) {
    await updateWatchlist(id, { [`alerted_${type}`]: false })
    await load()
  }

  const trend = (item) => item.trend || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Watchlist ({items.length})</h2>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} /> Add Ticker
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card border-brand-500/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Add to Watchlist</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Ticker *</label>
              <input className="input uppercase" placeholder="NVDA" required
                value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Alert Above $</label>
              <input className="input" type="number" step="any" placeholder="200.00"
                value={form.price_alert_above} onChange={e => setForm(f => ({ ...f, price_alert_above: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Alert Below $</label>
              <input className="input" type="number" step="any" placeholder="150.00"
                value={form.price_alert_below} onChange={e => setForm(f => ({ ...f, price_alert_below: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <input className="input" placeholder="Waiting for breakout..."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="md:col-span-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
                <Check size={15} /> {saving ? 'Saving...' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-center py-12">Loading watchlist data — fetching short interest, float, institutional ownership…</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">Watchlist is empty. Add tickers to monitor.</div>
      ) : (
        <div className="grid gap-4">
          {items.map(item => {
            const t = trend(item)
            const snapshotCount = t.snapshots ?? 0
            return (
              <div key={item.id} className="card space-y-4">

                {/* ── Row 1: Ticker identity ── */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-2xl tracking-tight">{item.ticker}</span>
                      {item.current_price && (
                        <span className="text-slate-200 text-lg font-medium">{fmt(item.current_price)}</span>
                      )}
                      <VolBadge data={item.volatility} />
                    </div>
                    {item.notes && (
                      <div className="text-slate-500 text-xs">{item.notes}</div>
                    )}
                  </div>
                  <button onClick={() => handleDelete(item.id)} className="btn-danger p-1.5 shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* ── Row 2: Key risk metrics ── */}
                <div className="border-t border-dark-600 pt-3">
                  <StatRow items={[
                    {
                      label: 'Short %',
                      value: <span>{pct(item.short_pct)} <TrendArrow direction={t.short_trend} invert={false} /></span>,
                      sub: item.short_pct > 20 ? '⚠ high' : item.short_pct != null && item.short_pct < 3 ? '✓ low' : null,
                      subColor: item.short_pct > 20 ? 'text-red-500' : 'text-emerald-500',
                    },
                    {
                      label: 'Days to Cover',
                      value: item.days_to_cover != null ? item.days_to_cover.toFixed(1) : '—',
                      sub: item.days_to_cover > 10 ? '⚠ trapped' : item.days_to_cover > 5 ? 'elevated' : item.days_to_cover != null ? '✓ liquid' : null,
                      subColor: item.days_to_cover > 10 ? 'text-red-500' : item.days_to_cover > 5 ? 'text-yellow-500' : 'text-emerald-500',
                    },
                    {
                      label: 'Float',
                      value: item.float ?? '—',
                    },
                    {
                      label: 'Institution %',
                      value: <span>{pct(item.inst_pct)} <TrendArrow direction={t.inst_trend} invert={true} /></span>,
                      sub: item.inst_pct > 70 ? 'smart money' : item.inst_pct != null && item.inst_pct < 30 ? 'retail-driven' : null,
                      subColor: item.inst_pct > 70 ? 'text-emerald-500' : item.inst_pct < 30 ? 'text-yellow-500' : 'text-slate-600',
                    },
                    {
                      label: 'ATR (14d)',
                      value: item.atr != null ? '$' + item.atr.toFixed(2) : '—',
                    },
                    {
                      label: 'Earnings',
                      value: <EarningsBadge e={item.earnings} />,
                    },
                  ]} />

                  {/* Snapshot status */}
                  <div className="mt-2 text-[10px] text-slate-700">
                    {snapshotCount === 0 && '⟳ First snapshot being taken now — trends available after next weekly snapshot'}
                    {snapshotCount === 1 && '⟳ 1 snapshot stored — trends available after next weekly snapshot (Monday)'}
                    {snapshotCount >= 2 && `✓ ${snapshotCount} snapshots · last ${t.latest_date} · prev ${t.prev_date}`}
                  </div>

                  {/* Confidence warnings */}
                  <ConfidenceBar confidence={item.confidence} />
                </div>

                {/* ── Row 3: Price alerts ── */}
                <div className="flex flex-wrap gap-3 border-t border-dark-600 pt-2">
                  {item.price_alert_above && (
                    <div className={`flex items-center gap-1.5 text-xs ${item.alerted_above ? 'text-emerald-400' : 'text-slate-400'}`}>
                      <Bell size={12} /> Above {fmt(item.price_alert_above)}
                      {item.alerted_above && (
                        <button onClick={() => resetAlert(item.id, 'above')} className="text-slate-500 hover:text-white ml-1">(reset)</button>
                      )}
                    </div>
                  )}
                  {item.price_alert_below && (
                    <div className={`flex items-center gap-1.5 text-xs ${item.alerted_below ? 'text-red-400' : 'text-slate-400'}`}>
                      <Bell size={12} /> Below {fmt(item.price_alert_below)}
                      {item.alerted_below && (
                        <button onClick={() => resetAlert(item.id, 'below')} className="text-slate-500 hover:text-white ml-1">(reset)</button>
                      )}
                    </div>
                  )}
                  {!item.price_alert_above && !item.price_alert_below && (
                    <span className="text-slate-600 flex items-center gap-1 text-xs"><BellOff size={12} /> No price alerts set</span>
                  )}
                </div>

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
