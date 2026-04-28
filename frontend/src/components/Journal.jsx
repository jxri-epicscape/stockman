import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Check } from 'lucide-react'
import { getJournal, addJournal, deleteJournal } from '../api.js'

const ACTIONS = ['BUY', 'SELL', 'TRIM', 'NOTE']
const ACTION_COLORS = {
  BUY:  'badge-green',
  SELL: 'badge-red',
  TRIM: 'badge-yellow',
  NOTE: 'badge-blue',
}

const EMPTY = {
  date: new Date().toISOString().slice(0, 10),
  ticker: '', action: 'BUY', shares: '', price: '', reason: '', notes: ''
}

export default function Journal() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')

  async function load() {
    setLoading(true)
    try { setEntries(await getJournal()) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await addJournal({
        ...form,
        ticker: form.ticker.toUpperCase(),
        shares: form.shares ? parseFloat(form.shares) : null,
        price: form.price ? parseFloat(form.price) : null,
      })
      setShowForm(false)
      setForm(EMPTY)
      await load()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this journal entry?')) return
    await deleteJournal(id)
    setEntries(e => e.filter(x => x.id !== id))
  }

  const filtered = filter
    ? entries.filter(e => e.ticker.includes(filter.toUpperCase()) || e.reason?.includes(filter) || e.notes?.includes(filter))
    : entries

  // Win/loss stats from matched BUY → SELL pairs per ticker
  const trades = (() => {
    const byTicker = {}
    entries.forEach(e => {
      if (!byTicker[e.ticker]) byTicker[e.ticker] = []
      byTicker[e.ticker].push(e)
    })
    const completed = []
    Object.values(byTicker).forEach(es => {
      const sorted = [...es].sort((a, b) => a.date.localeCompare(b.date))
      let buyStack = []
      sorted.forEach(e => {
        if (e.action === 'BUY' && e.price && e.shares) buyStack.push(e)
        else if ((e.action === 'SELL' || e.action === 'TRIM') && e.price && e.shares && buyStack.length) {
          const buy = buyStack[buyStack.length - 1]
          const pnlPct = ((e.price - buy.price) / buy.price) * 100
          completed.push({ ticker: e.ticker, pnlPct, won: pnlPct >= 0 })
        }
      })
    })
    return completed
  })()

  const wins = trades.filter(t => t.won)
  const losses = trades.filter(t => !t.won)
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : null
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : null
  const winRate = trades.length ? (wins.length / trades.length) * 100 : null

  return (
    <div className="space-y-6">

      {trades.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="text-xs text-slate-500 mb-1">Completed Trades</div>
            <div className="text-2xl font-bold text-white">{trades.length}</div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500 mb-1">Win Rate</div>
            <div className={`text-2xl font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
              {winRate != null ? winRate.toFixed(0) + '%' : '—'}
            </div>
            <div className="text-[10px] text-slate-600">{wins.length}W · {losses.length}L</div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500 mb-1">Avg Win</div>
            <div className="text-2xl font-bold text-emerald-400">
              {avgWin != null ? '+' + avgWin.toFixed(1) + '%' : '—'}
            </div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500 mb-1">Avg Loss</div>
            <div className="text-2xl font-bold text-red-400">
              {avgLoss != null ? avgLoss.toFixed(1) + '%' : '—'}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Trade Journal ({entries.length})</h2>
          <input
            className="input w-40 text-xs"
            placeholder="Filter by ticker..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> Log Entry
        </button>
      </div>

      {showForm && (
        <div className="card border-brand-500/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">New Journal Entry</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date *</label>
              <input className="input" type="date" required
                value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Ticker *</label>
              <input className="input uppercase" placeholder="AAPL" required
                value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Action *</label>
              <select className="input" value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}>
                {ACTIONS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Price</label>
              <input className="input" type="number" step="any" placeholder="150.00"
                value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Shares</label>
              <input className="input" type="number" step="any" placeholder="100"
                value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <label className="text-xs text-slate-400 mb-1 block">Reason / Thesis</label>
              <input className="input" placeholder="Why did you take this action?"
                value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="md:col-span-4">
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <textarea className="input" rows={2} placeholder="Additional notes..."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="md:col-span-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
                <Check size={15} /> {saving ? 'Saving...' : 'Log Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-center py-12">Loading journal...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          {filter ? 'No entries match your filter.' : 'No journal entries yet. Log your first trade.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <div key={entry.id} className="card flex gap-4 items-start">
              <div className="shrink-0 text-right min-w-20">
                <div className="text-xs text-slate-500">{entry.date}</div>
                <div className={`mt-1 ${ACTION_COLORS[entry.action] || 'badge-blue'}`}>{entry.action}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-white">{entry.ticker}</span>
                  {entry.price && <span className="text-slate-400 text-sm">${parseFloat(entry.price).toFixed(2)}</span>}
                  {entry.shares && <span className="text-slate-500 text-sm">{entry.shares} shares</span>}
                </div>
                {entry.reason && <div className="text-sm text-slate-300 mt-1">{entry.reason}</div>}
                {entry.notes && <div className="text-xs text-slate-500 mt-0.5">{entry.notes}</div>}
              </div>
              <button onClick={() => handleDelete(entry.id)} className="btn-danger p-1.5 shrink-0">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
