import { useState, useEffect, useRef } from 'react'
import { Save, Mail, Bell, RefreshCw, Download, Database, Upload } from 'lucide-react'
import { getSettings, updateSetting, runChecks, exportPortfolio, downloadBackup, restoreBackup } from '../api.js'

export default function SettingsPanel() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState(null)

  // Local editable fields
  const [emailFrom, setEmailFrom] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(true)
  const [defaultMultiplier, setDefaultMultiplier] = useState('2.5')
  const [defaultPeriod, setDefaultPeriod] = useState('14')

  async function load() {
    setLoading(true)
    try {
      const s = await getSettings()
      setSettings(s)
      setEmailFrom(s.email_from || '')
      setAlertsEnabled(s.alerts_enabled === '1')
      setDefaultMultiplier(s.default_atr_multiplier || '2.5')
      setDefaultPeriod(s.default_atr_period || '14')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save(key, value) {
    setSaving(key)
    try {
      await updateSetting(key, value)
      setMsg({ type: 'ok', text: 'Saved.' })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setSaving('')
      setTimeout(() => setMsg(null), 3000)
    }
  }

  async function saveEmail(e) {
    e.preventDefault()
    setSaving('email')
    try {
      await updateSetting('email_from', emailFrom)
      if (emailPassword) {
        await updateSetting('email_password', emailPassword)
        setEmailPassword('')
      }
      setMsg({ type: 'ok', text: 'Email settings saved.' })
      await load()
    } catch (err) {
      setMsg({ type: 'err', text: err.message })
    } finally {
      setSaving('')
      setTimeout(() => setMsg(null), 3000)
    }
  }

  async function handleTestAlerts() {
    setTesting(true)
    try {
      await runChecks()
      setMsg({ type: 'ok', text: 'Check ran — any triggered stops/alerts sent by email.' })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setTesting(false)
      setTimeout(() => setMsg(null), 5000)
    }
  }

  const [exporting, setExporting] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const restoreInputRef = useRef(null)

  async function handleBackup() {
    setBackingUp(true)
    try {
      await downloadBackup()
      setMsg({ type: 'ok', text: 'Backup downloaded.' })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBackingUp(false)
      setTimeout(() => setMsg(null), 3000)
    }
  }

  async function handleRestore(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm(`Restore from "${file.name}"? This will replace ALL current data. Are you sure?`)) {
      e.target.value = ''
      return
    }
    setRestoring(true)
    try {
      const result = await restoreBackup(file)
      setMsg({ type: 'ok', text: result.message })
    } catch (err) {
      setMsg({ type: 'err', text: err.message })
    } finally {
      setRestoring(false)
      e.target.value = ''
      setTimeout(() => setMsg(null), 6000)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const data = await exportPortfolio()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stockman_export_${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="text-slate-500 py-12 text-center">Loading settings...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold text-white">Settings</h2>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {/* Email */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={16} className="text-brand-500" />
          <h3 className="font-semibold text-white">Email Alerts</h3>
        </div>
        <div className="text-xs text-slate-500 -mt-2">
          Alerts will be sent to <span className="text-slate-300">{settings.email_to}</span>
        </div>

        <form onSubmit={saveEmail} className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Gmail address (sender)</label>
            <input className="input" type="email" placeholder="yourname@gmail.com"
              value={emailFrom} onChange={e => setEmailFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Gmail App Password
              {settings.email_password_set && <span className="text-emerald-400 ml-2">✓ Set</span>}
            </label>
            <input className="input" type="password" placeholder={settings.email_password_set ? 'Leave blank to keep existing' : 'Paste 16-character app password'}
              value={emailPassword} onChange={e => setEmailPassword(e.target.value)} />
            <div className="text-xs text-slate-500 mt-1">
              Get it at: Google Account → Security → 2-Step Verification → App Passwords
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-indigo-500"
                checked={alertsEnabled}
                onChange={async e => {
                  setAlertsEnabled(e.target.checked)
                  await save('alerts_enabled', e.target.checked ? '1' : '0')
                }}
              />
              <span className="text-sm text-slate-300">Alerts enabled</span>
            </label>
          </div>

          <button type="submit" disabled={saving === 'email'} className="btn-primary flex items-center gap-1.5">
            <Save size={14} /> {saving === 'email' ? 'Saving...' : 'Save Email Settings'}
          </button>
        </form>
      </div>

      {/* Trailing Stop Defaults */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell size={16} className="text-brand-500" />
          <h3 className="font-semibold text-white">Trailing Stop Defaults</h3>
        </div>
        <div className="text-xs text-slate-500 -mt-2">
          Applied to new positions. Existing positions keep their own settings.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">ATR Multiplier</label>
            <input className="input" type="number" step="0.5" min="0.5" max="10"
              value={defaultMultiplier} onChange={e => setDefaultMultiplier(e.target.value)} />
            <div className="text-xs text-slate-500 mt-1">Stop = Peak − (ATR × multiplier). 2.5 is typical.</div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">ATR Period (days)</label>
            <input className="input" type="number" step="1" min="5" max="50"
              value={defaultPeriod} onChange={e => setDefaultPeriod(e.target.value)} />
            <div className="text-xs text-slate-500 mt-1">14 days is standard.</div>
          </div>
        </div>
        <button
          onClick={async () => {
            await save('default_atr_multiplier', defaultMultiplier)
            await save('default_atr_period', defaultPeriod)
          }}
          disabled={saving === 'default_atr_multiplier'}
          className="btn-primary flex items-center gap-1.5"
        >
          <Save size={14} /> Save Defaults
        </button>
      </div>

      {/* Backup / Restore */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Database size={16} className="text-brand-500" />
          <h3 className="font-semibold text-white">Data Backup & Restore</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Backup saves your entire database — positions, journal, watchlist, snapshots, and settings — as a single <code className="text-slate-300">.db</code> file. Store it in Google Drive, Dropbox, or anywhere safe.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleBackup} disabled={backingUp} className="btn-primary flex items-center gap-1.5">
            <Download size={14} />
            {backingUp ? 'Downloading…' : 'Download Backup'}
          </button>
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoring}
            className="btn-ghost flex items-center gap-1.5 text-yellow-400 hover:text-yellow-300"
          >
            <Upload size={14} />
            {restoring ? 'Restoring…' : 'Restore from Backup'}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".db"
            className="hidden"
            onChange={handleRestore}
          />
        </div>
        <p className="text-[11px] text-slate-600">⚠ Restore replaces all current data. Make a backup first.</p>
      </div>

      {/* Export */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Download size={16} className="text-brand-500" />
          <h3 className="font-semibold text-white">Export for AI Analysis</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Downloads your complete portfolio as a JSON file — positions, P&L, signal scores, trade journal, watchlist with short interest data, and weekly snapshots. Paste it into Claude or ChatGPT and ask questions.
        </p>
        <div className="text-xs text-slate-600 space-y-1">
          <div>Example prompts after pasting:</div>
          <div className="text-slate-500 pl-2 space-y-0.5">
            <div>· "Which positions have the highest risk based on signal scores?"</div>
            <div>· "Am I over-exposed to any single sector?"</div>
            <div>· "Based on my journal, do I tend to sell too early?"</div>
            <div>· "Which watchlist stocks have rising short interest?"</div>
          </div>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-primary flex items-center gap-1.5">
          <Download size={14} />
          {exporting ? 'Preparing export…' : 'Download stockman_export.json'}
        </button>
      </div>

      {/* Manual check */}
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <RefreshCw size={16} className="text-brand-500" />
          <h3 className="font-semibold text-white">Manual Price Check</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Checks are automatic every hour Mon–Fri during market hours. Run one manually anytime.
        </p>
        <button onClick={handleTestAlerts} disabled={testing} className="btn-primary flex items-center gap-1.5">
          <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
          {testing ? 'Running...' : 'Run Checks Now'}
        </button>
      </div>
    </div>
  )
}
