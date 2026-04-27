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

export async function fetchMetaAssets() {
  const res = await fetch(`${BASE}/meta/asset-classes`)
  return res.json()
}

/**
 * Now accepts SimulationResponse directly — no re-simulation on backend.
 * Returns the full structured report payload (charts + narrative + table).
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
 * Calls /generate-report/pdf — triggers browser download of self-contained HTML file.
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
  a.href     = url
  a.download = 'finsim-report.html'
  a.click()
  URL.revokeObjectURL(url)
}