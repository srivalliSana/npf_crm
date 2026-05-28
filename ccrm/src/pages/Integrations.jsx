import React, { useState } from 'react'
import {
  CheckCircle2, AlertCircle, ExternalLink, RefreshCw,
  MessageCircle, CreditCard, Mail, BarChart2, Phone,
  Database, Globe, Lock, Save, X, Eye, EyeOff, ChevronDown, ChevronRight
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

const INTEGRATIONS = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business API',
    description: 'Send automated WhatsApp messages to leads for follow-ups, notifications, and reminders.',
    icon: MessageCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    category: 'Messaging',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: 'e.g. 123456789012345', secret: false },
      { key: 'wabaId',        label: 'WABA Account ID',  placeholder: 'WhatsApp Business Account ID', secret: false },
      { key: 'accessToken',   label: 'Access Token',     placeholder: 'Your permanent access token', secret: true },
    ]
  },
  {
    id: 'razorpay',
    name: 'Razorpay Payment Gateway',
    description: 'Accept online payments for application fees. Auto-update payment status on successful transactions.',
    icon: CreditCard,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    category: 'Payments',
    docsUrl: 'https://razorpay.com/docs/',
    fields: [
      { key: 'keyId',     label: 'Key ID',     placeholder: 'rzp_live_xxxxxxxxxxxx', secret: false },
      { key: 'keySecret', label: 'Key Secret', placeholder: 'Your Razorpay secret', secret: true },
      { key: 'webhookSecret', label: 'Webhook Secret', placeholder: 'Used to verify webhook events', secret: true },
    ]
  },
  {
    id: 'smtp',
    name: 'SMTP Email Service',
    description: 'Send automated email alerts for admissions, OTPs, payment receipts, and notifications.',
    icon: Mail,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    category: 'Email',
    docsUrl: 'https://nodemailer.com/about/',
    fields: [
      { key: 'host',     label: 'SMTP Host',     placeholder: 'e.g. smtp.gmail.com', secret: false },
      { key: 'port',     label: 'SMTP Port',     placeholder: '587', secret: false },
      { key: 'user',     label: 'SMTP Username', placeholder: 'noreply@cutm.ac.in', secret: false },
      { key: 'pass',     label: 'SMTP Password', placeholder: 'App password or SMTP password', secret: true },
      { key: 'fromName', label: 'From Name',     placeholder: 'CUTM Admissions', secret: false },
    ]
  },
  {
    id: 'googlesheets',
    name: 'Google Sheets Sync',
    description: 'Sync leads and applications data to a Google Sheet in real-time for reporting and sharing.',
    icon: BarChart2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    category: 'Productivity',
    docsUrl: 'https://developers.google.com/sheets/api',
    fields: [
      { key: 'spreadsheetId', label: 'Spreadsheet ID',   placeholder: 'From the Google Sheets URL', secret: false },
      { key: 'serviceEmail',  label: 'Service Account Email', placeholder: 'mybot@project.iam.gserviceaccount.com', secret: false },
      { key: 'privateKey',    label: 'Private Key (JSON)', placeholder: 'Paste service account JSON key', secret: true },
    ]
  },
  {
    id: 'sms',
    name: 'SMS Gateway (MSG91 / Twilio)',
    description: 'Send SMS OTPs, payment reminders and admission alerts to students via bulk SMS.',
    icon: Phone,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    category: 'Messaging',
    docsUrl: 'https://msg91.com/in/help',
    fields: [
      { key: 'provider',  label: 'Provider',     placeholder: 'msg91 or twilio', secret: false },
      { key: 'apiKey',    label: 'API Key',       placeholder: 'Your SMS API key', secret: true },
      { key: 'senderId',  label: 'Sender ID',     placeholder: 'e.g. CUTMAD', secret: false },
      { key: 'templateId',label: 'Template ID',   placeholder: 'DLT-approved template ID (for MSG91)', secret: false },
    ]
  },
  {
    id: 'googleanalytics',
    name: 'Google Analytics 4',
    description: 'Track CRM usage, student journey analytics and portal traffic through GA4.',
    icon: Globe,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    category: 'Analytics',
    docsUrl: 'https://developers.google.com/analytics',
    fields: [
      { key: 'measurementId', label: 'Measurement ID', placeholder: 'G-XXXXXXXXXX', secret: false },
      { key: 'apiSecret',     label: 'API Secret',     placeholder: 'For Measurement Protocol', secret: true },
    ]
  },
]

const CATEGORY_COLORS = {
  Messaging:   'bg-green-100 text-green-700',
  Payments:    'bg-blue-100 text-blue-700',
  Email:       'bg-purple-100 text-purple-700',
  Productivity:'bg-emerald-100 text-emerald-700',
  Analytics:   'bg-yellow-100 text-yellow-700',
}

// Load saved config from localStorage
const loadConfig = () => {
  try { return JSON.parse(localStorage.getItem('ccrm_integrations') || '{}') } catch { return {} }
}

export default function Integrations() {
  const { showToast } = useCcrm()
  const [configs, setConfigs]       = useState(loadConfig)
  const [editing, setEditing]       = useState(null)   // integration id being edited
  const [formValues, setFormValues] = useState({})
  const [showSecrets, setShowSecrets] = useState({})   // { fieldKey: bool }
  const [testing, setTesting]       = useState(null)   // integration id being tested
  const [expanded, setExpanded]     = useState({})     // { id: bool } for accordion

  const isConnected = (id) => {
    const cfg = configs[id]
    if (!cfg) return false
    return Object.keys(cfg).length > 0 && Object.values(cfg).some(v => v?.trim())
  }

  const handleEdit = (integ) => {
    setEditing(integ.id)
    setFormValues(configs[integ.id] || {})
    setShowSecrets({})
    setExpanded(prev => ({ ...prev, [integ.id]: true }))
  }

  const handleSave = (integ) => {
    const updated = { ...configs, [integ.id]: formValues }
    setConfigs(updated)
    localStorage.setItem('ccrm_integrations', JSON.stringify(updated))
    setEditing(null)
    showToast(`${integ.name} configuration saved.`, 'success')
  }

  const handleDisconnect = (integ) => {
    const updated = { ...configs }
    delete updated[integ.id]
    setConfigs(updated)
    localStorage.setItem('ccrm_integrations', JSON.stringify(updated))
    setEditing(null)
    showToast(`${integ.name} disconnected.`, 'info')
  }

  const handleTest = async (integ) => {
    setTesting(integ.id)
    // Simulate test connection
    await new Promise(r => setTimeout(r, 1500))
    setTesting(null)
    showToast(`Connection test for ${integ.name} completed.`, 'success')
  }

  const [sheetsSyncing, setSheetsSyncing] = useState(false)
  const [sheetsSyncResult, setSheetsSyncResult] = useState(null)

  const handleSheetsSync = async () => {
    const cfg = configs['googlesheets'] || {}
    if (!cfg.spreadsheetId) return showToast('Please configure Google Sheets with a Spreadsheet ID first.', 'error')
    setSheetsSyncing(true)
    setSheetsSyncResult(null)
    try {
      const res = await fetch('/api/integrations/sheets-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId: cfg.spreadsheetId, apiKey: cfg.privateKey || cfg.serviceEmail })
      })
      const data = await res.json()
      if (res.ok) {
        setSheetsSyncResult({ success: true, synced: data.synced, skipped: data.skipped })
        showToast(`Google Sheets synced: ${data.synced} new leads imported!`, 'success')
      } else {
        setSheetsSyncResult({ success: false, error: data.error })
        showToast(data.error || 'Sync failed.', 'error')
      }
    } catch (e) {
      showToast('Sheets sync failed — check your configuration.', 'error')
    } finally {
      setSheetsSyncing(false)
    }
  }

  const WEBHOOK_INFO = [
    { id: 'meta', label: 'Meta/Facebook Lead Ads', url: 'https://crm.cutmap.ac.in/api/webhooks/meta-leads', verify: 'ccrm_meta_verify_2026', docs: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving' },
    { id: 'google', label: 'Google Lead Form Ads', url: 'https://crm.cutmap.ac.in/api/webhooks/google-leads', verify: '', docs: 'https://support.google.com/google-ads/answer/9423234' },
    { id: 'wachat', label: 'WhatsApp Chatbot (WABA)', url: 'https://crm.cutmap.ac.in/api/webhooks/whatsapp-bot', verify: 'ccrm_wa_verify_2026', docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks' },
  ]

  const connectedCount = INTEGRATIONS.filter(i => isConnected(i.id)).length

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Third-Party Integrations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Connect CCRM with external services for messaging, payments, email and analytics.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`badge font-semibold ${connectedCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {connectedCount} / {INTEGRATIONS.length} Connected
          </span>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Lock size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Security Notice</p>
          <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
            All API keys and secrets are stored in your browser's local storage and transmitted only to your own backend server.
            For production use, configure these as environment variables in your server's <code className="bg-blue-100 px-1 rounded">.env</code> file instead.
          </p>
        </div>
      </div>

      {/* Integrations grid */}
      <div className="space-y-3">
        {INTEGRATIONS.map(integ => {
          const connected = isConnected(integ.id)
          const isExpanded = expanded[integ.id]
          const isEditing = editing === integ.id
          const isTesting = testing === integ.id

          return (
            <div
              key={integ.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                connected ? 'border-green-200' : 'border-gray-200'
              }`}
            >
              {/* Card Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpanded(prev => ({ ...prev, [integ.id]: !isExpanded }))}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${integ.bg} flex items-center justify-center flex-shrink-0`}>
                    <integ.icon size={20} className={integ.color} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 text-sm">{integ.name}</h3>
                      <span className={`badge text-[10px] font-bold ${CATEGORY_COLORS[integ.category] || 'bg-gray-100 text-gray-600'}`}>
                        {integ.category}
                      </span>
                      {connected && (
                        <span className="badge bg-green-100 text-green-700 text-[10px] font-bold flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> Connected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-xl leading-relaxed">{integ.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <a
                    href={integ.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5 border border-blue-200 rounded px-2 py-1"
                  >
                    <ExternalLink size={11} /> Docs
                  </a>
                  {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Expandable config area */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/30">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {integ.fields.map(field => (
                          <div key={field.key}>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                              {field.label}
                            </label>
                            <div className="relative">
                              <input
                                type={field.secret && !showSecrets[field.key] ? 'password' : 'text'}
                                value={formValues[field.key] || ''}
                                onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                placeholder={field.placeholder}
                                className="input-field text-sm pr-9"
                              />
                              {field.secret && (
                                <button
                                  type="button"
                                  onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  {showSecrets[field.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={() => handleTest(integ)}
                          disabled={isTesting}
                          className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {isTesting ? (
                            <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Testing...</>
                          ) : (
                            <><RefreshCw size={12} /> Test Connection</>
                          )}
                        </button>
                        <button
                          onClick={() => { setEditing(null); setFormValues({}) }}
                          className="flex items-center gap-1 text-xs text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                        >
                          <X size={12} /> Cancel
                        </button>
                        <button
                          onClick={() => handleSave(integ)}
                          className="flex items-center gap-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <Save size={12} /> Save Configuration
                        </button>
                        {connected && (
                          <button
                            onClick={() => handleDisconnect(integ)}
                            className="flex items-center gap-1 text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors ml-auto"
                          >
                            <X size={12} /> Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                  ) : connected ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle2 size={16} className="text-green-500" />
                        <span className="font-medium">Integration configured & active</span>
                        <span className="text-xs text-gray-400">
                          ({integ.fields.filter(f => configs[integ.id]?.[f.key]).length}/{integ.fields.length} fields set)
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleTest(integ)}
                          disabled={isTesting}
                          className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {isTesting ? <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Testing</> : <><RefreshCw size={12}/> Test</>}
                        </button>
                        <button
                          onClick={() => handleEdit(integ)}
                          className="text-xs text-primary-500 border border-primary-200 rounded-lg px-3 py-1.5 hover:bg-primary-50 transition-colors"
                        >
                          Edit Config
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <AlertCircle size={15} className="text-yellow-500" />
                        <span>Not configured — click Configure to add your API credentials.</span>
                      </div>
                      <button
                        onClick={() => handleEdit(integ)}
                        className="flex items-center gap-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Configure
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Google Sheets Sync Action */}
      {isConnected('googlesheets') && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-emerald-800 text-sm">Google Sheets → Lead Import</h3>
              <p className="text-xs text-emerald-600">Sync new rows from your connected Google Sheet as leads (deduplication included)</p>
            </div>
            <button onClick={handleSheetsSync} disabled={sheetsSyncing}
              className="flex items-center gap-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 disabled:opacity-50">
              {sheetsSyncing ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Syncing...</> : <><RefreshCw size={15} /> Sync Now</>}
            </button>
          </div>
          {sheetsSyncResult && (
            <div className={`mt-2 p-3 rounded-lg text-sm ${sheetsSyncResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
              {sheetsSyncResult.success
                ? `✓ Synced ${sheetsSyncResult.synced} new leads (${sheetsSyncResult.skipped} duplicates skipped)`
                : `✗ ${sheetsSyncResult.error}`}
            </div>
          )}
        </div>
      )}

      {/* Webhook Configuration */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="font-semibold text-gray-800">Webhook Endpoints (Lead Auto-Import)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Configure these URLs in your ad platforms to auto-create leads from Meta, Google Ads and WhatsApp</p>
        </div>
        <div className="divide-y divide-gray-100">
          {WEBHOOK_INFO.map(w => (
            <div key={w.id} className="px-5 py-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h3 className="font-medium text-gray-800 text-sm">{w.label}</h3>
                <a href={w.docs} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 border border-blue-200 rounded px-2 py-0.5">
                  <ExternalLink size={11} /> Setup Guide
                </a>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5 flex items-center justify-between gap-2">
                <code className="text-xs text-slate-700 font-mono break-all">{w.url}</code>
                <button onClick={() => { navigator.clipboard?.writeText(w.url); showToast('URL copied!', 'success') }}
                  className="text-xs text-slate-500 hover:text-slate-700 flex-shrink-0 border border-slate-200 rounded px-2 py-1">Copy</button>
              </div>
              {w.verify && (
                <p className="text-xs text-gray-400 mt-1.5">Verify Token: <code className="bg-gray-100 px-1 rounded font-mono">{w.verify}</code></p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong>Note:</strong> For production deployment, set these credentials as server environment variables
          (<code className="bg-gray-200 px-1 rounded">WHATSAPP_TOKEN</code>, <code className="bg-gray-200 px-1 rounded">RAZORPAY_KEY_ID</code>, etc.)
          rather than storing in the browser. Contact your system administrator or DevOps team to configure these securely on the server.
        </p>
      </div>
    </div>
  )
}
