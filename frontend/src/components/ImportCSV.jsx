import { useState, useRef } from 'react'
import { Upload, RefreshCw, FileText, Check, X, AlertCircle } from 'lucide-react'

const ACTION_COLORS = {
  BUY:      'text-emerald-400',
  SELL:     'text-red-400',
  DIVIDEND: 'text-yellow-400',
}

export default function ImportCSV() {
  const [step, setStep]         = useState('upload')  // upload | loading | map | done
  const [preview, setPreview]   = useState(null)
  const [tickerMap, setTickerMap] = useState({})
  const [importing, setImporting] = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const fileRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStep('loading')
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/import/csv/preview', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to parse CSV')
      }
      const data = await res.json()
      if (!data.total) throw new Error('No buy/sell/dividend transactions found in this file.')
      setPreview(data)
      setTickerMap({ ...data.companies })
      setStep('map')
    } catch (err) {
      setError(err.message)
      setStep('upload')
    } finally {
      if (e.target) e.target.value = ''
    }
  }

  async function handleImport() {
    setImporting(true)
    setError(null)
    try {
      const rows = preview.rows
        .filter(r => tickerMap[r.security_name]?.trim())
        .map(r => ({ ...r, ticker: tickerMap[r.security_name].trim() }))

      const res = await fetch('/api/import/csv/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      setResult(data)
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setStep('upload')
    setPreview(null)
    setResult(null)
    setError(null)
    setTickerMap({})
  }

  // Stats per company
  function companyStats() {
    if (!preview) return {}
    const s = {}
    for (const row of preview.rows) {
      if (!s[row.security_name]) s[row.security_name] = { BUY: 0, SELL: 0, DIVIDEND: 0 }
      s[row.security_name][row.action] = (s[row.security_name][row.action] || 0) + 1
    }
    return s
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  if (step === 'upload' || step === 'loading') return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed">
        Supports <span className="text-slate-300">Nordnet</span> CSV export
        (Tapahtumat-osio → Lataa CSV). Imports buy/sell/dividend history into your Journal.
      </p>
      {error && (
        <div className="flex items-start gap-2 text-red-400 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={step === 'loading'}
        className="btn-primary flex items-center gap-1.5"
      >
        {step === 'loading'
          ? <RefreshCw size={14} className="animate-spin" />
          : <Upload size={14} />
        }
        {step === 'loading' ? 'Parsing CSV…' : 'Upload Nordnet CSV'}
      </button>
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
    </div>
  )

  // ── Map tickers ────────────────────────────────────────────────────────────
  if (step === 'map') {
    const stats = companyStats()
    const companies = Object.keys(preview.companies)
    const mapped = companies.filter(n => tickerMap[n]?.trim())
    const totalToImport = preview.rows.filter(r => tickerMap[r.security_name]?.trim()).length

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <FileText size={14} className="text-brand-500" />
          <span className="text-slate-300">
            Found <span className="text-white font-semibold">{preview.total}</span> transactions
            in <span className="text-white font-semibold">{companies.length}</span> securities.
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Verify or correct the auto-detected ticker symbols. Leave blank to skip that security.
        </p>

        <div className="border border-dark-600 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-0 text-[10px] uppercase tracking-wide text-slate-500 px-3 py-2 bg-dark-800 border-b border-dark-600">
            <span>Security (from CSV)</span>
            <span className="text-center w-32">Ticker</span>
            <span className="text-right w-28">Transactions</span>
          </div>
          {companies.map(name => {
            const s = stats[name] || {}
            const parts = [
              s.BUY      && `${s.BUY}× buy`,
              s.SELL     && `${s.SELL}× sell`,
              s.DIVIDEND && `${s.DIVIDEND}× div`,
            ].filter(Boolean)
            return (
              <div key={name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 border-b border-dark-600/40 last:border-0 hover:bg-dark-700/30">
                <div className="min-w-0">
                  <div className="text-sm text-slate-200 truncate">{name}</div>
                </div>
                <input
                  className="input w-32 text-sm uppercase text-center py-1"
                  placeholder="TICKER"
                  value={tickerMap[name] || ''}
                  onChange={e => setTickerMap(m => ({ ...m, [name]: e.target.value.toUpperCase() }))}
                />
                <div className="text-[10px] text-slate-500 text-right w-28 space-y-0.5">
                  {parts.map(p => <div key={p}>{p}</div>)}
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="flex items-start gap-2 text-red-400 text-xs">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing || totalToImport === 0}
            className="btn-primary flex items-center gap-1.5"
          >
            {importing
              ? <RefreshCw size={14} className="animate-spin" />
              : <Check size={14} />
            }
            {importing ? 'Importing…' : `Import ${totalToImport} transactions to Journal`}
          </button>
          <button onClick={reset} className="btn-ghost text-sm flex items-center gap-1">
            <X size={13} /> Cancel
          </button>
        </div>
        {mapped < companies.length && (
          <p className="text-[11px] text-slate-600">
            {companies.length - mapped} securities without a ticker will be skipped.
          </p>
        )}
      </div>
    )
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
        <Check size={15} /> Import complete
      </div>
      <div className="text-sm text-slate-300">
        Added{' '}
        <span className="text-white font-semibold">{result.added}</span> transactions to the Journal.
        {result.skipped > 0 && (
          <span className="text-slate-500"> ({result.skipped} skipped — no ticker or invalid row.)</span>
        )}
      </div>
      <p className="text-xs text-slate-500">Open the Journal tab to review the imported entries.</p>
      <button onClick={reset} className="btn-ghost text-sm">Import another file</button>
    </div>
  )
}
