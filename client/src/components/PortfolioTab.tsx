'use client'
import React from 'react'
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { SimulationResponse } from '@/types/api'
import { Card, SectionLabel, Badge } from '@/components/ui'
import { fmt, cr } from '@/lib/format'

const ASSET_COLORS: Record<string, string> = {
  'Indian Equity': '#00e676', 'Nifty Bank': '#29b6f6', 'Nifty IT': '#ce93d8',
  'Gold': '#ffb300', 'Real Estate': '#ff9800', 'International Equity': '#e91e63', 'Debt/Bonds': '#78909c',
}

export default function PortfolioTab({ data }: { data: SimulationResponse }) {
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
        {/* Pie */}
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

        {/* Sharpe */}
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

      {/* Final asset values */}
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

      {/* Asset returns table */}
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
    </div>
  )
}