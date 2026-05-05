const BASE = '/api'

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// Portfolio
export const getPortfolio = () => req('/portfolio')
export const addPosition = (data) => req('/portfolio', { method: 'POST', body: JSON.stringify(data) })
export const updatePosition = (id, data) => req(`/portfolio/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deletePosition = (id) => req(`/portfolio/${id}`, { method: 'DELETE' })
export const refreshPosition = (id) => req(`/portfolio/${id}/refresh`, { method: 'POST' })
export const resetAlert = (id) => req(`/portfolio/${id}/reset-alert`, { method: 'POST' })

// Watchlist
export const getWatchlist = () => req('/watchlist')
export const addWatchlist = (data) => req('/watchlist', { method: 'POST', body: JSON.stringify(data) })
export const updateWatchlist = (id, data) => req(`/watchlist/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteWatchlist = (id) => req(`/watchlist/${id}`, { method: 'DELETE' })

// Journal
export const getJournal = () => req('/journal')
export const addJournal = (data) => req('/journal', { method: 'POST', body: JSON.stringify(data) })
export const deleteJournal = (id) => req(`/journal/${id}`, { method: 'DELETE' })

// Settings
export const getSettings = () => req('/settings')
export const updateSetting = (key, value) => req('/settings', { method: 'POST', body: JSON.stringify({ key, value }) })

// Market
export const getPrice = (ticker) => req(`/price/${ticker}`)
export const getHistory = (ticker, days = 60) => req(`/history/${ticker}?days=${days}`)
export const runChecks = () => req('/run-checks', { method: 'POST' })
export const getEurUsd = () => req('/fx/eurusd')

export async function getVolatility(ticker) {
  const r = await fetch(`/api/volatility/${ticker}`)
  if (!r.ok) return null
  return r.json()
}

export async function getDetails(ticker) {
  const r = await fetch(`/api/details/${ticker}`)
  if (!r.ok) return null
  return r.json()
}

export async function downloadBackup() {
  const res = await fetch('/api/backup')
  if (!res.ok) throw new Error('Backup failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stockman_backup_${new Date().toISOString().slice(0,10)}.db`
  a.click()
  URL.revokeObjectURL(url)
}

export async function restoreBackup(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/restore', { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Restore failed')
  }
  return res.json()
}

export async function exportPortfolio() {
  const data = await req('/export')

  // Merge signal scores from localStorage into each position
  data.portfolio = data.portfolio.map(pos => {
    try {
      const raw = JSON.parse(localStorage.getItem(`decision_v3_${pos.id}`)) || {}
      const reasons = []
      const WEIGHTS = [20,20,20,20,10,10,-10] // must match DECISION_REASONS order
      Object.entries(raw).forEach(([key, val]) => {
        if (key.startsWith('r_') && val.on) {
          const idx = parseInt(key.replace('r_', ''))
          reasons.push({ reason: `reason_${idx}`, weight: WEIGHTS[idx] || 0, notes: val.texts || [] })
        }
      })
      ;(raw.custom || []).forEach(c => {
        if (c.label) reasons.push({ reason: c.label, weight: c.weight, notes: c.texts || [] })
      })
      const score = reasons.reduce((s, r) => {
        const noteVal = r.weight < 0 ? -1 : 1
        return s + r.weight + r.notes.filter(t => t.trim()).length * noteVal
      }, 0)
      return { ...pos, signal_score: score, signal_reasons: reasons }
    } catch {
      return { ...pos, signal_score: 0, signal_reasons: [] }
    }
  })

  return data
}
