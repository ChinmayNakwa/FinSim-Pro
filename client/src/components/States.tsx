'use client'
import React from 'react'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 select-none">
      {/* Animated chart placeholder */}
      <div className="relative w-48 h-32">
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="absolute bottom-0 rounded-t-sm"
            style={{
              left:  `${i * 22}%`,
              width: '16%',
              height: `${30 + Math.sin(i * 1.2) * 20 + i * 8}%`,
              background: `rgba(0,230,118,${0.15 + i * 0.12})`,
              animation: `pulse 2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
        <div
          className="absolute bottom-0 left-0 w-full h-px"
          style={{ background: 'rgba(0,230,118,0.3)' }}
        />
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg font-display font-semibold text-text">
          Configure & Run Your Simulation
        </p>
        <p className="text-sm text-muted font-mono max-w-xs leading-relaxed text-center">
          Fill in your portfolio, goals, and tax preferences on the left, then hit{' '}
          <span className="text-green">Run Simulation</span>.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-sm w-full">
        {[
          { icon: '💼', label: 'Multi-asset portfolio' },
          { icon: '🎲', label: 'Monte Carlo paths' },
          { icon: '🧾', label: 'Indian tax engine' },
        ].map(f => (
          <div key={f.label} className="flex flex-col items-center gap-1.5 p-3 bg-surface border border-border rounded-xl">
            <span className="text-xl">{f.icon}</span>
            <span className="text-[10px] font-mono text-muted text-center leading-tight">{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LoadingState({ nSims }: { nSims: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6">
      {/* Spinning ring */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-green animate-spin"
          style={{ animationDuration: '0.8s' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-green font-mono text-xs font-bold">FS</span>
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-display font-semibold text-text">Running Simulation…</p>
        <p className="text-xs text-muted font-mono">
          {nSims.toLocaleString()} Monte Carlo paths · fetching market data
        </p>
      </div>

      {/* Skeleton cards */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-xl" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  )
}