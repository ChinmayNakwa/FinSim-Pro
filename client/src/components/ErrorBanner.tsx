'use client'
import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  message: string
  onDismiss: () => void
}

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="flex items-start gap-3 bg-red/10 border border-red/30 rounded-xl px-4 py-3">
      <AlertTriangle size={16} className="text-red shrink-0 mt-0.5" />
      <p className="text-sm font-mono text-red flex-1">{message}</p>
      <button onClick={onDismiss} className="text-red/60 hover:text-red transition-colors">
        <X size={14} />
      </button>
    </div>
  )
}