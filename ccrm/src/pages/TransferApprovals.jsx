import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCcrm } from '../context/CcrmContext'
import {
  ArrowRightLeft, CheckCircle2, XCircle, Clock, RefreshCw, Users
} from 'lucide-react'

const TABS = ['pending', 'approved', 'rejected']

export default function TransferApprovals() {
  const { currentUser, showToast, fetchAllData } = useCcrm()
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null) // id being acted on

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/lead-transfers?status=${tab}`)
      const data = await r.json()
      setItems(Array.isArray(data) ? data : [])
    } catch { setItems([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [tab])

  const decide = async (id, decision) => {
    setActing(id)
    try {
      const res = await fetch(`/api/lead-transfers/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decidedBy: currentUser?.name || 'Admin' })
      })
      if (res.ok) {
        showToast(`Transfer ${decision}`, 'success')
        if (decision === 'approved') fetchAllData?.()
        load()
      } else {
        const e = await res.json()
        showToast(e.error || 'Action failed', 'error')
      }
    } catch { showToast('Network error', 'error') }
    setActing(null)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowRightLeft size={22} className="text-primary-500" /> Lead Transfer Approvals
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Approve or reject counsellor-requested lead transfers</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${tab === t ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'pending' && '⏳ '}{t === 'approved' && '✓ '}{t === 'rejected' && '✗ '}{t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users size={36} className="mx-auto text-gray-200 mb-3" />
          <p className="text-sm text-gray-500 font-medium">No {tab} transfers</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Lead */}
                  <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => navigate(`/leads/${t.leadId}`)}
                      className="font-bold text-primary-600 hover:underline text-sm truncate">
                      {t.leadName || `Lead #${t.leadId}`}
                    </button>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500 truncate">{t.leadEmail}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs font-mono text-gray-500">{t.leadMobile}</span>
                  </div>
                  {/* Transfer flow */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md">
                      <strong>{t.fromOwner}</strong>
                    </span>
                    <ArrowRightLeft size={14} className="text-blue-500" />
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-md font-semibold">
                      {t.toOwner}
                    </span>
                  </div>
                  {/* Remark */}
                  {t.remark && (
                    <p className="text-xs text-gray-600 italic mt-2 bg-gray-50 px-3 py-1.5 rounded-md">
                      💬 {t.remark}
                    </p>
                  )}
                  {/* Meta */}
                  <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                    <Clock size={9} /> Requested by <strong>{t.requestedBy || '—'}</strong> · {t.requestedAt && new Date(t.requestedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    {t.decidedAt && <> · Decided by <strong>{t.decidedBy}</strong> on {new Date(t.decidedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</>}
                  </p>
                </div>
                {/* Actions */}
                {tab === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => decide(t.id, 'approved')} disabled={acting === t.id}
                      className="flex items-center gap-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">
                      <CheckCircle2 size={12} /> Approve
                    </button>
                    <button onClick={() => decide(t.id, 'rejected')} disabled={acting === t.id}
                      className="flex items-center gap-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                )}
                {tab === 'approved' && (
                  <span className="badge bg-green-100 text-green-700 text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 size={11} /> Approved
                  </span>
                )}
                {tab === 'rejected' && (
                  <span className="badge bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1">
                    <XCircle size={11} /> Rejected
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
