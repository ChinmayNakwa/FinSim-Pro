'use client'
import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line
} from 'recharts'
import { SimulationResponse } from '@/types/api'
import { Card, Badge } from '@/components/ui'
import { cr } from '@/lib/format'

function StatCard({
  label,
  value,
  sub,
  color = '#00e676',
}: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[11px] font-mono text-muted uppercase tracking-wider">{label}</p>
      <p className="text-xl font-display font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-muted font-mono">{sub}</p>}
    </div>
  )
}

export default function TaxTab({ data }: { data: SimulationResponse }) {
  const [chartType, setChartType] = useState<'stacked' | 'line'>('stacked')

  // Year-by-year tax chart data
  const yearlyTaxData = data.years_axis.map((y, i) => ({
    year: `Yr ${y}`,
    income_tax: +(data.annual_income_tax[i] / 1e5).toFixed(2),   // in ₹L
    ltcg_tax:   +(data.annual_ltcg_tax[i]   / 1e5).toFixed(2),
    stcg_tax:   +(data.annual_stcg_tax[i]   / 1e5).toFixed(2),
  }))

  // Asset tax summary for bar chart
  const assetTaxData = data.asset_tax_summary.map(a => ({
    name: a.asset_class.replace(/_/g, ' '),
    ltcg: +(a.ltcg_tax / 1e5).toFixed(2),
    stcg: +(a.stcg_tax / 1e5).toFixed(2),
    total: +(a.total_tax / 1e5).toFixed(2),
  })).sort((a, b) => b.total - a.total)

  const snap = data.tax_snapshot
  const totalTax = data.total_income_tax_avg + data.total_ltcg_tax_avg + data.total_stcg_tax_avg

  return (
    <div className="space-y-6">

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Avg Effective Rate"
          value={`${data.avg_effective_rate_pct.toFixed(2)}%`}
          sub={`Regime: ${snap.regime}`}
          color="#f87171"
        />
        <StatCard
          label="Avg Income Tax"
          value={cr(data.total_income_tax_avg)}
          sub="per year (avg)"
          color="#fb923c"
        />
        <StatCard
          label="Avg LTCG Tax"
          value={cr(data.total_ltcg_tax_avg)}
          sub="per year (avg)"
          color="#facc15"
        />
        <StatCard
          label="Avg STCG Tax"
          value={cr(data.total_stcg_tax_avg)}
          sub="per year (avg)"
          color="#a78bfa"
        />
      </div>

      {/* Tax Snapshot Card */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-display font-bold text-text">Current Year Tax Snapshot</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              Based on ₹{(snap.annual_income / 1e5).toFixed(1)}L income · {snap.regime} regime
            </p>
          </div>
          <Badge color="#f87171">
            Effective {(snap.effective_rate * 100).toFixed(2)}%
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Annual Income',   value: cr(snap.annual_income) },
            { label: 'Taxable Income',  value: cr(snap.taxable_income) },
            { label: 'Base Tax',        value: cr(snap.base_tax) },
            { label: 'Surcharge',       value: cr(snap.surcharge) },
            { label: 'Health & Ed Cess',value: cr(snap.cess) },
            { label: 'Total Tax',       value: cr(snap.total_tax), highlight: true },
          ].map(({ label, value, highlight }) => (
            <div
              key={label}
              className={`rounded-lg p-3 ${
                highlight
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-card/60 border border-border'
              }`}
            >
              <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-sm font-display font-bold ${highlight ? 'text-red-400' : 'text-text'}`}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Year-by-Year Tax Chart */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-display font-bold text-text">Projected Annual Tax Burden</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              Income tax + LTCG + STCG across simulation horizon
            </p>
          </div>
          <div className="flex items-center bg-card border border-border rounded-lg p-0.5 text-[11px] font-mono">
            <button
              onClick={() => setChartType('stacked')}
              className={`px-3 py-1 rounded-md transition-all ${
                chartType === 'stacked' ? 'bg-green/20 text-green' : 'text-muted hover:text-text'
              }`}
            >
              Stacked
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-3 py-1 rounded-md transition-all ${
                chartType === 'line' ? 'bg-green/20 text-green' : 'text-muted hover:text-text'
              }`}
            >
              Lines
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          {chartType === 'stacked' ? (
            <BarChart data={yearlyTaxData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
              <YAxis
                tickFormatter={v => `₹${v.toFixed(0)}L`}
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  `₹${v.toFixed(2)}L`,
                  name === 'income_tax' ? 'Income Tax' : name === 'ltcg_tax' ? 'LTCG Tax' : 'STCG Tax'
                ]}
                contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 12 }}
              />
              <Legend
                formatter={name =>
                  name === 'income_tax' ? 'Income Tax' : name === 'ltcg_tax' ? 'LTCG Tax' : 'STCG Tax'
                }
                wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
              />
              <Bar dataKey="income_tax" stackId="a" fill="#fb923c" radius={[0, 0, 0, 0]} />
              <Bar dataKey="ltcg_tax"   stackId="a" fill="#facc15" radius={[0, 0, 0, 0]} />
              <Bar dataKey="stcg_tax"   stackId="a" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={yearlyTaxData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
              <YAxis
                tickFormatter={v => `₹${v.toFixed(0)}L`}
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  `₹${v.toFixed(2)}L`,
                  name === 'income_tax' ? 'Income Tax' : name === 'ltcg_tax' ? 'LTCG Tax' : 'STCG Tax'
                ]}
                contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 12 }}
              />
              <Legend
                formatter={name =>
                  name === 'income_tax' ? 'Income Tax' : name === 'ltcg_tax' ? 'LTCG Tax' : 'STCG Tax'
                }
                wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
              />
              <Line type="monotone" dataKey="income_tax" stroke="#fb923c" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ltcg_tax"   stroke="#facc15" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="stcg_tax"   stroke="#a78bfa" strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </Card>

      {/* Per-Asset Tax Breakdown */}
      {assetTaxData.length > 0 && (
        <Card>
          <div className="mb-4">
            <p className="text-sm font-display font-bold text-text">Tax by Asset Class</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              Cumulative LTCG + STCG across simulation horizon (avg)
            </p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={assetTaxData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 80, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={v => `₹${v.toFixed(0)}L`}
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  `₹${v.toFixed(2)}L`,
                  name === 'ltcg' ? 'LTCG Tax' : 'STCG Tax'
                ]}
                contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 12 }}
              />
              <Legend
                formatter={name => name === 'ltcg' ? 'LTCG Tax' : 'STCG Tax'}
                wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
              />
              <Bar dataKey="ltcg" stackId="b" fill="#facc15" />
              <Bar dataKey="stcg" stackId="b" fill="#a78bfa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Regime Comparison Table */}
      {data.regime_comparison?.length > 0 && (
        <Card>
          <div className="mb-4">
            <p className="text-sm font-display font-bold text-text">New vs Old Regime Comparison</p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              Component-wise breakdown · Active: {snap.regime}
            </p>
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
                    <td className="py-2 px-4 text-right text-green text-[12px]">
                      {typeof row.new_regime === 'number' ? cr(row.new_regime) : row.new_regime}
                    </td>
                    <td className="py-2 pl-4 text-right text-amber text-[12px]">
                      {typeof row.old_regime === 'number' ? cr(row.old_regime) : row.old_regime}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}