'use client'
import React, { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { SimulationResponse, SimulationRequest } from '@/types/api'
import { Card, Badge } from '@/components/ui'
import { cr } from '@/lib/format'

interface Props {
  data: SimulationResponse
  currentRequest?: SimulationRequest | null
  baseline?: SimulationResponse | null
  baselineRequest?: SimulationRequest | null
}

/** Pulls a short human-readable label from a request */
function requestLabel(req: SimulationRequest): string {
  const income = `₹${(req.income / 1000).toFixed(0)}k/mo`
  const risk = req.risk_tolerance
  const age = `Age ${req.age}`
  return `${income} · ${risk} · ${age}`
}

function SingleChart({
  data,
  label,
  color = '#00e676',
}: {
  data: SimulationResponse
  label?: string
  color?: string
}) {
  const chartData = data.years_axis.map((y, i) => ({
    year: `Yr ${y}`,
    p10:  +(data.p10_path[i] / 1e7).toFixed(3),
    p50:  +(data.p50_path[i] / 1e7).toFixed(3),
    p90:  +(data.p90_path[i] / 1e7).toFixed(3),
  }))

  const fireCr = +(data.fire_number / 1e7).toFixed(3)
  const gradId = `grad-${color.replace('#', '')}`
  const bandId = `band-${color.replace('#', '')}`

  return (
    <div>
      {label && (
        <p className="text-[11px] font-mono text-muted mb-2 uppercase tracking-wider">{label}</p>
      )}
      <p className="text-[11px] text-muted font-mono mb-3">
        Blended CAGR: <span className="text-green">{(data.blended_cagr * 100).toFixed(2)}%</span>
        &nbsp;·&nbsp; Vol: <span className="text-amber">{(data.blended_vol * 100).toFixed(2)}%</span>
        &nbsp;·&nbsp; FIRE prob: <span style={{ color }}>{data.fire_prob_pct.toFixed(1)}%</span>
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={bandId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.12} />
              <stop offset="95%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
          <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
          <YAxis
            tickFormatter={v => `₹${v.toFixed(1)}Cr`}
            tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={false}
            width={65}
          />
          <Tooltip
            formatter={(v: number, name: string) => [
              `₹${v.toFixed(2)} Cr`,
              name === 'p50' ? 'Median' : name === 'p10' ? 'Pessimistic' : 'Optimistic'
            ]}
            contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="p90" stroke="none" fill={`url(#${bandId})`} />
          <Area type="monotone" dataKey="p10" stroke="none" fill="#080c10" />
          <Area type="monotone" dataKey="p50" stroke={color} strokeWidth={2.5} fill={`url(#${gradId})`} dot={false} />
          <ReferenceLine
            y={fireCr}
            stroke="#ffb300"
            strokeDasharray="6 3"
            label={{ value: `FIRE ${cr(data.fire_number)}`, position: 'insideTopRight', fill: '#ffb300', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function NetWorthChart({ data, currentRequest, baseline, baselineRequest }: Props) {
  const [mode, setMode] = useState<'overlay' | 'split'>('overlay')

  const hasBaseline = !!baseline

  // Overlay chart data — merges current + baseline p50 into one dataset
  const overlayData = data.years_axis.map((y, i) => ({
    year: `Yr ${y}`,
    p10:      +(data.p10_path[i] / 1e7).toFixed(3),
    p50:      +(data.p50_path[i] / 1e7).toFixed(3),
    p90:      +(data.p90_path[i] / 1e7).toFixed(3),
    b_p50: baseline ? +(baseline.p50_path[i] / 1e7).toFixed(3) : undefined,
  }))

  const fireCr = +(data.fire_number / 1e7).toFixed(3)

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-display font-bold text-text">Net Worth Projection</p>
          <p className="text-[11px] text-muted font-mono mt-0.5">
            Blended CAGR: <span className="text-green">{(data.blended_cagr * 100).toFixed(2)}%</span>
            &nbsp;·&nbsp; Vol: <span className="text-amber">{(data.blended_vol * 100).toFixed(2)}%</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Overlay / Split toggle — only shown when baseline exists */}
          {hasBaseline && (
            <div className="flex items-center bg-card border border-border rounded-lg p-0.5 text-[11px] font-mono">
              <button
                onClick={() => setMode('overlay')}
                className={`px-3 py-1 rounded-md transition-all ${
                  mode === 'overlay'
                    ? 'bg-green/20 text-green'
                    : 'text-muted hover:text-text'
                }`}
              >
                Overlay
              </button>
              <button
                onClick={() => setMode('split')}
                className={`px-3 py-1 rounded-md transition-all ${
                  mode === 'split'
                    ? 'bg-green/20 text-green'
                    : 'text-muted hover:text-text'
                }`}
              >
                Split
              </button>
            </div>
          )}

          <div className="flex gap-2 flex-wrap justify-end">
            <Badge color="#00e676">Current P50</Badge>
            {hasBaseline && <Badge color="#29b6f6">Baseline P50</Badge>}
            {!hasBaseline && <Badge color="#29b6f6">P10–P90 band</Badge>}
            <Badge color="#ffb300">FIRE line</Badge>
          </div>
        </div>
      </div>

      {/* Chart Content */}
      {!hasBaseline || mode === 'overlay' ? (
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={overlayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#00e676" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#00e676" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#00e676" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#00e676" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2a35" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} />
            <YAxis
              tickFormatter={v => `₹${v.toFixed(1)}Cr`}
              tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
              width={65}
            />
            <Tooltip
              formatter={(v: number, name: string) => [
                `₹${v.toFixed(2)} Cr`,
                name === 'p50' ? 'Current (Median)' : name === 'b_p50' ? 'Baseline (Median)' : name === 'p10' ? 'Pessimistic' : 'Optimistic'
              ]}
              contentStyle={{ background: '#0f1419', border: '1px solid #1e2a35', borderRadius: 8, fontSize: 12 }}
            />
            {/* P10–P90 band (only when no baseline) */}
            {!hasBaseline && (
              <>
                <Area type="monotone" dataKey="p90" stroke="none" fill="url(#bandGrad)" />
                <Area type="monotone" dataKey="p10" stroke="none" fill="#080c10" />
              </>
            )}
            {/* Current P50 */}
            <Area type="monotone" dataKey="p50" stroke="#00e676" strokeWidth={2.5} fill="url(#p50Grad)" dot={false} />
            {/* Baseline P50 — dashed blue */}
            {hasBaseline && (
              <Area
                type="monotone"
                dataKey="b_p50"
                stroke="#29b6f6"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="none"
                dot={false}
              />
            )}
            <ReferenceLine
              y={fireCr}
              stroke="#ffb300"
              strokeDasharray="6 3"
              label={{ value: `FIRE ${cr(data.fire_number)}`, position: 'insideTopRight', fill: '#ffb300', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        /* Split Mode */
        <div className="space-y-6">
          <div className="border border-border/50 rounded-xl p-4">
            <SingleChart
              data={data}
              label={currentRequest ? `Current · ${requestLabel(currentRequest)}` : 'Current'}
              color="#00e676"
            />
          </div>
          <div className="border border-blue-500/20 rounded-xl p-4">
            <SingleChart
              data={baseline!}
              label={baselineRequest ? `Baseline · ${requestLabel(baselineRequest)}` : 'Baseline'}
              color="#29b6f6"
            />
          </div>
        </div>
      )}
    </Card>
  )
}