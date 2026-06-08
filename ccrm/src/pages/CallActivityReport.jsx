import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart2, RefreshCw, X, AlertCircle, Phone } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

// Stage columns shown in the report (call funnel order)
const STAGES = ['Untouched', 'Contacted', 'No Response', 'Follow Up', 'Interested', 'Process for Payment', 'Payment Success', 'Not Interested', 'Invalid Number']

const STAGE_TEXT = {
  'Untouched': 'text-red-600', 'Contacted': 'text-blue-600', 'No Response': 'text-gray-500',
  'Follow Up': 'text-yellow-600', 'Interested': 'text-green-600', 'Process for Payment': 'text-orange-600',
  'Payment Success': 'text-emerald-600', 'Not Interested': 'text-red-600', 'Invalid Number': 'text-red-600',
}

export default function CallActivityReport() {
  const navigate = useNavigate()
  const { currentUser, showToast } = useCcrm()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [drill, setDrill] = useState(null)        // { owner, stage }
  const [drillLeads, setDrillLeads] = useState([])
  const [drillLoading, setDrillLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/reports/call-activity', { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) setRows(await res.json())
      else showToast((await res.json().catch(() => ({}))).error || 'Failed to load report', 'error')
    } catch { showToast('Failed to load report', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openDrill = async (owner, stage, count) => {
    if (!count) return
    setDrill({ owner, stage })
    setDrillLoading(true)
    setDrillLeads([])
    try {
      const token = localStorage.getItem('ccrm_token')
      const qs = new URLSearchParams({ owner, stage })
      const res = await fetch(`/api/reports/call-activity/leads?${qs}`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) setDrillLeads(await res.json())
    } catch { showToast('Failed to load details', 'error') }
    finally { setDrillLoading(false) }
  }

  if (currentUser && !['Admin', 'Manager'].includes(currentUser.role)) {
    return (
      <div className="p-6 bg-red-50 rounded-xl border border-red-200 m-6 flex items-center gap-3">
        <AlertCircle className="text-red-600" /><span className="text-red-800">Admin / Manager access required.</span>
      </div>
    )
  }

  const grand = STAGES.reduce((acc, s) => { acc[s] = rows.reduce((n, r) => n + (r.stages[s] || 0), 0); return acc }, {})
  const grandTotal = rows.reduce((n, r) => n + r.total, 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 size={22} className="text-primary-500" /> Call Activity Report
          </h1>
          <p className="text-gray-500 text-sm mt-1">Per-counselor breakdown by stage. Click any number to see the leads behind it.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left sticky left-0 bg-gray-50">Counselor</th>
                {STAGES.map(s => <th key={s} className="px-3 py-3 text-center whitespace-nowrap">{s}</th>)}
                <th className="px-4 py-3 text-center font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={STAGES.length + 2} className="text-center py-10 text-gray-400">
                  <RefreshCw className="inline animate-spin mr-2" size={16} /> Loading...
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={STAGES.length + 2} className="text-center py-10 text-gray-400">No assigned leads yet.</td></tr>
              ) : (
                rows.map(r => (
                  <tr key={r.owner} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white">{r.owner}</td>
                    {STAGES.map(s => {
                      const c = r.stages[s] || 0
                      return (
                        <td key={s} className="px-3 py-3 text-center">
                          {c > 0 ? (
                            <button onClick={() => openDrill(r.owner, s, c)}
                              className={`font-semibold hover:underline ${STAGE_TEXT[s] || 'text-gray-700'}`}>
                              {c}
                            </button>
                          ) : <span className="text-gray-300">0</span>}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 text-center font-bold text-gray-900">{r.total}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="bg-gray-50 border-t font-semibold">
                <tr>
                  <td className="px-4 py-3 sticky left-0 bg-gray-50">All counselors</td>
                  {STAGES.map(s => <td key={s} className="px-3 py-3 text-center text-gray-700">{grand[s] || 0}</td>)}
                  <td className="px-4 py-3 text-center text-gray-900">{grandTotal}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Drill-down modal */}
      {drill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">
                {drill.owner} · <span className={STAGE_TEXT[drill.stage]}>{drill.stage}</span>
                <span className="text-gray-400 font-normal"> ({drillLeads.length})</span>
              </h2>
              <button onClick={() => setDrill(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            {drillLoading ? (
              <p className="text-gray-400 text-sm py-6 text-center"><RefreshCw className="inline animate-spin mr-2" size={16} /> Loading...</p>
            ) : drillLeads.length === 0 ? (
              <p className="text-gray-400 text-sm py-6 text-center">No leads.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Mobile</th>
                    <th className="px-3 py-2 text-left">Follow-up</th>
                    <th className="px-3 py-2 text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {drillLeads.map(l => (
                    <tr key={l.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{l.name}</td>
                      <td className="px-3 py-2 text-gray-600">{l.mobile}</td>
                      <td className="px-3 py-2 text-gray-600">{l.followUpDate || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => navigate(`/leads/${l.id}`)} className="text-primary-600 hover:underline text-xs">View →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
