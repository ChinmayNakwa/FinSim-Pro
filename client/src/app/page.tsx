// 'use client'
'use client'

import React, { useState } from 'react'
import { Sparkles, LayoutDashboard, Zap } from 'lucide-react'

import SidebarForm from '@/components/SidebarForm'
import NetWorthChart from '@/components/NetWorthChart'
import PortfolioTab from '@/components/PortfolioTab'
import TaxTab from '@/components/TaxTab'
import GoalsTab from '@/components/GoalsTab'
import RebalanceTab from '@/components/RebalanceTab'
import YearlyTable from '@/components/YearlyTable'
import AIReportTab from '@/components/AIReportTab'
import StressTestTab from '@/components/StressTestTab'
import ErrorBanner from '@/components/ErrorBanner'
import { EmptyState, LoadingState } from '@/components/States'
import { Tabs } from '@/components/ui'

import { runSimulation, generateAIReport, downloadPDFReport } from '@/lib/api'
import { SimulationRequest, SimulationResponse } from '@/types/api'

const TABS = [
  '📈 Net Worth', '💼 Portfolio', '🧾 Tax',
  '🎯 Goals', '⚖️ Rebalance', '📋 Year-by-Year', '🪄 AI Analysis', '⚡ Stress Test',
]

export interface AIReportPayload {
  narrative: string
  charts: {
    net_worth: any
    tax: any
    portfolio: any
    rebalance: any
  }
  yearly_table: any[]
  meta: {
    fire_number: number
    years_to_fire: number | null
    blended_cagr: number
    blended_vol: number
    emi_monthly: number
  }
}

export default function Home() {
  const [result, setResult]             = useState<SimulationResponse | null>(null)
  const [lastRequest, setLastRequest]   = useState<SimulationRequest | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [activeTab, setActiveTab]       = useState(0)

  const [aiReport, setAiReport]                 = useState<AIReportPayload | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [downloadingPDF, setDownloadingPDF]     = useState(false)

  const [baselineResult, setBaselineResult]   = useState<SimulationResponse | null>(null)
  const [baselineRequest, setBaselineRequest] = useState<SimulationRequest | null>(null)

  const handleSubmit = async (req: SimulationRequest) => {
    setError(null); setLoading(true); setAiReport(null); setLastRequest(req)
    try {
      const data = await runSimulation(req)
      setResult(data); setActiveTab(0)
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Simulation failed.')
    } finally { setLoading(false) }
  }

  const handleGenerateAIReport = async () => {
    if (!result) return
    setGeneratingReport(true); setError(null)
    try {
      const data = await generateAIReport(result)  // now passes SimulationResponse
      setAiReport(data); setActiveTab(6)
    } catch {
      setError('AI Report generation failed. Please try again.')
    } finally { setGeneratingReport(false) }
  }

  const handleDownloadPDF = async () => {
    if (!result) return
    setDownloadingPDF(true)
    try { await downloadPDFReport(result) }
    catch { setError('PDF download failed.') }
    finally { setDownloadingPDF(false) }
  }

  const handleSetBaseline = () => {
    if (!result || !lastRequest) return
    setBaselineResult(result); setBaselineRequest(lastRequest)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <SidebarForm onSubmit={handleSubmit} loading={loading} />
      <main className="flex-1 overflow-y-auto relative">

        {/* Top Nav */}
        <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur-sm border-b border-border px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-green/10 p-2 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-green" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-text leading-none">FinSim Pro</h1>
              <p className="text-[11px] text-muted font-mono mt-1 uppercase tracking-wider">
                Monte Carlo Simulation Engine v2.0
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {result && (
              <button
                onClick={handleGenerateAIReport}
                disabled={generatingReport}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all shadow-lg shadow-purple-900/20 ${
                  generatingReport
                    ? 'bg-purple-900/50 text-purple-300 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-500 text-white active:scale-95'
                }`}
              >
                {generatingReport
                  ? <><Zap className="w-4 h-4 animate-pulse" /><span>Analyzing...</span></>
                  : <><Sparkles className="w-4 h-4" /><span>Generate AI Report</span></>}
              </button>
            )}
            <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-mono text-muted hover:text-green border border-border px-3 py-1.5 rounded-md transition-colors">
              API DOCS ↗
            </a>
          </div>
        </div>

        <div className="p-8 max-w-7xl mx-auto space-y-6">
          {error   && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {loading && <LoadingState nSims={lastRequest?.n_sims || 500} />}
          {!loading && !result && !error && <EmptyState />}

          {!loading && result && (
            <div className="stagger">
              <div className="flex items-center justify-between mb-6">
                <div className="bg-card/50 border border-border rounded-2xl p-1 inline-flex">
                  <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
                </div>
                <button onClick={handleSetBaseline}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-all">
                  <LayoutDashboard className="w-4 h-4" />
                  <span>{baselineResult ? 'Update Baseline' : 'Set Baseline'}</span>
                </button>
              </div>

              <div className="min-h-[600px]">
                <div className={activeTab === 0 ? 'block' : 'hidden'}>
                  <NetWorthChart data={result} currentRequest={lastRequest}
                    baseline={baselineResult} baselineRequest={baselineRequest} />
                </div>
                <div className={activeTab === 1 ? 'block' : 'hidden'}><PortfolioTab data={result} lastRequest={lastRequest} /></div>
                <div className={activeTab === 2 ? 'block' : 'hidden'}><TaxTab data={result} lastRequest={lastRequest} /></div>
                <div className={activeTab === 3 ? 'block' : 'hidden'}><GoalsTab data={result} /></div>
                <div className={activeTab === 4 ? 'block' : 'hidden'}><RebalanceTab data={result} /></div>
                <div className={activeTab === 5 ? 'block' : 'hidden'}><YearlyTable data={result} /></div>
                <div className={activeTab === 6 ? 'block' : 'hidden'}>
                  <AIReportTab
                    report={aiReport}
                    generating={generatingReport}
                    onGenerate={handleGenerateAIReport}
                    onDownloadPDF={handleDownloadPDF}
                    downloadingPDF={downloadingPDF}
                  />
                </div>
                <div className={activeTab === 7 ? 'block' : 'hidden'}><StressTestTab lastRequest={lastRequest} /></div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}




