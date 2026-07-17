export interface GoalIn {
  name: string
  target_amount: number
  target_year: number
  priority: 'Critical' | 'Important' | 'Nice-to-have'
}

export interface PortfolioHoldingIn {
  asset_class: string
  current_value: number
  purchase_price: number
  monthly_sip: number
  purchase_date?: string
  ticker?: string
}

export interface TaxConfigIn {
  regime: 'new' | 'old'
  ltcg_rate: number
  stcg_rate: number
  stcg_rebalance_fraction: number
  section_80d: number
  hra_exemption: number
  home_loan_interest: number
  ltcg_exempt_limit: number
  gold_ltcg_rate: number
  gold_stcg_rate: number
  re_ltcg_rate: number
  re_stcg_rate: number
  debt_ltcg_rate: number
  debt_stcg_rate: number
}

export interface SimulationRequest {
  savings: number
  income: number
  expenses: number
  age: number
  risk_tolerance: 'Conservative' | 'Moderate' | 'Aggressive'
  portfolio_holdings: PortfolioHoldingIn[]
  emi_loan_amount: number
  emi_rate: number
  emi_tenure_years: number
  emergency_months: number
  sim_years: number
  apply_tax: boolean
  n_sims: number
  withdrawal_rate: number
  risk_free_rate: number
  savings_yield: number
  emergency_yield: number
  include_holidays: boolean
  holiday_spike_pct: number
  holiday_months: number[]
  goals: GoalIn[]
  tax_cfg: TaxConfigIn
}

export interface TaxSnapshotResponse {
  annual_income: number
  taxable_income: number
  base_tax: number
  surcharge: number
  cess: number
  total_tax: number
  effective_rate: number
  regime: string
}

export interface AssetForecastItem {
  asset_class: string
  cagr: number
  vol: number
  weight: number
  data_source: string
}

export interface GoalResult {
  name: string
  target_amount: number
  target_year: number
  priority: string
  projected_nw_at_goal: number
  percent_funded: number
  /** Probability (0–100) the goal is fully funded across Monte Carlo paths. */
  prob_funded_pct: number
  on_track: boolean
}

export interface RebalanceSuggestion {
  asset_class: string
  action: 'BUY' | 'SELL'
  amount: number
  current_pct: number
  target_pct: number
  drift: number
}

export interface RebalanceResult {
  needed: boolean
  total_drift: number
  suggestions: RebalanceSuggestion[]
  current_allocation: Record<string, number>
  target_allocation: Record<string, number>
}

export interface YearlyRow {
  year: number
  age: number
  net_worth_median: number
  net_worth_p10: number
  net_worth_p90: number
  annual_income: number
  annual_expenses: number
  est_income_tax: number
  fire_progress_pct: number
  goals_due: string[]
}

export interface SimulationResponse {
  median_net_worth_final: number
  p10_net_worth_final: number
  p90_net_worth_final: number
  prob_positive_pct: number
  prob_crore_pct: number
  max_drawdown: number
  sharpe_ratio: number
  fire_number: number
  fire_prob_pct: number
  years_to_fire: number | null
  blended_cagr: number
  blended_vol: number
  emi_monthly: number
  tax_snapshot: TaxSnapshotResponse
  total_income_tax_avg: number
  total_ltcg_tax_avg: number
  total_stcg_tax_avg: number
  avg_effective_rate_pct: number
  years_axis: number[]
  p10_path: number[]
  p25_path: number[]
  p50_path: number[]
  p75_path: number[]
  p90_path: number[]
  annual_income_tax: number[]
  annual_ltcg_tax: number[]
  annual_stcg_tax: number[]
  asset_forecasts: AssetForecastItem[]
  asset_final_values: Record<string, number>
  asset_tax_summary: Array<{ asset_class: string; ltcg_tax: number; stcg_tax: number; total_tax: number }>
  goal_results: GoalResult[]
  rebalance: RebalanceResult
  yearly_table: YearlyRow[]
  regime_comparison: Array<{ component: string; new_regime: number | string; old_regime: number | string }>
}