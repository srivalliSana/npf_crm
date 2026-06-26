import React, { useState, useEffect } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { ChevronDown, RefreshCw, BarChart2 } from 'lucide-react'

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        {payload.map(p => (
          <div key={p.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill }}></div>
            <span className="text-gray-600">{p.name}:</span>
            <span className="font-semibold text-gray-800">{p.value}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function Analytics() {
  const { currentUser } = useCcrm()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [domainFilter, setDomainFilter] = useState('All')   // All | cutm | cutmap
  const [countFilter, setCountFilter] = useState('10 Selected')

  useEffect(() => {
    setLoading(true)
    let q = ''
    if (currentUser?.role === 'Counselor') q = `?owner=${encodeURIComponent(currentUser.name)}`
    else if (currentUser?.role === 'Manager') q = `?manager=${encodeURIComponent(currentUser.name)}`
    const token = localStorage.getItem('ccrm_token')
    fetch(`/api/dashboard/stats${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setStats(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [currentUser])

  const kpi = stats?.kpi || {}
  const counselorDataAll = stats?.byCounsellor || []
  const counselorData = (domainFilter === 'All'
    ? counselorDataAll
    : counselorDataAll.filter(c => c.domain === domainFilter))

  const totalStagesSum = (kpi.untouched + kpi.contacted + kpi.interested + kpi.followUp + kpi.processPay + kpi.paymentSuccess) || 1
  const STAGES_DIST = [
    { stage: 'Untouched',           count: kpi.untouched || 0,      pct: Math.round(((kpi.untouched||0) / totalStagesSum) * 100), color: 'bg-red-400' },
    { stage: 'Contacted',           count: kpi.contacted || 0,      pct: Math.round(((kpi.contacted||0) / totalStagesSum) * 100), color: 'bg-blue-400' },
    { stage: 'Interested',          count: kpi.interested || 0,     pct: Math.round(((kpi.interested||0) / totalStagesSum) * 100), color: 'bg-green-400' },
    { stage: 'Follow Up',           count: kpi.followUp || 0,       pct: Math.round(((kpi.followUp||0) / totalStagesSum) * 100), color: 'bg-yellow-400' },
    { stage: 'Process for Payment', count: kpi.processPay || 0,     pct: Math.round(((kpi.processPay||0) / totalStagesSum) * 100), color: 'bg-blue-500' },
    { stage: 'Payment Success',     count: kpi.paymentSuccess || 0, pct: Math.round(((kpi.paymentSuccess||0) / totalStagesSum) * 100), color: 'bg-emerald-400' },
  ]

  const sortedCounselors = [...counselorData].sort((a, b) => b.leads - a.leads)
  const maxLeads = sortedCounselors[0]?.leads || 1

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Analytics</h1>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
          <RefreshCw size={16} className="animate-spin" /> Please wait, loading analytics…
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <BarChart2 size={22} className="text-primary-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Lead stage breakdown, top performers and stage distribution</p>
        </div>
      </div>

      {/* Bar chart — User Wise Lead Stage Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-gray-800 text-sm md:text-base">User Wise Lead Stage Breakdown</h2>
            <p className="text-xs text-gray-400 mt-0.5">Untouched · Interested · Further Discussion · Process for Payment — per counsellor</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {[
                { v: 'All',    label: 'All' },
                { v: 'cutm',   label: '@cutm.ac.in' },
                { v: 'cutmap', label: '@cutmap.ac.in' },
              ].map(d => (
                <button key={d.v} onClick={() => setDomainFilter(d.v)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${domainFilter === d.v ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {d.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <select value={countFilter} onChange={e => setCountFilter(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer">
                {['10 Selected', '5 Selected', 'All'].map(o => <option key={o}>{o}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {counselorData.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No counsellor data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={counselorData.slice(0, countFilter === '5 Selected' ? 5 : countFilter === '10 Selected' ? 10 : counselorData.length)}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              barCategoryGap="30%"
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} iconType="circle" iconSize={8} />
              <Bar dataKey="untouched"  name="Untouched"            fill="#f87171" radius={[3,3,0,0]} />
              <Bar dataKey="interested" name="Interested"           fill="#34d399" radius={[3,3,0,0]} />
              <Bar dataKey="followUp"   name="Further Discussion"   fill="#fbbf24" radius={[3,3,0,0]} />
              <Bar dataKey="processPay" name="Process for Payment"  fill="#60a5fa" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Top performers */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Top Performers</h3>
          <div className="space-y-3">
            {sortedCounselors.length === 0 && <div className="text-sm text-gray-400">No data yet.</div>}
            {sortedCounselors.slice(0, 5).map((c, idx) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                  idx === 1 ? 'bg-gray-100 text-gray-600' :
                  idx === 2 ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-50 text-gray-500'
                }`}>{idx + 1}</span>
                <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold select-none">
                  {c.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{c.name}</span>
                    <span className="text-xs text-gray-500 font-bold">{c.leads} leads</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                    <div className="bg-primary-500 h-1.5 rounded-full transition-all" style={{ width: `${(c.leads / maxLeads) * 100}%` }}></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lead Stage Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Lead Stage Distribution</h3>
          <div className="space-y-3">
            {STAGES_DIST.map(s => (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-32 flex-shrink-0 font-medium">{s.stage}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className={`${s.color} h-2 rounded-full transition-all duration-500`} style={{ width: `${s.pct}%` }}></div>
                </div>
                <span className="text-xs font-bold text-gray-700 w-12 text-right">{s.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
