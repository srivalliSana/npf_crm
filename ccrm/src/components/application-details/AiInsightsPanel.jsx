import React from 'react'
import { AiPanel, Badge } from '../ui'

const SEVERITY_VARIANT = { critical: 'danger', warning: 'warning', info: 'info', success: 'success' }

// Presentational — the fetch (keyed by appId, fail-soft) lives in
// ApplicationDetails.jsx via the useAiInsights hook below, so the same data
// can also drive the KPI row's Admission Health / Days Since Last Activity
// tiles without a second network call.
export default function AiInsightsPanel({ appId, data, loading, error, onApplySuggestedDiscount }) {
  if (!appId) {
    return (
      <AiPanel title="AI Assistant" subtitle="Live signal from this record">
        <AiPanel.Section>
          <p className="text-xs text-gray-500">Insights become available once an application exists for this lead.</p>
        </AiPanel.Section>
      </AiPanel>
    )
  }

  return (
    <AiPanel title="AI Assistant" subtitle="Live signal from this record" loading={loading}>
      {error && (
        <AiPanel.Section>
          <p className="text-xs text-danger-600">{error}</p>
        </AiPanel.Section>
      )}

      {data && (
        <>
          <AiPanel.Section label="Admission Health">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-xl font-extrabold text-gray-900 font-mono">{data.admissionHealth.score}</span>
              <span className="text-[11px] text-gray-400">/ 100</span>
              <Badge variant={data.admissionHealth.tone} className="ml-auto">{data.admissionHealth.band}</Badge>
            </div>
            {data.admissionHealth.drivers?.length > 0 && (
              <ul className="text-[11px] text-gray-500 space-y-0.5 list-disc list-inside">
                {data.admissionHealth.drivers.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </AiPanel.Section>

          <AiPanel.Section label="Risk Prediction">
            {data.riskPrediction.daysSince == null ? (
              <p className="text-xs text-gray-400">No activity recorded yet.</p>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{data.riskPrediction.daysSince} day{data.riskPrediction.daysSince === 1 ? '' : 's'} since last activity</span>
                <Badge variant={data.riskPrediction.tone}>{data.riskPrediction.bucket}</Badge>
              </div>
            )}
          </AiPanel.Section>

          <AiPanel.Section label="Scholarship Suggestion">
            <p className="text-xs text-gray-500 mb-2">{data.scholarshipSuggestion.rationale}</p>
            {data.scholarshipSuggestion.suggestedPercent > 0 && (
              <button
                onClick={() => onApplySuggestedDiscount?.(data.scholarshipSuggestion.suggestedPercent)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-ai-100 text-ai-700 hover:bg-ai-200 transition-colors"
              >
                Apply {data.scholarshipSuggestion.suggestedPercent}%
              </button>
            )}
          </AiPanel.Section>

          <AiPanel.Section label="Next Best Action">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-700 font-medium">{data.nextBestAction.label}</span>
              <Badge variant={SEVERITY_VARIANT[data.nextBestAction.severity] || 'neutral'}>{data.nextBestAction.severity}</Badge>
            </div>
          </AiPanel.Section>
        </>
      )}
    </AiPanel>
  )
}
