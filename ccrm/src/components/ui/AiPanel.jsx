import React from 'react'
import { Sparkles, Loader } from 'lucide-react'

// The purple "AI Assistant" shell used in the Lead Detail Workspace's right
// column. Presentational only — callers own all data-fetching and pass
// finished content in via `AiPanel.Section`.
export default function AiPanel({ title = 'AI Assistant', subtitle, loading, children, className = '' }) {
  return (
    <div className={`card p-0 overflow-hidden border-ai-200 ${className}`}>
      <div className="bg-ai-50 border-b border-ai-100 px-4 py-3.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-ai-600 text-white flex items-center justify-center flex-shrink-0">
          <Sparkles size={15} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ai-700 leading-tight">{title}</div>
          {subtitle && <div className="text-[11px] text-ai-600/80 truncate">{subtitle}</div>}
        </div>
        {loading && <Loader size={14} className="animate-spin text-ai-500 ml-auto flex-shrink-0" />}
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  )
}

AiPanel.Section = function AiPanelSection({ label, children, className = '' }) {
  return (
    <div className={`pb-4 border-b border-gray-100 last:border-b-0 last:pb-0 ${className}`}>
      {label && <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">{label}</div>}
      {children}
    </div>
  )
}
