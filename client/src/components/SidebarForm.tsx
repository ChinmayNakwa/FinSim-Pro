'use client'

import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button, Divider } from '@/components/ui'
import {
  ProfileSection, HoldingsSection, EmiSection, GoalsSection, SimSection,
} from '@/components/form/FormSections'
import { SimInputsApi } from '@/hooks/useSimInputs'

interface Props {
  api: SimInputsApi
  open: boolean
  onClose: () => void
  onRun: () => void
  loading: boolean
}

/**
 * Quick-edit drawer shown over the results view. Slides in from the left,
 * reuses the same form sections as the setup dashboard, and re-runs the
 * simulation in place.
 */
export default function SidebarForm({ api, open, onClose, onRun, loading }: Props) {
  // Close on Escape while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-surface border-r border-border flex flex-col shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-label="Edit simulation inputs"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center gap-2">
            <span className="text-green font-mono font-bold text-lg">FS</span>
            <div>
              <p className="text-xs font-display font-bold text-text">Edit Inputs</p>
              <p className="text-[10px] text-muted font-mono">Tweak &amp; re-run</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-bg/50 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <ProfileSection api={api} />
          <Divider />
          <HoldingsSection api={api} />
          <Divider />
          <EmiSection api={api} />
          <Divider />
          <GoalsSection api={api} />
          <Divider />
          <SimSection api={api} />
        </div>

        {/* Run */}
        <div className="p-4 border-t border-border bg-surface">
          <Button onClick={onRun} loading={loading} className="w-full">
            {loading ? 'Simulating…' : 'Re-run Simulation'}
          </Button>
        </div>
      </aside>
    </>
  )
}
