import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Check, Bell, BellOff, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, Pencil, GripVertical } from 'lucide-react'
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
      <div className="text-slate-600 text-[10px]">{e.date}</div>
    </span>
  )
}

function TrendArrow({ direction, invert = false }) {
  if (direction === 'tracking') return <span className="text-[10px] text-slate-600">…</span>
  if (direction === 'unknown' || direction === 'stable') return <Minus size={11} className="text-slate-600 inline" />
  const isUp = direction === 'up'
  const isGood = invert ? isUp : !isUp
  return isUp
    ? <TrendingUp size={12} className={`inline ml-0.5 ${isGood ? 'text-emerald-400' : 'text-red-400'}`} />
    : <TrendingDown size={12} className={`inline ml-0.5 ${isGood ? 'text-emerald-400' : 'text-red-400'}`} />
}

export default function Watchlist() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY)
  const [itemOrder, setItemOrder] = useState(() => {
    try { const s = localStorage.getItem('stockman_watchlist_order'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const dragId = useRef(null)

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

  function startEdit(item) {
    setEditingId(item.id)
    setEditForm({
      notes: item.notes || '',
      price_alert_above: item.price_alert_above || '',
      price_alert_below: item.price_alert_below || '',
    })
  }

  async function handleEditSave(id) {
    setSaving(true)
    try {
      await updateWatchlist(id, {
        notes: editForm.notes || null,
        price_alert_above: editForm.price_alert_above ? parseFloat(editForm.price_alert_above) : null,
        price_alert_below: editForm.price_alert_below ? parseFloat(editForm.price_alert_below) : null,
      })
      setEditingId(null)
      await load()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  async function resetAlert(id, type) {
    await updateWatchlist(id, { [`alerted_${type}`]: false })
    await load()
  }

  function onDrop(toId) {
    const fromId = dragId.current
    if (!fromId || fromId === toId) return
    const base = itemOrder || items.map(i => i.id)
    const order = [...base]
    const fi = order.indexOf(fromId), ti = order.indexOf(toId)
    if (fi === -1 || ti === -1) return
    order.splice(fi, 1)
    order.splice(ti, 0, fromId)
    setItemOrder(order)
    localStorage.setItem('stockman_watchlist_order', JSON.stringify(order))
  }

  const sortedItems = itemOrder
    ? [...items].sort((a, b) => {
        const ai = itemOrder.indexOf(a.id), bi = itemOrder.indexOf(b.id)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    : items

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Add form */}
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

      {/* Table */}
      {loading ? (
        <div className="text-slate-500 text-center py-12">Loading watchlist — fetching short interest, float, institutional ownership…</div>
      ) : items.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">Watchlist is empty. Add tickers to monitor.</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-xs text-slate-500 uppercase tracking-wide">
                <th className="w-6 px-2 py-3"></th>
                <th className="text-left px-4 py-3">Ticker</th>
                <th className="text-right px-4 py-3">Price</th>
                <th className="text-right px-4 py-3">Short %</th>
                <th className="text-right px-4 py-3">Days Cover</th>
                <th className="text-right px-4 py-3">Float</th>
                <th className="text-right px-4 py-3">Inst %</th>
                <th className="text-right px-4 py-3">ATR</th>
                <th className="text-right px-4 py-3">Earnings</th>
                <th className="text-center px-4 py-3">Alerts</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map(item => {
                const t = item.trend || {}
                const snapshotCount = t.snapshots ?? 0
                const hasConfidence = item.confidence && !item.confidence.ok

                const row = (
                  <tr key={item.id}
                    draggable
                    onDragStart={() => { dragId.current = item.id }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDrop(item.id)}
                    className="border-b border-dark-600/50 hover:bg-dark-700/50 transition-colors cursor-grab active:cursor-grabbing">

                    {/* Grip */}
                    <td className="px-2 py-3 text-slate-600 hover:text-slate-400">
                      <GripVertical size={14} />
                    </td>

                    {/* Ticker */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white">{item.ticker}</span>
                        <VolBadge data={item.volatility} />
                        {hasConfidence && (
                          <span title={item.confidence.issues.join(' · ')}>
                            <AlertTriangle size={12} className="text-yellow-400" />
                          </span>
                        )}
                      </div>
                      {item.notes && <div className="text-xs text-slate-500 mt-0.5">{item.notes}</div>}
                      <div className="text-[10px] text-slate-700 mt-0.5">
                        {snapshotCount === 0 && '⟳ tracking…'}
                        {snapshotCount === 1 && '⟳ 1 snapshot'}
                        {snapshotCount >= 2 && `✓ ${snapshotCount} snapshots`}
                      </div>
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 text-right font-medium text-white">
                      {fmt(item.current_price)}
                    </td>

                    {/* Short % */}
                    <td className="px-4 py-3 text-right">
                      <div className={`font-medium ${item.short_pct > 20 ? 'text-red-400' : item.short_pct > 10 ? 'text-orange-400' : 'text-slate-300'}`}>
                        {pct(item.short_pct)} <TrendArrow direction={t.short_trend} invert={false} />
                      </div>
                      {item.short_pct > 20 && <div className="text-[10px] text-red-500">⚠ high</div>}
                      {item.short_pct != null && item.short_pct < 3 && <div className="text-[10px] text-emerald-500">✓ low</div>}
                    </td>

                    {/* Days to Cover */}
                    <td className="px-4 py-3 text-right">
                      <div className={`font-medium ${item.days_to_cover > 10 ? 'text-red-400' : item.days_to_cover > 5 ? 'text-yellow-400' : 'text-slate-300'}`}>
                        {item.days_to_cover != null ? item.days_to_cover.toFixed(1) : '—'}
                      </div>
                      {item.days_to_cover > 10 && <div className="text-[10px] text-red-500">trapped</div>}
                      {item.days_to_cover > 5 && item.days_to_cover <= 10 && <div className="text-[10px] text-yellow-500">elevated</div>}
                      {item.days_to_cover != null && item.days_to_cover <= 5 && <div className="text-[10px] text-emerald-500">liquid</div>}
                    </td>

                    {/* Float */}
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">
                      {item.float ?? '—'}
                    </td>

                    {/* Institution % */}
                    <td className="px-4 py-3 text-right">
                      <div className={`font-medium ${item.inst_pct > 70 ? 'text-emerald-400' : item.inst_pct < 30 ? 'text-yellow-400' : 'text-slate-300'}`}>
                        {pct(item.inst_pct)} <TrendArrow direction={t.inst_trend} invert={true} />
                      </div>
                      {item.inst_pct > 70 && <div className="text-[10px] text-emerald-500">smart $</div>}
                      {item.inst_pct != null && item.inst_pct < 30 && <div className="text-[10px] text-yellow-500">retail</div>}
                    </td>

                    {/* ATR */}
                    <td className="px-4 py-3 text-right text-slate-400">
                      {item.atr != null ? '$' + item.atr.toFixed(2) : '—'}
                    </td>

                    {/* Earnings */}
                    <td className="px-4 py-3 text-right">
                      <EarningsBadge e={item.earnings} />
                    </td>

                    {/* Alerts */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1 text-xs">
                        {item.price_alert_above && (
                          <div className={`flex items-center gap-1 ${item.alerted_above ? 'text-emerald-400' : 'text-slate-500'}`}>
                            <Bell size={10} /> {fmt(item.price_alert_above)}
                            {item.alerted_above && (
                              <button onClick={() => resetAlert(item.id, 'above')} className="text-slate-600 hover:text-white text-[10px]">(reset)</button>
                            )}
                          </div>
                        )}
                        {item.price_alert_below && (
                          <div className={`flex items-center gap-1 ${item.alerted_below ? 'text-red-400' : 'text-slate-500'}`}>
                            <Bell size={10} /> {fmt(item.price_alert_below)}
                            {item.alerted_below && (
                              <button onClick={() => resetAlert(item.id, 'below')} className="text-slate-600 hover:text-white text-[10px]">(reset)</button>
                            )}
                          </div>
                        )}
                        {!item.price_alert_above && !item.price_alert_below && (
                          <BellOff size={12} className="text-slate-700" />
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => startEdit(item)} className="btn-ghost p-1.5" title="Edit">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="btn-danger p-1.5" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )

                return (
                  <React.Fragment key={item.id}>
                    {row}
                    {editingId === item.id && (
                      <tr key={`edit-${item.id}`} className="bg-dark-800/60 border-b border-dark-600/50">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Alert Above $</label>
                              <input className="input" type="number" step="any" placeholder="—"
                                value={editForm.price_alert_above}
                                onChange={e => setEditForm(f => ({ ...f, price_alert_above: e.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Alert Below $</label>
                              <input className="input" type="number" step="any" placeholder="—"
                                value={editForm.price_alert_below}
                                onChange={e => setEditForm(f => ({ ...f, price_alert_below: e.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                              <input className="input" placeholder="Notes..."
                                value={editForm.notes}
                                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">Cancel</button>
                            <button onClick={() => handleEditSave(item.id)} disabled={saving}
                              className="btn-primary text-xs flex items-center gap-1">
                              <Check size={13} /> {saving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {hasConfidence && (
                      <tr key={`conf-${item.id}`} className="bg-yellow-500/5 border-b border-dark-600/30">
                        <td colSpan={11} className="px-4 py-1.5">
                          <div className="flex items-center gap-2 text-[11px] text-yellow-300">
                            <AlertTriangle size={11} className="text-yellow-400 shrink-0" />
                            {item.confidence.issues.join(' · ')}
                            <span className="text-yellow-700">— focus on trend direction</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
