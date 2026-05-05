import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Edit2, X, Check, ClipboardList, ChevronUp, ChevronDown, GripVertical, BarChart2, FileText } from 'lucide-react'
import { getPortfolio, addPosition, updatePosition, deletePosition, refreshPosition, resetAlert, getEurUsd, addJournal, getVolatility, getHistory, getDetails } from '../api.js'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'

const EMPTY_FORM = {
  ticker: '', shares: '', avg_price: '', date_bought: '',
  notes: '', trailing_stop_enabled: true, atr_multiplier: 2.5, atr_period: 14
}

const REORDERABLE_COLS = ['shares','avg_price','current','market_value','pnl','earnings','peak','stop_atr','status','line']
const COL_META = {
  shares:       { label: 'Shares',       align: 'right' },
  avg_price:    { label: 'Avg Price',    align: 'right' },
  current:      { label: 'Current',      align: 'right' },
  market_value: { label: 'Value Now',    align: 'right' },
  pnl:          { label: 'P&L',          align: 'right' },
  earnings:     { label: 'Earnings',     align: 'right' },
  peak:         { label: 'Peak',         align: 'right' },
  stop_atr:     { label: 'Stop (ATR)',   align: 'right' },
  status:       { label: 'Status',       align: 'center' },
  line:         { label: 'Line',         align: 'center' },
}

// Unified decision reasons: sell = 20pts, trim = 10pts
const DECISION_REASONS = [
  { label: 'Stock broke a clear trend (lower highs, lower lows)', weight: 20 },
  { label: 'Bad earnings / fundamental change', weight: 20 },
  { label: 'Whole market is crashing / sector is crashing', weight: 20 },
  { label: 'Short interest trend rising week over week', weight: 20 },
  { label: 'I no longer have conviction in this stock', weight: 20 },
  { label: 'Normal volatility shakeout — stock still in uptrend', weight: 10 },
  { label: 'I have big unrealized gains and want to protect some profit', weight: 10 },
  { label: 'I still believe in the company long-term', weight: -10 },
]
// Thresholds: 0 = hold, 1–30 = trim, 31+ = sell

// Read signal score from localStorage for a position
function calcSignalScore(posId) {
  try {
    const state = JSON.parse(localStorage.getItem(`decision_v3_${posId}`)) || {}
    let score = 0
    DECISION_REASONS.forEach((r, i) => {
      const e = state[`r_${i}`] || { on: false, texts: [] }
      const noteVal = r.weight < 0 ? -1 : 1
      if (e.on) { score += r.weight; e.texts.forEach(t => { if (t.trim()) score += noteVal }) }
    })
    ;(state.custom || []).forEach(c => {
      if (c.label && c.label.trim()) { score += c.weight; (c.texts || []).forEach(t => { if (t && t.trim()) score += 1 }) }
    })
    return score
  } catch { return 0 }
}

// Mini sparkline SVG
function Sparkline({ data }) {
  if (!data || data.length < 2) return <span className="text-slate-700 text-xs">—</span>
  const w = 80, h = 28
  const closes = data.map(d => d.close)
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const pts = closes.map((c, i) =>
    `${(i / (closes.length - 1)) * w},${h - ((c - min) / range) * h}`
  ).join(' ')
  const isUp = closes[closes.length - 1] >= closes[0]
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none"
        stroke={isUp ? '#34d399' : '#f87171'}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function PriceChart({ data, stopPrice, warnPrice, avgPrice, peakPrice }) {
  if (!data || data.length < 2) return <div className="text-slate-600 text-sm text-center py-8">No chart data available</div>
  const formatted = data.map(d => ({ date: d.date?.slice(5), close: d.close }))
  const closes = data.map(d => d.close)
  const min = Math.min(...closes, stopPrice || Infinity) * 0.98
  const max = Math.max(...closes) * 1.02
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={formatted} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.4} />
        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={[min, max]} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
          tickFormatter={v => '$' + v.toFixed(0)} width={48} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(v) => ['$' + v.toFixed(2), 'Price']}
        />
        {stopPrice && <ReferenceLine y={stopPrice} stroke="#f87171" strokeDasharray="4 2" strokeWidth={1.5}
          label={{ value: 'Stop', fill: '#f87171', fontSize: 10, position: 'insideTopRight' }} />}
        {warnPrice && !stopPrice && <ReferenceLine y={warnPrice} stroke="#fbbf24" strokeDasharray="4 2" strokeWidth={1}
          label={{ value: 'Warn', fill: '#fbbf24', fontSize: 10, position: 'insideTopRight' }} />}
        {avgPrice && <ReferenceLine y={avgPrice} stroke="#6366f1" strokeDasharray="4 2" strokeWidth={1}
          label={{ value: 'Buy', fill: '#6366f1', fontSize: 10, position: 'insideBottomRight' }} />}
        <Line type="monotone" dataKey="close" stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function fmt(n, dec = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtMoney(n, currency, eurUsd) {
  if (n == null) return '—'
  if (currency === 'EUR' && eurUsd) {
    const eur = n / eurUsd
    return '€' + fmt(eur)
  }
  return '$' + fmt(n)
}

// ── Volatility Badge ───────────────────────────────────────────────────────────
function VolatilityBadge({ data }) {
  if (!data) return null
  const colors = {
    green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    red: 'bg-red-500/20 text-red-400 border-red-500/40',
  }
  const cls = colors[data.level] || colors.green
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ml-1 cursor-default ${cls}`}
      title={`${data.count} days with >5% moves in past year`}
    >
      {data.label}
    </span>
  )
}

// ── Decision Checklist Modal ───────────────────────────────────────────────────
function DecisionModal({ pos, onClose, onLog }) {
  const storageKey = `decision_v3_${pos.id}`
  const [state, setState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || {} } catch { return {} }
  })
  const [logMode, setLogMode] = useState(null)
  const [logForm, setLogForm] = useState({ shares: '', price: '' })
  const [logging, setLogging] = useState(false)

  function getEntry(key) { return state[key] || { on: false, texts: [] } }
  function save(next) { localStorage.setItem(storageKey, JSON.stringify(next)); setState(next) }
  function toggleCheck(key) { const e = getEntry(key); save({ ...state, [key]: { ...e, on: !e.on } }) }
  function addText(key) { const e = getEntry(key); if (e.texts.length >= 5) return; save({ ...state, [key]: { ...e, texts: [...e.texts, ''] } }) }
  function updateText(key, idx, val) { const e = getEntry(key); const t = [...e.texts]; t[idx] = val; save({ ...state, [key]: { ...e, texts: t } }) }
  function removeText(key, idx) { const e = getEntry(key); save({ ...state, [key]: { ...e, texts: e.texts.filter((_, i) => i !== idx) } }) }

  // Custom "something else" helpers
  const customs = state.custom || []
  function addCustom() { save({ ...state, custom: [...customs, { label: '', weight: 10, texts: [] }] }) }
  function removeCustom(i) { save({ ...state, custom: customs.filter((_, ci) => ci !== i) }) }
  function updateCustomLabel(i, val) { const c = [...customs]; c[i] = { ...c[i], label: val }; save({ ...state, custom: c }) }
  function updateCustomWeight(i, val) { const c = [...customs]; c[i] = { ...c[i], weight: val }; save({ ...state, custom: c }) }
  function addCustomText(i) { if ((customs[i].texts || []).length >= 5) return; const c = [...customs]; c[i] = { ...c[i], texts: [...(c[i].texts || []), ''] }; save({ ...state, custom: c }) }
  function updateCustomText(i, ti, val) { const c = [...customs]; const t = [...(c[i].texts || [])]; t[ti] = val; c[i] = { ...c[i], texts: t }; save({ ...state, custom: c }) }
  function removeCustomText(i, ti) { const c = [...customs]; c[i] = { ...c[i], texts: (c[i].texts || []).filter((_, j) => j !== ti) }; save({ ...state, custom: c }) }

  // Score: sell=20, trim=10, conviction=-10, conviction notes=-1, other notes=+1
  let score = 0
  DECISION_REASONS.forEach((r, i) => {
    const e = getEntry(`r_${i}`)
    const noteVal = r.weight < 0 ? -1 : 1
    if (e.on) { score += r.weight; e.texts.forEach(t => { if (t.trim()) score += noteVal }) }
  })
  customs.forEach(c => {
    if (c.label && c.label.trim()) { score += c.weight; (c.texts || []).forEach(t => { if (t && t.trim()) score += 1 }) }
  })

  // Zone: <0 = strong hold, 0 = hold, 1–30 = trim, 31+ = sell
  const zone = score < 0 ? 'strong-hold' : score === 0 ? 'hold' : score <= 30 ? 'trim' : 'sell'
  const scoreColor = zone === 'strong-hold' ? 'text-emerald-400' : zone === 'hold' ? 'text-slate-500' : zone === 'trim' ? 'text-yellow-400' : 'text-red-400'

  const checkedReasons = DECISION_REASONS.filter((_, i) => getEntry(`r_${i}`).on).map(r => r.label)

  async function handleLog(action) {
    setLogging(true)
    try {
      await addJournal({
        date: new Date().toISOString().slice(0, 10),
        ticker: pos.ticker, action,
        shares: logForm.shares ? parseFloat(logForm.shares) : null,
        price: logForm.price ? parseFloat(logForm.price) : null,
        reason: checkedReasons.join('; ') || null,
        notes: null,
      })
      onLog && onLog(); onClose()
    } catch (err) { alert(err.message) }
    finally { setLogging(false) }
  }

  function renderReason(r, i) {
    const key = `r_${i}`
    const entry = getEntry(key)
    const isConviction = r.weight < 0
    const isSell = r.weight === 20
    const accentColor = isConviction ? 'accent-emerald-500' : isSell ? 'accent-red-500' : 'accent-yellow-500'
    const noteColor = isConviction ? 'text-emerald-400' : isSell ? 'text-red-400' : 'text-yellow-400'
    const weightColor = isConviction ? 'text-emerald-500/70' : isSell ? 'text-red-500/60' : 'text-yellow-500/60'
    return (
      <div key={key} className="mb-1">
        <label className="flex items-start gap-2 py-1 cursor-pointer group">
          <input type="checkbox" className={`mt-0.5 w-4 h-4 flex-shrink-0 ${accentColor}`}
            checked={entry.on} onChange={() => toggleCheck(key)} />
          <span className="text-slate-300 group-hover:text-white text-sm flex-1">{r.label}</span>
          <span className={`text-xs font-bold flex-shrink-0 ${weightColor}`}>{r.weight > 0 ? '+' : ''}{r.weight}</span>
        </label>
        {entry.on && (
          <div className="ml-6 mt-1 space-y-1">
            {entry.texts.map((text, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <input className="input text-xs flex-1 py-1" placeholder={`Note ${idx + 1}… (${isConviction ? '-1' : '+1'})`}
                  value={text} onChange={e => updateText(key, idx, e.target.value)} />
                <button onClick={() => removeText(key, idx)} className="text-slate-600 hover:text-red-400 p-1 flex-shrink-0"><X size={11} /></button>
              </div>
            ))}
            {entry.texts.length < 5 && (
              <button onClick={() => addText(key)}
                className={`text-xs opacity-50 hover:opacity-100 flex items-center gap-1 mt-0.5 ${noteColor}`}>
                <Plus size={11} /> add note ({isConviction ? '-1' : '+1'})
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <h3 className="font-bold text-white text-base">{pos.ticker} — Decision</h3>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className={`text-2xl font-bold leading-none ${scoreColor}`}>{score}%</div>
              <div className="text-[10px] text-slate-600 mt-0.5">signal</div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white ml-1"><X size={18} /></button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Zone indicator */}
          <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            zone === 'hold' ? 'bg-slate-700/30 border-slate-600/30 text-slate-500' :
            zone === 'trim' ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400' :
            'bg-red-500/10 border-red-500/40 text-red-400'
          }`}>
            {zone === 'strong-hold' && `🟢 Strong HOLD — conviction signal  (${score})`}
            {zone === 'strong-hold' && `🟢 Strong HOLD — conviction signal  (${score})`}
            {zone === 'hold' && '⚪ No action signal yet  (0)'}
            {zone === 'trim' && `🟡 Consider TRIMMING  (${score} / 1–30 zone)`}
            {zone === 'sell' && `🔴 Consider SELLING  (${score} / 31+ zone)`}
          </div>


          {/* SELL box */}
          <div className="border-2 border-red-500/60 rounded-lg p-3">
            <div className="text-red-400 font-semibold text-sm mb-2">Sell reasons</div>
            {DECISION_REASONS.filter(r => r.weight === 20).map(r => renderReason(r, DECISION_REASONS.indexOf(r)))}
          </div>

          {/* TRIM box */}
          <div className="border-2 border-yellow-500/60 rounded-lg p-3">
            <div className="text-yellow-400 font-semibold text-sm mb-2">Trim reasons</div>
            {DECISION_REASONS.filter(r => r.weight === 10).map(r => renderReason(r, DECISION_REASONS.indexOf(r)))}
          </div>

          {/* CONVICTION box */}
          <div className="border-2 border-emerald-500/60 rounded-lg p-3">
            <div className="text-emerald-400 font-semibold text-sm mb-2">Conviction</div>
            {DECISION_REASONS.filter(r => r.weight < 0).map(r => renderReason(r, DECISION_REASONS.indexOf(r)))}
          </div>

          {/* SOMETHING ELSE box */}
          <div className="border-2 border-slate-500/40 rounded-lg p-3">
            <div className="text-slate-400 font-semibold text-sm mb-2">Something else</div>
            {customs.map((c, ci) => (
              <div key={ci} className="mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <input className="input text-sm flex-1 py-1" placeholder="Describe reason…"
                    value={c.label} onChange={e => updateCustomLabel(ci, e.target.value)} />
                  <div className="flex gap-1 flex-shrink-0">
                    {[10, 20].map(w => (
                      <button key={w} onClick={() => updateCustomWeight(ci, w)}
                        className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${c.weight === w
                          ? w === 20 ? 'bg-red-500/30 text-red-400 border-red-500/60' : 'bg-yellow-500/30 text-yellow-400 border-yellow-500/60'
                          : 'bg-dark-700 text-slate-500 border-dark-600 hover:text-slate-300'}`}>
                        +{w}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => removeCustom(ci)} className="text-slate-600 hover:text-red-400 p-1 flex-shrink-0"><X size={13} /></button>
                </div>
                {c.label.trim() && (
                  <div className="ml-1 space-y-1">
                    {(c.texts || []).map((t, ti) => (
                      <div key={ti} className="flex items-center gap-1">
                        <input className="input text-xs flex-1 py-1" placeholder={`Note ${ti + 1}… (+1)`}
                          value={t} onChange={e => updateCustomText(ci, ti, e.target.value)} />
                        <button onClick={() => removeCustomText(ci, ti)} className="text-slate-600 hover:text-red-400 p-1 flex-shrink-0"><X size={11} /></button>
                      </div>
                    ))}
                    {(c.texts || []).length < 5 && (
                      <button onClick={() => addCustomText(ci)} className="text-xs opacity-50 hover:opacity-100 flex items-center gap-1 mt-0.5 text-slate-400">
                        <Plus size={11} /> add note (+1)
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <button onClick={addCustom} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 mt-1">
              <Plus size={11} /> add reason
            </button>
          </div>

          {/* Log buttons */}
          {!logMode ? (
            <div className="flex gap-2 pt-1">
              <button onClick={() => setLogMode('TRIM')}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30 transition-colors">
                Log as TRIM
              </button>
              <button onClick={() => setLogMode('SELL')}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors">
                Log as SELL ALL
              </button>
            </div>
          ) : (
            <div className="border border-dark-600 rounded-lg p-3 space-y-2">
              <div className="text-xs text-slate-400 font-medium">Log {logMode} for {pos.ticker}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Shares</label>
                  <input className="input text-sm" type="number" step="any" placeholder={logMode === 'SELL' ? pos.shares : ''}
                    value={logForm.shares} onChange={e => setLogForm(f => ({ ...f, shares: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Price</label>
                  <input className="input text-sm" type="number" step="any" placeholder={pos.current_price || ''}
                    value={logForm.price} onChange={e => setLogForm(f => ({ ...f, price: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setLogMode(null)} className="btn-ghost text-xs py-1 px-3">Cancel</button>
                <button onClick={() => handleLog(logMode === 'TRIM' ? 'TRIM' : 'SELL')} disabled={logging}
                  className={`flex-1 py-1 px-3 rounded text-xs font-medium transition-colors ${
                    logMode === 'TRIM' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'}`}>
                  {logging ? 'Saving...' : `Confirm ${logMode}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Portfolio() {
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState(null)
  const [refreshing, setRefreshing] = useState(null)
  const [currency, setCurrency] = useState('USD')
  const [eurUsd, setEurUsd] = useState(null)
  const [decisionPos, setDecisionPos] = useState(null)
  const [volatility, setVolatility] = useState({}) // { [ticker]: { level, label, count } }
  const [sparklines, setSparklines] = useState({}) // { [ticker]: [{close,...}] }
  const [details, setDetails] = useState({}) // { [ticker]: { short_pct, float, inst_pct } }
  const [scoreVersion, setScoreVersion] = useState(0) // bump to re-read localStorage scores
  const [expandedCharts, setExpandedCharts] = useState(new Set())
  const [chartData, setChartData] = useState({}) // { [ticker]: data }
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [colOrder, setColOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stockman_col_order')) || REORDERABLE_COLS } catch { return REORDERABLE_COLS }
  })
  const [rowOrder, setRowOrder] = useState(() => {
    try { const s = localStorage.getItem('stockman_row_order'); return s ? JSON.parse(s) : null } catch { return null }
  })
  const dragRowId = useRef(null)

  function moveCol(idx, dir) {
    const next = [...colOrder]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setColOrder(next)
    localStorage.setItem('stockman_col_order', JSON.stringify(next))
  }

  function onRowDrop(toId) {
    const fromId = dragRowId.current
    if (!fromId || fromId === toId) return
    const base = rowOrder || positions.map(p => p.id)
    const order = [...base]
    const fi = order.indexOf(fromId), ti = order.indexOf(toId)
    if (fi === -1 || ti === -1) return
    order.splice(fi, 1)
    order.splice(ti, 0, fromId)
    setRowOrder(order)
    localStorage.setItem('stockman_row_order', JSON.stringify(order))
  }

  async function load() {
    setLoading(true)
    try { setPositions(await getPortfolio()) } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    getEurUsd().then(r => setEurUsd(r.rate)).catch(() => {})
  }, [])

  // Fetch volatility + sparklines for each position asynchronously
  useEffect(() => {
    if (positions.length === 0) return
    const tickers = [...new Set(positions.map(p => p.ticker))]
    tickers.forEach(ticker => {
      if (!volatility[ticker])
        getVolatility(ticker).then(data => { if (data) setVolatility(prev => ({ ...prev, [ticker]: data })) }).catch(() => {})
      if (!sparklines[ticker])
        getHistory(ticker, 30).then(data => { if (data) setSparklines(prev => ({ ...prev, [ticker]: data })) }).catch(() => {})
      if (!details[ticker])
        getDetails(ticker).then(data => { if (data) setDetails(prev => ({ ...prev, [ticker]: data })) }).catch(() => {})
    })
  }, [positions])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const data = {
        ...form,
        ticker: form.ticker.toUpperCase(),
        shares: parseFloat(form.shares),
        avg_price: parseFloat(form.avg_price),
        atr_multiplier: parseFloat(form.atr_multiplier),
        atr_period: parseInt(form.atr_period),
        date_bought: form.date_bought || null,
      }
      if (editId) {
        await updatePosition(editId, data)
      } else {
        await addPosition(data)
      }
      setShowForm(false)
      setForm(EMPTY_FORM)
      setEditId(null)
      await load()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this position?')) return
    await deletePosition(id)
    setPositions(p => p.filter(x => x.id !== id))
  }

  async function handleRefresh(id) {
    setRefreshing(id)
    try {
      await refreshPosition(id)
      await load()
    } finally {
      setRefreshing(null)
    }
  }

  async function handleResetAlert(id) {
    await resetAlert(id)
    await load()
  }

  function toggleChart(pos) {
    setExpandedCharts(prev => {
      const next = new Set(prev)
      if (next.has(pos.id)) { next.delete(pos.id) }
      else {
        next.add(pos.id)
        if (!chartData[pos.ticker]) {
          getHistory(pos.ticker, 90).then(data => {
            if (data) setChartData(prev2 => ({ ...prev2, [pos.ticker]: data }))
          }).catch(() => {})
        }
      }
      return next
    })
  }

  async function saveNote(posId) {
    try {
      await updatePosition(posId, { notes: noteText })
      setPositions(prev => prev.map(p => p.id === posId ? { ...p, notes: noteText } : p))
    } catch (e) { alert(e.message) }
    finally { setEditingNoteId(null) }
  }

  function startEdit(pos) {
    setForm({
      ticker: pos.ticker,
      shares: pos.shares,
      avg_price: pos.avg_price,
      date_bought: pos.date_bought || '',
      notes: pos.notes || '',
      trailing_stop_enabled: Boolean(pos.trailing_stop_enabled),
      atr_multiplier: pos.atr_multiplier,
      atr_period: pos.atr_period,
    })
    setEditId(pos.id)
    setShowForm(true)
  }

  // Row order
  const orderedPositions = rowOrder
    ? [...positions].sort((a, b) => {
        const ai = rowOrder.indexOf(a.id), bi = rowOrder.indexOf(b.id)
        if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi
      })
    : positions

  // Dynamic cell renderer
  function renderCell(col, pos, isHardStop, isWarn) {
    switch (col) {
      case 'shares':       return <td key={col} className="px-4 py-3 text-right text-slate-300">{fmt(pos.shares, 4)}</td>
      case 'avg_price':    return <td key={col} className="px-4 py-3 text-right text-slate-300">{fmtMoney(pos.avg_price, currency, eurUsd)}</td>
      case 'current':      return <td key={col} className="px-4 py-3 text-right font-medium text-white">{fmtMoney(pos.current_price, currency, eurUsd)}</td>
      case 'market_value': return <td key={col} className="px-4 py-3 text-right text-slate-300">{fmtMoney(pos.market_value, currency, eurUsd)}</td>
      case 'pnl': return (
        <td key={col} className="px-4 py-3 text-right">
          {pos.unrealized_pnl != null ? (
            <div className={pos.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              <div>{pos.unrealized_pnl >= 0 ? '+' : ''}{fmtMoney(pos.unrealized_pnl, currency, eurUsd)}</div>
              <div className="text-xs">{pos.unrealized_pnl_pct >= 0 ? '+' : ''}{fmt(pos.unrealized_pnl_pct)}%</div>
            </div>
          ) : '—'}
        </td>
      )
      case 'earnings': return (
        <td key={col} className="px-4 py-3 text-right">
          {pos.earnings ? (
            <div>
              <div className={`text-xs font-medium ${pos.earnings.days <= 7 ? 'text-orange-400' : pos.earnings.days <= 30 ? 'text-yellow-400' : 'text-slate-400'}`}>
                {pos.earnings.days === 0 ? '🔔 Today!' : pos.earnings.days === 1 ? '🔔 Tomorrow' : `${pos.earnings.days}d`}
              </div>
              <div className="text-xs text-slate-600">{pos.earnings.date}</div>
            </div>
          ) : <span className="text-slate-600">—</span>}
        </td>
      )
      case 'peak': return <td key={col} className="px-4 py-3 text-right text-slate-400">{fmtMoney(pos.peak_price, currency, eurUsd)}</td>
      case 'stop_atr': return (
        <td key={col} className="px-4 py-3 text-right">
          {pos.stop_price ? <span className={isHardStop ? 'text-red-400 font-bold' : 'text-slate-400'}>{fmtMoney(pos.stop_price, currency, eurUsd)}</span> : '—'}
          {pos.warn_price && !isHardStop ? <div className="text-xs text-yellow-600" title="Warning level">⚠ {fmtMoney(pos.warn_price, currency, eurUsd)}</div> : null}
          {pos.trailing_stop_enabled ? <div className="text-xs text-slate-600">{pos.atr_multiplier}× ATR</div> : <div className="text-xs text-slate-600">off</div>}
        </td>
      )
      case 'status': return (
        <td key={col} className="px-4 py-3 text-center">
          {isHardStop ? (
            <div className="flex flex-col items-center gap-1">
              <span className="badge-red flex items-center gap-1"><AlertTriangle size={11} /> HARD STOP</span>
              <button onClick={() => handleResetAlert(pos.id)} className="text-xs text-slate-500 hover:text-slate-300">reset</button>
            </div>
          ) : isWarn ? (
            <div className="flex flex-col items-center gap-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                <AlertTriangle size={11} /> TRIM?
              </span>
            </div>
          ) : pos.trailing_stop_enabled ? (
            <span className="badge-green">Active</span>
          ) : (
            <span className="badge-yellow">No Stop</span>
          )}
          {(() => {
            const sc = calcSignalScore(pos.id)
            if (sc === 0) return null
            const scColor = sc < 0 ? 'text-emerald-400' : sc <= 30 ? 'text-yellow-400' : sc <= 60 ? 'text-orange-400' : 'text-red-400'
            return <div className={`text-xs font-semibold mt-1 ${scColor}`}>{sc}% signal</div>
          })()}
        </td>
      )
      case 'line': return <td key={col} className="px-4 py-3 text-center"><Sparkline data={sparklines[pos.ticker]} /></td>
      default: return null
    }
  }

  // Summary stats
  const totalValue = positions.reduce((s, p) => s + (p.market_value || 0), 0)
  const totalCost = positions.reduce((s, p) => s + (p.avg_price * p.shares), 0)
  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost ? (totalPnl / totalCost) * 100 : 0
  const stopCount = positions.filter(p => p.stop_triggered).length

  // Risk calculations
  const posRisks = positions.map(p => {
    const risk = (p.current_price && p.stop_price)
      ? (p.current_price - p.stop_price) * p.shares
      : null
    const stopOutValue = p.stop_price ? p.stop_price * p.shares : (p.market_value || 0)
    return { ...p, riskDollar: risk, stopOutValue }
  })
  const totalRisk = posRisks.reduce((s, p) => s + (p.riskDollar || 0), 0)
  const stopOutTotal = posRisks.reduce((s, p) => s + p.stopOutValue, 0)

  return (
    <div className="space-y-6">
      {/* Decision Modal */}
      {decisionPos && (
        <DecisionModal
          pos={decisionPos}
          onClose={() => { setDecisionPos(null); setScoreVersion(v => v + 1) }}
          onLog={() => {}}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-slate-500 mb-1">Portfolio Value</div>
          <div className="text-2xl font-bold text-white">{fmtMoney(totalValue, currency, eurUsd)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500 mb-1">Total Cost</div>
          <div className="text-2xl font-bold text-slate-300">{fmtMoney(totalCost, currency, eurUsd)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500 mb-1">Unrealized P&L</div>
          <div className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}{fmtMoney(totalPnl, currency, eurUsd)}
            <span className="text-sm ml-1">({totalPnlPct >= 0 ? '+' : ''}{fmt(totalPnlPct)}%)</span>
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-500 mb-1">Stop Alerts</div>
          <div className={`text-2xl font-bold ${stopCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {stopCount} <span className="text-sm">triggered</span>
          </div>
        </div>
      </div>

      {/* Risk summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card border-red-500/20">
          <div className="text-xs text-slate-500 mb-1">Total Downside Risk</div>
          <div className="text-xl font-bold text-red-400" title="Sum of (current − stop) × shares for all positions">
            {totalRisk > 0 ? '−' : ''}{fmtMoney(Math.abs(totalRisk), currency, eurUsd)}
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">if all stops hit from here</div>
        </div>
        <div className="card border-orange-500/20">
          <div className="text-xs text-slate-500 mb-1">Stop-Out Portfolio Value</div>
          <div className="text-xl font-bold text-orange-400" title="Total value if all positions exit at their stop price">
            {fmtMoney(stopOutTotal, currency, eurUsd)}
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">worst-case floor value</div>
        </div>
        <div className="card border-yellow-500/20">
          <div className="text-xs text-slate-500 mb-1">Risk as % of Portfolio</div>
          <div className={`text-xl font-bold ${totalValue ? (totalRisk/totalValue*100 > 20 ? 'text-red-400' : totalRisk/totalValue*100 > 10 ? 'text-yellow-400' : 'text-emerald-400') : 'text-slate-400'}`}>
            {totalValue ? fmt(totalRisk / totalValue * 100) : '—'}%
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">{'>'}20% = high · {'<'}10% = healthy</div>
        </div>
        <div className="card border-slate-600/40">
          <div className="text-xs text-slate-500 mb-2">Risk Concentration</div>
          <div className="space-y-1">
            {posRisks
              .filter(p => p.riskDollar != null && totalRisk > 0)
              .sort((a, b) => b.riskDollar - a.riskDollar)
              .slice(0, 3)
              .map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-14 shrink-0">{p.ticker}</span>
                  <div className="flex-1 bg-dark-700 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-orange-500/70"
                      style={{ width: `${Math.min(100, p.riskDollar / totalRisk * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 w-8 text-right">
                    {fmt(p.riskDollar / totalRisk * 100, 0)}%
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Positions ({positions.length})</h2>
          <div className="flex rounded-lg overflow-hidden border border-dark-600 text-xs">
            <button
              onClick={() => setCurrency('USD')}
              className={`px-3 py-1.5 transition-colors ${currency === 'USD' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              $ USD
            </button>
            <button
              onClick={() => setCurrency('EUR')}
              className={`px-3 py-1.5 transition-colors ${currency === 'EUR' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              € EUR
            </button>
          </div>
          {currency === 'EUR' && eurUsd && (
            <span className="text-xs text-slate-500">1€ = ${fmt(eurUsd)}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} /> Refresh All
          </button>
          <button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM) }} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} /> Add Position
          </button>
        </div>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="card border-brand-500/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">{editId ? 'Edit Position' : 'Add Position'}</h3>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Ticker *</label>
              <input className="input uppercase" placeholder="AAPL" required
                value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Shares *</label>
              <input className="input" type="number" step="any" placeholder="100" required
                value={form.shares} onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Avg Buy Price *</label>
              <input className="input" type="number" step="any" placeholder="150.00" required
                value={form.avg_price} onChange={e => setForm(f => ({ ...f, avg_price: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date Bought</label>
              <input className="input" type="date"
                value={form.date_bought} onChange={e => setForm(f => ({ ...f, date_bought: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">ATR Multiplier — Stop Distance</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  { label: 'Tight', value: 1.5, desc: 'Exit fast, high vol', color: 'border-red-500/60 text-red-400' },
                  { label: 'Snug', value: 2.0, desc: 'Conservative exit', color: 'border-orange-500/60 text-orange-400' },
                  { label: 'Normal', value: 2.5, desc: 'Standard — recommended', color: 'border-brand-500/60 text-brand-400' },
                  { label: 'Relaxed', value: 3.0, desc: 'Give more room', color: 'border-yellow-500/60 text-yellow-400' },
                  { label: 'Loose', value: 3.5, desc: 'Trend following', color: 'border-slate-500/60 text-slate-400' },
                  { label: 'Very Loose', value: 4.5, desc: 'Boring/safe stocks', color: 'border-emerald-500/60 text-emerald-400' },
                ].map(t => (
                  <button key={t.value} type="button" title={t.desc}
                    onClick={() => setForm(f => ({ ...f, atr_multiplier: t.value }))}
                    className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${
                      parseFloat(form.atr_multiplier) === t.value
                        ? t.color + ' bg-white/10'
                        : 'border-dark-600 text-slate-500 hover:text-slate-300'
                    }`}>
                    {t.label} <span className="opacity-60">{t.value}×</span>
                  </button>
                ))}
              </div>
              <input className="input w-28" type="number" step="0.1" min="0.5" max="10"
                value={form.atr_multiplier} onChange={e => setForm(f => ({ ...f, atr_multiplier: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">ATR Period (days)</label>
              <input className="input" type="number" step="1" min="5" max="50"
                value={form.atr_period} onChange={e => setForm(f => ({ ...f, atr_period: e.target.value }))} />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-indigo-500"
                  checked={form.trailing_stop_enabled}
                  onChange={e => setForm(f => ({ ...f, trailing_stop_enabled: e.target.checked }))} />
                <span className="text-sm text-slate-300">Trailing Stop</span>
              </label>
            </div>
            <div className="md:col-span-4">
              <label className="text-xs text-slate-400 mb-1 block">Notes</label>
              <input className="input" placeholder="Why you bought it..."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="md:col-span-4 flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
                <Check size={15} /> {saving ? 'Saving...' : (editId ? 'Update' : 'Add Position')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Positions table */}
      {loading ? (
        <div className="text-slate-500 text-center py-12">Loading positions...</div>
      ) : positions.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          No positions yet. Add your first position above.
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 w-6"></th>
                <th className="text-left px-4 py-3">Ticker</th>
                {colOrder.map((col, idx) => (
                  <th key={col} className={`px-2 py-3 text-${COL_META[col].align} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1">
                      {COL_META[col].label}
                      <span className="inline-flex flex-col ml-0.5">
                        <button onClick={() => moveCol(idx, -1)} disabled={idx === 0}
                          className="text-slate-600 hover:text-slate-300 disabled:opacity-20 leading-none p-0">
                          <ChevronUp size={10} />
                        </button>
                        <button onClick={() => moveCol(idx, 1)} disabled={idx === colOrder.length - 1}
                          className="text-slate-600 hover:text-slate-300 disabled:opacity-20 leading-none p-0">
                          <ChevronDown size={10} />
                        </button>
                      </span>
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orderedPositions.map(pos => {
                const isHardStop = pos.stop_triggered
                const isWarn = pos.alerted_warn && !pos.stop_triggered
                const row = (
                  <tr key={pos.id}
                    draggable
                    onDragStart={() => { dragRowId.current = pos.id }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onRowDrop(pos.id)}
                    className={`border-b border-dark-600/50 hover:bg-dark-700/50 transition-colors cursor-grab active:cursor-grabbing ${isHardStop ? 'bg-red-500/5' : isWarn ? 'bg-yellow-500/5' : ''}`}>
                    <td className="px-2 py-3 text-slate-600 hover:text-slate-400">
                      <GripVertical size={14} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center flex-wrap gap-1">
                        <span className="font-bold text-white">{pos.ticker}</span>
                      </div>
                      {pos.date_bought && <div className="text-xs text-slate-500">{pos.date_bought}</div>}
                      {editingNoteId === pos.id ? (
                        <div className="mt-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <textarea
                            className="input text-xs py-1 w-40 resize-none"
                            rows={2}
                            autoFocus
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(pos.id) } if (e.key === 'Escape') setEditingNoteId(null) }}
                          />
                          <div className="flex flex-col gap-1">
                            <button onClick={() => saveNote(pos.id)} className="text-emerald-400 hover:text-emerald-300"><Check size={12} /></button>
                            <button onClick={() => setEditingNoteId(null)} className="text-slate-600 hover:text-slate-300"><X size={12} /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-0.5 group/note cursor-pointer"
                          onClick={() => { setEditingNoteId(pos.id); setNoteText(pos.notes || '') }}>
                          {pos.notes
                            ? <span className="text-xs text-slate-500 truncate max-w-32" title={pos.notes}>{pos.notes}</span>
                            : <span className="text-xs text-slate-700 opacity-0 group-hover/note:opacity-100 transition-opacity">+ note</span>
                          }
                          <FileText size={10} className="text-slate-700 opacity-0 group-hover/note:opacity-100 transition-opacity shrink-0" />
                        </div>
                      )}
                      {details[pos.ticker] && (() => {
                        const d = details[pos.ticker]
                        const parts = []
                        if (d.short_pct != null) parts.push(<span key="s" title="Short % of float" className={`${d.short_pct >= 20 ? 'text-red-400' : d.short_pct >= 10 ? 'text-orange-400' : 'text-slate-500'}`}>S:{d.short_pct}%</span>)
                        if (d.float) parts.push(<span key="f" className="text-slate-500" title="Float shares">F:{d.float}</span>)
                        if (d.inst_pct != null) parts.push(<span key="i" className="text-slate-500" title="Institutional ownership">I:{d.inst_pct}%</span>)
                        if (!parts.length) return null
                        return <div className="flex gap-1.5 mt-0.5 text-[10px]">{parts}</div>
                      })()}
                      <VolatilityBadge data={volatility[pos.ticker]} />
                    </td>
                    {colOrder.map(col => renderCell(col, pos, isHardStop, isWarn))}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => toggleChart(pos)}
                          className={`btn-ghost p-1.5 ${expandedCharts.has(pos.id) ? 'text-sky-400' : ''}`} title="Price chart">
                          <BarChart2 size={13} />
                        </button>
                        <button onClick={() => setDecisionPos(pos)} className="btn-ghost p-1.5" title="Decision checklist">
                          <ClipboardList size={13} />
                        </button>
                        <button onClick={() => handleRefresh(pos.id)} disabled={refreshing === pos.id}
                          className="btn-ghost p-1.5" title="Refresh prices">
                          <RefreshCw size={13} className={refreshing === pos.id ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => startEdit(pos)} className="btn-ghost p-1.5" title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(pos.id)} className="btn-danger p-1.5" title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
                return (
                  <React.Fragment key={pos.id}>
                    {row}
                    {expandedCharts.has(pos.id) && (
                      <tr key={`chart-${pos.id}`} className="bg-dark-800/60">
                        <td colSpan={colOrder.length + 3} className="px-4 py-3">
                          <div className="flex items-center gap-4 mb-2">
                            <span className="text-xs font-semibold text-slate-400">{pos.ticker} — 90 day price chart</span>
                            <div className="flex items-center gap-3 text-[10px]">
                              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-sky-400 rounded"></span> Price</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-red-400 rounded" style={{borderTop:'2px dashed'}}></span> Stop</span>
                              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-indigo-400 rounded"></span> Buy price</span>
                            </div>
                          </div>
                          <PriceChart
                            data={chartData[pos.ticker] || sparklines[pos.ticker]}
                            stopPrice={pos.stop_price}
                            warnPrice={pos.warn_price}
                            avgPrice={pos.avg_price}
                            peakPrice={pos.peak_price}
                          />
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
