import React, { useState, useEffect } from 'react'
import { LifeBuoy, Send, Loader, CheckCircle2 } from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { Card, Badge } from '../components/ui'

export default function Grievances() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Open')
  const [replyingId, setReplyingId] = useState(null)
  const [responseText, setResponseText] = useState('')
  const [sending, setSending] = useState(false)

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/grievances', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setTickets(await res.json())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchTickets() }, [])

  const respond = async (id) => {
    if (!responseText.trim()) return
    setSending(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch(`/api/grievances/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ response: responseText })
      })
      if (res.ok) {
        setReplyingId(null)
        setResponseText('')
        fetchTickets()
      } else {
        alert('Failed to send response.')
      }
    } finally {
      setSending(false)
    }
  }

  const visible = tickets.filter(t => filter === 'All' || t.status === filter)
  const openCount = tickets.filter(t => t.status === 'Open').length

  return (
    <PageContainer
      title="Grievances & Support"
      description="Student support tickets raised from the portal — respond here to email the student directly."
    >
      <div className="flex gap-2 mb-5">
        {['Open', 'Resolved', 'All'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold ${filter === f ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f}{f === 'Open' && openCount > 0 ? ` (${openCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : visible.length === 0 ? (
        <Card className="text-center py-14">
          <LifeBuoy size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No {filter !== 'All' ? filter.toLowerCase() : ''} tickets.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map(t => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] text-gray-400">GRV{String(t.id).padStart(4, '0')}</span>
                    <Badge variant="primary">{t.category}</Badge>
                    <Badge variant={t.status === 'Resolved' ? 'success' : 'warning'}>{t.status}</Badge>
                  </div>
                  <p className="font-bold text-gray-900">{t.student_name} <span className="text-gray-400 font-normal font-mono text-[12px]">· {t.app_no}</span></p>
                  <p className="text-[12.5px] text-gray-500">{t.email} · {t.mobile} · Counsellor: {t.counsellor_name || 'Unassigned'}</p>
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0">{new Date(t.created_at).toLocaleString('en-IN')}</span>
              </div>

              <p className="text-sm text-gray-700 mt-3 bg-gray-50 rounded-xl px-4 py-3">{t.message}</p>

              {t.response && (
                <div className="mt-3 bg-success-50 rounded-xl px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-success-700 mb-1 flex items-center gap-1.5"><CheckCircle2 size={12} /> Responded by {t.responded_by}</p>
                  <p className="text-sm text-success-800">{t.response}</p>
                </div>
              )}

              {t.status === 'Open' && (
                replyingId === t.id ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={responseText} onChange={(e) => setResponseText(e.target.value)}
                      placeholder="Type your response — this will be emailed to the student…"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-200 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => respond(t.id)} disabled={sending || !responseText.trim()}
                      className="px-4 py-2 bg-primary-500 text-white text-sm font-bold rounded-xl hover:bg-primary-600 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {sending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />} Send
                    </button>
                    <button onClick={() => { setReplyingId(null); setResponseText('') }} className="px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setReplyingId(t.id); setResponseText('') }}
                    className="mt-3 text-sm font-bold text-primary-600 hover:text-primary-700"
                  >
                    Reply →
                  </button>
                )
              )}
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
