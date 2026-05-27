import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { ChevronDown, TrendingUp, Users, FileText, CheckCircle } from 'lucide-react'

const TABS = ['User Dashboard', 'Productivity Report']

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

export default function Dashboard() {
  const { leads, applications, payments, counselors } = useCcrm()
  const [activeTab, setActiveTab] = useState('User Dashboard')
  const [leadsFilter, setLeadsFilter] = useState('Leads Assigned')
  const [appsFilter, setAppsFilter] = useState('Application Assigned')
  const [countFilter, setCountFilter] = useState('10 Selected')

  // 1. Calculate Summary Cards
  const totalLeads = leads.length
  const totalApps = applications.length
  const totalApprovedPayments = payments.filter(p => p.status === 'Approved' || p.status === 'Payment Approved').length
  const enrolments = applications.filter(a => a.stage === 'Enrolment' || a.stage === 'Enrolments').length

  const SUMMARY_CARDS = [
    { label: 'Total Leads',        value: totalLeads.toLocaleString(),        change: '+15%', icon: Users,       color: 'bg-blue-500',   light: 'bg-blue-50',   text: 'text-blue-600' },
    { label: 'Total Applications', value: totalApps.toLocaleString(),         change: '+9%',  icon: FileText,    color: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-600' },
    { label: 'Approved Payments',  value: totalApprovedPayments.toLocaleString(), change: '+22%', icon: CheckCircle, color: 'bg-green-500',  light: 'bg-green-50',  text: 'text-green-600' },
    { label: 'Enrolments',         value: enrolments.toLocaleString(),        change: '+6%',  icon: TrendingUp,  color: 'bg-purple-500', light: 'bg-purple-50', text: 'text-purple-600' },
  ]

  // 2. Compute Counselors Lead vs App Data dynamically
  const counselorData = counselors.map(c => {
    // Leads where l.owner matches c.name
    const simplName = c.name.split(' ')[0]
    const cLeads = leads.filter(l => l.owner === c.name || l.owner?.split(' ')[0] === simplName)
    const cApps = applications.filter(app => {
      // Find matching lead to see owner
      const lead = leads.find(l => l.name === app.name)
      return lead && (lead.owner === c.name || lead.owner?.split(' ')[0] === simplName)
    })

    return {
      name: c.name,
      leads: cLeads.length || Math.floor(c.leads / 8), // upscale/fallback
      apps: cApps.length || Math.floor(c.apps / 8)
    }
  })

  // 3. Compute stage distributions dynamically
  const getStageCount = (stage) => leads.filter(l => l.stage === stage).length
  const getStageCountOrAlt = (stage, alt) => leads.filter(l => l.stage === stage || l.stage === alt).length

  const untouchedCount = getStageCount('Untouched')
  const contactedCount = getStageCount('Contacted')
  const interestedCount = getStageCountOrAlt('Interested', 'Qualified Leads')
  const followupCount = getStageCount('Follow Up')
  const convertedCount = getStageCountOrAlt('Converted', 'Qualified Leads')

  const totalStagesSum = untouchedCount + contactedCount + interestedCount + followupCount + convertedCount || 1
  const STAGES_DIST = [
    { stage: 'Untouched',  count: untouchedCount, pct: Math.round((untouchedCount / totalStagesSum) * 100) || 0, color: 'bg-red-400' },
    { stage: 'Contacted',  count: contactedCount, pct: Math.round((contactedCount / totalStagesSum) * 100) || 0, color: 'bg-blue-400' },
    { stage: 'Interested', count: interestedCount, pct: Math.round((interestedCount / totalStagesSum) * 100) || 0, color: 'bg-green-400' },
    { stage: 'Follow Up',  count: followupCount, pct: Math.round((followupCount / totalStagesSum) * 100) || 0, color: 'bg-yellow-400' },
    { stage: 'Converted', count: convertedCount, pct: Math.round((convertedCount / totalStagesSum) * 100) || 0, color: 'bg-emerald-400' },
  ]

  const sortedCounselors = [...counselorData].sort((a, b) => b.leads - a.leads)
  const maxLeads = sortedCounselors[0]?.leads || 1

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
            <select className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer">
              <option>Last 30 Days</option>
              <option>Last 7 Days</option>
              <option>This Month</option>
              <option>This Quarter</option>
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none ${
              activeTab === tab
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

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

      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-gray-800 text-sm md:text-base">User Wise Lead and Application Count</h2>
            <p className="text-xs text-gray-400 mt-0.5">Performance breakdown by counselor</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { value: leadsFilter, setter: setLeadsFilter, opts: ['Leads Assigned', 'Leads Engaged'] },
              { value: appsFilter, setter: setAppsFilter, opts: ['Application Assigned', 'Payment Approved'] },
              { value: countFilter, setter: setCountFilter, opts: ['10 Selected', '5 Selected', 'All'] },
            ].map((f, i) => (
              <div key={i} className="relative">
                <select
                  value={f.value}
                  onChange={e => f.setter(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
                >
                  {f.opts.map(o => <option key={o}>{o}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={counselorData.slice(0, countFilter === '5 Selected' ? 5 : countFilter === '10 Selected' ? 10 : counselorData.length)}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            barCategoryGap="30%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="leads" name="Leads" fill="#003087" radius={[4, 4, 0, 0]} />
            <Bar dataKey="apps"  name="Applications" fill="#f5a623" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Top performers */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Top Performers</h3>
          <div className="space-y-3">
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
                    <div
                      className="bg-primary-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${(c.leads / maxLeads) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stage distribution */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Lead Stage Distribution</h3>
          <div className="space-y-3">
            {STAGES_DIST.map(s => (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="text-xs text-gray-505 w-20 flex-shrink-0 font-medium">{s.stage}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className={`${s.color} h-2 rounded-full transition-all duration-500`} style={{ width: `${s.pct}%` }}></div>
                </div>
                <span className="text-xs font-bold text-gray-700 w-8 text-right">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
