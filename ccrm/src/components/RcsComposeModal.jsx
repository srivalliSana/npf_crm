import React, { useState, useEffect } from 'react'
import { Sparkles, MessageCircle, X, AlertCircle } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

// Reusable RCS compose modal — pick an approved template, fill variables,
// preview, and send to a single lead. Used in LeadManager and ApplicationDetails.
// Props: lead = { id, name, mobile }, onClose()
export default function RcsComposeModal({ lead, onClose }) {
  const { rcsTemplates, fetchRcsTemplates, sendRcsToLead, showToast } = useCcrm()
  const [templateId, setTemplateId] = useState('')
  const [vars, setVars] = useState({})
  const [sending, setSending] = useState(false)

  useEffect(() => { fetchRcsTemplates() }, [])

  const approved = (rcsTemplates || []).filter(t => (t.status || '').toUpperCase() === 'APPROVED')
  const selected = approved.find(t => t.templateId === templateId)
  const selectedVars = Array.isArray(selected?.variables) ? selected.variables : []

  const preview = (() => {
    if (!selected) return ''
    let txt = selected.preview || ''
    selectedVars.forEach((v, i) => {
      const label = typeof v === 'string' ? v : (v?.name || v?.key || `var${i + 1}`)
      const val = vars[`var${i + 1}`] || `{${label}}`
      txt = txt.split(`{${label}}`).join(val).split(`{var${i + 1}}`).join(val)
    })
    return txt
  })()

  const handleSend = async () => {
    if (!templateId) return showToast('Please select an approved template.', 'error')
    setSending(true)
    const result = await sendRcsToLead(lead.id, {
      templateId,
      rcsType: selected?.rcsType || 'BASIC',
      variables: vars
    })
    setSending(false)
    if (result?.success) onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Sparkles size={18} className="text-fuchsia-500" /> Send RCS Message
          </h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="bg-fuchsia-50 rounded-xl p-3 mb-4">
          <div className="font-semibold text-slate-800">{lead.name}</div>
          <div className="text-fuchsia-600 font-mono text-sm font-bold flex items-center gap-2">
            <MessageCircle size={14} /> {lead.mobile}
          </div>
        </div>

        {approved.length === 0 ? (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              No approved RCS templates yet. Add/approve a template in Integrations → RCS before sending.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Template</label>
              <select value={templateId} onChange={e => { setTemplateId(e.target.value); setVars({}) }} className="input-field text-sm">
                <option value="">-- Select approved template --</option>
                {approved.map(t => (
                  <option key={t.templateId} value={t.templateId}>{t.name || t.templateId} ({t.rcsType})</option>
                ))}
              </select>
            </div>

            {selectedVars.map((v, i) => {
              const label = typeof v === 'string' ? v : (v?.name || v?.key || `Variable ${i + 1}`)
              const key = `var${i + 1}`
              return (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">{label}</label>
                  <input
                    type="text"
                    value={vars[key] || ''}
                    onChange={e => setVars(prev => ({ ...prev, [key]: e.target.value }))}
                    className="input-field text-sm"
                    placeholder={`Enter ${label}`}
                  />
                </div>
              )
            })}

            {selected?.preview && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Preview</label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                  {preview}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm py-2">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || !templateId || approved.length === 0}
            className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Sparkles size={15} /> {sending ? 'Sending...' : 'Send RCS'}
          </button>
        </div>
      </div>
    </div>
  )
}
