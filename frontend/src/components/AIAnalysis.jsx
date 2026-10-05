import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, RefreshCw, AlertCircle, TrendingDown } from 'lucide-react'

const PRESET_QUESTIONS = [
  { label: 'Portfolio health check', q: 'Give me a complete portfolio health check — P&L, risk, stop levels, and anything that needs attention.' },
  { label: 'Biggest risks', q: 'Which positions carry the most risk right now and why? Consider stop proximity, concentration, and volatility.' },
  { label: 'Near trailing stops', q: 'Which positions are closest to their trailing stop levels? How much downside room do they have?' },
  { label: 'Sector diversification', q: 'How diversified is my portfolio across sectors and industries? Am I over-exposed anywhere?' },
  { label: 'Journal patterns', q: 'Based on my trade journal, do I have any recurring patterns or habits I should be aware of?' },
  { label: 'Watchlist opportunities', q: 'Looking at my watchlist stocks, which ones look most interesting right now and what should I watch for?' },
]

const BEAR_QUESTION = "Run a full bear case analysis on my portfolio. Find every weakness, risk, and mistake. Be brutal and specific."

export default function AIAnalysis() {
  const [question, setQuestion] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [askedQuestion, setAskedQuestion] = useState('')
  const [activeMode, setActiveMode] = useState('default')
  const responseRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [response])

  async function ask(q, mode = 'default') {
    const text = (q || question).trim()
    if (!text || loading) return

    setResponse('')
    setError(null)
    setAskedQuestion(text)
    setActiveMode(mode)
    setLoading(true)

    try {
      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, mode }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Analysis failed' }))
        throw new Error(err.detail || 'Analysis failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue
          try {
            const parsed = JSON.parse(raw)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.text) setResponse(prev => prev + parsed.text)
          } catch (parseErr) {
            if (parseErr.message !== 'Unexpected end of JSON input') throw parseErr
          }
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isBear = activeMode === 'bear'

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-brand-500" />
        <h2 className="text-lg font-semibold text-white">AI Analysis</h2>
        <span className="text-xs text-slate-500 ml-1">powered by Claude</span>
      </div>

      {/* Bear Analysis */}
      <div className="rounded-lg border border-red-800/60 bg-red-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown size={16} className="text-red-400" />
          <span className="font-semibold text-red-300 text-sm">Bear Analysis</span>
          <span className="text-[10px] text-red-600 uppercase tracking-wider ml-1">devil's advocate mode</span>
        </div>
        <p className="text-xs text-red-400/80 leading-relaxed">
          Claude switches to pure critic mode — no praise, no balance. It will dig through your positions, journal, stop levels,
          and watchlist looking for every weakness, bad habit, and hidden risk. Ends with a fragility score and the #1 thing to fix.
        </p>
        <button
          onClick={() => ask(BEAR_QUESTION, 'bear')}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/40 border border-red-700/50 text-red-300 text-sm font-medium hover:bg-red-900/60 hover:border-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading && isBear
            ? <RefreshCw size={14} className="animate-spin" />
            : <TrendingDown size={14} />
          }
          {loading && isBear ? 'Digging for problems…' : 'Run Bear Analysis'}
        </button>
      </div>

      {/* Preset questions */}
      <div className="card space-y-3">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Quick analysis</div>
        <div className="flex flex-wrap gap-2">
          {PRESET_QUESTIONS.map(({ label, q }) => (
            <button
              key={label}
              onClick={() => ask(q, 'default')}
              disabled={loading}
              className="btn-ghost text-xs px-3 py-1.5 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Response area */}
      {(response || loading || error) && (
        <div className={`card space-y-3 ${isBear ? 'border-red-800/40' : ''}`}>
          {askedQuestion && (
            <div className={`text-xs border-b pb-2 ${isBear ? 'text-red-500/70 border-red-900/50' : 'text-slate-500 border-dark-600'}`}>
              {isBear && <span className="text-red-400 font-semibold mr-1">BEAR: </span>}
              {!isBear && <span className="text-slate-400 font-medium">Q: </span>}
              {askedQuestion}
            </div>
          )}
          {error ? (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : (
            <div
              ref={responseRef}
              className={`text-sm leading-relaxed whitespace-pre-wrap max-h-[560px] overflow-y-auto pr-1 ${
                isBear ? 'text-red-200' : 'text-slate-200'
              }`}
            >
              {response}
              {loading && (
                <span className={`inline-block w-1.5 h-[1em] ml-0.5 animate-pulse align-middle rounded-sm ${
                  isBear ? 'bg-red-500' : 'bg-brand-500'
                }`} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Custom question input */}
      <div className="card space-y-3">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Ask anything</div>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            className="input flex-1 resize-none min-h-[40px] max-h-[120px]"
            rows={1}
            placeholder="e.g. Should I trim any positions given current market conditions?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
            disabled={loading}
          />
          <button
            onClick={() => ask()}
            disabled={loading || !question.trim()}
            className="btn-primary flex items-center gap-1.5 shrink-0 self-end"
          >
            {loading && !isBear
              ? <RefreshCw size={14} className="animate-spin" />
              : <Send size={14} />
            }
            {loading && !isBear ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        <p className="text-[11px] text-slate-600">
          Your portfolio, journal, and watchlist are sent to Claude for analysis. Set your API key in Settings → AI Analysis.
        </p>
      </div>

    </div>
  )
}
