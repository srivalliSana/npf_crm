import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, TrendingUp, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function WebsitesDashboard() {
  const navigate = useNavigate()
  const { showToast } = useCcrm()
  const [stats, setStats] = useState({
    gttech: { total: 0, new: 0, assigned: 0, unassigned: 0 },
    ftl: { total: 0, new: 0, assigned: 0, unassigned: 0 },
    gtib: { total: 0, new: 0, assigned: 0, unassigned: 0 },
    esse: { total: 0, new: 0, assigned: 0, unassigned: 0 }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {}

      const endpoints = ['gttech', 'ftl', 'gtib', 'esse']
      const newStats = { ...stats }

      for (const site of endpoints) {
        const res = await fetch(`/api/${site}-leads?limit=1`, { headers })
        if (res.ok) {
          const data = await res.json()
          const total = data.total || 0

          // Get assigned/unassigned counts
          const assignedRes = await fetch(`/api/${site}-leads?limit=1&owner=!Unassigned`, { headers })
          const unassignedRes = await fetch(`/api/${site}-leads?limit=1&owner=Unassigned`, { headers })

          const assigned = assignedRes.ok ? (await assignedRes.json()).total : 0
          const unassigned = unassignedRes.ok ? (await unassignedRes.json()).total : 0
          const newLeads = total - assigned // Simple heuristic: new = unassigned

          newStats[site] = {
            total,
            new: newLeads,
            assigned,
            unassigned
          }
        }
      }

      setStats(newStats)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
      showToast('Failed to load website stats', 'error')
    } finally {
      setLoading(false)
    }
  }

  const websites = [
    { id: 'gttech', label: 'GTTECH', color: 'from-blue-500 to-blue-600', icon: '🏢' },
    { id: 'ftl', label: 'FTL', color: 'from-green-500 to-green-600', icon: '🌿' },
    { id: 'gtib', label: 'GTIB', color: 'from-purple-500 to-purple-600', icon: '🎓' },
    { id: 'esse', label: 'ESSE', color: 'from-orange-500 to-orange-600', icon: '🌱' }
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Website Leads Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage leads from all website sources</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin">⏳</div>
          <p className="text-gray-500 mt-4">Loading statistics...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {websites.map(site => {
            const data = stats[site.id]
            const assignmentRate = data.total > 0 ? Math.round((data.assigned / data.total) * 100) : 0

            return (
              <div
                key={site.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className={`bg-gradient-to-r ${site.color} h-2`} />

                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="text-4xl">{site.icon}</div>
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">{site.label} Leads</h2>
                        <p className="text-gray-500 text-sm mt-1">Manage and assign leads</p>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(`/${site.id.toLowerCase()}-leads`)}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
                    >
                      Manage
                      <ArrowRight size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-6">
                    {/* Total Leads */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-gray-600 text-sm font-medium">Total Leads</p>
                          <p className="text-2xl font-bold text-gray-900 mt-1">{data.total}</p>
                        </div>
                        <Users className="text-gray-400" size={24} />
                      </div>
                    </div>

                    {/* New Leads */}
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-700 text-sm font-medium">New</p>
                          <p className="text-2xl font-bold text-blue-900 mt-1">{data.new}</p>
                        </div>
                        <TrendingUp className="text-blue-400" size={24} />
                      </div>
                    </div>

                    {/* Assigned */}
                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-700 text-sm font-medium">Assigned</p>
                          <p className="text-2xl font-bold text-green-900 mt-1">{data.assigned}</p>
                        </div>
                        <CheckCircle className="text-green-400" size={24} />
                      </div>
                    </div>

                    {/* Unassigned */}
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-700 text-sm font-medium">Unassigned</p>
                          <p className="text-2xl font-bold text-orange-900 mt-1">{data.unassigned}</p>
                        </div>
                        <AlertCircle className="text-orange-400" size={24} />
                      </div>
                    </div>
                  </div>

                  {/* Assignment Rate */}
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${assignmentRate}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 min-w-12">
                      {assignmentRate}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Assignment Rate</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-12 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 mb-2">💡 Next Step</h3>
        <p className="text-blue-800 text-sm">
          Social Media integration (Facebook, Instagram, LinkedIn) coming soon. These will auto-populate into the main Lead Manager with automatic routing.
        </p>
      </div>
    </div>
  )
}
