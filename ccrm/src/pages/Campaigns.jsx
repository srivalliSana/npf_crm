import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  Plus, Search, Filter, Download, MoreHorizontal,
  TrendingUp, Users, DollarSign, Target, ChevronDown,
  Play, Pause, CheckCircle, BarChart2, X, Save
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts'

const STATUS_COLORS = {
  Active:    { bg: 'bg-green-100',  text: 'text-green-700'  },
  Paused:    { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Completed: { bg: 'bg-gray-100',   text: 'text-gray-600'   },
  Draft:     { bg: 'bg-blue-100',   text: 'text-blue-700'   },
}

const CHANNEL_COLORS = {
  'Facebook Ads': 'bg-blue-500',
  'Google Ads':   'bg-red-500',
  'LinkedIn':     'bg-blue-700',
  'WhatsApp':     'bg-green-500',
  'Offline':      'bg-gray-500',
  'SMS':          'bg-purple-500',
}

const roiData = [
  { month: 'Jan', spend: 80000,  leads: 620,  conversions: 48  },
  { month: 'Feb', spend: 95000,  leads: 780,  conversions: 62  },
  { month: 'Mar', spend: 120000, leads: 1050, conversions: 89  },
  { month: 'Apr', spend: 145000, leads: 1380, conversions: 112 },
  { month: 'May', spend: 160000, leads: 1640, conversions: 138 },
]

export default function Campaigns() {
  const { campaigns, setCampaigns, toggleCampaignStatus, addCampaign, currentUser, showToast, fetchAllData } = useCcrm()

  const resetModule = async () => {
    if (!confirm('⚠️ This will DELETE all campaigns data permanently.\n\nType OK to continue.')) return
    if (prompt('Type "RESET MODULE" to confirm') !== 'RESET MODULE') return showToast('Reset cancelled.', 'info')
    try {
      const res = await fetch('/api/admin/reset-module', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: 'campaigns', confirmPhrase: 'RESET MODULE' })
      })
      if (res.ok) {
        showToast('Campaigns reset — all data cleared', 'success')
        setCampaigns([])
        fetchAllData?.()
      } else {
        const e = await res.json()
        showToast(e.error || 'Reset failed', 'error')
      }
    } catch { showToast('Network error', 'error') }
  }
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    channel: 'Facebook Ads',
    budget: '',
    startDate: '',
    endDate: '',
    status: 'Active'
  })

  const tabs = ['All', 'Active', 'Paused', 'Completed', 'Draft']
  const filtered = campaigns.filter(c =>
    (activeTab === 'All' || c.status === activeTab) &&
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalBudget   = campaigns.reduce((s, c) => s + Number(c.budget || 0), 0)
  const totalSpent    = campaigns.reduce((s, c) => s + Number(c.spent || 0), 0)
  const totalLeads    = campaigns.reduce((s, c) => s + Number(c.leads || 0), 0)
  const totalConv     = campaigns.reduce((s, c) => s + Number(c.conversions || 0), 0)

  const handleCreateCampaign = (e) => {
    e.preventDefault()
    if (!newCampaign.name.trim() || !newCampaign.budget) {
      showToast('Please enter campaign name and budget.', 'error')
      return
    }

    // Format dates 'YYYY-MM-DD' -> 'DD/MM/YYYY'
    const startStr = newCampaign.startDate ? newCampaign.startDate.split('-').reverse().join('/') : new Date().toLocaleDateString('en-IN')
    const endStr = newCampaign.endDate ? newCampaign.endDate.split('-').reverse().join('/') : ''

    addCampaign({
      name: newCampaign.name,
      channel: newCampaign.channel,
      budget: Number(newCampaign.budget),
      status: newCampaign.status,
      spent: 0,
      leads: 0,
      conversions: 0,
      startDate: startStr,
      endDate: endStr
    })

    setShowCreate(false)
    setNewCampaign({
      name: '',
      channel: 'Facebook Ads',
      budget: '',
      startDate: '',
      endDate: '',
      status: 'Active'
    })
  }

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('No campaign records to export.', 'warning')
      return
    }
    const headers = ['Campaign Name', 'Channel', 'Status', 'Budget', 'Spent', 'Leads', 'Conversions', 'Start Date', 'End Date']
    const rows = filtered.map(c => [
      c.name,
      c.channel,
      c.status,
      c.budget,
      c.spent,
      c.leads,
      c.conversions,
      c.startDate,
      c.endDate
    ])
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `campaigns_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Exported campaign analytics to CSV.', 'success')
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campaign Manager</h1>
          <p className="text-sm text-gray-500 mt-0.5">Multi-channel campaign tracking &amp; ROI optimization</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <Download size={14} /> Export
          </button>
          {currentUser?.role === 'Admin' && (
            <button onClick={resetModule}
              className="flex items-center gap-1.5 text-sm text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
              🗑️ Reset Campaigns
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors focus:outline-none"
          >
            <Plus size={14} /> New Campaign
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Budget',      value: `₹${(totalBudget/100000).toFixed(1)}L`,  icon: DollarSign, color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { label: 'Amount Spent',      value: `₹${(totalSpent/100000).toFixed(1)}L`,   icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Total Leads',       value: totalLeads.toLocaleString(),              icon: Users,      color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Conversions',       value: totalConv.toLocaleString(),               icon: Target,     color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon size={20} className={card.color} />
            </div>
            <div className="text-2xl font-extrabold text-gray-900">{card.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* ROI Chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800">Campaign ROI Trend</h2>
            <p className="text-xs text-gray-400 mt-0.5">Monthly spend vs leads vs conversions</p>
          </div>
          <div className="flex items-center gap-2">
            <select className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-600">
              <option>Last 5 Months</option>
              <option>Last 3 Months</option>
              <option>This Year</option>
            </select>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={roiData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
            <Line type="monotone" dataKey="leads"       name="Leads"       stroke="#003087" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="conversions" name="Conversions" stroke="#f5a623" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Campaign list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {tabs.map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none ${activeTab === t ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search campaigns..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 w-48" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Campaign Name','Channel','Status','Budget','Spent','Leads','Conversions','ROI','Period','Actions'].map(h => (
                  <th key={h} className="table-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const roi = c.spent > 0 ? (((c.conversions * 25000 - c.spent) / c.spent) * 100).toFixed(0) : 0
                const sc = STATUS_COLORS[c.status] || STATUS_COLORS.Draft
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td font-semibold text-primary-600">{c.name}</td>
                    <td className="table-td">
                      <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold text-white px-2.5 py-0.5 rounded-full ${CHANNEL_COLORS[c.channel] || 'bg-gray-400'}`}>
                        {c.channel}
                      </span>
                    </td>
                    <td className="table-td">
                      <span className={`badge ${sc.bg} ${sc.text}`}>{c.status}</span>
                    </td>
                    <td className="table-td">₹{c.budget.toLocaleString()}</td>
                    <td className="table-td">₹{c.spent.toLocaleString()}</td>
                    <td className="table-td text-primary-600 font-semibold">{c.leads.toLocaleString()}</td>
                    <td className="table-td text-primary-600 font-semibold">{c.conversions}</td>
                    <td className="table-td">
                      <span className={`font-bold ${Number(roi) > 0 ? 'text-green-600' : 'text-red-500'}`}>{roi}%</span>
                    </td>
                    <td className="table-td text-xs text-gray-500">{c.startDate} – {c.endDate || 'Ongoing'}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-1">
                        {c.status === 'Active' ? (
                          <button onClick={() => toggleCampaignStatus(c.id)} className="p-1 rounded hover:bg-yellow-50 text-yellow-600 focus:outline-none" title="Pause"><Pause size={14} /></button>
                        ) : c.status === 'Paused' ? (
                          <button onClick={() => toggleCampaignStatus(c.id)} className="p-1 rounded hover:bg-green-50 text-green-600 focus:outline-none" title="Resume"><Play size={14} /></button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-gray-400 text-sm">
                    No campaigns found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Campaign Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Create New Campaign</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateCampaign} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Campaign Name *</label>
                <input
                  type="text"
                  required
                  value={newCampaign.name}
                  onChange={e => setNewCampaign(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. CUEE 2026 Summer Drive"
                  className="input-field text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Marketing Channel</label>
                <select
                  value={newCampaign.channel}
                  onChange={e => setNewCampaign(p => ({ ...p, channel: e.target.value }))}
                  className="input-field text-sm"
                >
                  {['Facebook Ads', 'Google Ads', 'LinkedIn', 'WhatsApp', 'SMS'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Budget Allocation (₹) *</label>
                <input
                  type="number"
                  required
                  value={newCampaign.budget}
                  onChange={e => setNewCampaign(p => ({ ...p, budget: e.target.value }))}
                  placeholder="e.g. 150000"
                  className="input-field text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newCampaign.startDate}
                    onChange={e => setNewCampaign(p => ({ ...p, startDate: e.target.value }))}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">End Date</label>
                  <input
                    type="date"
                    value={newCampaign.endDate}
                    onChange={e => setNewCampaign(p => ({ ...p, endDate: e.target.value }))}
                    className="input-field text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 btn-secondary text-sm py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-1.5"
                >
                  <Save size={15} /> Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
