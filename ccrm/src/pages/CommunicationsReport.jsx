import React, { useState, useEffect } from 'react'
import {
  Mail, MessageCircle, Phone, RefreshCw, Download,
  CheckCircle2, XCircle, Clock, ChevronRight, BarChart2,
  Users, TrendingUp, AlertCircle
} from 'lucide-react'

const TABS = [
  { id: 'email',     label: 'Email',     icon: Mail          },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle },
  { id: 'calls',     label: 'Calls',     icon: Phone         },
]

const OUTCOME_COLORS = {
  'Connected':            'bg-green-100 text-green-700',
  'Called':               'bg-blue-100 text-blue-700',
  'No Answer':            'bg-yellow-100 text-yellow-700',
  'Busy':                 'bg-orange-100 text-orange-700',
  'Callback Requested':   'bg-purple-100 text-purple-700',
  'Not Interested':       'bg-red-100 text-red-700',
}

// Format any DB timestamp in IST regardless of server timezone
const fmtIST = (ts, withTime = true) => {
  if (!ts) return '—'
  const opts = { timeZone: 'Asia/Kolkata', hour12: true }
  return withTime
    ? new Date(ts).toLocaleString('en-IN', opts) + ' IST'
    : new Date(ts).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
}

export default function CommunicationsReport() {
  const [tab, setTab]               = useState('email')
  const [loading, setLoading]       = useState(false)

  // Email state
  const [emailSummary, setEmailSummary]   = useState([])
  const [emailLogs, setEmailLogs]         = useState([])
  const [activeCamp, setActiveCamp]       = useState(null)
  const [logsLoading, setLogsLoading]     = useState(false)

  // WhatsApp state
  const [waLogs, setWaLogs]               = useState([])

  // Call state
  const [callData, setCallData]           = useState({ logs: [], outcomeStats: [], byCounselor: [] })

  const fetchData = async () => {
    setLoading(true)
    try {
      if (tab === 'email') {
        const r = await fetch('/api/reports/email-logs').then(x => x.json())
        setEmailSummary(Array.isArray(r) ? r : [])
      } else if (tab === 'whatsapp') {
        const r = await fetch('/api/reports/whatsapp-logs').then(x => x.json())
        setWaLogs(Array.isArray(r) ? r : [])
      } else if (tab === 'calls') {
        const r = await fetch('/api/reports/call-logs').then(x => x.json())
        setCallData(r || { logs: [], outcomeStats: [], byCounselor: [] })
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [tab])

  const loadEmailLogs = async (camp) => {
    if (activeCamp?.campaignId === camp.campaignId) { setActiveCamp(null); setEmailLogs([]); return }
    setActiveCamp(camp)
    setLogsLoading(true)
    try {
      const r = await fetch(`/api/reports/email-logs/${camp.campaignId}`).then(x => x.json())
      setEmailLogs(Array.isArray(r) ? r : [])
    } catch { setEmailLogs([]) }
    setLogsLoading(false)
  }

  // fields = array of object keys matching the headers order
  const exportCsv = (rows, filename, headers, fields) => {
    if (!rows || rows.length === 0) {
      alert('No data to export yet. Load the data first.')
      return
    }
    const csvRows = rows.map(r =>
      fields.map(f => `"${String(r[f] ?? '').replace(/"/g, '""')}"`).join(',')
    )
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows].join('\n')
    const a = document.createElement('a')
    a.href = encodeURI(csv)
    a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  // Export email logs for a specific campaign — fetch if not already loaded
  const exportCampaignLogs = async (camp) => {
    let logs = (activeCamp?.campaignId === camp.campaignId) ? emailLogs : null
    if (!logs || logs.length === 0) {
      try {
        const r = await fetch(`/api/reports/email-logs/${camp.campaignId}`).then(x => x.json())
        logs = Array.isArray(r) ? r : []
      } catch { logs = [] }
    }
    exportCsv(logs, `${camp.campaignName}_email_logs.csv`,
      ['Email', 'Name', 'Status', 'Error', 'Sent At'],
      ['email', 'name', 'status', 'error', 'sentAt']
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Communications Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Email delivery status · WhatsApp history · Call outcomes</p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── EMAIL TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'email' && (
        <div className="space-y-4">
          {emailSummary.length === 0 && !loading && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Mail size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm text-gray-400 font-medium">No email campaign logs yet</p>
              <p className="text-xs text-gray-300 mt-1">Send a campaign from Email Campaigns to see delivery reports here</p>
            </div>
          )}

          {emailSummary.map(camp => {
            const total   = Number(camp.total || 0)
            const sent    = Number(camp.sent  || 0)
            const failed  = Number(camp.failed || 0)
            const rate    = total > 0 ? Math.round((sent / total) * 100) : 0
            const isOpen  = activeCamp?.campaignId === camp.campaignId

            return (
              <div key={camp.campaignId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Campaign header row */}
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50/50"
                  onClick={() => loadEmailLogs(camp)}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                      <Mail size={18} className="text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{camp.campaignName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Last sent: {fmtIST(camp.lastSentAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-gray-800">{total}</div>
                      <div className="text-[10px] text-gray-400 uppercase font-medium">Total</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-green-600">{sent}</div>
                      <div className="text-[10px] text-green-500 uppercase font-medium">Sent</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-extrabold text-red-500">{failed}</div>
                      <div className="text-[10px] text-red-400 uppercase font-medium">Failed</div>
                    </div>
                    <div className="w-20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-600">{rate}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={e => { e.stopPropagation(); exportCampaignLogs(camp) }}
                        className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50 flex items-center gap-1">
                        <Download size={11} /> Export
                      </button>
                      <ChevronRight size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                </div>

                {/* Per-recipient logs */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {logsLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                        <span className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-primary-500 rounded-full" />
                        Loading delivery logs...
                      </div>
                    ) : emailLogs.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">No delivery logs for this campaign.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              {['Recipient','Name','Status','Error','Sent At'].map(h => (
                                <th key={h} className="table-th text-xs">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {emailLogs.map(log => (
                              <tr key={log.id} className="hover:bg-gray-50 border-t border-gray-100">
                                <td className="table-td text-xs font-mono text-gray-700">{log.email}</td>
                                <td className="table-td text-xs text-gray-600">{log.name || '—'}</td>
                                <td className="table-td">
                                  <span className={`badge text-xs font-semibold ${log.status === 'Sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                    {log.status === 'Sent' ? <span className="flex items-center gap-1"><CheckCircle2 size={10}/> Sent</span> : <span className="flex items-center gap-1"><XCircle size={10}/> Failed</span>}
                                  </span>
                                </td>
                                <td className="table-td text-xs text-red-500 max-w-xs truncate" title={log.error}>{log.error || '—'}</td>
                                <td className="table-td text-xs text-gray-500 whitespace-nowrap">{fmtIST(log.sentAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── WHATSAPP TAB ──────────────────────────────────────────────────────── */}
      {tab === 'whatsapp' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Campaigns', value: waLogs.length, icon: MessageCircle, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Total Sent',      value: waLogs.reduce((s, w) => s + Number(w.recipientCount || 0), 0), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Last Sent',       value: fmtIST(waLogs[0]?.sentAt, false), icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
                  <c.icon size={20} className={c.color} />
                </div>
                <div>
                  <div className={`text-xl font-extrabold ${c.color}`}>{c.value}</div>
                  <div className="text-xs text-gray-500">{c.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-gray-800 text-sm">WhatsApp Bulk Send History</h3>
              <button onClick={() => exportCsv(waLogs, 'whatsapp_history.csv',
                ['Campaign','Template','Recipients','Status','Sent At'],
                ['campaignName','template','recipientCount','status','sentAt'])}
                className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">
                <Download size={11} /> Export
              </button>
            </div>
            {waLogs.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                <MessageCircle size={36} className="mx-auto text-gray-200 mb-3" />
                No WhatsApp campaigns sent yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>{['Campaign Name','Sent By','Message Preview','Recipients','Status','Sent At'].map(h => <th key={h} className="table-th text-xs">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {waLogs.map(w => {
                      const st = w.status || 'Sent'
                      const stClass =
                        st === 'Sent'           ? 'bg-green-100 text-green-700' :
                        st === 'Partial'        ? 'bg-yellow-100 text-yellow-700' :
                        st === 'Not Configured' ? 'bg-orange-100 text-orange-700' :
                        st === 'Failed'         ? 'bg-red-100 text-red-700' :
                                                  'bg-gray-100 text-gray-600'
                      return (
                      <tr key={w.id} className="hover:bg-gray-50 border-t border-gray-100">
                        <td className="table-td font-semibold text-gray-800">{w.campaignName || 'Bulk Outreach'}</td>
                        <td className="table-td text-xs text-gray-600">{w.sentBy || '—'}</td>
                        <td className="table-td text-xs text-gray-500 max-w-xs truncate" title={w.template}>{w.template?.substring(0, 80)}…</td>
                        <td className="table-td">
                          <span className="font-bold text-green-600">{w.recipientCount}</span>
                        </td>
                        <td className="table-td">
                          <span className={`badge text-xs font-semibold ${stClass}`}>{st}</span>
                        </td>
                        <td className="table-td text-xs text-gray-500 whitespace-nowrap">{fmtIST(w.sentAt)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CALLS TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'calls' && (
        <div className="space-y-4">
          {/* Outcome breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {callData.outcomeStats.map(o => (
              <div key={o.outcome} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                <div className={`px-2 py-1 rounded-lg text-xs font-bold ${OUTCOME_COLORS[o.outcome] || 'bg-gray-100 text-gray-600'}`}>
                  {o.outcome}
                </div>
                <div className="text-xl font-extrabold text-gray-800">{o.count}</div>
              </div>
            ))}
            {callData.outcomeStats.length === 0 && (
              <div className="col-span-3 bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Phone size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400 font-medium">No call logs yet</p>
                <p className="text-xs text-gray-300 mt-1">Use the phone icon on any lead to log calls</p>
              </div>
            )}
          </div>

          {/* Counselor stats */}
          {callData.byCounselor.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-800 text-sm">Counselor-wise Call Performance</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>{['Counselor','Total Calls','Connected','Connect Rate'].map(h => <th key={h} className="table-th text-xs">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {callData.byCounselor.map(c => {
                      const rate = c.total > 0 ? Math.round((c.connected / c.total) * 100) : 0
                      return (
                        <tr key={c.counselor} className="hover:bg-gray-50 border-t border-gray-100">
                          <td className="table-td font-semibold text-gray-800">{c.counselor}</td>
                          <td className="table-td text-primary-600 font-bold">{c.total}</td>
                          <td className="table-td text-green-600 font-bold">{c.connected}</td>
                          <td className="table-td">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-gray-100 rounded-full h-2">
                                <div className="h-2 rounded-full bg-green-500" style={{ width: `${rate}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-gray-700">{rate}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Full call log */}
          {callData.logs.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-800 text-sm">Recent Call Logs ({callData.logs.length})</h3>
                <button onClick={() => exportCsv(callData.logs, 'call_logs.csv',
                  ['Lead','Mobile','Counselor','Duration','Outcome','Notes','Called At'],
                  ['leadName','mobile','counselor','duration','outcome','notes','calledAt'])}
                  className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">
                  <Download size={11} /> Export
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>{['Lead','Mobile','Counselor','Duration','Outcome','Notes','Called At'].map(h => <th key={h} className="table-th text-xs">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {callData.logs.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 border-t border-gray-100">
                        <td className="table-td font-semibold text-gray-800">{c.leadName}</td>
                        <td className="table-td font-mono text-xs text-gray-600">{c.mobile}</td>
                        <td className="table-td text-gray-600 text-xs">{c.counselor}</td>
                        <td className="table-td text-xs text-gray-500">{c.duration || '—'}</td>
                        <td className="table-td">
                          <span className={`badge text-xs font-semibold ${OUTCOME_COLORS[c.outcome] || 'bg-gray-100 text-gray-600'}`}>{c.outcome}</span>
                        </td>
                        <td className="table-td text-xs text-gray-500 max-w-xs truncate" title={c.notes}>{c.notes || '—'}</td>
                        <td className="table-td text-xs text-gray-500 whitespace-nowrap">{fmtIST(c.calledAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
