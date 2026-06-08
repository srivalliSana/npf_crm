import React, { useState, useEffect } from 'react'
import { useCcrm } from '../context/CcrmContext'
import { TrendingUp, Users, FileText, CheckCircle, RefreshCw, Filter } from 'lucide-react'

// Lead stages shown in the summary table (funnel order)
const ALL_STAGES = ['Untouched', 'Contacted', 'No Response', 'Follow Up', 'Interested', 'Campus Visit', 'Process for Payment', 'Payment Success', 'Not Interested', 'Invalid Number']

export default function Dashboard() {
  const { currentUser } = useCcrm()
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [summaryStage, setSummaryStage] = useState('All')

  useEffect(() => {
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
  }, [currentUser])

  const kpi = stats?.kpi || {}
  const byCounsellor = stats?.byCounsellor?.[0] || {}
  const isAdmin = currentUser?.role === 'Admin'
  const isCounselor = currentUser?.role === 'Counselor'

  const SUMMARY_CARDS = isCounselor ? [
    { label: 'Total Leads',     value: ((byCounsellor?.leads ?? 0)).toLocaleString(),        icon: Users,       light: 'bg-blue-50',   text: 'text-blue-600' },
    { label: 'Untouched',       value: ((byCounsellor?.untouched ?? 0)).toLocaleString(),    icon: Users,       light: 'bg-orange-50', text: 'text-orange-600' },
    { label: 'Interested',      value: ((byCounsellor?.interested ?? 0)).toLocaleString(),   icon: FileText,    light: 'bg-green-50',  text: 'text-green-600' },
    { label: 'Follow Up',       value: ((byCounsellor?.followUp ?? 0)).toLocaleString(),     icon: TrendingUp,  light: 'bg-yellow-50', text: 'text-yellow-600' },
    { label: 'Not Interested',  value: ((byCounsellor?.notInterested ?? 0)).toLocaleString(), icon: CheckCircle, light: 'bg-red-50',    text: 'text-red-600' },
  ] : [
    { label: 'Total Leads',     value: ((kpi?.totalLeads || 0)).toLocaleString(),           icon: Users,       light: 'bg-blue-50',   text: 'text-blue-600' },
    { label: 'Unassigned',      value: ((kpi?.unassigned ?? 0)).toLocaleString(),           icon: Users,       light: 'bg-purple-50', text: 'text-purple-600' },
    { label: 'Untouched',       value: ((kpi?.untouched ?? 0)).toLocaleString(),            icon: Users,       light: 'bg-orange-50', text: 'text-orange-600' },
    { label: 'Interested',      value: ((kpi?.interested ?? 0)).toLocaleString(),           icon: FileText,    light: 'bg-green-50',  text: 'text-green-600' },
    { label: 'Follow Up',       value: ((kpi?.followUp ?? 0)).toLocaleString(),             icon: TrendingUp,  light: 'bg-yellow-50', text: 'text-yellow-600' },
    { label: 'Not Interested',  value: ((kpi?.notInterested ?? 0)).toLocaleString(),        icon: CheckCircle, light: 'bg-red-50',    text: 'text-red-600' },
    ...(isAdmin ? [{ label: 'Revenue Collected', value: `₹${(((stats?.revenue ?? 0))/100000).toFixed(1)}L`, icon: CheckCircle, light: 'bg-emerald-50', text: 'text-emerald-600' }] : []),
  ]

  const cutm   = stats?.byDomain?.cutm   || { total: 0, stages: {} }
  const cutmap = stats?.byDomain?.cutmap || { total: 0, stages: {} }
  const st = (data, stage) => data?.stages?.[stage] || 0
  const visibleStages = summaryStage === 'All' ? ALL_STAGES : ALL_STAGES.filter(s => s === summaryStage)

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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {SUMMARY_CARDS.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.light} flex items-center justify-center`}>
                  <Icon size={20} className={card.text} />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-gray-900">{card.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
            </div>
          )
        })}
      </div>

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
              { l: 'Follow Up',      v: st(d.data, 'Follow Up') },
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

      {/* Stage summary sheet — filterable by stage (admin/manager) */}
      {!isCounselor && stats?.byDomain && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 text-sm">Stage Summary</h2>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-gray-400" />
              <select value={summaryStage} onChange={e => setSummaryStage(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400">
                <option value="All">All stages</option>
                {ALL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-2.5 text-left">Stage</th>
                  <th className="px-4 py-2.5 text-right">CUTM</th>
                  <th className="px-4 py-2.5 text-right">CUTMAP</th>
                  <th className="px-4 py-2.5 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleStages.map(s => {
                  const a = st(cutm, s), b = st(cutmap, s)
                  return (
                    <tr key={s} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-2.5 font-medium text-gray-800">{s}</td>
                      <td className="px-4 py-2.5 text-right text-blue-700">{a.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-violet-700">{b.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{(a + b).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t font-semibold">
                <tr>
                  <td className="px-5 py-2.5">{summaryStage === 'All' ? 'Total' : `${summaryStage} total`}</td>
                  <td className="px-4 py-2.5 text-right text-blue-700">
                    {visibleStages.reduce((n, s) => n + st(cutm, s), 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-violet-700">
                    {visibleStages.reduce((n, s) => n + st(cutmap, s), 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-900">
                    {visibleStages.reduce((n, s) => n + st(cutm, s) + st(cutmap, s), 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
