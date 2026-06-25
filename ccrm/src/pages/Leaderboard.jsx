import React, { useState, useEffect } from 'react'
import { useCcrm } from '../context/CcrmContext'
import { Trophy, TrendingUp, Phone, Users, Target, Medal, Star, RefreshCw } from 'lucide-react'

const BADGES = [
  { min: 10, label: '🥇 Top Closer', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { min: 5,  label: '🥈 Rising Star', color: 'bg-slate-100 text-slate-800 border-slate-300' },
  { min: 2,  label: '🥉 Performer', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { min: 0,  label: '🌱 Growing', color: 'bg-green-100 text-green-800 border-green-300' },
]

function getBadge(enrolled) {
  return BADGES.find(b => enrolled >= b.min) || BADGES[BADGES.length - 1]
}

export default function Leaderboard() {
  const { currentUser } = useCcrm()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('All Time')
  const [sortBy, setSortBy] = useState('enrolled')

  const fetchLeaderboard = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/leaderboard', { headers: { Authorization: `Bearer ${localStorage.getItem('ccrm_token')}` } })
      if (res.ok) {
        const rows = await res.json()
        setData(rows)
      }
    } catch {
      // Fallback: derive from context
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLeaderboard() }, [])

  const sorted = [...data].sort((a, b) => {
    if (sortBy === 'enrolled') return b.enrolled - a.enrolled || b.converted - a.converted
    if (sortBy === 'leads') return b.leads - a.leads
    if (sortBy === 'convRate') return b.convRate - a.convRate
    if (sortBy === 'calls') return b.calls - a.calls
    return 0
  })

  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="text-yellow-500" size={28} /> Counselor Leaderboard
          </h1>
          <p className="text-slate-500 text-sm mt-1">Live performance rankings — updated in real time</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            {['All Time', 'This Month', 'This Week'].map(p => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="enrolled">Sort: Enrolled</option>
            <option value="leads">Sort: Total Leads</option>
            <option value="convRate">Sort: Conv. Rate</option>
            <option value="calls">Sort: Calls Made</option>
          </select>
          <button
            onClick={fetchLeaderboard}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <RefreshCw size={28} className="animate-spin mr-3" /> Loading leaderboard...
        </div>
      ) : data.length === 0 ? (
        <div className="text-center text-slate-400 py-16">No data available yet.</div>
      ) : (
        <>
          {/* Podium — top 3 */}
          <div className="grid grid-cols-3 gap-4">
            {[1, 0, 2].map(idx => {
              const person = top3[idx]
              if (!person) return <div key={idx} />
              const rank = idx === 0 ? 1 : idx === 1 ? 2 : 3
              const badge = getBadge(person.enrolled)
              const podiumH = rank === 1 ? 'pt-8' : rank === 2 ? 'pt-16' : 'pt-24'
              const ringColor = rank === 1 ? 'ring-yellow-400' : rank === 2 ? 'ring-slate-400' : 'ring-amber-600'
              const bgColor = rank === 1 ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200' : rank === 2 ? 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200' : 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
              return (
                <div key={idx} className={`${podiumH} flex flex-col`}>
                  <div className={`rounded-2xl border p-5 text-center flex flex-col items-center gap-2 shadow-sm ${bgColor}`}>
                    <div className={`w-16 h-16 rounded-full bg-primary-100 ring-4 ${ringColor} flex items-center justify-center text-2xl font-bold text-primary-600`}>
                      {person.name.charAt(0)}
                    </div>
                    <div className="text-3xl font-black">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</div>
                    <h3 className="font-bold text-slate-800 text-sm">{person.name.split(' ')[0]}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.color}`}>{badge.label}</span>
                    <div className="grid grid-cols-2 gap-2 w-full mt-2 text-center">
                      <div className="bg-white/70 rounded-lg p-2">
                        <div className="text-lg font-bold text-primary-600">{person.enrolled}</div>
                        <div className="text-xs text-slate-500">Enrolled</div>
                      </div>
                      <div className="bg-white/70 rounded-lg p-2">
                        <div className="text-lg font-bold text-green-600">{person.convRate}%</div>
                        <div className="text-xs text-slate-500">Conv.</div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Full table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Star size={16} className="text-yellow-500" /> Full Rankings
              </h2>
              <span className="text-xs text-slate-400">{data.length} counselors</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Rank</th>
                    <th className="px-4 py-3 text-left">Counselor</th>
                    <th className="px-4 py-3 text-right">Leads</th>
                    <th className="px-4 py-3 text-right">Converted</th>
                    <th className="px-4 py-3 text-right">Enrolled</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Calls</th>
                    <th className="px-4 py-3 text-right">Conv. Rate</th>
                    <th className="px-4 py-3 text-left">Badge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((person, idx) => {
                    const badge = getBadge(person.enrolled)
                    const isMe = currentUser && (currentUser.name === person.name || currentUser.email === person.email)
                    return (
                      <tr key={person.email} className={`hover:bg-slate-50 transition-colors ${isMe ? 'bg-primary-50' : ''}`}>
                        <td className="px-4 py-3 font-bold text-slate-400">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-sm">
                              {person.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-slate-800">{person.name} {isMe && <span className="text-primary-500 text-xs">(You)</span>}</div>
                              <div className="text-xs text-slate-400">{person.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{person.leads}</td>
                        <td className="px-4 py-3 text-right font-medium text-blue-600">{person.converted}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-green-600 text-base">{person.enrolled}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          ₹{((person.payApproved || 0) * 25000).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{person.calls}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${person.convRate >= 20 ? 'text-green-600' : person.convRate >= 10 ? 'text-blue-600' : 'text-orange-500'}`}>
                            {person.convRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.color}`}>{badge.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Weekly Target widget */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Leads', value: data.reduce((s, d) => s + d.leads, 0), icon: Users, color: 'text-blue-600 bg-blue-50' },
              { label: 'Converted', value: data.reduce((s, d) => s + d.converted, 0), icon: TrendingUp, color: 'text-green-600 bg-green-50' },
              { label: 'Enrolled', value: data.reduce((s, d) => s + d.enrolled, 0), icon: Trophy, color: 'text-yellow-600 bg-yellow-50' },
              { label: 'Total Calls', value: data.reduce((s, d) => s + d.calls, 0), icon: Phone, color: 'text-purple-600 bg-purple-50' },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${stat.color}`}>
                  <stat.icon size={20} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
                  <div className="text-xs text-slate-500">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
