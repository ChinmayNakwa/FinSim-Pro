'use client'
import React, { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  SectionLabel, Field, TextInput, Select, SliderField,
  Button, Divider, Badge
} from '@/components/ui'
import {
  SimulationRequest, PortfolioHoldingIn, GoalIn, TaxConfigIn
} from '@/types/api'

const ASSET_CLASSES = [
  'Indian Equity', 'Nifty Bank', 'Nifty IT',
  'Gold', 'Real Estate', 'International Equity', 'Debt/Bonds',
]
const ASSET_COLORS: Record<string, string> = {
  'Indian Equity': '#00e676', 'Nifty Bank': '#29b6f6', 'Nifty IT': '#ce93d8',
  'Gold': '#ffb300', 'Real Estate': '#ff9800', 'International Equity': '#e91e63', 'Debt/Bonds': '#78909c',
}

const DEFAULT_TAX: TaxConfigIn = {
  regime: 'new',
  ltcg_rate: 0.125, stcg_rate: 0.20, stcg_rebalance_fraction: 0.05,
  section_80d: 25000, hra_exemption: 0, home_loan_interest: 0,
  ltcg_exempt_limit: 125000,
  gold_ltcg_rate: 0.20, gold_stcg_rate: 0.30,
  re_ltcg_rate: 0.20, re_stcg_rate: 0.30,
  debt_ltcg_rate: 0.30, debt_stcg_rate: 0.30,
}

interface Props {
  onSubmit: (req: SimulationRequest) => void
  loading: boolean
}

function Collapsible({ title, children, defaultOpen = false }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
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

export default function SidebarForm({ onSubmit, loading }: Props) {
  // Personal
  const [savings, setSavings]   = useState(500000)
  const [income, setIncome]     = useState(100000)
  const [expenses, setExpenses] = useState(40000)
  const [age, setAge]           = useState(28)
  const [risk, setRisk]         = useState<SimulationRequest['risk_tolerance']>('Moderate')

  // Holdings
  const [holdings, setHoldings] = useState<PortfolioHoldingIn[]>([
    { asset_class: 'Indian Equity',  current_value: 300000, purchase_price: 240000, monthly_sip: 10000 },
    { asset_class: 'Gold',           current_value: 100000, purchase_price: 80000,  monthly_sip: 2000  },
    { asset_class: 'Debt/Bonds',     current_value: 100000, purchase_price: 100000, monthly_sip: 3000  },
  ])

  // EMI
  const [emiAmount, setEmiAmount]   = useState(2000000)
  const [emiRate, setEmiRate]       = useState(9.0)
  const [emiTenure, setEmiTenure]   = useState(10)
  const [emergency, setEmergency]   = useState(6)

  // Sim
  const [simYears, setSimYears]     = useState(20)
  const [nSims, setNSims]           = useState(500)
  const [applyTax, setApplyTax]     = useState(true)
  const [holidays, setHolidays]     = useState(true)
  const [regime, setRegime]         = useState<'new' | 'old'>('new')

  // Goals
  const [goals, setGoals] = useState<GoalIn[]>([
    { name: '🏠 House',       target_amount: 5000000,  target_year: 7,  priority: 'Critical'  },
    { name: '🏖️ Retirement', target_amount: 30000000, target_year: 25, priority: 'Critical'  },
  ])

  const addHolding = () => setHoldings(h => [...h, { asset_class: 'Indian Equity', current_value: 100000, purchase_price: 80000, monthly_sip: 5000 }])
  const removeHolding = (i: number) => setHoldings(h => h.filter((_, j) => j !== i))
  const updateHolding = (i: number, k: keyof PortfolioHoldingIn, v: string | number) =>
    setHoldings(h => h.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const addGoal = () => setGoals(g => [...g, { name: 'New Goal', target_amount: 1000000, target_year: 10, priority: 'Important' }])
  const removeGoal = (i: number) => setGoals(g => g.filter((_, j) => j !== i))
  const updateGoal = (i: number, k: keyof GoalIn, v: string | number) =>
    setGoals(g => g.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const handleSubmit = () => {
    onSubmit({
      savings, income, expenses, age, risk_tolerance: risk,
      portfolio_holdings: holdings,
      emi_loan_amount: emiAmount, emi_rate: emiRate, emi_tenure_years: emiTenure,
      emergency_months: emergency,
      sim_years: simYears, apply_tax: applyTax, n_sims: nSims,
      withdrawal_rate: 0.04, risk_free_rate: 0.065,
      savings_yield: 0.05, emergency_yield: 0.065,
      include_holidays: holidays,
      holiday_spike_pct: 0.15,
      holiday_months: [1, 3, 8, 9, 10, 11, 12],
      goals,
      tax_cfg: { ...DEFAULT_TAX, regime },
    })
  }

  return (
    <aside className="w-80 shrink-0 h-screen overflow-y-auto bg-surface border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border sticky top-0 bg-surface z-10">
        <div className="flex items-center gap-2">
          <span className="text-green font-mono font-bold text-lg">FS</span>
          <div>
            <p className="text-xs font-display font-bold text-text">FinSim Pro</p>
            <p className="text-[10px] text-muted font-mono">Monte Carlo Engine</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-5">
        {/* Profile */}
        <div>
          <SectionLabel>👤 Profile</SectionLabel>
          <div className="space-y-3">
            <Field label="Monthly Income">
              <TextInput value={income} onChange={v => setIncome(Number(v))} prefix="₹" />
            </Field>
            <Field label="Monthly Expenses">
              <TextInput value={expenses} onChange={v => setExpenses(Number(v))} prefix="₹" />
            </Field>
            <Field label="Current Savings">
              <TextInput value={savings} onChange={v => setSavings(Number(v))} prefix="₹" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age">
                <TextInput value={age} onChange={v => setAge(Number(v))} />
              </Field>
              <Field label="Risk">
                <Select
                  value={risk}
                  onChange={v => setRisk(v as SimulationRequest['risk_tolerance'])}
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

        <Divider />

        {/* Holdings */}
        <div>
          <SectionLabel>💼 Portfolio Holdings</SectionLabel>
          <div className="space-y-2">
            {holdings.map((h, i) => (
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
                <button onClick={() => removeHolding(i)} className="flex items-center gap-1 text-[11px] text-red/70 hover:text-red font-mono mt-1">
                  <Trash2 size={11} /> Remove
                </button>
              </Collapsible>
            ))}
            <button onClick={addHolding} className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-lg text-xs font-mono text-muted hover:text-green hover:border-green/40 transition-colors">
              <Plus size={12} /> Add Holding
            </button>
          </div>
        </div>

        <Divider />

        {/* EMI */}
        <div>
          <SectionLabel>🏦 EMI / Loan</SectionLabel>
          <div className="space-y-3">
            <Field label="Loan Amount">
              <TextInput value={emiAmount} onChange={v => setEmiAmount(Number(v))} prefix="₹" />
            </Field>
            <SliderField label="Interest Rate" value={emiRate} onChange={setEmiRate} min={5} max={15} step={0.25} display={`${emiRate}%`} />
            <SliderField label="Tenure" value={emiTenure} onChange={setEmiTenure} min={1} max={30} display={`${emiTenure} yrs`} />
          </div>
        </div>

        <Divider />

        {/* Goals */}
        <div>
          <SectionLabel>🎯 Goals</SectionLabel>
          <div className="space-y-2">
            {goals.map((g, i) => (
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
                  <Select value={g.priority} onChange={v => updateGoal(i, 'priority', v)} options={[
                    { value: 'Critical', label: 'Critical' },
                    { value: 'Important', label: 'Important' },
                    { value: 'Nice-to-have', label: 'Nice-to-have' },
                  ]} />
                </Field>
                <button onClick={() => removeGoal(i)} className="flex items-center gap-1 text-[11px] text-red/70 hover:text-red font-mono">
                  <Trash2 size={11} /> Remove
                </button>
              </Collapsible>
            ))}
            <button onClick={addGoal} className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-lg text-xs font-mono text-muted hover:text-green hover:border-green/40 transition-colors">
              <Plus size={12} /> Add Goal
            </button>
          </div>
        </div>

        <Divider />

        {/* Simulation settings */}
        <div>
          <SectionLabel>⚙️ Simulation</SectionLabel>
          <div className="space-y-3">
            <SliderField label="Projection Years" value={simYears} onChange={setSimYears} min={5} max={40} display={`${simYears} yrs`} />
            <SliderField label="Emergency Fund" value={emergency} onChange={setEmergency} min={3} max={24} display={`${emergency} mo`} />
            <SliderField label="Monte Carlo Paths" value={nSims} onChange={setNSims} min={100} max={2000} step={100} display={nSims.toLocaleString()} />
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
                <input type="checkbox" checked={applyTax} onChange={e => setApplyTax(e.target.checked)} />
                Apply Indian Tax
              </label>
              <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
                <input type="checkbox" checked={holidays} onChange={e => setHolidays(e.target.checked)} />
                Include Holiday Spending
              </label>
            </div>
            <Field label="Tax Regime">
              <Select value={regime} onChange={v => setRegime(v as 'new' | 'old')} options={[
                { value: 'new', label: 'New Regime (FY25)' },
                { value: 'old', label: 'Old Regime' },
              ]} />
            </Field>
          </div>
        </div>
      </div>

      {/* Run button */}
      <div className="p-4 border-t border-border sticky bottom-0 bg-surface">
        <Button onClick={handleSubmit} loading={loading} className="w-full">
          {loading ? 'Simulating…' : '🚀 Run Simulation'}
        </Button>
      </div>
    </aside>
  )
}