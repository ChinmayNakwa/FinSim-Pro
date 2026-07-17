'use client'

import React, { useEffect, useState } from 'react'
import {
  User, Wallet, Target, SlidersHorizontal, Landmark, LineChart, LayoutDashboard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button, SectionLabel } from '@/components/ui'
import {
  ProfileSection, HoldingsSection, EmiSection, GoalsSection, SimSection,
} from '@/components/form/FormSections'
import { SimInputsApi } from '@/hooks/useSimInputs'
import { fetchMetaAssets, AssetMeta } from '@/lib/api'

interface Props {
  api: SimInputsApi
  onRun: () => void
  loading: boolean
}

/** A titled panel wrapping a form section. */
function Panel({
  icon: Icon,
  title,
  accent = '#00e676',
  className = '',
  children,
}: {
  icon: LucideIcon
  title: string
  accent?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={`bg-surface border border-border rounded-xl overflow-hidden ${className}`}
    >
      <header className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-card/40">
        <span className="p-1.5 rounded-md" style={{ background: `${accent}18`, color: accent }}>
          <Icon size={15} />
        </span>
        <h2 className="text-sm font-display font-semibold text-text">{title}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

/** Reference table of default market assumptions (from /meta/asset-classes). */
function MarketAssumptions() {
  const [assets, setAssets] = useState<Record<string, AssetMeta> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    fetchMetaAssets()
      .then(a => { if (alive) setAssets(a) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  if (failed) return null

  return (
    <Panel icon={LineChart} title="Market Assumptions" accent="#29b6f6" className="lg:col-span-2">
      <SectionLabel>Default forecast per asset class · overridden by live data at run time</SectionLabel>
      {!assets ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-6 rounded" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left py-2 pr-4 font-medium">Asset Class</th>
                <th className="text-right py-2 px-4 font-medium">Default CAGR</th>
                <th className="text-right py-2 px-4 font-medium">Volatility</th>
                <th className="text-left py-2 pl-4 font-medium">Ticker</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(assets).map(([ac, m]) => (
                <tr key={ac} className="border-b border-border/40">
                  <td className="py-2 pr-4 text-text">{ac}</td>
                  <td className="py-2 px-4 text-right text-green">{(m.default_cagr * 100).toFixed(1)}%</td>
                  <td className="py-2 px-4 text-right text-amber">{(m.default_vol * 100).toFixed(1)}%</td>
                  <td className="py-2 pl-4 text-muted">{m.ticker ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

export default function SetupDashboard({ api, onRun, loading }: Props) {
  const { inputs } = api

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="border-b border-border bg-bg/95 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="bg-green/10 p-2.5 rounded-lg">
            <LayoutDashboard className="w-5 h-5 text-green" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-text leading-none">FinSim Pro</h1>
            <p className="text-[11px] text-muted font-mono mt-1 uppercase tracking-wider">
              Monte Carlo Simulation Engine · Configure your scenario
            </p>
          </div>
        </div>
      </header>

      {/* Single-page form grid */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Panel icon={User} title="Profile" accent="#00e676">
            <ProfileSection api={api} />
          </Panel>

          <Panel icon={SlidersHorizontal} title="Simulation" accent="#ce93d8">
            <SimSection api={api} />
          </Panel>

          <Panel icon={Wallet} title="Portfolio Holdings" accent="#29b6f6">
            <HoldingsSection api={api} />
          </Panel>

          <Panel icon={Target} title="Goals" accent="#ffb300">
            <GoalsSection api={api} />
          </Panel>

          <Panel icon={Landmark} title="EMI / Loan" accent="#ff9800">
            <EmiSection api={api} />
          </Panel>

          <MarketAssumptions />
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-bg/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono text-muted">
            <span>{inputs.holdings.length} holdings</span>
            <span className="text-border">·</span>
            <span>{inputs.goals.length} goals</span>
            <span className="text-border">·</span>
            <span>{inputs.simYears}y horizon</span>
            <span className="text-border">·</span>
            <span>{inputs.nSims.toLocaleString()} paths</span>
            <span className="text-border">·</span>
            <span className="text-muted/60">saved locally</span>
          </div>
          <Button onClick={onRun} loading={loading} className="w-full sm:w-auto ml-auto">
            {loading ? 'Simulating…' : 'Run Simulation'}
          </Button>
        </div>
      </div>
    </div>
  )
}
