import React, { useState, useEffect } from 'react'
import { useCcrm } from '../context/CcrmContext'
import { TrendingUp, Users, FileText, CheckCircle, RefreshCw, Filter, Trash2, X, Download } from 'lucide-react'
import { stageLabel } from '../stageLabel'

// Lead stages shown in the summary table (funnel order)
const ALL_STAGES = ['Untouched', 'Contacted', 'Invalid Number', 'No Response', 'Follow Up', 'Interested', 'Campus Visit Scheduled', 'Campus Visit Completed', 'Process for Payment', 'Payment Success', 'Not Interested']

export default function Dashboard() {
  const { currentUser } = useCcrm()
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [summaryStage, setSummaryStage] = useState('All')
  const [summaryDomain, setSummaryDomain] = useState('All')   // All | cutm | cutmap
  const [deleteTarget, setDeleteTarget] = useState(null)      // counsellor row pending lead deletion
  const [deleting, setDeleting] = useState(false)

  const loadStats = () => {
    // Server-side aggregated dashboard stats — scales to millions of rows.
    // Role-scoped: counsellor sees own, manager sees their team, admin sees all.
    setStatsLoading(true)
    let q = ''
    if (currentUser?.role === 'Counselor') q = `?owner=${encodeURIComponent(currentUser.name)}`
    else if (currentUser?.role === 'Manager') q = `?manager=${encodeURIComponent(currentUser.name)}`
    fetch(`/api/dashboard/stats${q}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setStats(data); setStatsLoading(false) })
      .catch(() => setStatsLoading(false))
  }
  useEffect(() => { loadStats() }, [currentUser])

  const handleDeleteCounsellorLeads = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/leads/delete-by-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ owner: deleteTarget.counsellor })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDeleteTarget(null)
        loadStats()
      }
    } catch { /* ignore */ }
    finally { setDeleting(false) }
  }

  const kpi = stats?.kpi || {}
  const byCounsellor = stats?.byCounsellor?.[0] || {}
  const isAdmin = currentUser?.role === 'Admin'
  const isCounselor = currentUser?.role === 'Counselor'

  const SUMMARY_CARDS = isCounselor ? [
    { label: 'Total Leads',     value: ((byCounsellor?.leads ?? 0)).toLocaleString(),        icon: Users,       light: 'bg-blue-50',   text: 'text-blue-600' },
    { label: 'Untouched',       value: ((byCounsellor?.untouched ?? 0)).toLocaleString(),    icon: Users,       light: 'bg-orange-50', text: 'text-orange-600' },
    { label: 'Interested',      value: ((byCounsellor?.interested ?? 0)).toLocaleString(),   icon: FileText,    light: 'bg-green-50',  text: 'text-green-600' },
    { label: 'Further Talk/Follow Up',       value: ((byCounsellor?.followUp ?? 0)).toLocaleString(),     icon: TrendingUp,  light: 'bg-yellow-50', text: 'text-yellow-600' },
    { label: 'Not Interested',  value: ((byCounsellor?.notInterested ?? 0)).toLocaleString(), icon: CheckCircle, light: 'bg-red-50',    text: 'text-red-600' },
  ] : [
    { label: 'Total Leads',     value: ((kpi?.totalLeads || 0)).toLocaleString(),           icon: Users,       light: 'bg-blue-50',   text: 'text-blue-600' },
    { label: 'Unassigned',      value: ((kpi?.unassigned ?? 0)).toLocaleString(),           icon: Users,       light: 'bg-purple-50', text: 'text-purple-600' },
    { label: 'Untouched',       value: ((kpi?.untouched ?? 0)).toLocaleString(),            icon: Users,       light: 'bg-orange-50', text: 'text-orange-600' },
    { label: 'Interested',      value: ((kpi?.interested ?? 0)).toLocaleString(),           icon: FileText,    light: 'bg-green-50',  text: 'text-green-600' },
    { label: 'Further Talk/Follow Up',       value: ((kpi?.followUp ?? 0)).toLocaleString(),             icon: TrendingUp,  light: 'bg-yellow-50', text: 'text-yellow-600' },
    { label: 'Not Interested',  value: ((kpi?.notInterested ?? 0)).toLocaleString(),        icon: CheckCircle, light: 'bg-red-50',    text: 'text-red-600' },
    ...(isAdmin ? [{ label: 'Revenue Collected', value: `₹${(((stats?.revenue ?? 0))/100000).toFixed(1)}L`, icon: CheckCircle, light: 'bg-emerald-50', text: 'text-emerald-600' }] : []),
  ]

  const cutm   = stats?.byDomain?.cutm   || { total: 0, stages: {} }
  const cutmap = stats?.byDomain?.cutmap || { total: 0, stages: {} }
  const st = (data, stage) => data?.stages?.[stage] || 0
  const visibleStages = summaryStage === 'All' ? ALL_STAGES : ALL_STAGES.filter(s => s === summaryStage)
  const matrixRows = (stats?.byCounsellorStages || []).filter(r => summaryDomain === 'All' || r.domain === summaryDomain)

  // Export the Stage Summary matrix (respecting the active Domain + Stage filters) to CSV.
  const exportStageSummary = () => {
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Counsellor', 'Domain', 'Assigned', ...visibleStages.map(stageLabel), 'Total']
    const lines = [header.map(esc).join(',')]
    matrixRows.forEach(r => {
      const rowTotal = summaryStage === 'All' ? (r.total || 0) : visibleStages.reduce((n, s) => n + st(r, s), 0)
      lines.push([
        r.counsellor,
        (r.domain || '').toUpperCase(),
        r.total || 0,
        ...visibleStages.map(s => st(r, s)),
        rowTotal,
      ].map(esc).join(','))
    })
    // Totals row
    const grandTotal = summaryStage === 'All'
      ? matrixRows.reduce((n, r) => n + (r.total || 0), 0)
      : matrixRows.reduce((n, r) => n + visibleStages.reduce((m, s) => m + st(r, s), 0), 0)
    lines.push([
      'All counsellors',
      summaryDomain === 'All' ? 'ALL' : summaryDomain.toUpperCase(),
      matrixRows.reduce((n, r) => n + (r.total || 0), 0),
      ...visibleStages.map(s => matrixRows.reduce((n, r) => n + st(r, s), 0)),
      grandTotal,
    ].map(esc).join(','))

    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `stage-summary-${summaryDomain}-${summaryStage === 'All' ? 'all-stages' : summaryStage}-${stamp}.csv`.replace(/\s+/g, '-')
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of team performance and lead activity</p>
        </div>
      </div>

      {statsLoading && (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2 mb-6">
          <RefreshCw size={16} className="animate-spin" /> Please wait, loading dashboard…
        </div>
      )}

      {/* Summary cards — compact */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {SUMMARY_CARDS.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${card.light} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={card.text} />
              </div>
              <div className="min-w-0">
                <div className="text-xl font-extrabold text-gray-900 leading-tight">{card.value}</div>
                <div className="text-[11px] text-gray-500 truncate">{card.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Your GT entities (counsellor's own leads per granted GT entity) */}
      {stats?.gtEntities?.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Your GT Entities</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.gtEntities.map(e => (
              <div key={e.entity} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                <div className="text-[11px] font-bold text-indigo-600">{e.entity}</div>
                <div className="text-xl font-extrabold text-gray-900 leading-tight">{(e.total || 0).toLocaleString()}</div>
                <div className="text-[11px] text-gray-500">leads · {(e.untouched || 0).toLocaleString()} not contacted</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CUTM vs CUTMAP split (admin/manager) */}
      {!isCounselor && stats?.byDomain && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {[
            { key: 'cutm',   label: 'CUTM',   data: cutm,   accent: 'from-blue-500 to-blue-600' },
            { key: 'cutmap', label: 'CUTMAP', data: cutmap, accent: 'from-violet-500 to-violet-600' },
          ].map(d => {
            const cells = [
              { l: 'Total',          v: d.data.total },
              { l: 'Untouched',      v: st(d.data, 'Untouched') },
              { l: 'Follow Up',   v: st(d.data, 'Follow Up') },
              { l: 'Interested',     v: st(d.data, 'Interested') },
              { l: 'Not Interested', v: st(d.data, 'Not Interested') },
              { l: 'Invalid Number', v: st(d.data, 'Invalid Number') },
            ]
            return (
              <div key={d.key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${d.accent} px-4 py-2.5 flex items-center justify-between`}>
                  <span className="text-white font-bold text-sm">{d.label}</span>
                  <span className="text-white/90 text-xs">{(d.data.total || 0).toLocaleString()} leads</span>
                </div>
                <div className="grid grid-cols-6 divide-x divide-gray-100">
                  {cells.map(c => (
                    <div key={c.l} className="px-1.5 py-3 text-center">
                      <div className="text-base font-extrabold text-gray-900">{(c.v || 0).toLocaleString()}</div>
                      <div className="text-[9px] text-gray-500 mt-0.5 leading-tight">{c.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reconciliation — CUTM + CUTMAP + Unassigned/Other = Total Leads */}
      {!isCounselor && stats?.byDomain && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 mb-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
          <span className="font-bold text-gray-900">{(kpi?.totalLeads || 0).toLocaleString()}</span>
          <span className="text-gray-400 text-xs">Total</span>
          <span className="text-gray-300">=</span>
          <span className="font-semibold text-blue-600">{(cutm.total || 0).toLocaleString()}</span>
          <span className="text-gray-400 text-xs">CUTM</span>
          <span className="text-gray-300">+</span>
          <span className="font-semibold text-violet-600">{(cutmap.total || 0).toLocaleString()}</span>
          <span className="text-gray-400 text-xs">CUTMAP</span>
          <span className="text-gray-300">+</span>
          <span className="font-semibold text-gray-600">{((stats?.byDomain?.other?.total) || 0).toLocaleString()}</span>
          <span className="text-gray-400 text-xs">Unassigned / Other</span>
        </div>
      )}

      {/* Stage Summary — counsellor (rows) × stage (columns) matrix (admin/manager) */}
      {!isCounselor && Array.isArray(stats?.byCounsellorStages) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-gray-800 text-sm">Stage Summary — by Counsellor</h2>
            <div className="flex items-center gap-2">
              {/* Domain filter: All / CUTM / CUTMAP */}
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {[{ v: 'All', l: 'All' }, { v: 'cutm', l: 'CUTM' }, { v: 'cutmap', l: 'CUTMAP' }].map(d => (
                  <button key={d.v} onClick={() => setSummaryDomain(d.v)}
                    className={`px-3 py-1.5 ${summaryDomain === d.v ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {d.l}
                  </button>
                ))}
              </div>
              <Filter size={14} className="text-gray-400" />
              <select value={summaryStage} onChange={e => setSummaryStage(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
                <option value="All">All stages</option>
                {ALL_STAGES.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
              </select>
              <button onClick={exportStageSummary} disabled={matrixRows.length === 0}
                title="Export the current view to CSV (Excel)"
                className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                <Download size={14} /> Export
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left sticky left-0 bg-gray-50">Counsellor</th>
                  <th className="px-4 py-2.5 text-center font-bold text-primary-600">Assigned</th>
                  {visibleStages.map(s => <th key={s} className="px-3 py-2.5 text-center whitespace-nowrap">{stageLabel(s)}</th>)}
                  <th className="px-4 py-2.5 text-center font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.length === 0 ? (
                  <tr><td colSpan={visibleStages.length + 3} className="text-center py-8 text-gray-400">No leads for this filter.</td></tr>
                ) : matrixRows.map(r => {
                  // In 'All' view, Total = the counsellor's true assigned count (matches Assigned).
                  // When filtered to one stage, Total = that stage's count.
                  const rowTotal = summaryStage === 'All' ? (r.total || 0) : visibleStages.reduce((n, s) => n + st(r, s), 0)
                  return (
                    <tr key={r.counsellor} className="border-b border-gray-50 hover:bg-gray-50 group">
                      <td className="px-4 py-2.5 font-medium text-gray-800 sticky left-0 bg-white">
                        <span className="inline-flex items-center gap-2">
                          {r.counsellor}
                          {isAdmin && (
                            <button onClick={() => setDeleteTarget(r)} title={`Delete all ${r.counsellor}'s leads`}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-bold text-primary-600">{(r.total || 0).toLocaleString()}</td>
                      {visibleStages.map(s => {
                        const v = st(r, s)
                        return <td key={s} className="px-3 py-2.5 text-center">{v ? v.toLocaleString() : <span className="text-gray-300">0</span>}</td>
                      })}
                      <td className="px-4 py-2.5 text-center font-bold text-gray-900">{rowTotal.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t font-semibold">
                <tr>
                  <td className="px-4 py-2.5 sticky left-0 bg-gray-50">All counsellors</td>
                  <td className="px-4 py-2.5 text-center text-primary-600">
                    {matrixRows.reduce((n, r) => n + (r.total || 0), 0).toLocaleString()}
                  </td>
                  {visibleStages.map(s => (
                    <td key={s} className="px-3 py-2.5 text-center text-gray-700">
                      {matrixRows.reduce((n, r) => n + st(r, s), 0).toLocaleString()}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-center text-gray-900">
                    {(summaryStage === 'All'
                      ? matrixRows.reduce((n, r) => n + (r.total || 0), 0)
                      : matrixRows.reduce((n, r) => n + visibleStages.reduce((m, s) => m + st(r, s), 0), 0)
                    ).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Delete all leads of a counsellor — confirm (Admin) */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Trash2 size={18} className="text-red-500" /> Delete counsellor's leads
              </h2>
              <button onClick={() => setDeleteTarget(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-600">
              This will permanently delete <strong className="text-red-600">{(deleteTarget.total || 0).toLocaleString()} lead(s)</strong> owned by
              <strong className="text-gray-900"> {deleteTarget.counsellor}</strong>. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 btn-secondary text-sm py-2">Cancel</button>
              <button onClick={handleDeleteCounsellorLeads} disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                <Trash2 size={15} /> {deleting ? 'Deleting...' : `Delete ${(deleteTarget.total || 0).toLocaleString()} leads`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
