import { useState, useEffect } from 'react'
import { TrendingUp, List, BookOpen, Settings, RefreshCw, Bell, GraduationCap } from 'lucide-react'
import Portfolio from './components/Portfolio.jsx'
import Watchlist from './components/Watchlist.jsx'
import Journal from './components/Journal.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import Guide from './components/Guide.jsx'
import { runChecks } from './api.js'

const TABS = [
  { id: 'portfolio', label: 'Portfolio', icon: TrendingUp },
  { id: 'watchlist', label: 'Watchlist', icon: List },
  { id: 'journal',   label: 'Journal',   icon: BookOpen },
  { id: 'guide',     label: 'Guide',     icon: GraduationCap },
  { id: 'settings',  label: 'Settings',  icon: Settings },
]

export default function App() {
  const [tab, setTab] = useState('portfolio')
  const [checking, setChecking] = useState(false)
  const [lastCheck, setLastCheck] = useState(null)

  async function handleRunChecks() {
    setChecking(true)
    try {
      await runChecks()
      setLastCheck(new Date().toLocaleTimeString())
    } catch (e) {
      console.error(e)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header */}
      <header className="bg-dark-800 border-b border-dark-600 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <img src="https://ik.imagekit.io/epicscape/ES+Krasis/Logot/stockman-logo-white.png" className="h-8 w-auto" alt="Stockman" />
              <span className="text-xl font-bold text-white tracking-tight">Stockman</span>
            </div>
            <div className="text-[10px] text-slate-500 tracking-wide">the sharpest tool in your finance toolbox</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastCheck && (
            <span className="text-xs text-slate-500">Last check: {lastCheck}</span>
          )}
          <button
            onClick={handleRunChecks}
            disabled={checking}
            className="btn-ghost flex items-center gap-1.5 text-xs"
            title="Run price checks now"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check Now'}
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-dark-800 border-b border-dark-600 px-6">
        <div className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-brand-500 text-brand-500'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="p-6">
        {tab === 'portfolio' && <Portfolio />}
        {tab === 'watchlist' && <Watchlist />}
        {tab === 'journal'   && <Journal />}
        {tab === 'guide'     && <Guide />}
        {tab === 'settings'  && <SettingsPanel />}
      </main>
    </div>
  )
}
