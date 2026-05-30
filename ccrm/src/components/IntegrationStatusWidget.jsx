import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Share2, Search, Linkedin, MessageCircle, Phone, CreditCard, Wallet,
  PhoneCall, Mail, BarChart2, Globe, Zap, ChevronRight
} from 'lucide-react'

// Each integration → list of DB keys whose presence means "connected"
const INTEGRATIONS = [
  { id: 'meta',         name: 'Facebook Ads',        icon: Share2,       color: 'text-blue-600',   keys: ['meta_page_access_token'] },
  { id: 'googleads',    name: 'Google Ads',          icon: Search,       color: 'text-red-500',    keys: ['googleads_developer_token','googleads_customer_id'] },
  { id: 'linkedin',     name: 'LinkedIn',            icon: Linkedin,     color: 'text-sky-600',    keys: ['linkedin_access_token'] },
  { id: 'whatsapp',     name: 'WhatsApp',            icon: MessageCircle,color: 'text-green-600',  keys: ['whatsapp_access_token','whatsapp_phone_number_id'] },
  { id: 'sms',          name: 'SMS Gateway',         icon: Phone,        color: 'text-orange-600', keys: ['sms_api_key','sms_provider'] },
  { id: 'rcs',          name: 'RCS Messaging',       icon: MessageCircle,color: 'text-pink-600',   keys: ['rcs_api_key','rcs_provider'] },
  { id: 'razorpay',     name: 'Razorpay',            icon: CreditCard,   color: 'text-indigo-600', keys: ['razorpay_key_id','razorpay_key_secret'] },
  { id: 'payu',         name: 'PayU',                icon: Wallet,       color: 'text-teal-600',   keys: ['payu_merchant_key','payu_merchant_salt'] },
  { id: 'ameyo',        name: 'Telephony',           icon: PhoneCall,    color: 'text-violet-600', keys: ['ameyo_api_url','ameyo_username'] },
  { id: 'smtp',         name: 'Gmail / SMTP',        icon: Mail,         color: 'text-purple-600', keys: ['smtp_host','smtp_user','smtp_pass'] },
  { id: 'googlesheets', name: 'Google Sheets',       icon: BarChart2,    color: 'text-emerald-600',keys: ['sheets_spreadsheet_id'] },
  { id: 'ga4',          name: 'Google Analytics',    icon: Globe,        color: 'text-yellow-600', keys: ['ga4_measurement_id'] },
]

// Status logic per integration
function getStatus(integ, settings) {
  const values = integ.keys.map(k => (settings[k] || '').trim())
  const filledCount = values.filter(v => v.length > 0).length
  if (filledCount === 0)              return { tone: 'red',    label: 'Not Connected', desc: 'No credentials saved' }
  if (filledCount < integ.keys.length) return { tone: 'yellow', label: 'Not Configured', desc: `${filledCount}/${integ.keys.length} fields filled` }
  return { tone: 'green', label: 'Connected', desc: 'All credentials set' }
}

const TONE = {
  red:    { dot: 'bg-red-500',    pill: 'bg-red-50 text-red-700 border-red-200',       glow: 'shadow-red-300/40'    },
  yellow: { dot: 'bg-yellow-500', pill: 'bg-yellow-50 text-yellow-700 border-yellow-200', glow: 'shadow-yellow-300/40' },
  green:  { dot: 'bg-green-500',  pill: 'bg-green-50 text-green-700 border-green-200',  glow: 'shadow-green-300/40'  },
}

export default function IntegrationStatusWidget() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({})
  const [loading, setLoading]   = useState(true)

  const refresh = () => {
    setLoading(true)
    fetch('/api/integration-settings')
      .then(r => r.ok ? r.json() : {})
      .then(d => setSettings(d || {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  // KPI counts
  const statuses = INTEGRATIONS.map(i => getStatus(i, settings))
  const greens  = statuses.filter(s => s.tone === 'green').length
  const yellows = statuses.filter(s => s.tone === 'yellow').length
  const reds    = statuses.filter(s => s.tone === 'red').length

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
            <Zap size={16} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Integration Health</h3>
            <p className="text-xs text-gray-400">Live status across all configured platforms</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mini-stats */}
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-green-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-500" /> {greens}
            </span>
            <span className="flex items-center gap-1 text-yellow-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-yellow-500" /> {yellows}
            </span>
            <span className="flex items-center gap-1 text-red-500 font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500" /> {reds}
            </span>
          </div>
          <button
            onClick={() => navigate('/integrations')}
            className="text-xs text-primary-500 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            Manage <ChevronRight size={12} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-4 pb-3 border-b border-gray-100">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow shadow-green-300/50" /> Connected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow shadow-yellow-300/50" /> Not Configured
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow shadow-red-300/50" /> Not Connected
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-xs">
          <span className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-primary-500 rounded-full" />
          Loading integrations...
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {INTEGRATIONS.map(integ => {
            const Icon   = integ.icon
            const status = getStatus(integ, settings)
            const t      = TONE[status.tone]

            return (
              <button
                key={integ.id}
                onClick={() => navigate('/integrations')}
                className="group bg-gray-50 hover:bg-white border border-gray-200 hover:border-primary-300 rounded-xl p-3 text-left transition-all"
                title={`${integ.name} — ${status.label}: ${status.desc}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center group-hover:border-gray-300">
                    <Icon size={16} className={integ.color} />
                  </div>
                  {/* Radio-style status dot with pulse on green */}
                  <span
                    className={`relative w-3 h-3 rounded-full ${t.dot} shadow-md ${t.glow}`}
                    aria-label={status.label}
                  >
                    {status.tone === 'green' && (
                      <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
                    )}
                  </span>
                </div>
                <div className="text-xs font-semibold text-gray-800 truncate">{integ.name}</div>
                <div className={`mt-1 inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${t.pill}`}>
                  {status.label}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
