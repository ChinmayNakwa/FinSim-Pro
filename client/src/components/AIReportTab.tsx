'use client'
import React, { useEffect, useRef } from 'react'
import { Sparkles, Download, FileText, Loader2 } from 'lucide-react'
import { AIReportPayload } from '@/app/page'
import { Card } from '@/components/ui'
// import { cr } from '@/lib/format'

interface Props {
  report: AIReportPayload | null
  generating: boolean
  onGenerate: () => void
  onDownloadPDF: () => void
  downloadingPDF: boolean
}

// ─── Chart.js helpers ────────────────────────────────────────────────────────

function useChartJS(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  buildConfig: () => any,
  deps: any[]
) {
  const instanceRef = useRef<any>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    let cancelled = false

    import('chart.js/auto').then(({ Chart }) => {
      if (cancelled || !canvasRef.current) return
      if (instanceRef.current) instanceRef.current.destroy()
      instanceRef.current = new Chart(canvasRef.current, buildConfig())
    })

    return () => {
      cancelled = true
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// ─── Individual Charts ────────────────────────────────────────────────────────

function NetWorthChart({ data }: { data: any }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useChartJS(ref, () => ({
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'P90 (Optimistic)',
          data: data.p90.map((v: number) => +(v / 1e7).toFixed(3)),
          borderColor: 'transparent', backgroundColor: 'rgba(0,230,118,0.08)',
          fill: '+2', tension: 0.4, pointRadius: 0,
        },
        {
          label: 'Median (P50)',
          data: data.p50.map((v: number) => +(v / 1e7).toFixed(3)),
          borderColor: '#00e676', backgroundColor: 'rgba(0,230,118,0.15)',
          fill: false, tension: 0.4, pointRadius: 0, borderWidth: 2.5,
        },
        {
          label: 'P10 (Pessimistic)',
          data: data.p10.map((v: number) => +(v / 1e7).toFixed(3)),
          borderColor: 'transparent', backgroundColor: 'rgba(0,0,0,0)',
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
            fireLine: {
              type: 'line', yMin: +(data.fire_number / 1e7).toFixed(3),
              yMax: +(data.fire_number / 1e7).toFixed(3),
              borderColor: '#ffb300', borderWidth: 1.5, borderDash: [6, 3],
              label: { content: `FIRE ₹${(data.fire_number/1e7).toFixed(2)}Cr`, display: true,
                       color: '#ffb300', font: { size: 10 } },
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: '#8899aa', font: { family: 'monospace', size: 9 }, maxTicksLimit: 10 },
             grid: { color: '#1e2a35' } },
        y: { ticks: { color: '#8899aa', font: { family: 'monospace', size: 9 },
                      callback: (v: any) => `₹${(+v).toFixed(1)}Cr` },
             grid: { color: '#1e2a35' } },
      },
    },
  }), [data])
  return <canvas ref={ref} />
}

function TaxChart({ data }: { data: any }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useChartJS(ref, () => ({
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        { label: 'Income Tax', data: data.income_tax.map((v: number) => +(v/1e5).toFixed(2)),
          backgroundColor: '#ef5350', stack: 'tax' },
        { label: 'LTCG Tax',   data: data.ltcg_tax.map((v: number) => +(v/1e5).toFixed(2)),
          backgroundColor: '#ffb300', stack: 'tax' },
        { label: 'STCG Tax',   data: data.stcg_tax.map((v: number) => +(v/1e5).toFixed(2)),
          backgroundColor: '#29b6f6', stack: 'tax' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8899aa', font: { size: 11 } } } },
      scales: {
        x: { stacked: true, ticks: { color: '#8899aa', font: { size: 9 }, maxTicksLimit: 10 },
             grid: { color: '#1e2a35' } },
        y: { stacked: true, ticks: { color: '#8899aa', font: { size: 9 },
                                     callback: (v: any) => `₹${v}L` },
             grid: { color: '#1e2a35' } },
      },
    },
  }), [data])
  return <canvas ref={ref} />
}

function PortfolioDoughnut({ data }: { data: any }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const COLORS = ['#00e676','#29b6f6','#ffb300','#ef5350','#ab47bc','#26c6da','#d4e157']
  useChartJS(ref, () => ({
    type: 'doughnut',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.weights_pct,
        backgroundColor: COLORS.slice(0, data.labels.length),
        borderColor: '#0f1419', borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'right', labels: { color: '#8899aa', font: { size: 11 }, padding: 12 } } },
    },
  }), [data])
  return <canvas ref={ref} />
}

function CAGRChart({ data }: { data: any }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useChartJS(ref, () => ({
    type: 'bar',
    data: {
      labels: data.cagr_labels,
      datasets: [
        { label: 'CAGR %', data: data.cagrs, backgroundColor: 'rgba(0,230,118,0.8)', borderRadius: 4 },
        { label: 'Vol %',  data: data.vols,  backgroundColor: 'rgba(41,182,246,0.8)', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8899aa', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#8899aa', font: { size: 9 } }, grid: { color: '#1e2a35' } },
        y: { ticks: { color: '#8899aa', font: { size: 9 }, callback: (v: any) => `${v}%` },
             grid: { color: '#1e2a35' } },
      },
    },
  }), [data])
  return <canvas ref={ref} />
}

function RebalanceChart({ data }: { data: any }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useChartJS(ref, () => ({
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        { label: 'Current %', data: data.current_pct, backgroundColor: 'rgba(41,182,246,0.8)', borderRadius: 4 },
        { label: 'Target %',  data: data.target_pct,  backgroundColor: 'rgba(0,230,118,0.8)',  borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8899aa', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#8899aa', font: { size: 9 } }, grid: { color: '#1e2a35' } },
        y: { ticks: { color: '#8899aa', font: { size: 9 }, callback: (v: any) => `${v}%` },
             grid: { color: '#1e2a35' } },
      },
    },
  }), [data])
  return <canvas ref={ref} />
}

// ─── Narrative renderer (markdown → html) ─────────────────────────────────────

function Narrative({ text }: { text: string }) {
  const sections = text.trim().split(/\n## /)
  return (
    <div className="space-y-4">
      {sections.map((section, i) => {
        const lines = section.split('\n')
        const title = lines[0].replace(/^#+\s*/, '')
        const body  = lines.slice(1).join('\n').trim()
        return (
          <div key={i} className="bg-card/60 border border-border rounded-xl p-5">
            <h3 className="text-sm font-display font-bold text-green mb-2">{title}</h3>
            <p className="text-sm text-muted/90 leading-relaxed whitespace-pre-wrap"
               dangerouslySetInnerHTML={{ __html: body.replace(/\*\*(.+?)\*\*/g, '<strong class="text-text">$1</strong>') }} />
          </div>
        )
      })}
    </div>
  )
}

// ─── Yearly Table ─────────────────────────────────────────────────────────────

function YearlyReportTable({ rows }: { rows: any[] }) {
  const fmt = (v: number) => Math.abs(v) >= 1e7 ? `₹${(v/1e7).toFixed(2)}Cr` : `₹${(v/1e5).toFixed(1)}L`
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="border-b border-border">
            {['Yr','Age','Median NW','P10','P90','Income','Expenses','Tax','FIRE %','Goals'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-green/80 font-medium uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/30 hover:bg-card/40 transition-colors">
              <td className="px-3 py-2 text-muted">{r.year}</td>
              <td className="px-3 py-2 text-muted">{r.age}</td>
              <td className="px-3 py-2 text-green font-medium">{fmt(r.net_worth_median)}</td>
              <td className="px-3 py-2 text-red-400">{fmt(r.net_worth_p10)}</td>
              <td className="px-3 py-2 text-blue-400">{fmt(r.net_worth_p90)}</td>
              <td className="px-3 py-2">{fmt(r.annual_income)}</td>
              <td className="px-3 py-2">{fmt(r.annual_expenses)}</td>
              <td className="px-3 py-2 text-amber-400">{fmt(r.est_income_tax)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-green rounded-full" style={{ width: `${Math.min(r.fire_progress_pct, 100)}%` }} />
                  </div>
                  <span className="text-muted">{r.fire_progress_pct.toFixed(1)}%</span>
                </div>
              </td>
              <td className="px-3 py-2 text-purple-400">{r.goals_due.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIReportTab({ report, generating, onGenerate, onDownloadPDF, downloadingPDF }: Props) {

  if (!report) {
    return (
      <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 bg-muted/10 rounded-full flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-muted" />
        </div>
        <div className="max-w-md">
          <h3 className="text-lg font-medium text-text">No Analysis Generated</h3>
          <p className="text-sm text-muted mt-2">
            Click "Generate AI Report" to receive a full breakdown with charts, narrative, and year-by-year data.
          </p>
        </div>
      </div>
    )
  }

  const { narrative, charts, yearly_table, meta } = report

  return (
    <div className="space-y-6">

      {/* Header card */}
      <div className="bg-card border border-border rounded-2xl p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-purple-600/20 p-3 rounded-xl">
            <FileText className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-text">AI Financial Strategy Report</h2>
            <p className="text-xs text-muted">LangGraph · Gemini · {yearly_table.length} year projection</p>
          </div>
        </div>
        <button
          onClick={onDownloadPDF}
          disabled={downloadingPDF}
          className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-green/10 text-green border border-green/20 transition-all duration-200 hover:bg-green/20 hover:scale-105 hover:shadow-lg hover:shadow-green/20 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Download HTML Report"
        >
          {downloadingPDF
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Download className="w-4 h-4 transition-transform duration-200 group-hover:-translate-y-0.5" />}
          <span className="text-sm font-medium">{downloadingPDF ? 'Preparing...' : 'Download Report'}</span>
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'FIRE Target',    value: `₹${(meta.fire_number/1e7).toFixed(2)}Cr` },
          { label: 'Years to FIRE',  value: meta.years_to_fire ? `${meta.years_to_fire} yrs` : '—' },
          { label: 'Blended CAGR',   value: `${(meta.blended_cagr*100).toFixed(2)}%` },
          { label: 'Portfolio Vol',  value: `${(meta.blended_vol*100).toFixed(2)}%` },
          { label: 'Monthly EMI',    value: `₹${meta.emi_monthly.toLocaleString('en-IN', {maximumFractionDigits:0})}` },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <div className="text-lg font-bold text-green">{k.value}</div>
            <div className="text-[10px] text-muted font-mono uppercase tracking-wider mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Net Worth Chart */}
      <Card>
        <p className="text-sm font-display font-bold text-text mb-4">Net Worth Projection</p>
        <div className="h-[300px]"><NetWorthChart data={charts.net_worth} /></div>
      </Card>

      {/* Narrative */}
      <Narrative text={narrative} />

      {/* Tax Chart */}
      <Card>
        <p className="text-sm font-display font-bold text-text mb-4">Annual Tax Breakdown</p>
        <div className="h-[260px]"><TaxChart data={charts.tax} /></div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-[11px] font-mono">
          <div className="bg-bg/50 rounded-lg p-3">
            <div className="text-muted uppercase tracking-wider">Total Income Tax</div>
            <div className="text-text font-bold mt-1">₹{(charts.tax.summary.total_income_tax/1e5).toFixed(1)}L avg</div>
          </div>
          <div className="bg-bg/50 rounded-lg p-3">
            <div className="text-muted uppercase tracking-wider">Total LTCG</div>
            <div className="text-amber-400 font-bold mt-1">₹{(charts.tax.summary.total_ltcg/1e5).toFixed(1)}L avg</div>
          </div>
          <div className="bg-bg/50 rounded-lg p-3">
            <div className="text-muted uppercase tracking-wider">Effective Rate</div>
            <div className="text-blue-400 font-bold mt-1">{charts.tax.summary.avg_eff_rate.toFixed(2)}%</div>
          </div>
        </div>
      </Card>

      {/* Portfolio Charts */}
      <Card>
        <p className="text-sm font-display font-bold text-text mb-4">Portfolio Analysis</p>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-[240px]"><PortfolioDoughnut data={charts.portfolio} /></div>
          <div className="h-[240px]"><CAGRChart data={charts.portfolio} /></div>
        </div>
      </Card>

      {/* Rebalance Chart + suggestions */}
      <Card>
        <p className="text-sm font-display font-bold text-text mb-4">Rebalancing Analysis</p>
        <div className="h-[240px]"><RebalanceChart data={charts.rebalance} /></div>
        {charts.rebalance.suggestions.length > 0 && (
          <div className="mt-4 space-y-2">
            {charts.rebalance.suggestions.map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-bg/50 rounded-lg border border-border/50">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  s.action === 'BUY' ? 'bg-green/15 text-green' : 'bg-red-500/15 text-red-400'
                }`}>{s.action}</span>
                <span className="text-sm font-medium text-text">{s.asset_class}</span>
                <span className="text-xs text-muted">
                  ₹{(s.amount/1e5).toFixed(1)}L &nbsp;·&nbsp; {s.current_pct}% → {s.target_pct}% &nbsp;·&nbsp; drift {s.drift}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Year-by-Year Table */}
      <Card>
        <p className="text-sm font-display font-bold text-text mb-4">Year-by-Year Projection</p>
        <YearlyReportTable rows={yearly_table} />
      </Card>

    </div>
  )
}