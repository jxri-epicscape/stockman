export default function Guide() {
  return (
    <div className="space-y-6 max-w-3xl">

      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Stockman — Investment Guide</h2>
        <p className="text-slate-500 text-sm">Personal reference. Re-read before making decisions.</p>
      </div>

      {/* 1 */}
      <Section title="Why Trailing Stop Is Your Most Important Tool" accent="brand">
        <p>Losses are asymmetric. Lose 50% and you need 100% to recover. Lose 75% and you need 300%. <strong>Protecting capital beats making gains.</strong></p>
        <Table rows={[
          ['You lose', 'You need to recover'],
          ['10%', '11%'],
          ['25%', '33%'],
          ['50%', '100%'],
          ['75%', '300%'],
        ]} />
        <p>Two psychological traps kill most investors:</p>
        <ul>
          <li><strong>Loss Aversion</strong> — losses feel twice as painful as gains feel good (Kahneman, Nobel Prize). When a stock drops, your brain says "hold, it will come back." Even when it won't.</li>
          <li><strong>Wrong direction</strong> — selling winners early (feels good), holding losers forever (avoiding admitting a mistake).</li>
        </ul>
        <Callout>The trailing stop removes emotion from the equation. The rule decides — not you.</Callout>
      </Section>

      {/* 2 */}
      <Section title="How ATR-Based Trailing Stop Works" accent="emerald">
        <p>Stop = Peak Price − (ATR × Multiplier). The stop <strong>only moves up</strong> — never down.</p>
        <Table rows={[
          ['Stock Price', 'Stop Level', 'Action'],
          ['$100', '$94', 'Starting point (ATR=3, mult=2×)'],
          ['$110', '$104', 'Stock up → stop moves up'],
          ['$120', '$114', 'Stock up → stop moves up'],
          ['$115', '$114', 'Stock dips → stop STAYS'],
          ['$113.99', '$114', '→ ALERT: EXIT'],
        ]} />
        <p><strong>Why ATR, not %?</strong> A volatile stock like Tesla moves 5% on a normal day — a fixed 5% stop triggers constantly. ATR measures the stock's natural daily movement and adjusts accordingly. You're always asking: "did it move abnormally badly?" — not just "did it move?"</p>
        <Callout color="yellow">If you use leverage, set a tighter multiplier (1.5–2×). Your stop must trigger before a margin call.</Callout>
      </Section>

      {/* 3 */}
      <Section title="Two-Tier Alert System" accent="orange">
        <Table rows={[
          ['Level', 'Trigger', 'Action'],
          ['🟡 Warning', 'ATR × lower multiplier', 'Email: consider trimming'],
          ['🔴 Hard Stop', 'ATR × full multiplier', 'Email: exit position'],
        ]} />
        <p>Do not ignore yellow alerts. They exist because by the time the red fires, it may already be painful.</p>
      </Section>

      {/* 4 */}
      <Section title="ATR Multiplier Themes" accent="slate">
        <Table rows={[
          ['Theme', 'Multiplier', 'Use for'],
          ['Tight', '1.5×', 'High volatility stocks, leveraged positions'],
          ['Snug', '2.0×', 'Conservative, want early exit'],
          ['Normal', '2.5×', 'Standard — works for most stocks'],
          ['Relaxed', '3.0×', 'Give more room, trust the trend'],
          ['Loose', '3.5×', 'Trend following, strong conviction'],
          ['Very Loose', '4.5×', 'Boring/safe stocks, long-term hold'],
        ]} />
      </Section>

      {/* 5 */}
      <Section title="Signal Score System" accent="brand">
        <p>Every position has a score 0–100+. Use it as a pressure gauge, not a hard rule.</p>
        <Table rows={[
          ['Score', 'Signal', 'Action'],
          ['< 0', 'Strong hold', 'Conviction outweighs all concerns'],
          ['0', 'Hold', 'No signals'],
          ['1–30', 'Trim', 'Consider reducing position size'],
          ['31+', 'Sell', 'Exit or heavy trim'],
        ]} />
        <Table rows={[
          ['Reason type', 'Points'],
          ['Sell: Stock broke a clear trend (lower highs, lower lows)', '+20'],
          ['Sell: Bad earnings / fundamental change', '+20'],
          ['Sell: Whole market or sector is crashing', '+20'],
          ['Sell: Short interest trend rising week over week', '+20'],
          ['Sell: I no longer have conviction in this stock', '+20'],
          ['Trim: Normal volatility shakeout — stock still in uptrend', '+10'],
          ['Trim: I have big unrealized gains, want to protect some profit', '+10'],
          ['Conviction: I still believe in the company long-term', '−10'],
          ['Each note added (sell/trim reason)', '+1'],
          ['Each note added (conviction reason)', '−1'],
        ]} />
        <Callout>One sell reason (bad earnings) + two notes (missed revenue, dilution) = 22%. One trim + conviction = 0. Numbers tell you where you stand.</Callout>
      </Section>

      {/* 6 */}
      <Section title="Trim vs Sell All" accent="red">
        <p><strong>Sell ALL when:</strong></p>
        <ul>
          <li>Stock broke a clear trend (lower highs, lower lows)</li>
          <li>Bad earnings or fundamental change</li>
          <li>Whole market or sector is crashing</li>
          <li><strong>Short interest trend rising week over week</strong> — smart money is building positions against the stock. Check the ↑ arrow in Watchlist. If short % is rising consistently across 2–3 weekly snapshots, treat it as a sell signal. Combine with days-to-cover: rising short + high days-to-cover = fragile, trapped shorts = potential violent move in either direction.</li>
          <li>You no longer have conviction</li>
        </ul>
        <p><strong>TRIM (sell partial) when:</strong></p>
        <ul>
          <li>Normal volatility shakeout — stock still in uptrend</li>
          <li>You have big unrealized gains and want to protect some profit</li>
          <li>You still believe in the company long-term</li>
        </ul>
        <Callout color="yellow">Practical rule: First alert → trim 50%. If it keeps falling and hits the second level → sell the rest.</Callout>

        <p><strong>The AXTI lesson — when you feel like selling everything</strong></p>
        <p>Bought 500 shares at $15. Signal check showed 10%. Sold everything at $25. Stock went to $75.</p>
        <p>The signal said trim — not sell. The emotion said run.</p>
        <Table rows={[
          ['Action', 'Result'],
          ['Sold all 500 shares at $25', '+$5,000 profit — real, locked in'],
          ['What trim would have done', 'Sell 150 shares at $25 (+$1,500), hold 350'],
          ['350 shares at $75', '+$21,000 still captured on the remaining position'],
          ['Total with trim approach', '~$22,500 vs $5,000 actually made'],
        ]} />
        <p>The hype risk was real. The fundamentals did not support $75. Selling at $25 was not wrong — selling <strong>everything</strong> at 10% signal was the mistake.</p>
        <ul>
          <li>10% signal = trim territory. Sell 20–30%, keep the rest running.</li>
          <li>You don't need to choose between "sell all" and "hold all." That's what trim exists for.</li>
          <li>Missing a momentum run is not a mistake if you had no reason to stay. Chasing it after at $75 would be the real mistake.</li>
          <li>The trailing stop would have protected the remaining position — you'd exit near the top automatically, not by guessing.</li>
        </ul>
        <Callout color="red">When you feel like selling everything and the signal is below 30% — sell partial only. Lock in peace of mind, keep exposure. Let the stop do the rest.</Callout>
      </Section>

      {/* 7 */}
      <Section title="Short Interest / Float / Institutional Ownership" accent="slate">
        <Table rows={[
          ['Metric', 'Low value means', 'High value means'],
          ['Short %', 'Nobody bets against it — safe', 'High squeeze risk, also high risk'],
          ['Float', 'Small = volatile, moves fast', 'Large = stable, hard to move'],
          ['Institutional %', 'Retail-driven, speculative', 'Smart money holds — steady hands'],
        ]} />
        <p>Amazon profile: short ~1–2%, institutional ~65%, large float. This is your benchmark for "safe."</p>
        <p>RDDT: institutional 98.8%, float 135M. High institutional on a small float = can drop hard and fast when one big fund exits.</p>
      </Section>

      {/* 8 */}
      <Section title="Volatility Badge" accent="emerald">
        <Table rows={[
          ['Badge', 'Meaning', 'Days with >5% move / year'],
          ['🟢 Low', 'Calm, boring — ideal for leverage', '< 10 days'],
          ['🟠 Med', 'Normal market stock', '10–49 days'],
          ['🔴 High', 'Volatile — be careful with leverage', '50+ days'],
        ]} />
      </Section>

      {/* 9 */}
      <Section title="Finnish Capital Gains Tax (30% / 34%)" accent="orange">
        <ul>
          <li>30% on profits up to €30,000 per year</li>
          <li>34% on profits above €30,000</li>
          <li>Every trailing stop trigger = taxable event in regular account</li>
          <li>Loan interest is tax deductible — offsets gains</li>
        </ul>
        <Table rows={[
          ['Account', 'Tax on stop triggers', 'Notes'],
          ['OST (Osakesäästötili)', 'None until withdrawal', 'Max €50k deposit, perfect for trailing stops'],
          ['Regular brokerage', '30% per realized gain', 'Leverage available here'],
          ['Kapitalisaatiosopimus', 'Deferred', 'Annual fees eat returns'],
        ]} />
        <Callout color="yellow">OST + trailing stops = tax-efficient compounding. Regular account + leverage = more power, but every exit costs 30%.</Callout>
        <p><strong>€30,000 threshold trick:</strong> If you're near €30k gains in November — wait until January to sell the last position. New tax year, fresh bucket.</p>
      </Section>

      {/* 10 */}
      <Section title="Leverage — €20k Stock Loan" accent="red">
        <p>With 2× leverage, gains AND losses are doubled.</p>
        <Table rows={[
          ['', 'Your capital only', 'With €20k loan'],
          ['Invest', '€20,000', '€40,000'],
          ['+25% move', '+€5,000', '+€10,000 🚀'],
          ['−25% move', '−€5,000', '−€10,000 💀 (€10k left)'],
        ]} />
        <Callout color="red">With leverage, a trailing stop is survival — not optional. Set it tighter than normal (1.5–2× ATR max).</Callout>
        <p><strong>Margin call:</strong> If portfolio drops below ~130% of loan value, broker forces a sale at the worst time. Your stop must trigger before this level.</p>
        <p><strong>Use leverage only on:</strong> MSFT, AAPL, AMZN, GOOGL, V, MA, COST — low volatility, high institutional, strong trend. Never on small caps or high-volatility stocks.</p>
      </Section>

      {/* 11 */}
      <Section title="The Trail-the-Giants Strategy" accent="brand">
        <p>Someone built real wealth by just trailing META, AAPL, NFLX, AMZN with stop protection. The math:</p>
        <Table rows={[
          ['Ticker', '2015 → 2024', 'Return'],
          ['AMZN', '$15 → $200', '+1,200%'],
          ['AAPL', '$28 → $220', '+685%'],
          ['META', '$78 → $550', '+605%'],
          ['NFLX', '$48 → $650', '+1,250%'],
        ]} />
        <p>The trailing stop protects you during the ugly parts (COVID −40%, rate hike crash −50–70%) and re-enters when trend resumes.</p>
        <Callout>It's not genius — it's discipline. 99% of people can't hold through a 60% drawdown. The stop removes the decision.</Callout>
        <p><strong>Finnish tax note:</strong> This works best inside OST. In regular account, each trigger = 30% tax event.</p>
      </Section>

      {/* 12 */}
      <Section title="Similar to Amazon — Data Profile" accent="emerald">
        <p>Amazon's data traits: beta ~1.1, short ~1–2%, institutional ~65%, multi-segment revenue, consistent cash flow, trend always recovers.</p>
        <Table rows={[
          ['Ticker', 'Match level', 'Why'],
          ['MSFT', '🥇 Closest twin', 'Beta 0.9, inst 72%, short <1%, cloud+office+gaming'],
          ['GOOGL', '🥇 Very close', 'Beta 1.1, inst 65%, diversified (search/cloud/YouTube)'],
          ['AAPL', '🥇 Very close', 'Beta 1.2, ecosystem moat, pricing power'],
          ['V / MA', '🥈 Strong', 'Beta 0.9, inst 90%+, toll-road model, near-zero short'],
          ['COST', '🥈 Strong', 'Beta 0.8, ultra-consistent compounder, loyal base'],
          ['ASML', '🥉 Partial', 'Near-monopoly in chip lithography — but more volatile'],
        ]} />
        <p><strong>Note:</strong> If you own AMZN, MSFT is not diversification — it's the same bet in a different shirt.</p>
      </Section>

      {/* 13 */}
      <Section title="Data Model Limitations — What the Numbers Actually Mean" accent="yellow">
        <p>This model is useful as long as its limitations are understood. The goal is not precision — it is to detect when risk is increasing or decreasing.</p>

        <p><strong>Short Interest</strong></p>
        <ul>
          <li>Reported with a delay — reflects the recent past, not right now</li>
          <li>Incomplete: positions built through derivatives don't appear</li>
          <li>The absolute number is always an approximation</li>
          <li><strong>Practical rule:</strong> focus on the direction of change, not the value itself. A rising short % over several weeks matters more than any single reading</li>
        </ul>

        <p><strong>Float</strong></p>
        <ul>
          <li>Not a precisely defined number — different sources calculate it differently</li>
          <li>Insider holdings, locked shares, and ETF structures can distort it</li>
          <li>If float is inaccurate, the short % derived from it is also inaccurate</li>
          <li><strong>Practical rule:</strong> use one consistent source (yfinance). Consistency matters more than finding the "correct" number. Treat float as a relative measure — float as % of total shares outstanding</li>
        </ul>

        <p><strong>Institutional Ownership</strong></p>
        <ul>
          <li>Claims of 98–100% institutional often arise from aggregated data with double-counting</li>
          <li>What matters is not just the % but the distribution — broad ownership = stability, concentrated = additional risk</li>
          <li>Watch for exits: falling inst% quarter over quarter is a warning signal</li>
          <li><strong>Practical rule:</strong> treat extreme values (&gt;95%) with caution — Stockman flags these automatically</li>
        </ul>

        <Callout color="yellow">Core principle: track changes over time using the same source. Direction is reliable. Absolute numbers are estimates.</Callout>

        <p><strong>Days to Cover (Short Ratio) — the liquidity layer</strong></p>
        <p>Short interest alone does not fully describe risk. What matters equally is how easily those positions can be unwound. Rising short interest with low volume = shorts are trapped = fragile situation.</p>
        <ul>
          <li><strong>Formula:</strong> Short Shares ÷ Average Daily Volume</li>
          <li><strong>Answers:</strong> if all short sellers tried to exit today at the same time, how many full trading days would it take to buy back all those shares?</li>
        </ul>

        <p><strong>Concrete example</strong></p>
        <ul>
          <li>SOUN has 50M shares shorted, average daily volume 10M</li>
          <li>Days to Cover = 50M ÷ 10M = <strong>5 days</strong></li>
          <li>Meaning: shorts need 5 full trading days just to unwind — no other buying or selling, just covering</li>
        </ul>

        <p><strong>Why it matters</strong></p>
        <p>Short sellers borrow shares and sell them. Eventually they must buy them back (cover). That buying creates upward pressure on price.</p>
        <Table rows={[
          ['Scenario', 'What happens'],
          ['Bad news + low days-to-cover', 'Shorts exit fast, clean controlled drop'],
          ['Bad news + high days-to-cover', 'Shorts cannot exit fast — crowded exit, chaotic price action'],
          ['Good news + high days-to-cover', 'Shorts forced to buy to cover → price spikes violently → short squeeze'],
        ]} />

        <Table rows={[
          ['Days to Cover', 'Situation'],
          ['< 3 days', '✓ Liquid — shorts can exit fast, low squeeze risk'],
          ['3–5 days', 'Moderate — normal range for most stocks'],
          ['5–10 days', '⚠ Elevated — exit harder, volatility risk rises'],
          ['> 10 days', '🔴 Trapped — any upward move can trigger violent squeeze'],
        ]} />

        <p><strong>The GameStop lesson (January 2021)</strong></p>
        <ul>
          <li>GME days to cover: ~13 days. Short % of float: ~140%</li>
          <li>Reddit noticed → coordinated buying → shorts could not exit → forced to buy at higher and higher prices</li>
          <li>Price: $20 → $483 in two weeks</li>
          <li>The trap was the days-to-cover. The spark was retail buying.</li>
        </ul>

        <p><strong>How to read it in Stockman</strong></p>
        <p>When you see in Watchlist:</p>
        <ul>
          <li>Short %: 18% ↑ · Days to Cover: 11 → shorts are trapped and increasing. High energy stored in the position.</li>
          <li>Which direction it releases depends on the next catalyst — earnings beat or miss, analyst move, market event.</li>
          <li>This combination (rising short + high days-to-cover) also auto-triggers a confidence flag in Stockman.</li>
        </ul>

        <Callout>Short interest = positioning. Days to cover = fragility of that positioning. High days-to-cover = high energy stored. Neither alone is the full picture.</Callout>

        <p><strong>Data Confidence Flags in Stockman</strong></p>
        <Table rows={[
          ['Flag condition', 'What it means'],
          ['inst% > 95%', 'Likely double-counted — verify before acting'],
          ['short% + inst% > 110%', 'Data overlap — figures from different methodologies'],
          ['short% > 50%', 'Unusually high — verify source'],
          ['float > shares outstanding', 'Bad data — ignore these numbers'],
          ['float unavailable', 'Source has no data — trend still tracked if possible'],
        ]} />
        <p>When a flag appears: do not make decisions based on the flagged metric alone. Check trend direction. Cross-reference with price action and earnings.</p>
      </Section>

      {/* Seasonality */}
      <Section title="Market Seasonality — Some Months Are Statistically Better" accent="brand">
        <p>Based on S&amp;P 500 historical data going back decades. Not a guarantee — but a consistent pattern worth knowing before making big moves.</p>

        <SeasonalityGrid />

        <p><strong>Key patterns</strong></p>
        <Table rows={[
          ['Pattern', 'Period', 'What it means'],
          ['Best 6 months', 'Nov → Apr', '"Winter is better" — statistically strongest half of year'],
          ['Worst 6 months', 'May → Oct', '"Sell in May and go away" — historically weaker'],
          ['September Effect', 'September', 'Worst single month on average — institutional rebalancing, end of fiscal year for many funds'],
          ['January Effect', 'January', 'Historically positive — reinvestment after December tax-loss selling. Weaker in recent years.'],
          ['Santa Claus Rally', 'Late Dec + early Jan', 'Last 5 trading days of Dec + first 2 of Jan — tends to be positive'],
          ['October reputation', 'October', 'Famous for crashes (1929, 1987, 2008) — but statistically average positive. Fear is higher than reality.'],
          ['Q4 strength', 'Nov + Dec', 'Two strongest months historically — fund managers window dressing, holiday sentiment'],
        ]} />

        <p><strong>How to use this</strong></p>
        <ul>
          <li>September approaching → tighten ATR multiplier, check signal scores, be ready to trim</li>
          <li>May → consider whether to reduce exposure until November</li>
          <li>November → historically a good time to be fully invested</li>
          <li>These are averages over decades — any single year can be different</li>
          <li><strong>Never make decisions based on month alone.</strong> Use it as one input alongside trailing stops and signal scores</li>
        </ul>

        <Callout color="yellow">September 2022: S&P 500 fell 9.3% in one month. September 2001: −8.2%. September 2008: −9%. The pattern is real — not every year, but consistently enough to be aware of.</Callout>
      </Section>

      {/* 14 */}
      <Section title="Boring Companies — The Best Kind" accent="slate">
        <p>Low beta, steady dividend, nobody talks about them, goes up slowly forever. When tech crashes 30%, your trash company drops 5%.</p>
        <Table rows={[
          ['Ticker', 'What', 'Beta', 'Why boring is good'],
          ['WM', 'Waste Management', '~0.7', 'Nobody stops making trash'],
          ['PG', 'Procter & Gamble', '~0.5', 'Tide, Gillette — bought in any economy'],
          ['KO', 'Coca-Cola', '~0.6', "Buffett's favorite boring"],
          ['NEE', 'NextEra Energy', '~0.6', 'Biggest utility in US'],
          ['V', 'Visa', '~0.9', 'Toll on every card swipe globally'],
          ['BRK.B', 'Berkshire', '~0.9', "Buffett's boring collection"],
          ['AWK', 'American Water', '~0.6', 'Nobody stops drinking water'],
        ]} />
        <Callout color="emerald">Portfolio logic: AMZN + MSFT = growth engine 🚀 | WM + PG + NEE = shock absorbers 🛡️</Callout>
      </Section>

    </div>
  )
}

function Section({ title, children, accent = 'brand' }) {
  const borders = {
    brand: 'border-brand-500/40',
    emerald: 'border-emerald-500/40',
    orange: 'border-orange-500/40',
    red: 'border-red-500/40',
    slate: 'border-slate-600/60',
    yellow: 'border-yellow-500/40',
  }
  return (
    <div className={`card border-l-4 ${borders[accent] || borders.brand} space-y-3`}>
      <h3 className="font-semibold text-white text-base">{title}</h3>
      <div className="text-slate-300 text-sm space-y-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:space-y-1 [&_strong]:text-white [&_p]:leading-relaxed">
        {children}
      </div>
    </div>
  )
}

const MONTHS = [
  { m: 'Jan', avg: +1.0, level: 'good',    note: 'January effect — reinvestment after tax-loss selling' },
  { m: 'Feb', avg: -0.1, level: 'neutral', note: 'Slightly negative on average' },
  { m: 'Mar', avg: +1.0, level: 'good',    note: 'Recovery from winter — generally positive' },
  { m: 'Apr', avg: +1.5, level: 'good',    note: 'Historically one of the strongest months' },
  { m: 'May', avg: +0.2, level: 'caution', note: '"Sell in May" starts — weakest 6-month period begins' },
  { m: 'Jun', avg: -0.1, level: 'caution', note: 'Slightly negative, summer slowdown' },
  { m: 'Jul', avg: +1.3, level: 'good',    note: 'Mid-summer bounce — earnings season' },
  { m: 'Aug', avg: +0.1, level: 'caution', note: 'Low volume, thin markets, prone to sudden drops' },
  { m: 'Sep', avg: -0.7, level: 'bad',     note: 'Worst month historically — institutional rebalancing, fund fiscal year end' },
  { m: 'Oct', avg: +0.9, level: 'caution', note: 'Scary reputation (1929, 1987, 2008) but statistically positive — high fear month' },
  { m: 'Nov', avg: +1.7, level: 'strong',  note: 'One of two best months — Q4 strength, fund window dressing' },
  { m: 'Dec', avg: +1.5, level: 'strong',  note: 'Santa Claus rally, year-end buying — historically very strong' },
]

function SeasonalityGrid() {
  const now = new Date()
  const currentMonth = now.getMonth() // 0-indexed
  const colors = {
    strong:  { bar: 'bg-emerald-500',    text: 'text-emerald-400', border: 'border-emerald-500/50', label: 'bg-emerald-500/20' },
    good:    { bar: 'bg-emerald-600/70', text: 'text-emerald-500', border: 'border-emerald-600/30', label: 'bg-emerald-600/10' },
    neutral: { bar: 'bg-slate-500',      text: 'text-slate-400',   border: 'border-slate-500/30',   label: 'bg-slate-500/10' },
    caution: { bar: 'bg-yellow-500/80',  text: 'text-yellow-400',  border: 'border-yellow-500/30',  label: 'bg-yellow-500/10' },
    bad:     { bar: 'bg-red-500',        text: 'text-red-400',     border: 'border-red-500/50',     label: 'bg-red-500/20' },
  }
  const maxAbs = 1.7
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
        {MONTHS.map((m, i) => {
          const c = colors[m.level]
          const isCurrent = i === currentMonth
          const barH = Math.round((Math.abs(m.avg) / maxAbs) * 40)
          const isNeg = m.avg < 0
          return (
            <div key={m.m} className={`flex flex-col items-center gap-1 rounded-lg p-1.5 border ${c.border} ${isCurrent ? 'ring-2 ring-white/30' : ''} ${c.label}`}
              title={m.note}>
              <span className={`text-[11px] font-bold ${isCurrent ? 'text-white' : c.text}`}>{m.m}</span>
              <div className="flex flex-col justify-end items-center h-10 w-full">
                {!isNeg && <div className={`w-full rounded-sm ${c.bar}`} style={{ height: barH }} />}
                {isNeg && <div className="w-full rounded-sm bg-red-500" style={{ height: barH }} />}
              </div>
              <span className={`text-[10px] font-medium ${c.text}`}>{m.avg > 0 ? '+' : ''}{m.avg}%</span>
              {isCurrent && <span className="text-[9px] text-white/60">now</span>}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Strong</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-600/70 inline-block" /> Good</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-500/80 inline-block" /> Caution</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> Weak</span>
        <span className="text-slate-600 ml-auto">Hover each month for details · Current month highlighted</span>
      </div>
    </div>
  )
}

function Callout({ children, color = 'brand' }) {
  const styles = {
    brand: 'bg-brand-500/10 border-brand-500/40 text-brand-300',
    yellow: 'bg-yellow-500/10 border-yellow-500/40 text-yellow-300',
    red: 'bg-red-500/10 border-red-500/40 text-red-300',
    emerald: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300',
  }
  return (
    <div className={`border rounded-lg px-3 py-2 text-sm font-medium ${styles[color] || styles.brand}`}>
      {children}
    </div>
  )
}

function Table({ rows }) {
  const [header, ...body] = rows
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} className="text-left text-xs text-slate-500 font-semibold uppercase tracking-wide pb-1 pr-4 border-b border-dark-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-dark-700/50">
              {row.map((cell, ci) => (
                <td key={ci} className="py-1.5 pr-4 text-slate-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
