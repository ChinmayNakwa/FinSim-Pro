'use client'
import React, { useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid,
  ScatterChart, Scatter, ReferenceDot,
} from 'recharts'
import { SimulationResponse, SimulationRequest } from '@/types/api'
import { Card, SectionLabel, Badge } from '@/components/ui'
import { fmt, cr } from '@/lib/format'

const BASE = '/api/backend'

const ASSET_COLORS: Record<string, string> = {
  'Indian Equity': '#00e676', 'Nifty Bank': '#29b6f6', 'Nifty IT': '#ce93d8',
  'Gold': '#ffb300', 'Real Estate': '#ff9800', 'International Equity': '#e91e63', 'Debt/Bonds': '#78909c',
}

// ─── Optimizer Sub-section ───────────────────────────────────────────────────

function OptimizerSection({ data, lastRequest }: { data: SimulationResponse; lastRequest?: SimulationRequest | null }) {
  const [result, setResult]   = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [selected, setSelected] = useState<'max_sharpe' | 'min_vol' | 'max_return'>('max_sharpe')

  const run = async () => {
    if (!lastRequest) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulation: lastRequest }),
      })
      if (!res.ok) throw new Error((await res.json())?.detail ?? `HTTP ${res.status}`)
      setResult(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  const OPTIMAL_COLORS = { max_sharpe: '#00e676', min_vol: '#29b6f6', max_return: '#f87171' }
  const OPTIMAL_LABELS = { max_sharpe: 'Max Sharpe', min_vol: 'Min Volatility', max_return: 'Max Return' }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <SectionLabel>Portfolio Optimizer</SectionLabel>
          <p className="text-[11px] text-muted font-mono mt-0.5">Markowitz efficient frontier · 5,000 random portfolios</p>
        </div>
        <button
          onClick={run} disabled={loading || !lastRequest}
          className="px-4 py-1.5 rounded-full text-xs font-mono border border-green/40 text-green hover:bg-green/10 disabled:opacity-40 transition-all"
        >
          {loading ? 'Optimizing...' : 'Run Optimizer'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 font-mono mb-3">{error}</p>}

      {result && (
        <div className="space-y-4">
          {/* Frontier scatter */}
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
              <XAxis dataKey="vol_pct" name="Volatility" unit="%" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} label={{ value: 'Volatility %', position: 'insideBottom', offset: -2, fontSize: 10 }} />
              <YAxis dataKey="return_pct" name="Return" unit="%" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={50} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 11 }} formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n]} />
              <Scatter name="Frontier" data={result.frontier} fill="#29b6f6" opacity={0.7} />
              {/* Current portfolio dot */}
              <ReferenceDot
                x={result.current.expected_vol_pct} y={result.current.expected_return_pct}
                r={6} fill="#ffb300" stroke="#0f1419" strokeWidth={2}
                label={{ value: 'Current', position: 'top', fontSize: 9, fill: '#ffb300' }}
              />
              {/* Optimal dot */}
              <ReferenceDot
                x={result.optimal[selected].expected_vol_pct} y={result.optimal[selected].expected_return_pct}
                r={6} fill={OPTIMAL_COLORS[selected]} stroke="#0f1419" strokeWidth={2}
                label={{ value: OPTIMAL_LABELS[selected], position: 'top', fontSize: 9, fill: OPTIMAL_COLORS[selected] }}
              />
            </ScatterChart>
          </ResponsiveContainer>

          {/* Optimal selector */}
          <div className="flex gap-2">
            {(['max_sharpe', 'min_vol', 'max_return'] as const).map(k => (
              <button key={k} onClick={() => setSelected(k)}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-mono border transition-all"
                style={{
                  borderColor: selected === k ? OPTIMAL_COLORS[k] : '#1e2a35',
                  color: selected === k ? OPTIMAL_COLORS[k] : '#546e7a',
                  background: selected === k ? `${OPTIMAL_COLORS[k]}15` : 'transparent',
                }}
              >
                {OPTIMAL_LABELS[k]}
              </button>
            ))}
          </div>

          {/* Selected portfolio weights */}
          <div className="bg-card/60 border border-border rounded-xl p-3 space-y-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-mono text-muted">Suggested Weights</span>
              <div className="flex gap-3 text-[11px] font-mono">
                <span style={{ color: OPTIMAL_COLORS[selected] }}>
                  Return {result.optimal[selected].expected_return_pct}%
                </span>
                <span className="text-muted">Vol {result.optimal[selected].expected_vol_pct}%</span>
                <span className="text-amber">Sharpe {result.optimal[selected].sharpe_ratio}</span>
              </div>
            </div>
            {Object.entries(result.optimal[selected].weights).map(([ac, w]: [string, any]) => (
              <div key={ac} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ASSET_COLORS[ac] ?? '#546e7a' }} />
                <span className="text-[11px] font-mono text-muted flex-1">{ac}</span>
                <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${w * 100}%`, background: ASSET_COLORS[ac] ?? '#546e7a' }} />
                </div>
                <span className="text-[11px] font-mono w-10 text-right" style={{ color: ASSET_COLORS[ac] ?? '#546e7a' }}>
                  {(w * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!result && !loading && (
        <p className="text-[11px] text-muted font-mono text-center py-6">
          Click "Run Optimizer" to compute the efficient frontier for your current holdings.
        </p>
      )}
    </Card>
  )
}

// ─── Main Tab ────────────────────────────────────────────────────────────────

export default function PortfolioTab({ data, lastRequest }: { data: SimulationResponse; lastRequest?: SimulationRequest | null }) {
  const pieData = data.asset_forecasts.map(af => ({
    name: af.asset_class,
    value: af.weight * 100,
    color: ASSET_COLORS[af.asset_class] ?? '#546e7a',
  }))

  const sharpeData = data.asset_forecasts.map(af => ({
    name: af.asset_class.split(' ')[0],
    full: af.asset_class,
    sharpe: +((af.cagr - 0.065) / af.vol).toFixed(3),
    color: ASSET_COLORS[af.asset_class] ?? '#546e7a',
  }))

  const finalData = Object.entries(data.asset_final_values).map(([ac, v]) => ({
    name: ac.split(' ')[0],
    full: ac,
    value: +(v / 1e5).toFixed(1),
    color: ASSET_COLORS[ac] ?? '#546e7a',
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Current Allocation</SectionLabel>
          <div className="flex items-center gap-4">
            <PieChart width={180} height={180}>
              <Pie data={pieData} cx={85} cy={85} innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`]} contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 11 }} />
            </PieChart>
            <div className="space-y-1.5 flex-1">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="text-[11px] font-mono text-muted flex-1 truncate">{d.name}</span>
                  <span className="text-[11px] font-mono" style={{ color: d.color }}>{d.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionLabel>Sharpe Ratio by Asset</SectionLabel>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sharpeData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => [v.toFixed(2), 'Sharpe']} contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="sharpe" radius={[4, 4, 0, 0]}>
                {sharpeData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <SectionLabel>Projected Final Values (Median, Year {data.years_axis.at(-1)})</SectionLabel>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={finalData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
            <YAxis tickFormatter={v => `₹${v}L`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={60} />
            <Tooltip formatter={(v: number) => [`₹${v}L`, 'Final Value']} contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {finalData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <SectionLabel>Asset Forecasts</SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-muted">
                {['Asset Class', 'Expected CAGR', 'Volatility', 'Weight', 'Data Source'].map(h => (
                  <th key={h} className="text-left py-2 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.asset_forecasts.map(af => (
                <tr key={af.asset_class} className="border-b border-border/40 hover:bg-bg/50 transition-colors">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: ASSET_COLORS[af.asset_class] ?? '#546e7a' }} />
                      {af.asset_class}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-green">{(af.cagr * 100).toFixed(2)}%</td>
                  <td className="py-2 pr-4 text-amber">{(af.vol * 100).toFixed(2)}%</td>
                  <td className="py-2 pr-4">{(af.weight * 100).toFixed(1)}%</td>
                  <td className="py-2">
                    <Badge color={af.data_source === 'Prophet' ? '#00e676' : '#546e7a'}>
                      {af.data_source}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <OptimizerSection data={data} lastRequest={lastRequest} />
    </div>
  )
}