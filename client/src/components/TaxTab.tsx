'use client'
import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts'
import { SimulationResponse, SimulationRequest } from '@/types/api'
import { Card, Badge } from '@/components/ui'
import { cr } from '@/lib/format'

const BASE = '/api/backend'

function StatCard({ label, value, sub, color = '#00e676' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[11px] font-mono text-muted uppercase tracking-wider">{label}</p>
      <p className="text-xl font-display font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-muted font-mono">{sub}</p>}
    </div>
  )
}

// ─── Tax Harvester Sub-section ───────────────────────────────────────────────

const FLAG_META: Record<string, { color: string; label: string }> = {
  SELL_FOR_LOSS:  { color: '#f87171', label: '🔴 Sell for Loss' },
  LOW_TAX_GAIN:   { color: '#00e676', label: '🟢 Low-Tax Gain'  },
  WAIT_FOR_LTCG:  { color: '#ffb300', label: '🟡 Wait for LTCG' },
  HOLD:           { color: '#546e7a', label: '⚪ Hold'           },
}

function TaxHarvesterSection({ lastRequest }: { lastRequest?: SimulationRequest | null }) {
  const [result, setResult]   = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const run = async () => {
    if (!lastRequest) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/tax/harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdings: lastRequest.portfolio_holdings,
          tax_cfg:  lastRequest.tax_cfg,
        }),
      })
      if (!res.ok) throw new Error((await res.json())?.detail ?? `HTTP ${res.status}`)
      setResult(await res.json())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-display font-bold text-text">Tax Harvester</p>
          <p className="text-[11px] text-muted font-mono mt-0.5">
            Flag holdings for loss harvesting or low-tax rebalancing
          </p>
        </div>
        <button onClick={run} disabled={loading || !lastRequest}
          className="px-4 py-1.5 rounded-full text-xs font-mono border border-amber/40 text-amber hover:bg-amber/10 disabled:opacity-40 transition-all">
          {loading ? 'Analyzing...' : 'Analyze Holdings'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 font-mono mb-3">{error}</p>}

      {result && (
        <div className="space-y-4">
          {/* Summary pills */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
              <p className="text-[10px] font-mono text-muted uppercase">Harvestable Loss</p>
              <p className="text-lg font-display font-bold text-red-400">{cr(result.total_harvestable_loss)}</p>
            </div>
            <div className="bg-green/10 border border-green/20 rounded-xl p-3 text-center">
              <p className="text-[10px] font-mono text-muted uppercase">Low-Tax Gain</p>
              <p className="text-lg font-display font-bold text-green">{cr(result.total_low_tax_gain)}</p>
            </div>
            {Object.entries(result.summary).map(([k, v]: [string, any]) => (
              <div key={k} className="bg-card/60 border border-border rounded-xl p-3 text-center">
                <p className="text-[10px] font-mono text-muted uppercase">{k.replace(/_count$/, '').replace(/_/g, ' ')}</p>
                <p className="text-lg font-display font-bold text-text">{v}</p>
              </div>
            ))}
          </div>

          {/* Holdings table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wider">
                  {['Asset', 'Unrealised G/L', 'Days Held', 'Days→LTCG', 'Tax if Sold', 'Eff. Tax%', 'Action'].map(h => (
                    <th key={h} className="text-left py-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.opportunities.map((o: any, i: number) => {
                  const meta  = FLAG_META[o.flag]
                  const isPos = o.unrealised_gain >= 0
                  return (
                    <tr key={i} className="border-b border-border/40 hover:bg-card/40 transition-colors">
                      <td className="py-2 pr-3 text-text">{o.asset_class}</td>
                      <td className="py-2 pr-3" style={{ color: isPos ? '#00e676' : '#f87171' }}>
                        {isPos ? '+' : ''}{cr(o.unrealised_gain)}
                      </td>
                      <td className="py-2 pr-3 text-muted">{o.days_held}d</td>
                      <td className="py-2 pr-3 text-muted">
                        {o.days_to_ltcg > 0 ? `${o.days_to_ltcg}d` : <span className="text-green">✓ LTCG</span>}
                      </td>
                      <td className="py-2 pr-3 text-amber">{cr(o.tax_if_sold)}</td>
                      <td className="py-2 pr-3 text-muted">{o.eff_tax_rate_pct.toFixed(1)}%</td>
                      <td className="py-2 pr-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border"
                          style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}10` }}>
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Reason tooltips */}
          <div className="space-y-1.5">
            {result.opportunities.filter((o: any) => o.flag !== 'HOLD').map((o: any, i: number) => (
              <p key={i} className="text-[11px] font-mono" style={{ color: FLAG_META[o.flag].color }}>
                {o.asset_class}: {o.reason}
              </p>
            ))}
          </div>
        </div>
      )}

      {!result && !loading && (
        <p className="text-[11px] text-muted font-mono text-center py-6">
          Click "Analyze Holdings" to identify tax-loss harvesting and low-tax rebalancing opportunities.
        </p>
      )}
    </Card>
  )
}

// ─── Main Tab ────────────────────────────────────────────────────────────────

export default function TaxTab({ data, lastRequest }: { data: SimulationResponse; lastRequest?: SimulationRequest | null }) {
  const [chartType, setChartType] = useState<'stacked' | 'line'>('stacked')

  const yearlyTaxData = data.years_axis.map((y, i) => ({
    year: `Yr ${y}`,
    income_tax: +(data.annual_income_tax[i] / 1e5).toFixed(2),
    ltcg_tax:   +(data.annual_ltcg_tax[i]   / 1e5).toFixed(2),
    stcg_tax:   +(data.annual_stcg_tax[i]   / 1e5).toFixed(2),
  }))

  const assetTaxData = data.asset_tax_summary.map(a => ({
    name:  a.asset_class.replace(/_/g, ' '),
    ltcg:  +(a.ltcg_tax  / 1e5).toFixed(2),
    stcg:  +(a.stcg_tax  / 1e5).toFixed(2),
    total: +(a.total_tax / 1e5).toFixed(2),
  })).sort((a, b) => b.total - a.total)

  const snap = data.tax_snapshot

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Avg Effective Rate" value={`${data.avg_effective_rate_pct.toFixed(2)}%`} sub={`Regime: ${snap.regime}`} color="#f87171" />
        <StatCard label="Avg Income Tax"     value={cr(data.total_income_tax_avg)} sub="per year (avg)" color="#fb923c" />
        <StatCard label="Avg LTCG Tax"       value={cr(data.total_ltcg_tax_avg)}   sub="per year (avg)" color="#facc15" />
        <StatCard label="Avg STCG Tax"       value={cr(data.total_stcg_tax_avg)}   sub="per year (avg)" color="#a78bfa" />
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-display font-bold text-text">Current Year Tax Snapshot</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              Based on ₹{(snap.annual_income / 1e5).toFixed(1)}L income · {snap.regime} regime
            </p>
          </div>
          <Badge color="#f87171">Effective {(snap.effective_rate * 100).toFixed(2)}%</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Annual Income',    value: cr(snap.annual_income) },
            { label: 'Taxable Income',   value: cr(snap.taxable_income) },
            { label: 'Base Tax',         value: cr(snap.base_tax) },
            { label: 'Surcharge',        value: cr(snap.surcharge) },
            { label: 'Health & Ed Cess', value: cr(snap.cess) },
            { label: 'Total Tax',        value: cr(snap.total_tax), highlight: true },
          ].map(({ label, value, highlight }) => (
            <div key={label} className={`rounded-lg p-3 ${highlight ? 'bg-red-500/10 border border-red-500/20' : 'bg-card/60 border border-border'}`}>
              <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-sm font-display font-bold ${highlight ? 'text-red-400' : 'text-text'}`}>{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-display font-bold text-text">Projected Annual Tax Burden</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">Income tax + LTCG + STCG across simulation horizon</p>
          </div>
          <div className="flex items-center bg-card border border-border rounded-lg p-0.5 text-[11px] font-mono">
            {(['stacked', 'line'] as const).map(t => (
              <button key={t} onClick={() => setChartType(t)}
                className={`px-3 py-1 rounded-md transition-all capitalize ${chartType === t ? 'bg-green/20 text-green' : 'text-muted hover:text-text'}`}>
                {t === 'stacked' ? 'Stacked' : 'Lines'}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          {chartType === 'stacked' ? (
            <BarChart data={yearlyTaxData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
              <YAxis tickFormatter={v => `₹${v.toFixed(0)}L`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={60} />
              <Tooltip formatter={(v: number, n: string) => [`₹${v.toFixed(2)}L`, n === 'income_tax' ? 'Income Tax' : n === 'ltcg_tax' ? 'LTCG Tax' : 'STCG Tax']} contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 12 }} />
              <Legend formatter={n => n === 'income_tax' ? 'Income Tax' : n === 'ltcg_tax' ? 'LTCG Tax' : 'STCG Tax'} wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
              <Bar dataKey="income_tax" stackId="a" fill="#fb923c" />
              <Bar dataKey="ltcg_tax"   stackId="a" fill="#facc15" />
              <Bar dataKey="stcg_tax"   stackId="a" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={yearlyTaxData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
              <YAxis tickFormatter={v => `₹${v.toFixed(0)}L`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={60} />
              <Tooltip formatter={(v: number, n: string) => [`₹${v.toFixed(2)}L`, n === 'income_tax' ? 'Income Tax' : n === 'ltcg_tax' ? 'LTCG Tax' : 'STCG Tax']} contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 12 }} />
              <Legend formatter={n => n === 'income_tax' ? 'Income Tax' : n === 'ltcg_tax' ? 'LTCG Tax' : 'STCG Tax'} wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
              <Line type="monotone" dataKey="income_tax" stroke="#fb923c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ltcg_tax"   stroke="#facc15" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="stcg_tax"   stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </Card>

      {assetTaxData.length > 0 && (
        <Card>
          <div className="mb-4">
            <p className="text-sm font-display font-bold text-text">Tax by Asset Class</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">Cumulative LTCG + STCG across simulation horizon (avg)</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={assetTaxData} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `₹${v.toFixed(0)}L`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={80} />
              <Tooltip formatter={(v: number, n: string) => [`₹${v.toFixed(2)}L`, n === 'ltcg' ? 'LTCG Tax' : 'STCG Tax']} contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 12 }} />
              <Legend formatter={n => n === 'ltcg' ? 'LTCG Tax' : 'STCG Tax'} wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
              <Bar dataKey="ltcg" stackId="b" fill="#facc15" />
              <Bar dataKey="stcg" stackId="b" fill="#a78bfa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {data.regime_comparison?.length > 0 && (
        <Card>
          <div className="mb-4">
            <p className="text-sm font-display font-bold text-text">New vs Old Regime Comparison</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">Component-wise breakdown · Active: {snap.regime}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted uppercase tracking-wider">
                  <th className="text-left py-2 pr-4">Component</th>
                  <th className="text-right py-2 px-4">New Regime</th>
                  <th className="text-right py-2 pl-4">Old Regime</th>
                </tr>
              </thead>
              <tbody>
                {data.regime_comparison.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-card/40 transition-colors">
                    <td className="py-2 pr-4 text-muted text-[12px]">{row.component}</td>
                    <td className="py-2 px-4 text-right text-green text-[12px]">{typeof row.new_regime === 'number' ? cr(row.new_regime) : row.new_regime}</td>
                    <td className="py-2 pl-4 text-right text-amber text-[12px]">{typeof row.old_regime === 'number' ? cr(row.old_regime) : row.old_regime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TaxHarvesterSection lastRequest={lastRequest} />
    </div>
  )
}