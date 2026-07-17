import { SimulationRequest, SimulationResponse } from '@/types/api'

const BASE = '/api/backend'

export async function runSimulation(req: SimulationRequest): Promise<SimulationResponse> {
  const res = await fetch(`${BASE}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export interface AssetMeta {
  default_cagr: number
  default_vol: number
  ticker: string | null
}

/** Default market assumptions (CAGR/vol/ticker) per supported asset class. */
export async function fetchMetaAssets(): Promise<Record<string, AssetMeta>> {
  const res = await fetch(`${BASE}/meta/asset-classes`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export interface ScenarioMeta {
  label: string
  description: string
}

/** Available stress-test scenarios, keyed by scenario_key (backend source of truth). */
export async function fetchStressScenarios(): Promise<Record<string, ScenarioMeta>> {
  const res = await fetch(`${BASE}/stress-test/scenarios`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Accepts SimulationResponse directly — no re-simulation on backend.
 * Returns structured report payload: narrative, chart data, yearly table, meta.
 */
export async function generateAIReport(sim: SimulationResponse): Promise<any> {
  const res = await fetch(`${BASE}/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sim),
  })
  if (!res.ok) throw new Error('Failed to generate AI report')
  return res.json()
}

/**
 * Triggers browser download of self-contained HTML report with Matplotlib charts.
 */
export async function downloadPDFReport(sim: SimulationResponse): Promise<void> {
  const res = await fetch(`${BASE}/generate-report/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sim),
  })
  if (!res.ok) throw new Error('Failed to generate PDF report')
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'finsim-report.html'; a.click()
  URL.revokeObjectURL(url)
}

/**
 * Run a single stress test scenario against the original simulation request.
 */
export async function runStressTest(
  req: SimulationRequest,
  scenarioKey: string,
  shockYear: number,
): Promise<any> {
  const res = await fetch(`${BASE}/stress-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      simulation:   req,
      scenario_key: scenarioKey,
      shock_year:   shockYear,
      run_all:      false,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail ?? `Stress test failed: HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Run all 5 built-in scenarios and return comparative summary.
 */
export async function runAllStressTests(
  req: SimulationRequest,
  shockYear: number,
): Promise<any> {
  const res = await fetch(`${BASE}/stress-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      simulation:   req,
      scenario_key: 'market_crash_2008',
      shock_year:   shockYear,
      run_all:      true,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail ?? `Stress test failed: HTTP ${res.status}`)
  }
  return res.json()
}