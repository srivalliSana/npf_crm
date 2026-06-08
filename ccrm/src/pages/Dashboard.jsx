import React, { useState, useEffect } from 'react'
import { useCcrm } from '../context/CcrmContext'
import { ChevronDown, TrendingUp, Users, FileText, CheckCircle, Target, MapPin, RefreshCw } from 'lucide-react'

const CAMPUSES = ['All', 'Bhubaneswar', 'Vizianagaram', 'Paralakhemundi', 'Balasore']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function Dashboard() {
  const { activeCampus, setActiveCampus, saveTarget, currentUser } = useCcrm()
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [targetForm, setTargetForm] = useState({ month: MONTHS[new Date().getMonth()], year: new Date().getFullYear(), campus: 'All', targetLeads: 100, targetApplications: 30, targetEnrollments: 10 })
  const [achievement, setAchievement] = useState(null)
  const [campusStats, setCampusStats] = useState([])

  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    // Fetch achievement data
    const m = MONTHS[new Date().getMonth()]
    fetch(`/api/targets/achievement?month=${m}&year=${new Date().getFullYear()}&campus=${activeCampus}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAchievement(data) })
      .catch(() => {})

    // Fetch campus stats
    fetch('/api/campus/stats')
      .then(r => r.ok ? r.json() : [])
      .then(data => setCampusStats(Array.isArray(data) ? data : []))
      .catch(() => setCampusStats([]))

    // Server-side aggregated dashboard stats — scales to millions of rows.
    // Role-scoped: counsellor sees own, manager sees their team, admin sees all.
    setStatsLoading(true)
    let q = `?campus=${encodeURIComponent(activeCampus)}`
    if (currentUser?.role === 'Counselor') q += `&owner=${encodeURIComponent(currentUser.name)}`
    else if (currentUser?.role === 'Manager') q += `&manager=${encodeURIComponent(currentUser.name)}`
    fetch(`/api/dashboard/stats${q}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setStats(data); setStatsLoading(false) })
      .catch(() => setStatsLoading(false))
  }, [currentUser, activeCampus])

  const handleSaveTarget = async (e) => {
    e.preventDefault()
    await saveTarget(targetForm)
    setShowTargetModal(false)
    // Refresh achievement
    fetch(`/api/targets/achievement?month=${targetForm.month}&year=${targetForm.year}&campus=All`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setAchievement(data) })
  }

  // 1. Summary Cards — from server aggregate (instant at any scale)
  const kpi = stats?.kpi || {}
  const byCounsellor = stats?.byCounsellor?.[0] || {}
  const isAdmin = currentUser?.role === 'Admin'
  const isCounselor = currentUser?.role === 'Counselor'

  const SUMMARY_CARDS = isCounselor ? [
    { label: 'Total Leads',     value: ((byCounsellor?.leads ?? 0)).toLocaleString(),        icon: Users,       color: 'bg-blue-500',   light: 'bg-blue-50',   text: 'text-blue-600' },
    { label: 'Untouched',       value: ((byCounsellor?.untouched ?? 0)).toLocaleString(),    icon: Users,       color: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-600' },
    { label: 'Interested',      value: ((byCounsellor?.interested ?? 0)).toLocaleString(),   icon: FileText,    color: 'bg-green-500',  light: 'bg-green-50',  text: 'text-green-600' },
    { label: 'Follow Up',       value: ((byCounsellor?.followUp ?? 0)).toLocaleString(),     icon: TrendingUp,  color: 'bg-yellow-500', light: 'bg-yellow-50', text: 'text-yellow-600' },
    { label: 'Not Interested',  value: ((byCounsellor?.notInterested ?? 0)).toLocaleString(), icon: CheckCircle, color: 'bg-red-500',    light: 'bg-red-50',    text: 'text-red-600' },
  ] : [
    { label: 'Total Leads',     value: ((kpi?.totalLeads || 0)).toLocaleString(),           icon: Users,       color: 'bg-blue-500',   light: 'bg-blue-50',   text: 'text-blue-600' },
    { label: 'Unassigned',      value: ((kpi?.unassigned ?? 0)).toLocaleString(),           icon: Users,       color: 'bg-purple-500', light: 'bg-purple-50', text: 'text-purple-600' },
    { label: 'Untouched',       value: ((kpi?.untouched ?? 0)).toLocaleString(),            icon: Users,       color: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-600' },
    { label: 'Interested',      value: ((kpi?.interested ?? 0)).toLocaleString(),           icon: FileText,    color: 'bg-green-500',  light: 'bg-green-50',  text: 'text-green-600' },
    { label: 'Follow Up',       value: ((kpi?.followUp ?? 0)).toLocaleString(),             icon: TrendingUp,  color: 'bg-yellow-500', light: 'bg-yellow-50', text: 'text-yellow-600' },
    { label: 'Not Interested',  value: ((kpi?.notInterested ?? 0)).toLocaleString(),        icon: CheckCircle, color: 'bg-red-500',    light: 'bg-red-50',    text: 'text-red-600' },
    ...(isAdmin ? [{ label: 'Revenue Collected', value: `₹${(((stats?.revenue ?? 0))/100000).toFixed(1)}L`, icon: CheckCircle, color: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-600' }] : []),
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of team performance and lead activity</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={activeCampus} onChange={e => setActiveCampus(e.target.value)} className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer">
              {CAMPUSES.map(campus => <option key={campus} value={campus}>{campus}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
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
                <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full select-none">
                  {card.change}
                </span>
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
            { key: 'cutm',   label: 'CUTM',   accent: 'from-blue-500 to-blue-600' },
            { key: 'cutmap', label: 'CUTMAP', accent: 'from-violet-500 to-violet-600' },
          ].map(d => {
            const data = stats.byDomain[d.key] || {}
            const cells = [
              { l: 'Total',          v: data.total },
              { l: 'Untouched',      v: data.untouched },
              { l: 'Follow Up',      v: data.followUp },
              { l: 'Interested',     v: data.interested },
              { l: 'Not Interested', v: data.notInterested },
            ]
            return (
              <div key={d.key} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${d.accent} px-4 py-2.5 flex items-center justify-between`}>
                  <span className="text-white font-bold text-sm">{d.label}</span>
                  <span className="text-white/90 text-xs">{(data.total || 0).toLocaleString()} leads</span>
                </div>
                <div className="grid grid-cols-5 divide-x divide-gray-100">
                  {cells.map(c => (
                    <div key={c.l} className="px-2 py-3 text-center">
                      <div className="text-lg font-extrabold text-gray-900">{(c.v || 0).toLocaleString()}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{c.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Campus Filter Bar */}
      <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 p-3 shadow-sm mb-4">
        <MapPin size={14} className="text-primary-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-500 mr-1">Campus:</span>
        {CAMPUSES.map(c => (
          <button key={c} onClick={() => setActiveCampus(c)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${activeCampus === c ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {c}
          </button>
        ))}
        {Array.isArray(campusStats) && campusStats.length > 0 && activeCampus !== 'All' && (() => {
          const stat = campusStats.find(s => s?.campus === activeCampus)
          return stat ? (
            <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
              <span>Apps: <strong className="text-gray-700">{stat.applications ?? 0}</strong></span>
              <span>Enrolled: <strong className="text-green-600">{stat.enrolled ?? 0}</strong></span>
              <span>Paid: <strong className="text-primary-600">{stat.paid ?? 0}</strong></span>
            </div>
          ) : null
        })()}
      </div>

      {/* Admission Target Tracker */}
      {achievement && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target size={18} className="text-primary-500" />
                  <h2 className="font-semibold text-gray-800">Admission Target Tracker — {achievement.month} {achievement.year}</h2>
                </div>
                {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                  <button onClick={() => setShowTargetModal(true)}
                    className="text-xs text-primary-600 border border-primary-200 rounded-lg px-3 py-1 hover:bg-primary-50">
                    Set Target
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Leads', achieved: achievement.achieved.leads, target: achievement.targets.leads, color: 'blue' },
                  { label: 'Applications', achieved: achievement.achieved.applications, target: achievement.targets.applications, color: 'orange' },
                  { label: 'Enrollments', achieved: achievement.achieved.enrollments, target: achievement.targets.enrollments, color: 'green' },
                ].map(item => {
                  const pct = item.target > 0 ? Math.min((item.achieved / item.target) * 100, 100) : 0
                  const colorMap = { blue: 'bg-blue-500', orange: 'bg-orange-500', green: 'bg-green-500' }
                  const textMap = { blue: 'text-blue-600', orange: 'text-orange-600', green: 'text-green-600' }
                  return (
                    <div key={item.label} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 font-medium">{item.label}</span>
                        <span className={`font-bold ${textMap[item.color]}`}>{item.achieved} / {item.target || '—'}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div className={`h-2.5 rounded-full transition-all ${colorMap[item.color]}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-gray-400">{pct.toFixed(0)}% of target achieved</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

      {/* Target Setting Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Target size={18} className="text-primary-500" /> Set Admission Targets</h2>
              <button onClick={() => setShowTargetModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <form onSubmit={handleSaveTarget} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Month</label>
                  <select value={targetForm.month} onChange={e => setTargetForm(p => ({ ...p, month: e.target.value }))} className="input-field text-sm">
                    {MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Year</label>
                  <input type="number" value={targetForm.year} onChange={e => setTargetForm(p => ({ ...p, year: parseInt(e.target.value) }))} className="input-field text-sm" min="2024" max="2030" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Campus</label>
                <select value={targetForm.campus} onChange={e => setTargetForm(p => ({ ...p, campus: e.target.value }))} className="input-field text-sm">
                  {CAMPUSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Target Leads</label>
                  <input type="number" value={targetForm.targetLeads} onChange={e => setTargetForm(p => ({ ...p, targetLeads: parseInt(e.target.value) || 0 }))} className="input-field text-sm" min="0" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Applications</label>
                  <input type="number" value={targetForm.targetApplications} onChange={e => setTargetForm(p => ({ ...p, targetApplications: parseInt(e.target.value) || 0 }))} className="input-field text-sm" min="0" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Enrollments</label>
                  <input type="number" value={targetForm.targetEnrollments} onChange={e => setTargetForm(p => ({ ...p, targetEnrollments: parseInt(e.target.value) || 0 }))} className="input-field text-sm" min="0" />
                </div>
              </div>
              <div className="flex gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowTargetModal(false)} className="flex-1 btn-secondary text-sm py-2.5">Cancel</button>
                <button type="submit" className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2">
                  <Target size={15} /> Save Targets
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
