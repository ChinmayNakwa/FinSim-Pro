'use client'
import React, { useState, useRef, useEffect } from 'react'
import { Zap, AlertTriangle, ShieldCheck, TrendingDown, RefreshCw } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import { SimulationRequest } from '@/types/api'
import { runStressTest, runAllStressTests } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StressMetrics {
  base_drawdown: number
  shocked_drawdown: number
  drawdown_delta: number
  base_sharpe: number
  shocked_sharpe: number
  sharpe_delta: number
  median_nw_loss_pct: number
  prob_negative_pct: number
}

interface StressTestResult {
  scenario_key: string
  scenario_label: string
  scenario_desc: string
  shock_year: number
  recovery_year: number | null
  years_to_recover: number | null
  baseline: { p10: number[]; p50: number[]; p90: number[] }
  shocked:  { p10: number[]; p50: number[]; p90: number[] }
  delta_p50: number[]
  metrics: StressMetrics
  scenario_params: any
}

interface StressCompareResult {
  results: any[]
  worst_scenario: string
  most_resilient: string
}

interface Props {
  lastRequest: SimulationRequest | null
}

const SCENARIOS: Record<string, string> = {
  market_crash_2008: '2008 Global Financial Crisis',
  covid_2020:        'COVID-19 Market Crash',
  income_loss:       'Job Loss / Income Disruption',
  stagflation:       'Stagflation',
  rate_hike_cycle:   'Aggressive Rate Hike Cycle',
}

// ─── Chart.js hook ────────────────────────────────────────────────────────────

function useChart(ref: React.RefObject<HTMLCanvasElement>, config: () => any, deps: any[]) {
  const inst = useRef<any>(null)
  useEffect(() => {
    if (!ref.current) return
    let cancelled = false
    import('chart.js/auto').then(({ Chart }) => {
      if (cancelled || !ref.current) return
      inst.current?.destroy()
      inst.current = new Chart(ref.current, config())
    })
    return () => { cancelled = true; inst.current?.destroy(); inst.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// ─── Baseline vs Shocked chart ────────────────────────────────────────────────

function PathChart({ result, yearsAxis }: { result: StressTestResult; yearsAxis: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const labels = yearsAxis.map(y => `Yr ${y}`)

  useChart(ref, () => ({
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Baseline P50',
          data: result.baseline.p50.map(v => +(v / 1e7).toFixed(3)),
          borderColor: '#00e676', borderWidth: 2.5,
          fill: false, tension: 0.4, pointRadius: 0,
        },
        {
          label: 'Shocked P50',
          data: result.shocked.p50.map(v => +(v / 1e7).toFixed(3)),
          borderColor: '#ef5350', borderWidth: 2.5,
          borderDash: [6, 3], fill: false, tension: 0.4, pointRadius: 0,
        },
        {
          label: 'Shocked P10',
          data: result.shocked.p10.map(v => +(v / 1e7).toFixed(3)),
          borderColor: 'rgba(239,83,80,0.3)', borderWidth: 1,
          fill: false, tension: 0.4, pointRadius: 0,
        },
        {
          label: 'Shocked P90',
          data: result.shocked.p90.map(v => +(v / 1e7).toFixed(3)),
          borderColor: 'rgba(239,83,80,0.3)', borderWidth: 1,
          fill: false, tension: 0.4, pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8899aa', font: { family: 'monospace', size: 11 } } },
        annotation: {
          annotations: {
            shockLine: {
              type: 'line',
              xMin: result.shock_year, xMax: result.shock_year,
              borderColor: '#ffb300', borderWidth: 1.5, borderDash: [4, 4],
              label: { content: `Shock Yr ${result.shock_year}`, display: true,
                       color: '#ffb300', font: { size: 10 }, position: 'start' },
            },
            ...(result.recovery_year != null ? {
              recoveryLine: {
                type: 'line',
                xMin: result.recovery_year, xMax: result.recovery_year,
                borderColor: '#29b6f6', borderWidth: 1.5, borderDash: [4, 4],
                label: { content: `Recovery Yr ${result.recovery_year}`, display: true,
                         color: '#29b6f6', font: { size: 10 }, position: 'start' },
              }
            } : {}),
          },
        },
      },
      scales: {
        x: { ticks: { color: '#8899aa', font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: '#1e2a35' } },
        y: { ticks: { color: '#8899aa', font: { size: 9 }, callback: (v: any) => `₹${(+v).toFixed(1)}Cr` },
             grid: { color: '#1e2a35' } },
      },
    },
  }), [result])

  return <canvas ref={ref} />
}

// ─── Delta chart ──────────────────────────────────────────────────────────────

function DeltaChart({ delta, yearsAxis }: { delta: number[]; yearsAxis: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useChart(ref, () => ({
    type: 'bar',
    data: {
      labels: yearsAxis.map(y => `Yr ${y}`),
      datasets: [{
        label: 'NW Impact vs Baseline (₹Cr)',
        data: delta.map(v => +(v / 1e7).toFixed(3)),
        backgroundColor: delta.map(v => v >= 0 ? 'rgba(0,230,118,0.7)' : 'rgba(239,83,80,0.7)'),
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8899aa', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#8899aa', font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: '#1e2a35' } },
        y: { ticks: { color: '#8899aa', font: { size: 9 }, callback: (v: any) => `₹${(+v).toFixed(2)}Cr` },
             grid: { color: '#1e2a35' } },
      },
    },
  }), [delta])

  return <canvas ref={ref} />
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StressTestTab({ lastRequest }: Props) {
  const [scenarioKey, setScenarioKey] = useState('market_crash_2008')
  const [shockYear, setShockYear]     = useState(3)
  const [runAll, setRunAll]           = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const [result, setResult]           = useState<StressTestResult | null>(null)
  const [compareResult, setCompare]   = useState<StressCompareResult | null>(null)

  const simYears = lastRequest?.sim_years ?? 20
  const yearsAxis = Array.from({ length: simYears + 1 }, (_, i) => i)

  const handleRun = async () => {
    if (!lastRequest) return
    setLoading(true); setError(null); setResult(null); setCompare(null)
    try {
      if (runAll) {
        const data = await runAllStressTests(lastRequest, shockYear)
        setCompare(data)
      } else {
        const data = await runStressTest(lastRequest, scenarioKey, shockYear)
        setResult(data)
      }
    } catch (e: any) {
      setError(e.message ?? 'Stress test failed.')
    } finally {
      setLoading(false)
    }
  }

  if (!lastRequest) {
    return (
      <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center justify-center py-20 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-muted" />
        <p className="text-sm text-muted">Run a simulation first to enable stress testing.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Controls */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-amber-500/10 p-2 rounded-lg">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-display font-bold text-text">Stress Test Engine</p>
            <p className="text-[11px] text-muted font-mono">Inject macro shocks into your Monte Carlo paths</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Scenario dropdown */}
          <div>
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1.5">
              Scenario
            </label>
            <select
              value={scenarioKey}
              onChange={e => setScenarioKey(e.target.value)}
              disabled={runAll}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text
                         focus:outline-none focus:border-green/50 disabled:opacity-40 transition-colors"
            >
              {Object.entries(SCENARIOS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Shock year slider */}
          <div>
            <label className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1.5">
              Shock Year — <span className="text-amber-400">Yr {shockYear}</span>
            </label>
            <input
              type="range"
              min={1} max={Math.min(simYears - 2, 15)}
              value={shockYear}
              onChange={e => setShockYear(+e.target.value)}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[9px] text-muted font-mono mt-0.5">
              <span>Yr 1</span><span>Yr {Math.min(simYears - 2, 15)}</span>
            </div>
          </div>

          {/* Run All toggle + button */}
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setRunAll(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative ${runAll ? 'bg-amber-500' : 'bg-border'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${runAll ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-[11px] font-mono text-muted">Compare All Scenarios</span>
            </label>
            <button
              onClick={handleRun}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400
                         text-black text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Running...</span></>
                : <><Zap className="w-4 h-4" /><span>Run Stress Test</span></>}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
      </Card>

      {/* Single scenario result */}
      {result && !runAll && (
        <>
          {/* Scenario header */}
          <div className="bg-card border border-amber-500/20 rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-base font-display font-bold text-text">{result.scenario_label}</p>
                <p className="text-xs text-muted mt-1">{result.scenario_desc}</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <Badge color="#ffb300">Shock Yr {result.shock_year}</Badge>
                {result.recovery_year != null
                  ? <Badge color="#29b6f6">Recovery Yr {result.recovery_year}</Badge>
                  : <Badge color="#ef5350">No Recovery</Badge>}
              </div>
            </div>
          </div>

          {/* Metrics cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: 'NW Loss',
                value: `${result.metrics.median_nw_loss_pct.toFixed(1)}%`,
                color: result.metrics.median_nw_loss_pct < 0 ? 'text-red-400' : 'text-green',
                icon: <TrendingDown className="w-4 h-4" />,
              },
              {
                label: 'Drawdown Δ',
                value: `+${result.metrics.drawdown_delta.toFixed(1)}%`,
                color: 'text-amber-400',
                icon: <TrendingDown className="w-4 h-4" />,
              },
              {
                label: 'Sharpe Δ',
                value: result.metrics.sharpe_delta.toFixed(3),
                color: result.metrics.sharpe_delta < 0 ? 'text-red-400' : 'text-green',
                icon: <ShieldCheck className="w-4 h-4" />,
              },
              {
                label: 'Prob Negative',
                value: `${result.metrics.prob_negative_pct.toFixed(1)}%`,
                color: result.metrics.prob_negative_pct > 20 ? 'text-red-400' : 'text-amber-400',
                icon: <AlertTriangle className="w-4 h-4" />,
              },
              {
                label: 'Years to Recover',
                value: result.years_to_recover != null ? `${result.years_to_recover} yrs` : '—',
                color: 'text-blue-400',
                icon: <RefreshCw className="w-4 h-4" />,
              },
              {
                label: 'Base Drawdown',
                value: `${result.metrics.base_drawdown.toFixed(1)}%`,
                color: 'text-muted',
                icon: <TrendingDown className="w-4 h-4" />,
              },
              {
                label: 'Shocked Drawdown',
                value: `${result.metrics.shocked_drawdown.toFixed(1)}%`,
                color: 'text-red-400',
                icon: <TrendingDown className="w-4 h-4" />,
              },
              {
                label: 'Base Sharpe',
                value: result.metrics.base_sharpe.toFixed(3),
                color: 'text-muted',
                icon: <ShieldCheck className="w-4 h-4" />,
              },
            ].map((m, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <div className={`text-lg font-bold font-mono ${m.color}`}>{m.value}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider font-mono mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Path chart */}
          <Card>
            <p className="text-sm font-display font-bold text-text mb-4">
              Baseline vs Shocked Net Worth
            </p>
            <div className="h-[300px]">
              <PathChart result={result} yearsAxis={yearsAxis} />
            </div>
          </Card>

          {/* Delta chart */}
          <Card>
            <p className="text-sm font-display font-bold text-text mb-1">
              Net Worth Impact vs Baseline (₹Cr)
            </p>
            <p className="text-[11px] text-muted font-mono mb-4">
              Red bars = net worth below baseline · Green = recovered above baseline
            </p>
            <div className="h-[220px]">
              <DeltaChart delta={result.delta_p50} yearsAxis={yearsAxis} />
            </div>
          </Card>
        </>
      )}

      {/* Compare all scenarios */}
      {compareResult && runAll && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-display font-bold text-text">All Scenarios Comparison</p>
            <div className="flex gap-2">
              <Badge color="#ef5350">
                Worst: {SCENARIOS[compareResult.worst_scenario] ?? compareResult.worst_scenario}
              </Badge>
              <Badge color="#00e676">
                Most Resilient: {SCENARIOS[compareResult.most_resilient] ?? compareResult.most_resilient}
              </Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-border">
                  {['Scenario', 'Shock Yr', 'Recovery Yr', 'Yrs to Recover',
                    'NW Loss %', 'Shocked Drawdown', 'Sharpe Δ', 'Prob Negative'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-green/80 font-medium uppercase tracking-wider text-[10px]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareResult.results.map((r, i) => {
                  const isWorst     = r.scenario_key === compareResult.worst_scenario
                  const isResilient = r.scenario_key === compareResult.most_resilient
                  return (
                    <tr key={i} className={`border-b border-border/30 transition-colors
                      ${isWorst ? 'bg-red-500/5' : isResilient ? 'bg-green/5' : 'hover:bg-card/40'}`}>
                      <td className="px-3 py-2.5 text-text font-medium">
                        {SCENARIOS[r.scenario_key] ?? r.scenario_key}
                        {isWorst     && <span className="ml-2 text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">WORST</span>}
                        {isResilient && <span className="ml-2 text-[9px] text-green bg-green/10 px-1.5 py-0.5 rounded-full">RESILIENT</span>}
                      </td>
                      <td className="px-3 py-2.5 text-amber-400">Yr {r.shock_year}</td>
                      <td className="px-3 py-2.5 text-blue-400">{r.recovery_year != null ? `Yr ${r.recovery_year}` : '—'}</td>
                      <td className="px-3 py-2.5">{r.years_to_recover != null ? `${r.years_to_recover} yrs` : '—'}</td>
                      <td className={`px-3 py-2.5 font-bold ${r.median_nw_loss_pct < -10 ? 'text-red-400' : r.median_nw_loss_pct < 0 ? 'text-amber-400' : 'text-green'}`}>
                        {r.median_nw_loss_pct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-red-400">{r.shocked_drawdown.toFixed(1)}%</td>
                      <td className={`px-3 py-2.5 ${r.sharpe_delta < 0 ? 'text-red-400' : 'text-green'}`}>
                        {r.sharpe_delta.toFixed(3)}
                      </td>
                      <td className={`px-3 py-2.5 ${r.prob_negative_pct > 20 ? 'text-red-400' : 'text-muted'}`}>
                        {r.prob_negative_pct.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}