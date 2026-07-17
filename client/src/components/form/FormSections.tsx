'use client'

import React, { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { SectionLabel, Field, TextInput, Select, SliderField } from '@/components/ui'
import { SimulationRequest } from '@/types/api'
import { ASSET_CLASSES, SimInputsApi } from '@/hooks/useSimInputs'

// ── Collapsible (shared by Holdings & Goals rows) ─────────────────────────────
export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono text-muted hover:text-text bg-bg/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {title}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  )
}

// ── Profile ───────────────────────────────────────────────────────────────────
export function ProfileSection({ api }: { api: SimInputsApi }) {
  const { inputs, update } = api
  return (
    <div>
      <SectionLabel>Profile</SectionLabel>
      <div className="space-y-3">
        <Field label="Monthly Income">
          <TextInput value={inputs.income} onChange={v => update({ income: Number(v) })} prefix="₹" />
        </Field>
        <Field label="Monthly Expenses">
          <TextInput value={inputs.expenses} onChange={v => update({ expenses: Number(v) })} prefix="₹" />
        </Field>
        <Field label="Current Savings">
          <TextInput value={inputs.savings} onChange={v => update({ savings: Number(v) })} prefix="₹" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age">
            <TextInput value={inputs.age} onChange={v => update({ age: Number(v) })} />
          </Field>
          <Field label="Risk">
            <Select
              value={inputs.risk}
              onChange={v => update({ risk: v as SimulationRequest['risk_tolerance'] })}
              options={[
                { value: 'Conservative', label: 'Conservative' },
                { value: 'Moderate',     label: 'Moderate' },
                { value: 'Aggressive',   label: 'Aggressive' },
              ]}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

// ── Portfolio holdings ────────────────────────────────────────────────────────
export function HoldingsSection({ api }: { api: SimInputsApi }) {
  const { inputs, addHolding, removeHolding, updateHolding } = api
  return (
    <div>
      <SectionLabel>Portfolio Holdings</SectionLabel>
      <div className="space-y-2">
        {inputs.holdings.map((h, i) => (
          <Collapsible
            key={i}
            title={`${h.asset_class} · ₹${(h.current_value / 1e5).toFixed(1)}L`}
            defaultOpen={i < 2}
          >
            <Field label="Asset Class">
              <Select
                value={h.asset_class}
                onChange={v => updateHolding(i, 'asset_class', v)}
                options={ASSET_CLASSES.map(ac => ({ value: ac, label: ac }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Current Value">
                <TextInput value={h.current_value} onChange={v => updateHolding(i, 'current_value', Number(v))} prefix="₹" />
              </Field>
              <Field label="Monthly SIP">
                <TextInput value={h.monthly_sip} onChange={v => updateHolding(i, 'monthly_sip', Number(v))} prefix="₹" />
              </Field>
            </div>
            <Field label="Purchase Price">
              <TextInput value={h.purchase_price} onChange={v => updateHolding(i, 'purchase_price', Number(v))} prefix="₹" />
            </Field>
            <button
              type="button"
              onClick={() => removeHolding(i)}
              className="flex items-center gap-1 text-[11px] text-red/70 hover:text-red font-mono mt-1"
            >
              <Trash2 size={11} /> Remove
            </button>
          </Collapsible>
        ))}
        <button
          type="button"
          onClick={addHolding}
          className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-lg text-xs font-mono text-muted hover:text-green hover:border-green/40 transition-colors"
        >
          <Plus size={12} /> Add Holding
        </button>
      </div>
    </div>
  )
}

// ── EMI / Loan ────────────────────────────────────────────────────────────────
export function EmiSection({ api }: { api: SimInputsApi }) {
  const { inputs, update } = api
  return (
    <div>
      <SectionLabel>EMI / Loan</SectionLabel>
      <div className="space-y-3">
        <Field label="Loan Amount">
          <TextInput value={inputs.emiAmount} onChange={v => update({ emiAmount: Number(v) })} prefix="₹" />
        </Field>
        <SliderField label="Interest Rate" value={inputs.emiRate} onChange={v => update({ emiRate: v })} min={5} max={15} step={0.25} display={`${inputs.emiRate}%`} />
        <SliderField label="Tenure" value={inputs.emiTenure} onChange={v => update({ emiTenure: v })} min={1} max={30} display={`${inputs.emiTenure} yrs`} />
      </div>
    </div>
  )
}

// ── Goals ─────────────────────────────────────────────────────────────────────
export function GoalsSection({ api }: { api: SimInputsApi }) {
  const { inputs, addGoal, removeGoal, updateGoal } = api
  return (
    <div>
      <SectionLabel>Goals</SectionLabel>
      <div className="space-y-2">
        {inputs.goals.map((g, i) => (
          <Collapsible key={i} title={`${g.name} · Yr ${g.target_year}`} defaultOpen={i < 2}>
            <Field label="Goal Name">
              <TextInput value={g.name} type="text" onChange={v => updateGoal(i, 'name', v)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Target (₹)">
                <TextInput value={g.target_amount} onChange={v => updateGoal(i, 'target_amount', Number(v))} prefix="₹" />
              </Field>
              <Field label="Year">
                <TextInput value={g.target_year} onChange={v => updateGoal(i, 'target_year', Number(v))} />
              </Field>
            </div>
            <Field label="Priority">
              <Select
                value={g.priority}
                onChange={v => updateGoal(i, 'priority', v)}
                options={[
                  { value: 'Critical', label: 'Critical' },
                  { value: 'Important', label: 'Important' },
                  { value: 'Nice-to-have', label: 'Nice-to-have' },
                ]}
              />
            </Field>
            <button
              type="button"
              onClick={() => removeGoal(i)}
              className="flex items-center gap-1 text-[11px] text-red/70 hover:text-red font-mono"
            >
              <Trash2 size={11} /> Remove
            </button>
          </Collapsible>
        ))}
        <button
          type="button"
          onClick={addGoal}
          className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-lg text-xs font-mono text-muted hover:text-green hover:border-green/40 transition-colors"
        >
          <Plus size={12} /> Add Goal
        </button>
      </div>
    </div>
  )
}

// ── Simulation settings ───────────────────────────────────────────────────────
export function SimSection({ api }: { api: SimInputsApi }) {
  const { inputs, update } = api
  return (
    <div>
      <SectionLabel>Simulation</SectionLabel>
      <div className="space-y-3">
        <SliderField label="Projection Years" value={inputs.simYears} onChange={v => update({ simYears: v })} min={5} max={40} display={`${inputs.simYears} yrs`} />
        <SliderField label="Emergency Fund" value={inputs.emergency} onChange={v => update({ emergency: v })} min={3} max={24} display={`${inputs.emergency} mo`} />
        <SliderField label="Monte Carlo Paths" value={inputs.nSims} onChange={v => update({ nSims: v })} min={100} max={2000} step={100} display={inputs.nSims.toLocaleString()} />
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
            <input type="checkbox" checked={inputs.applyTax} onChange={e => update({ applyTax: e.target.checked })} />
            Apply Indian Tax
          </label>
          <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
            <input type="checkbox" checked={inputs.holidays} onChange={e => update({ holidays: e.target.checked })} />
            Include Holiday Spending
          </label>
        </div>
        <Field label="Tax Regime">
          <Select
            value={inputs.regime}
            onChange={v => update({ regime: v as 'new' | 'old' })}
            options={[
              { value: 'new', label: 'New Regime (FY25)' },
              { value: 'old', label: 'Old Regime' },
            ]}
          />
        </Field>
      </div>
    </div>
  )
}
