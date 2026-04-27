'use client'
import React from 'react'
import { SimulationResponse } from '@/types/api'
import { Card, SectionLabel, ProgressBar, Badge } from '@/components/ui'
import { cr, fmt } from '@/lib/format'

const PRIORITY_COLOR: Record<string, string> = {
  Critical: '#ff4444',
  Important: '#ffb300',
  'Nice-to-have': '#29b6f6',
}

export default function GoalsTab({ data }: { data: SimulationResponse }) {
  if (!data.goal_results.length) {
    return (
      <Card>
        <p className="text-sm text-muted font-mono text-center py-8">No goals configured.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {data.goal_results.map(g => {
        const barColor = g.percent_funded >= 100
          ? '#00e676'
          : g.percent_funded >= 60
          ? '#ffb300'
          : '#ff4444'

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
                {g.on_track
                  ? <Badge color="#00e676">✓ On track</Badge>
                  : <Badge color="#ff4444">⚠ Shortfall</Badge>}
              </div>
            </div>

            <ProgressBar value={g.percent_funded} color={barColor} />

            <div className="flex justify-between items-center mt-2">
              <span className="text-xs font-mono text-muted">
                {g.percent_funded.toFixed(0)}% funded
              </span>
              <span className="text-xs font-mono" style={{ color: barColor }}>
                Projected NW at goal: {cr(g.projected_nw_at_goal)}
              </span>
            </div>

            {g.shortfall > 0 && (
              <p className="text-[11px] text-red font-mono mt-1.5">
                Shortfall: {fmt(g.shortfall)}
              </p>
            )}
          </Card>
        )
      })}
    </div>
  )
}