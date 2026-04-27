'use client'
import React from 'react'
import clsx from 'clsx'

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className,
  accent,
}: {
  children: React.ReactNode
  className?: string
  accent?: string
}) {
  return (
    <div
      className={clsx(
        'bg-surface border border-border rounded-xl p-4 relative overflow-hidden',
        className
      )}
      style={accent ? { borderColor: accent + '44' } : undefined}
    >
      {accent && (
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}88, transparent)` }}
        />
      )}
      {children}
    </div>
  )
}

// ── Section label ────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">
      {children}
    </p>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────
export function KpiCard({
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
    <Card accent={color}>
      <p className="text-[10px] font-mono text-muted uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-display font-bold" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted mt-1 font-mono">{sub}</p>}
    </Card>
  )
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-mono text-muted uppercase tracking-wider">{label}</label>
      {children}
      {hint && <span className="text-[10px] text-muted/60">{hint}</span>}
    </div>
  )
}

// ── Text input ────────────────────────────────────────────────────────────────
export function TextInput({
  value,
  onChange,
  type = 'number',
  placeholder,
  prefix,
}: {
  value: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  prefix?: string
}) {
  return (
    <div className="flex items-center bg-bg border border-border rounded-lg overflow-hidden focus-within:border-green/50 transition-colors">
      {prefix && (
        <span className="px-2.5 text-muted font-mono text-sm border-r border-border select-none">
          {prefix}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent px-3 py-2 text-sm font-mono text-text outline-none placeholder:text-muted/40"
      />
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono text-text outline-none focus:border-green/50 transition-colors cursor-pointer appearance-none"
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23546e7a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// ── Slider ────────────────────────────────────────────────────────────────────
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  display,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  display?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <label className="text-[11px] font-mono text-muted uppercase tracking-wider">{label}</label>
        <span className="text-xs font-mono text-green">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: number
  onChange: (i: number) => void
}) {
  return (
    <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 overflow-x-auto">
      {tabs.map((t, i) => (
        <button
          key={t}
          onClick={() => onChange(i)}
          className={clsx(
            'px-4 py-2 rounded-lg text-xs font-mono whitespace-nowrap transition-all',
            i === active
              ? 'bg-bg text-green border border-border'
              : 'text-muted hover:text-text'
          )}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({
  children,
  color = '#00e676',
}: {
  children: React.ReactNode
  color?: string
}) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold"
      style={{ background: color + '22', color, border: `1px solid ${color}44` }}
    >
      {children}
    </span>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────
export function Button({
  children,
  onClick,
  loading,
  disabled,
  variant = 'primary',
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'ghost'
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        'px-6 py-3 rounded-xl font-mono font-bold text-sm transition-all flex items-center justify-center gap-2',
        variant === 'primary'
          ? 'bg-green text-bg hover:bg-green/90 disabled:opacity-50 disabled:cursor-not-allowed'
          : 'border border-border text-muted hover:text-text hover:border-text/30',
        className
      )}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function ProgressBar({
  value,
  color = '#00e676',
}: {
  value: number
  color?: string
}) {
  return (
    <div className="h-1.5 bg-border rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider() {
  return <div className="border-t border-border my-4" />
}