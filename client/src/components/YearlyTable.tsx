'use client'
import React, { useState } from 'react'
import { SimulationResponse } from '@/types/api'
import { Card, SectionLabel, Badge } from '@/components/ui'
import { fmt } from '@/lib/format'

export default function YearlyTable({ data }: { data: SimulationResponse }) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10
  const rows = data.yearly_table
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const downloadCsv = () => {
    const headers = ['Year', 'Age', 'NW Median', 'NW P10', 'NW P90', 'Annual Income', 'Annual Expenses', 'Est. Tax', 'FIRE %', 'Goals Due']
    const csvRows = rows.map(r => [
      r.year, r.age,
      r.net_worth_median.toFixed(0), r.net_worth_p10.toFixed(0), r.net_worth_p90.toFixed(0),
      r.annual_income.toFixed(0), r.annual_expenses.toFixed(0), r.est_income_tax.toFixed(0),
      r.fire_progress_pct, r.goals_due.join('; '),
    ].join(','))
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'finsim_projection.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Year-by-Year Breakdown (Median Path)</SectionLabel>
        <button
          onClick={downloadCsv}
          className="text-[11px] font-mono text-muted hover:text-green border border-border hover:border-green/40 px-3 py-1.5 rounded-lg transition-colors"
        >
          ↓ CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border">
              {['Yr', 'Age', 'NW (Median)', 'NW (P10)', 'NW (P90)', 'Income', 'Expenses', 'Tax', 'FIRE %', 'Goals'].map(h => (
                <th key={h} className="text-left py-2 pr-4 text-muted whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
              const fireColor = r.fire_progress_pct >= 100 ? '#00e676' : r.fire_progress_pct >= 60 ? '#ffb300' : '#cfd8dc'
              return (
                <tr key={r.year} className="border-b border-border/30 hover:bg-bg/60 transition-colors">
                  <td className="py-2 pr-4 text-muted">{r.year}</td>
                  <td className="py-2 pr-4 text-muted">{r.age}</td>
                  <td className="py-2 pr-4 text-green font-semibold">{fmt(r.net_worth_median)}</td>
                  <td className="py-2 pr-4 text-red/70">{fmt(r.net_worth_p10)}</td>
                  <td className="py-2 pr-4 text-blue">{fmt(r.net_worth_p90)}</td>
                  <td className="py-2 pr-4">{fmt(r.annual_income)}</td>
                  <td className="py-2 pr-4 text-muted">{fmt(r.annual_expenses)}</td>
                  <td className="py-2 pr-4 text-red/80">{fmt(r.est_income_tax)}</td>
                  <td className="py-2 pr-4 font-semibold whitespace-nowrap" style={{ color: fireColor }}>
                    {r.fire_progress_pct.toFixed(0)}%
                  </td>
                  <td className="py-2">
                    {r.goals_due.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {r.goals_due.map(g => (
                          <Badge key={g} color="#ce93d8">{g}</Badge>
                        ))}
                      </div>
                    ) : <span className="text-muted/40">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <span className="text-[11px] text-muted font-mono">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-[11px] font-mono border border-border rounded hover:border-green/40 disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1 text-[11px] font-mono border border-border rounded hover:border-green/40 disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}