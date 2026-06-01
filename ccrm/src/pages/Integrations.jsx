import React, { useState, useEffect } from 'react'
import {
  CheckCircle2, AlertCircle, ExternalLink, RefreshCw,
  MessageCircle, CreditCard, Mail, BarChart2, Phone,
  Globe, Lock, Save, X, Eye, EyeOff, ChevronDown, ChevronRight,
  Share2, Zap, Copy, CheckCheck, Bell, Linkedin, Search, PhoneCall,
  Wallet
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

const INTEGRATIONS = [
  // ── Social Media & Ads ──────────────────────────────────────────────────────
  {
    id: 'meta',
    name: 'Facebook Lead Ads',
    description: 'Auto-import leads from Facebook & Instagram Lead Ad campaigns. Uses Graph API to fetch full lead form data when a lead submits.',
    icon: Share2,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    category: 'Social Media',
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving',
    fields: [
      { key: 'meta_page_access_token', label: 'Page Access Token', placeholder: 'EAAxxxxxxxxxxxxxxx (permanent page token)', secret: true },
      { key: 'meta_app_id',            label: 'App ID',             placeholder: 'Your Meta App ID', secret: false },
      { key: 'meta_app_secret',        label: 'App Secret',         placeholder: 'Your Meta App Secret (for webhook verification)', secret: true },
    ]
  },
  {
    id: 'googleads',
    name: 'Google Ads',
    description: 'Capture leads from Google search and display ad campaigns. Lead form extensions post directly to CCRM via webhook.',
    icon: Search,
    color: 'text-red-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    category: 'Ads',
    docsUrl: 'https://support.google.com/google-ads/answer/9423234',
    fields: [
      { key: 'googleads_developer_token', label: 'Developer Token',  placeholder: 'Your Google Ads developer token', secret: true },
      { key: 'googleads_client_id',       label: 'OAuth Client ID',  placeholder: 'From Google Cloud Console', secret: false },
      { key: 'googleads_client_secret',   label: 'Client Secret',    placeholder: 'OAuth client secret', secret: true },
      { key: 'googleads_refresh_token',   label: 'Refresh Token',    placeholder: 'Generated via OAuth flow', secret: true },
      { key: 'googleads_customer_id',     label: 'Customer ID',      placeholder: 'e.g. 123-456-7890', secret: false },
    ]
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Lead Gen',
    description: 'Import leads from LinkedIn Lead Gen Forms. Auto-sync when prospects fill out forms on your LinkedIn ad campaigns.',
    icon: Linkedin,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    category: 'Social Media',
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/lead-sync',
    fields: [
      { key: 'linkedin_client_id',     label: 'App Client ID',   placeholder: 'LinkedIn App Client ID', secret: false },
      { key: 'linkedin_client_secret', label: 'Client Secret',   placeholder: 'LinkedIn App Client Secret', secret: true },
      { key: 'linkedin_access_token',  label: 'Access Token',    placeholder: 'Generated via OAuth 2.0', secret: true },
      { key: 'linkedin_org_id',        label: 'Organization ID', placeholder: 'urn:li:organization:XXXXXXX', secret: false },
    ]
  },

  // ── Messaging ───────────────────────────────────────────────────────────────
  {
    id: 'whatsapp',
    name: 'WhatsApp Business API',
    description: 'Alert counselors on their WhatsApp when a lead is assigned. Also capture leads from WhatsApp chatbot interactions.',
    icon: MessageCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    category: 'Messaging',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    fields: [
      { key: 'whatsapp_phone_number_id', label: 'Phone Number ID',  placeholder: 'e.g. 123456789012345', secret: false },
      { key: 'whatsapp_waba_id',         label: 'WABA Account ID',  placeholder: 'WhatsApp Business Account ID', secret: false },
      { key: 'whatsapp_access_token',    label: 'Access Token',     placeholder: 'Your permanent access token', secret: true },
    ]
  },
  {
    id: 'sms',
    name: 'SMS Gateway',
    description: 'Bulk SMS for OTPs, payment reminders and alerts. Supports 7 providers — pick one in the Provider field.',
    icon: Phone,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    category: 'Messaging',
    docsUrl: 'https://msg91.com/in/help',
    fields: [
      { key: 'sms_provider',      label: 'Provider',     placeholder: 'msg91 | twilio | plivo | textlocal | gupshup | kaleyra | karix', secret: false },
      { key: 'sms_api_key',       label: 'API Key / Auth Token', placeholder: 'For Twilio: Auth Token. For others: API key', secret: true },
      { key: 'sms_api_sid',       label: 'Account SID / Auth Key', placeholder: 'For Twilio: Account SID. For Plivo: Auth ID. (Optional for MSG91)', secret: false },
      { key: 'sms_sender_id',     label: 'Sender ID',    placeholder: 'e.g. CUTMAD — 6-char DLT-approved header', secret: false },
      { key: 'sms_template_id',   label: 'DLT Template ID', placeholder: 'DLT-approved template ID (India only)', secret: false },
      { key: 'sms_from_number',   label: 'From Number',  placeholder: 'For Twilio/Plivo: +14155551234 (E.164)', secret: false },
    ]
  },
  {
    id: 'rcs',
    name: 'RCS Business Messaging',
    description: 'Send rich interactive messages (buttons, carousels, images) over RCS. Supports rcssms.in, Gupshup, Karix, Sinch, and Google RBM.',
    icon: MessageCircle,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    category: 'Messaging',
    docsUrl: 'https://web.rcssms.in/',
    fields: [
      { key: 'rcs_provider',    label: 'Provider',           placeholder: 'rcssms | gupshup | karix | sinch | google-rbm', secret: false },
      { key: 'rcs_username',    label: 'Username',           placeholder: 'rcssms.in account username (leave blank for other providers)', secret: false },
      { key: 'rcs_password',    label: 'Password',           placeholder: 'rcssms.in account password (or leave blank if using Bearer)', secret: true },
      { key: 'rcs_api_key',     label: 'API Key / Bearer Token', placeholder: 'For gupshup/karix/google-rbm OR rcssms bearer token', secret: true },
      { key: 'rcs_rcsid',       label: 'RCS Bot ID (rcsid)', placeholder: 'rcssms: assigned bot ID. For Sinch: project ID', secret: false },
      { key: 'rcs_template_id', label: 'Default Template ID',placeholder: 'Approved template ID to use (rcssms)', secret: false },
      { key: 'rcs_type',        label: 'Template Type',      placeholder: 'BASIC | RICH | RICHCASOUREL (default: BASIC)', secret: false },
      { key: 'rcs_agent_id',    label: 'Agent ID / Brand ID',placeholder: 'For Karix/Sinch/Google-RBM (not needed for rcssms)', secret: false },
      { key: 'rcs_sender_id',   label: 'Sender Brand',       placeholder: 'Brand name shown to recipient', secret: false },
    ]
  },

  // ── Payments ────────────────────────────────────────────────────────────────
  {
    id: 'razorpay',
    name: 'Razorpay',
    description: 'Accept online payments for application fees. Auto-update payment status on successful transactions.',
    icon: CreditCard,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    category: 'Payments',
    docsUrl: 'https://razorpay.com/docs/',
    fields: [
      { key: 'razorpay_key_id',         label: 'Key ID',          placeholder: 'rzp_live_xxxxxxxxxxxx', secret: false },
      { key: 'razorpay_key_secret',     label: 'Key Secret',      placeholder: 'Your Razorpay secret', secret: true },
      { key: 'razorpay_webhook_secret', label: 'Webhook Secret',  placeholder: 'Used to verify webhook events', secret: true },
    ]
  },
  {
    id: 'payu',
    name: 'PayU',
    description: 'Alternative online payment gateway for application fees. Supports UPI, net banking, credit/debit cards.',
    icon: Wallet,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    category: 'Payments',
    docsUrl: 'https://devguide.payu.in/',
    fields: [
      { key: 'payu_merchant_key',  label: 'Merchant Key',  placeholder: 'Your PayU Merchant Key', secret: false },
      { key: 'payu_merchant_salt', label: 'Merchant Salt', placeholder: 'Your PayU Salt (keep secret)', secret: true },
      { key: 'payu_env',           label: 'Environment',   placeholder: 'production or test', secret: false },
    ]
  },

  // ── Telephony ───────────────────────────────────────────────────────────────
  {
    id: 'ameyo',
    name: 'Telephony (Ameyo / Exotel)',
    description: 'Click-to-call counselors via Ameyo or Exotel. Supports both providers — detected automatically from the API URL.',
    icon: PhoneCall,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    category: 'Telephony',
    docsUrl: 'https://developer.exotel.com/api/',
    fields: [
      { key: 'ameyo_api_url',       label: 'API URL',                   placeholder: 'https://api.exotel.com  OR  https://yourorg.ameyo.com', secret: false },
      { key: 'ameyo_username',      label: 'Account SID / Username',    placeholder: 'Exotel Account SID  OR  Ameyo username', secret: false },
      { key: 'ameyo_password',      label: 'Auth Token / Password',     placeholder: 'Exotel Auth Token  OR  Ameyo password', secret: true },
      { key: 'ameyo_virtual_number',label: 'Virtual Number (Exotel)',   placeholder: 'Exotel VN e.g. 08068xxxxxx', secret: false },
      { key: 'ameyo_agent_number',  label: 'Agent Number (Exotel)',     placeholder: 'Counselor\'s mobile number e.g. 9876543210', secret: false },
      { key: 'ameyo_campaign_id',   label: 'Campaign ID (Ameyo only)',  placeholder: 'Ameyo dialer campaign ID', secret: false },
    ]
  },

  // ── Email ───────────────────────────────────────────────────────────────────
  {
    id: 'smtp',
    name: 'Gmail / SMTP Email',
    description: 'Send automated email alerts to counselors when leads are assigned, and transactional emails (OTPs, payment receipts). Use Gmail App Password or any SMTP provider.',
    icon: Mail,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    category: 'Email',
    docsUrl: 'https://support.google.com/accounts/answer/185833',
    fields: [
      { key: 'smtp_host',      label: 'SMTP Host',     placeholder: 'smtp.gmail.com', secret: false },
      { key: 'smtp_port',      label: 'SMTP Port',     placeholder: '587', secret: false },
      { key: 'smtp_user',      label: 'Gmail Address', placeholder: 'noreply@cutm.ac.in', secret: false },
      { key: 'smtp_pass',      label: 'App Password',  placeholder: 'Google App Password (16 chars)', secret: true },
      { key: 'smtp_from_name', label: 'From Name',     placeholder: 'CUTM Admissions', secret: false },
    ]
  },

  // ── Productivity ─────────────────────────────────────────────────────────────
  {
    id: 'googlesheets',
    name: 'Google Sheets Sync',
    description: 'Sync leads from a Google Sheet into CCRM. Ideal for manually collected lead data.',
    icon: BarChart2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    category: 'Productivity',
    docsUrl: 'https://developers.google.com/sheets/api',
    fields: [
      { key: 'sheets_spreadsheet_id', label: 'Spreadsheet ID',       placeholder: 'From the Google Sheets URL', secret: false },
      { key: 'sheets_service_email',  label: 'Service Account Email', placeholder: 'mybot@project.iam.gserviceaccount.com', secret: false },
      { key: 'sheets_api_key',        label: 'API Key',               placeholder: 'Google Sheets API Key', secret: true },
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
      { key: 'ga4_measurement_id', label: 'Measurement ID', placeholder: 'G-XXXXXXXXXX', secret: false },
      { key: 'ga4_api_secret',     label: 'API Secret',     placeholder: 'For Measurement Protocol', secret: true },
    ]
  },
]

const CATEGORY_COLORS = {
  'Social Media': 'bg-blue-100 text-blue-700',
  Ads:            'bg-red-100 text-red-600',
  Messaging:      'bg-green-100 text-green-700',
  Payments:       'bg-indigo-100 text-indigo-700',
  Telephony:      'bg-violet-100 text-violet-700',
  Email:          'bg-purple-100 text-purple-700',
  Productivity:   'bg-emerald-100 text-emerald-700',
  Analytics:      'bg-yellow-100 text-yellow-700',
}

const WEBHOOK_INFO = [
  {
    id: 'meta',
    label: 'Meta / Facebook & Instagram Lead Ads',
    url: 'https://crm.cutmap.ac.in/api/webhooks/meta-leads',
    verify: 'ccrm_meta_verify_2026',
    docs: 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving',
    steps: [
      'Go to Meta for Developers → Your App → Webhooks',
      'Subscribe to Page object, leadgen field',
      'Set Callback URL + Verify Token above',
      'Set Page Access Token in the Meta integration above',
    ]
  },
  {
    id: 'google',
    label: 'Google Ads Lead Forms',
    url: 'https://crm.cutmap.ac.in/api/webhooks/google-leads',
    verify: '',
    docs: 'https://support.google.com/google-ads/answer/9423234',
    steps: [
      'Open Google Ads → Lead Forms → Lead Delivery',
      'Set Webhook URL above',
      'Google will POST lead data on every form submission',
    ]
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Lead Gen Forms',
    url: 'https://crm.cutmap.ac.in/api/webhooks/linkedin-leads',
    verify: '',
    docs: 'https://learn.microsoft.com/en-us/linkedin/marketing/lead-sync',
    steps: [
      'Go to LinkedIn Campaign Manager → Account Assets → Lead Gen Forms',
      'Open your Lead Gen Form → Integrations tab',
      'Add a CRM integration → select "Other" → paste the Webhook URL above',
      'LinkedIn will POST lead data when a user submits the form',
    ]
  },
  {
    id: 'wachat',
    label: 'WhatsApp Chatbot (WABA)',
    url: 'https://crm.cutmap.ac.in/api/webhooks/whatsapp-bot',
    verify: 'ccrm_wa_verify_2026',
    docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks',
    steps: [
      'Go to Meta → WhatsApp → Configuration → Webhooks',
      'Set Callback URL + Verify Token above',
      'Subscribe to messages field',
    ]
  },
]

// ── RCS Templates Manager — list, add manually, delete; auto-populated by webhook ─
function RcsTemplatesManager() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [form, setForm] = useState({ templateId: '', name: '', rcsType: 'BASIC', status: 'APPROVED' })

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/rcs/templates')
      if (r.ok) setTemplates(await r.json())
    } catch {}
    setLoading(false)
  }
  React.useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.templateId.trim()) return alert('Template ID required')
    const r = await fetch('/api/rcs/templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    if (r.ok) { setShowAdd(false); setForm({ templateId: '', name: '', rcsType: 'BASIC', status: 'APPROVED' }); load() }
    else alert('Save failed')
  }
  const del = async (id) => {
    if (!confirm('Delete this template?')) return
    await fetch(`/api/rcs/templates/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-purple-50 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            ✨ RCS Approved Templates
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Auto-populated when rcssms.in posts approval via webhook ·
            Webhook URL: <code className="bg-white px-1.5 py-0.5 rounded font-mono text-pink-700">https://crm.cutmap.ac.in/api/webhooks/rcssms-template</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">
            ↻ Refresh
          </button>
          <button onClick={() => setShowAdd(true)} className="text-xs bg-pink-500 hover:bg-pink-600 text-white rounded-lg px-2.5 py-1">
            + Add Template
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          No templates yet. Add one manually or share the webhook URL above with rcssms support.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left">Template ID</th>
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">Type</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left">Approved</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-mono text-xs">{t.templateId}</td>
                <td className="px-4 py-2.5">{t.name || '—'}</td>
                <td className="px-4 py-2.5"><span className="badge bg-pink-100 text-pink-700 text-xs">{t.rcsType}</span></td>
                <td className="px-4 py-2.5">
                  <span className={`badge text-xs font-bold ${t.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.status}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{t.approvedAt ? new Date(t.approvedAt).toLocaleDateString('en-IN') : '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => del(t.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Add RCS Template</h3>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Template ID *</label>
                <input value={form.templateId} onChange={e => setForm(p => ({ ...p, templateId: e.target.value }))}
                  placeholder="e.g. 7U5QvSVi5e" className="input-field text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Display Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Welcome Message" className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Type</label>
                  <select value={form.rcsType} onChange={e => setForm(p => ({ ...p, rcsType: e.target.value }))} className="input-field text-sm">
                    <option>BASIC</option><option>RICH</option><option>RICHCASOUREL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="input-field text-sm">
                    <option>APPROVED</option><option>PENDING</option><option>REJECTED</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAdd(false)} className="flex-1 btn-secondary text-sm py-2">Cancel</button>
              <button onClick={save} className="flex-1 btn-primary text-sm py-2">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Integrations() {
  const { showToast } = useCcrm()

  // Settings from backend (keyed by integration_settings.key)
  const [savedSettings, setSavedSettings] = useState({})
  const [loadingSettings, setLoadingSettings] = useState(true)

  // UI state
  const [editing, setEditing]         = useState(null)
  const [formValues, setFormValues]   = useState({})
  const [showSecrets, setShowSecrets] = useState({})
  const [testing, setTesting]         = useState(null)
  const [saving, setSaving]           = useState(null)
  const [expanded, setExpanded]       = useState({})
  const [copiedId, setCopiedId]       = useState(null)

  // Sheets sync
  const [sheetsSyncing, setSheetsSyncing] = useState(false)
  const [sheetsSyncResult, setSheetsSyncResult] = useState(null)

  // Load integration settings from backend on mount
  useEffect(() => {
    fetch('/api/integration-settings')
      .then(r => r.json())
      .then(data => { setSavedSettings(data); setLoadingSettings(false) })
      .catch(() => setLoadingSettings(false))
  }, [])

  // Check if an integration has any saved settings
  const isConnected = (integ) => {
    return integ.fields.some(f => savedSettings[f.key]?.trim())
  }

  const handleEdit = (integ) => {
    const current = {}
    integ.fields.forEach(f => { current[f.key] = savedSettings[f.key] || '' })
    setEditing(integ.id)
    setFormValues(current)
    setShowSecrets({})
    setExpanded(prev => ({ ...prev, [integ.id]: true }))
  }

  const handleSave = async (integ) => {
    setSaving(integ.id)
    try {
      // Only save fields that belong to this integration
      const payload = {}
      integ.fields.forEach(f => { payload[f.key] = formValues[f.key] || '' })

      const res = await fetch('/api/integration-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        setSavedSettings(prev => ({ ...prev, ...payload }))
        setEditing(null)
        setFormValues({})
        showToast(`${integ.name} configuration saved to server.`, 'success')
      } else {
        showToast('Failed to save configuration. Please try again.', 'error')
      }
    } catch (e) {
      // Fallback: save to localStorage
      const updated = { ...savedSettings }
      integ.fields.forEach(f => { updated[f.key] = formValues[f.key] || '' })
      setSavedSettings(updated)
      localStorage.setItem('ccrm_integrations_settings', JSON.stringify(updated))
      setEditing(null)
      showToast(`${integ.name} saved locally (server unreachable).`, 'warning')
    } finally {
      setSaving(null)
    }
  }

  const handleDisconnect = async (integ) => {
    const payload = {}
    integ.fields.forEach(f => { payload[f.key] = '' })
    try {
      await fetch('/api/integration-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch {}
    setSavedSettings(prev => ({ ...prev, ...payload }))
    setEditing(null)
    showToast(`${integ.name} disconnected.`, 'info')
  }

  const handleTest = async (integ) => {
    setTesting(integ.id)
    try {
      if (integ.id === 'smtp') {
        // Real SMTP verification via backend
        const res = await fetch('/api/integration-settings/test-smtp', { method: 'POST' })
        const data = await res.json()
        if (data.ok) showToast(`✓ ${data.message}`, 'success')
        else         showToast(`✗ ${data.error}`, 'error')
      } else {
        await new Promise(r => setTimeout(r, 1000))
        showToast(`${integ.name} configuration saved — live test requires API credentials.`, 'info')
      }
    } catch {
      showToast('Test failed — server unreachable.', 'error')
    }
    setTesting(null)
  }

  const handleCopy = (text, id) => {
    navigator.clipboard?.writeText(text)
    setCopiedId(id)
    showToast('Copied to clipboard!', 'success')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSheetsSync = async () => {
    const sheetId = savedSettings['sheets_spreadsheet_id']
    const apiKey = savedSettings['sheets_api_key']
    if (!sheetId) return showToast('Please configure Google Sheets Spreadsheet ID first.', 'error')
    setSheetsSyncing(true)
    setSheetsSyncResult(null)
    try {
      const res = await fetch('/api/integrations/sheets-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, apiKey })
      })
      const data = await res.json()
      if (res.ok) {
        setSheetsSyncResult({ success: true, synced: data.synced, skipped: data.skipped })
        showToast(`Google Sheets synced: ${data.synced} new leads imported!`, 'success')
      } else {
        setSheetsSyncResult({ success: false, error: data.error })
        showToast(data.error || 'Sync failed.', 'error')
      }
    } catch {
      showToast('Sheets sync failed — check configuration.', 'error')
    } finally {
      setSheetsSyncing(false)
    }
  }

  const connectedCount = INTEGRATIONS.filter(i => isConnected(i)).length

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Integrations & Social Media</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Connect CCRM to social media platforms, messaging, payments, and analytics — leads auto-import and counselors get instant alerts.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {loadingSettings ? (
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="animate-spin w-3.5 h-3.5 border-2 border-gray-300 border-t-primary-500 rounded-full" />
              Loading...
            </span>
          ) : (
            <span className={`badge font-semibold ${connectedCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {connectedCount} / {INTEGRATIONS.length} Connected
            </span>
          )}
        </div>
      </div>

      {/* How It Works banner */}
      <div className="bg-gradient-to-r from-blue-50 to-emerald-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Zap size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">How Lead Alerts Work</p>
            <p className="text-xs text-blue-600 mt-1 leading-relaxed">
              When a lead is submitted (from the landing page, Facebook Ads, Google Ads, or WhatsApp), it is auto-assigned to a counselor using round-robin.
              The assigned counselor receives: <strong>1)</strong> an in-app notification (bell icon), <strong>2)</strong> an email alert, and <strong>3)</strong> a WhatsApp message (if their mobile is set and WhatsApp API is configured).
            </p>
          </div>
        </div>
      </div>

      {/* Security notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Lock size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Security Notice</p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            API keys are stored in your server database (encrypted at rest by PostgreSQL). For maximum security, also set them as environment variables
            (<code className="bg-amber-100 px-1 rounded font-mono">META_PAGE_TOKEN</code>, <code className="bg-amber-100 px-1 rounded font-mono">WA_ACCESS_TOKEN</code>, etc.) on your server.
          </p>
        </div>
      </div>

      {/* Integrations List */}
      <div className="space-y-3">
        {INTEGRATIONS.map(integ => {
          const connected = isConnected(integ)
          const isExpanded = expanded[integ.id]
          const isEditing  = editing === integ.id
          const isTesting  = testing === integ.id
          const isSaving   = saving === integ.id

          return (
            <div
              key={integ.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${connected ? 'border-green-200' : 'border-gray-200'}`}
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
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-wrap">
                        <button
                          onClick={() => handleTest(integ)}
                          disabled={isTesting}
                          className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {isTesting ? (
                            <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Testing...</>
                          ) : <><RefreshCw size={12} /> Test Connection</>}
                        </button>
                        <button
                          onClick={() => { setEditing(null); setFormValues({}) }}
                          className="flex items-center gap-1 text-xs text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                        >
                          <X size={12} /> Cancel
                        </button>
                        <button
                          onClick={() => handleSave(integ)}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {isSaving ? (
                            <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Saving...</>
                          ) : <><Save size={12} /> Save to Server</>}
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
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle2 size={16} className="text-green-500" />
                        <span className="font-medium">Integration configured & active on server</span>
                        <span className="text-xs text-gray-400">
                          ({integ.fields.filter(f => savedSettings[f.key]?.trim()).length}/{integ.fields.length} fields set)
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
                    <div className="flex items-center justify-between flex-wrap gap-3">
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
      {isConnected(INTEGRATIONS.find(i => i.id === 'googlesheets')) && (
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

      {/* RCS Templates Manager */}
      <RcsTemplatesManager />

      {/* Webhook Configuration */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={16} className="text-gray-600" />
            <h2 className="font-semibold text-gray-800">Webhook Endpoints — Lead Auto-Import</h2>
          </div>
          <p className="text-xs text-gray-500">
            Paste these URLs into your ad platforms. Every lead submitted on Meta, Google Ads, or WhatsApp is instantly imported into CCRM and the assigned counselor is alerted.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {WEBHOOK_INFO.map(w => (
            <div key={w.id} className="px-5 py-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h3 className="font-medium text-gray-800 text-sm">{w.label}</h3>
                <a href={w.docs} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 border border-blue-200 rounded px-2 py-0.5">
                  <ExternalLink size={11} /> Setup Guide
                </a>
              </div>

              {/* Webhook URL */}
              <div className="bg-slate-50 rounded-lg p-2.5 flex items-center justify-between gap-2 mb-2">
                <code className="text-xs text-slate-700 font-mono break-all">{w.url}</code>
                <button
                  onClick={() => handleCopy(w.url, w.id)}
                  className="text-xs text-slate-500 hover:text-slate-700 flex-shrink-0 border border-slate-200 rounded px-2 py-1 flex items-center gap-1"
                >
                  {copiedId === w.id ? <><CheckCheck size={11} className="text-green-500" /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>

              {/* Verify token */}
              {w.verify && (
                <p className="text-xs text-gray-400 mb-2">
                  Verify Token: <code className="bg-gray-100 px-1 rounded font-mono">{w.verify}</code>
                </p>
              )}

              {/* Setup steps */}
              <ol className="text-xs text-gray-500 space-y-0.5 list-decimal list-inside">
                {w.steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* Counselor Mobile Setup note */}
      <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <MessageCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-green-800">Enable WhatsApp Alerts for Counselors</p>
          <p className="text-xs text-green-700 mt-1 leading-relaxed">
            For counselors to receive WhatsApp alerts when a lead is assigned to them, go to <strong>User Management</strong> → edit each counselor → add their mobile number.
            Then configure the WhatsApp Business API above. The system will send them an instant WhatsApp notification for every new lead.
          </p>
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong>Production tip:</strong> Also set credentials as server environment variables
          (<code className="bg-gray-200 px-1 rounded">META_PAGE_TOKEN</code>, <code className="bg-gray-200 px-1 rounded">WA_ACCESS_TOKEN</code>, <code className="bg-gray-200 px-1 rounded">RAZORPAY_KEY_ID</code>, etc.)
          for extra security. Environment variables take precedence over database-stored values.
        </p>
      </div>
    </div>
  )
}
