'use client'
import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { SimulationResponse } from '@/types/api'
import { Card, SectionLabel, ProgressBar, Badge } from '@/components/ui'
import { cr } from '@/lib/format'

const BASE = '/api/backend'

const PRIORITY_COLOR: Record<string, string> = {
  Critical: '#ff4444', Important: '#ffb300', 'Nice-to-have': '#29b6f6',
}

const SWR_COLORS = ['#f87171', '#fb923c', '#00e676', '#29b6f6', '#a78bfa']

// ─── Retirement Planner Sub-section ─────────────────────────────────────────

function RetirementPlannerSection({ data }: { data: SimulationResponse }) {
  const [result, setResult]   = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [selectedSWR, setSelectedSWR] = useState(2) // index 2 = 4% default

  // Derive sensible defaults from simulation data
  const [form, setForm] = useState({
    current_age:       30,
    current_net_worth: Math.round(data.p50_path[0] / 1e5) * 1e5,
    annual_expenses:   Math.round(data.yearly_table[0]?.annual_expenses ?? 600000),
    annual_savings:    Math.round((data.yearly_table[0]?.annual_income ?? 1200000) * 0.3),
    expected_cagr:     +(data.blended_cagr * 100).toFixed(1),
    inflation_rate:    6.0,
  })

  const run = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/retirement/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          expected_cagr: form.expected_cagr / 100,
          inflation_rate: form.inflation_rate / 100,
        }),
      })
      if (!res.ok) throw new Error((await res.json())?.detail ?? `HTTP ${res.status}`)
      setResult(await res.json())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const inp = (label: string, key: keyof typeof form, unit: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-mono text-muted uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-3 py-1.5">
        <input
          type="number"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: +e.target.value }))}
          className="bg-transparent text-sm font-mono text-text w-full outline-none"
        />
        <span className="text-[11px] text-muted font-mono">{unit}</span>
      </div>
    </div>
  )

  // Chart data for selected SWR
  const chartData = result?.swr_sensitivity[selectedSWR]?.yearly?.map((r: any) => ({
    age: r.age,
    net_worth: +(r.net_worth / 1e5).toFixed(1),
    fire_number: +(r.fire_number / 1e5).toFixed(1),
  })) ?? []

  return (
    <Card>
      <div className="mb-4">
        <SectionLabel>Retirement Planner</SectionLabel>
        <p className="text-[11px] text-muted font-mono mt-0.5">FIRE date estimator · SWR sensitivity analysis</p>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        {inp('Current Age', 'current_age', 'yrs')}
        {inp('Net Worth', 'current_net_worth', '₹')}
        {inp('Annual Expenses', 'annual_expenses', '₹')}
        {inp('Annual Savings', 'annual_savings', '₹')}
        {inp('Expected CAGR', 'expected_cagr', '%')}
        {inp('Inflation', 'inflation_rate', '%')}
      </div>

      <button onClick={run} disabled={loading}
        className="w-full py-2 rounded-lg text-xs font-mono border border-green/40 text-green hover:bg-green/10 disabled:opacity-40 transition-all mb-4">
        {loading ? 'Planning...' : 'Estimate FIRE Date'}
      </button>

      {error && <p className="text-xs text-red-400 font-mono mb-3">{error}</p>}

      {result && (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green/10 border border-green/20 rounded-xl p-3">
              <p className="text-[10px] font-mono text-muted uppercase tracking-wider">Earliest FIRE Age</p>
              <p className="text-2xl font-display font-bold text-green">{result.earliest_fire_age ?? '—'}</p>
            </div>
            <div className="bg-card/60 border border-border rounded-xl p-3">
              <p className="text-[10px] font-mono text-muted uppercase tracking-wider">Latest FIRE Age (3% SWR)</p>
              <p className="text-2xl font-display font-bold text-amber">{result.latest_fire_age ?? 'Not achievable'}</p>
            </div>
          </div>

          {/* SWR selector */}
          <div>
            <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">Safe Withdrawal Rate</p>
            <div className="flex gap-2">
              {result.swr_sensitivity.map((s: any, i: number) => (
                <button key={i} onClick={() => setSelectedSWR(i)}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-mono border transition-all"
                  style={{
                    borderColor: selectedSWR === i ? SWR_COLORS[i] : '#1e2a35',
                    color: selectedSWR === i ? SWR_COLORS[i] : '#546e7a',
                    background: selectedSWR === i ? `${SWR_COLORS[i]}15` : 'transparent',
                  }}>
                  {s.swr_pct}%
                  <span className="block text-[9px] opacity-70">{s.fire_age ? `Age ${s.fire_age}` : 'N/A'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* NW vs FIRE number chart */}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
              <XAxis dataKey="age" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 10 }} />
              <YAxis tickFormatter={v => `₹${v}L`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={60} />
              <Tooltip formatter={(v: number, n: string) => [`₹${v}L`, n === 'net_worth' ? 'Net Worth' : 'FIRE Number']}
                contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="net_worth"   stroke={SWR_COLORS[selectedSWR]} strokeWidth={2} dot={false} name="net_worth" />
              <Line type="monotone" dataKey="fire_number" stroke="#546e7a" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="fire_number" />
              {result.swr_sensitivity[selectedSWR]?.fire_age && (
                <ReferenceLine x={result.swr_sensitivity[selectedSWR].fire_age}
                  stroke={SWR_COLORS[selectedSWR]} strokeDasharray="3 3"
                  label={{ value: 'FIRE!', position: 'top', fontSize: 10, fill: SWR_COLORS[selectedSWR] }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!result && !loading && (
        <p className="text-[11px] text-muted font-mono text-center py-4">
          Adjust inputs and click "Estimate FIRE Date" to see your retirement projection.
        </p>
      )}
    </Card>
  )
}

// ─── Main Tab ────────────────────────────────────────────────────────────────

export default function GoalsTab({ data }: { data: SimulationResponse }) {
  if (!data.goal_results.length) {
    return (
      <div className="space-y-4">
        <Card>
          <p className="text-sm text-muted font-mono text-center py-8">No goals configured.</p>
        </Card>
        <RetirementPlannerSection data={data} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {data.goal_results.map(g => {
        const barColor = g.percent_funded >= 100 ? '#00e676' : g.percent_funded >= 60 ? '#ffb300' : '#ff4444'
        return (
          <Card key={g.name} accent={barColor}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="font-display font-semibold text-text">{g.name}</p>
                <p className="text-[11px] text-muted font-mono mt-0.5">
                  Target: {cr(g.target_amount)} · Year {g.target_year}
                </p>
              </div>
              <div className="flex gap-2 items-center">
                <Badge color={PRIORITY_COLOR[g.priority] ?? '#546e7a'}>{g.priority}</Badge>
                {g.on_track ? <Badge color="#00e676">✓ On track</Badge> : <Badge color="#ff4444">⚠ Shortfall</Badge>}
              </div>
            </div>
            <ProgressBar value={g.percent_funded} color={barColor} />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs font-mono text-muted">{g.percent_funded.toFixed(0)}% funded</span>
              <span className="text-xs font-mono" style={{ color: barColor }}>
                Projected NW at goal: {cr(g.projected_nw_at_goal)}
              </span>
            </div>
            {g.shortfall > 0 && (
              <p className="text-[11px] text-red font-mono mt-1.5">Shortfall: {cr(g.shortfall)}</p>
            )}
          </Card>
        )
      })}

      <RetirementPlannerSection data={data} />
    </div>
  )
}