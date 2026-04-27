'use client'
import React from 'react'
import { SimulationResponse } from '@/types/api'
import { Card, SectionLabel, Badge, ProgressBar } from '@/components/ui'
import { fmt } from '@/lib/format'

export default function RebalanceTab({ data }: { data: SimulationResponse }) {
  const reb = data.rebalance

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <Card accent={reb.needed ? '#ffb300' : '#00e676'}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display font-semibold text-text">
              {reb.needed ? '⚠️ Rebalancing Recommended' : '✅ Portfolio Well-Balanced'}
            </p>
            {reb.needed && (
              <p className="text-xs text-muted font-mono mt-0.5">
                Total drift: <span className="text-amber">{reb.total_drift.toFixed(1)}%</span> from target
              </p>
            )}
          </div>
          <Badge color={reb.needed ? '#ffb300' : '#00e676'}>
            {reb.needed ? `${reb.suggestions.length} actions` : 'No action needed'}
          </Badge>
        </div>
      </Card>

      {/* Current vs target */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Current vs Target Allocation</SectionLabel>
          <div className="space-y-3">
            {Object.keys({ ...reb.current_allocation, ...reb.target_allocation }).map(ac => {
              const cur = reb.current_allocation[ac] ?? 0
              const tgt = reb.target_allocation[ac] ?? 0
              const drift = Math.abs(cur - tgt)
              return (
                <div key={ac}>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-muted truncate max-w-[140px]">{ac}</span>
                    <span className="flex gap-3">
                      <span className="text-blue">{cur.toFixed(1)}%</span>
                      <span className="text-muted">→</span>
                      <span className="text-green">{tgt.toFixed(1)}%</span>
                      {drift > 5 && <span className="text-amber">({drift.toFixed(1)}% drift)</span>}
                    </span>
                  </div>
                  <div className="relative h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="absolute top-0 left-0 h-full rounded-full bg-blue/60 transition-all" style={{ width: `${Math.min(cur, 100)}%` }} />
                    <div className="absolute top-0 left-0 h-full w-px bg-green" style={{ left: `${Math.min(tgt, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <SectionLabel>Action Items</SectionLabel>
          {!reb.needed ? (
            <p className="text-sm text-muted font-mono text-center py-8">No rebalancing needed.</p>
          ) : (
            <div className="space-y-2">
              {reb.suggestions.map(s => (
                <div
                  key={s.asset_class}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  style={{ borderColor: s.action === 'BUY' ? '#00e67644' : '#ff444444', background: s.action === 'BUY' ? '#00e67608' : '#ff444408' }}
                >
                  <div>
                    <p className="text-xs font-mono font-semibold" style={{ color: s.action === 'BUY' ? '#00e676' : '#ff4444' }}>
                      {s.action} {s.asset_class}
                    </p>
                    <p className="text-[11px] text-muted font-mono mt-0.5">
                      {s.current_pct.toFixed(1)}% → {s.target_pct.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold" style={{ color: s.action === 'BUY' ? '#00e676' : '#ff4444' }}>
                      {fmt(s.amount)}
                    </p>
                    <p className="text-[10px] text-muted font-mono">{s.drift.toFixed(1)}% drift</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}