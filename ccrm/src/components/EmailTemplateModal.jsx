import React, { useState, useEffect } from 'react'
import { Mail, Loader, AlertCircle } from 'lucide-react'
import { Modal } from './ui'

export default function EmailTemplateModal({ isOpen, onClose, app, lead, onSendSuccess }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [amount, setAmount] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchTemplates()
    }
  }, [isOpen])

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/email-templates', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setTemplates(data)
      setLoading(false)
    } catch (err) {
      setError('Failed to load templates')
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!selectedTemplate) {
      setError('Please select a template')
      return
    }

    // For applications: use app_id directly
    let appId = app?.id
    let email = app?.email

    // For leads: check if they have an associated application
    if (lead && !app) {
      if (!lead.appId) {
        setError('❌ This lead has no application yet. Please create an application first, then send the email.')
        return
      }
      appId = lead.appId
      email = lead.email
    }

    if (!appId) {
      setError('Application ID is required')
      return
    }

    if (!email) {
      setError('Email address not found')
      return
    }

    setSending(true)
    setError('')

    try {
      const token = localStorage.getItem('ccrm_token')
      const payload = {
        app_id: appId,
        template_type: selectedTemplate.template_type,
        amount: amount || 0,
        customMessage: customMessage || ''
      }

      const res = await fetch('/api/send-template-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send email')
        return
      }

      onSendSuccess && onSendSuccess(data)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className="p-6 max-w-2xl">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Mail size={24} className="text-indigo-600" />
          Send Email {app?.name || lead?.name ? `to ${app?.name || lead?.name}` : ''}
        </h2>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader size={32} className="animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Template Selection Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Select Email Template *
              </label>
              <select
                value={selectedTemplate?.id || ''}
                onChange={(e) => {
                  const tpl = templates.find(t => t.id === parseInt(e.target.value))
                  if (tpl) {
                    setSelectedTemplate(tpl)
                    setAmount('')
                    setCustomMessage('')
                  }
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              >
                <option value="">-- Choose a template --</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} — {tpl.description}
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate && (
              <>
                {/* Template Details */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">
                    <strong>Subject:</strong> {selectedTemplate.subject}
                  </p>
                </div>

                {/* Amount Field (for payment templates) */}
                {['application_fee', 'registration_fee', 'tuition_fee', 'other_fee'].includes(
                  selectedTemplate.template_type
                ) && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Amount (₹) *
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g., 1000"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                )}

                {/* Custom Message */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Custom Message (Optional)
                  </label>
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Add any additional message..."
                    rows="3"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSend}
                disabled={!selectedTemplate || sending}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
              >
                {sending ? <Loader size={18} className="animate-spin" /> : <Mail size={18} />}
                {sending ? 'Sending...' : 'Send Email'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
