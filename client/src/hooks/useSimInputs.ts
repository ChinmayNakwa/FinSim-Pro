'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SimulationRequest,
  PortfolioHoldingIn,
  GoalIn,
  TaxConfigIn,
} from '@/types/api'

// ── Static reference data ─────────────────────────────────────────────────────
export const ASSET_CLASSES = [
  'Indian Equity', 'Nifty Bank', 'Nifty IT',
  'Gold', 'Real Estate', 'International Equity', 'Debt/Bonds',
] as const

export const ASSET_COLORS: Record<string, string> = {
  'Indian Equity': '#00e676', 'Nifty Bank': '#29b6f6', 'Nifty IT': '#ce93d8',
  'Gold': '#ffb300', 'Real Estate': '#ff9800', 'International Equity': '#e91e63',
  'Debt/Bonds': '#78909c',
}

export const DEFAULT_TAX: TaxConfigIn = {
  regime: 'new',
  ltcg_rate: 0.125, stcg_rate: 0.20, stcg_rebalance_fraction: 0.05,
  section_80d: 25000, hra_exemption: 0, home_loan_interest: 0,
  ltcg_exempt_limit: 125000,
  gold_ltcg_rate: 0.20, gold_stcg_rate: 0.30,
  re_ltcg_rate: 0.20, re_stcg_rate: 0.30,
  debt_ltcg_rate: 0.30, debt_stcg_rate: 0.30,
}

// ── Shape of everything the setup form collects ───────────────────────────────
export interface SimInputs {
  // Profile
  savings: number
  income: number
  expenses: number
  age: number
  risk: SimulationRequest['risk_tolerance']
  // Portfolio
  holdings: PortfolioHoldingIn[]
  // EMI / Loan
  emiAmount: number
  emiRate: number
  emiTenure: number
  emergency: number
  // Simulation
  simYears: number
  nSims: number
  applyTax: boolean
  holidays: boolean
  regime: 'new' | 'old'
  // Goals
  goals: GoalIn[]
}

export const DEFAULT_INPUTS: SimInputs = {
  savings: 500000,
  income: 100000,
  expenses: 40000,
  age: 28,
  risk: 'Moderate',
  holdings: [
    { asset_class: 'Indian Equity', current_value: 300000, purchase_price: 240000, monthly_sip: 10000 },
    { asset_class: 'Gold',          current_value: 100000, purchase_price: 80000,  monthly_sip: 2000  },
    { asset_class: 'Debt/Bonds',    current_value: 100000, purchase_price: 100000, monthly_sip: 3000  },
  ],
  emiAmount: 2000000,
  emiRate: 9.0,
  emiTenure: 10,
  emergency: 6,
  simYears: 20,
  nSims: 500,
  applyTax: true,
  holidays: true,
  regime: 'new',
  goals: [
    { name: '🏠 House',       target_amount: 5000000,  target_year: 7,  priority: 'Critical' },
    { name: '🏖️ Retirement', target_amount: 30000000, target_year: 25, priority: 'Critical' },
  ],
}

const STORAGE_KEY = 'finsim:inputs:v1'

/**
 * Single source of truth for the simulation inputs.
 *
 * State is lifted here so the tabbed setup dashboard and the results-page
 * quick-edit drawer both read and write the same values. Backed by
 * localStorage so a page refresh restores whatever the user last entered.
 */
export function useSimInputs() {
  const [inputs, setInputs] = useState<SimInputs>(DEFAULT_INPUTS)
  const hydrated = useRef(false)

  // Restore from localStorage once, on the client, after first paint.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setInputs({ ...DEFAULT_INPUTS, ...JSON.parse(raw) })
    } catch {
      /* corrupt/unavailable storage — fall back to defaults */
    }
    hydrated.current = true
  }, [])

  // Persist on every change (but not before we've hydrated, or we'd clobber
  // stored values with defaults on the very first render).
  useEffect(() => {
    if (!hydrated.current) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs))
    } catch {
      /* storage full/blocked — non-fatal */
    }
  }, [inputs])

  // Patch one or more top-level fields.
  const update = useCallback(<K extends keyof SimInputs>(patch: Pick<SimInputs, K> | Partial<SimInputs>) => {
    setInputs(prev => ({ ...prev, ...patch }))
  }, [])

  // ── Holdings helpers ────────────────────────────────────────────────────────
  const addHolding = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      holdings: [
        ...prev.holdings,
        { asset_class: 'Indian Equity', current_value: 100000, purchase_price: 80000, monthly_sip: 5000 },
      ],
    }))
  }, [])

  const removeHolding = useCallback((i: number) => {
    setInputs(prev => ({ ...prev, holdings: prev.holdings.filter((_, j) => j !== i) }))
  }, [])

  const updateHolding = useCallback((i: number, key: keyof PortfolioHoldingIn, value: string | number) => {
    setInputs(prev => ({
      ...prev,
      holdings: prev.holdings.map((h, j) => (j === i ? { ...h, [key]: value } : h)),
    }))
  }, [])

  // ── Goals helpers ───────────────────────────────────────────────────────────
  const addGoal = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      goals: [...prev.goals, { name: 'New Goal', target_amount: 1000000, target_year: 10, priority: 'Important' }],
    }))
  }, [])

  const removeGoal = useCallback((i: number) => {
    setInputs(prev => ({ ...prev, goals: prev.goals.filter((_, j) => j !== i) }))
  }, [])

  const updateGoal = useCallback((i: number, key: keyof GoalIn, value: string | number) => {
    setInputs(prev => ({
      ...prev,
      goals: prev.goals.map((g, j) => (j === i ? { ...g, [key]: value } : g)),
    }))
  }, [])

  const reset = useCallback(() => setInputs(DEFAULT_INPUTS), [])

  // Assemble the API request payload from the current inputs.
  const buildRequest = useCallback((): SimulationRequest => ({
    savings: inputs.savings,
    income: inputs.income,
    expenses: inputs.expenses,
    age: inputs.age,
    risk_tolerance: inputs.risk,
    portfolio_holdings: inputs.holdings,
    emi_loan_amount: inputs.emiAmount,
    emi_rate: inputs.emiRate,
    emi_tenure_years: inputs.emiTenure,
    emergency_months: inputs.emergency,
    sim_years: inputs.simYears,
    apply_tax: inputs.applyTax,
    n_sims: inputs.nSims,
    withdrawal_rate: 0.04,
    risk_free_rate: 0.065,
    savings_yield: 0.05,
    emergency_yield: 0.065,
    include_holidays: inputs.holidays,
    holiday_spike_pct: 0.15,
    holiday_months: [1, 3, 8, 9, 10, 11, 12],
    goals: inputs.goals,
    tax_cfg: { ...DEFAULT_TAX, regime: inputs.regime },
  }), [inputs])

  return {
    inputs,
    update,
    addHolding, removeHolding, updateHolding,
    addGoal, removeGoal, updateGoal,
    reset,
    buildRequest,
  }
}

export type SimInputsApi = ReturnType<typeof useSimInputs>
