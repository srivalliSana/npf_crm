import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area
} from 'recharts'
import { Download } from 'lucide-react'
import { Users, FileText, TrendingUp, DollarSign } from 'lucide-react'

const COLORS = ['#003087','#f5a623','#10b981','#ef4444','#8b5cf6','#06b6d4']

const monthlyData = [
  { month: 'Jan', leads: 420,  apps: 180, enrolled: 45  },
  { month: 'Feb', leads: 580,  apps: 240, enrolled: 62  },
  { month: 'Mar', leads: 720,  apps: 310, enrolled: 88  },
  { month: 'Apr', leads: 890,  apps: 380, enrolled: 105 },
  { month: 'May', leads: 1050, apps: 450, enrolled: 128 },
]

const REPORT_TYPES = [
  'Lead Summary', 'Application Summary', 'Conversion Report',
  'Campaign Performance', 'Source Performance', 'Team Productivity',
  'Course-wise Report', 'Payment Report', 'Enrollment Report'
]

export default function Reports() {
  const { leads, applications, payments, showToast } = useCcrm()
  const [activeReport, setActiveReport] = useState('Lead Summary')
  const [dateRange, setDateRange] = useState('Last 30 Days')

  // 1. Calculate KPI Metrics dynamically
  const totalLeads = leads.length
  const totalApps = applications.length
  const enrolledCount = applications.filter(a => a.stage === 'Enrolment' || a.stage === 'Enrolments').length
  const totalRevenue = payments.filter(p => p.status === 'Approved' || p.status === 'Payment Approved').reduce((s, p) => s + Number(p.amount || 0), 0)

  // 2. Compute dynamic sources
  const leadSources = ['Facebook Ads', 'Google Ads', 'LinkedIn', 'WhatsApp', 'Referral', 'Walk-in', 'Website', 'SMS Campaign']
  const sourceData = leadSources.map(src => {
    const count = leads.filter(l => l.source === src).length
    return {
      source: src,
      leads: count,
      pct: Math.round((count / (leads.length || 1)) * 100)
    }
  }).filter(s => s.leads > 0).sort((a, b) => b.leads - a.leads)

  // 3. Compute dynamic funnel
  const contacted = leads.filter(l => l.stage !== 'Untouched').length
  const interested = leads.filter(l => l.stage === 'Interested' || l.stage === 'Qualified Leads').length
  const started = applications.length
  const paid = payments.filter(p => p.status === 'Approved' || p.status === 'Payment Approved').length
  const enrolled = enrolledCount

  const funnelData = [
    { name: 'Total Leads',          value: totalLeads, fill: '#003087' },
    { name: 'Contacted',            value: contacted, fill: '#1d4ed8' },
    { name: 'Interested',           value: interested, fill: '#3b82f6' },
    { name: 'Application Started',  value: started, fill: '#60a5fa' },
    { name: 'Payment Done',         value: paid,  fill: '#93c5fd' },
    { name: 'Enrolled',             value: enrolled,  fill: '#bfdbfe' },
  ]

  // 4. Compute dynamic courses
  const courses = ['B.Tech CSE', 'MBA', 'B.Tech ECE', 'BCA', 'M.Tech', 'B.Com']
  const courseData = courses.map(c => {
    const cApps = applications.filter(a => a.course === c).length
    const cEnrolled = applications.filter(a => a.course === c && (a.stage === 'Enrolment' || a.stage === 'Enrolments')).length
    return {
      course: c,
      apps: cApps,
      enrolled: cEnrolled
    }
  })

  const handleExport = () => {
    showToast('Preparing custom PDF and CSV report bundle for ' + activeReport + '...', 'info')
    setTimeout(() => {
      const headers = ['Metric', 'Total Count']
      const rows = [
        ['Total Leads', totalLeads],
        ['Applications Received', totalApps],
        ['Student Enrollments', enrolledCount],
        ['Gross Revenue Collected', totalRevenue]
      ]
      const csvContent = "data:text/csv;charset=utf-8,"
        + [headers.join(','), ...rows.map(e => e.map(val => `"${val.toString()}"`).join(","))].join("\n")
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `ccrm_executive_report_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast('Successfully exported ' + activeReport + ' to CSV.', 'success')
    }, 1000)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports &amp; Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Comprehensive business intelligence &amp; performance insights</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={dateRange} onChange={e => setDateRange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400">
            {['Last 7 Days','Last 30 Days','Last 3 Months','This Year'].map(o => <option key={o}>{o}</option>)}
          </select>
          <button onClick={handleExport} className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Leads',       value: totalLeads.toLocaleString(), change: '+18%', icon: Users,      color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { label: 'Applications',      value: totalApps.toLocaleString(), change: '+12%', icon: FileText,   color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Enrollments',       value: enrolledCount.toLocaleString(),   change: '+8%',  icon: TrendingUp, color: 'text-green-600',  bg: 'bg-green-50'  },
          { label: 'Gross Revenue',     value: `₹${(totalRevenue/100000).toFixed(1)}L`,  change: '+22%', icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                <card.icon size={20} className={card.color} />
              </div>
              <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full select-none">{card.change}</span>
            </div>
            <div className="text-2xl font-extrabold text-gray-900">{card.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Report type tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {REPORT_TYPES.map(r => (
          <button key={r} onClick={() => setActiveReport(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none ${activeReport === r ? 'bg-primary-500 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {r}
          </button>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Monthly trend */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Monthly Lead &amp; Enrollment Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#003087" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#003087" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f5a623" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f5a623" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
              <Area type="monotone" dataKey="leads" name="Leads" stroke="#003087" fill="url(#leadsGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="enrolled" name="Enrolled" stroke="#f5a623" fill="url(#enrollGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Lead source pie */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Lead Source Distribution</h3>
          <div className="flex items-center gap-4 flex-col sm:flex-row">
            <ResponsiveContainer width="100%" height={200} className="sm:w-1/2">
              <PieChart>
                <Pie data={sourceData} dataKey="leads" nameKey="source" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                  {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v.toLocaleString(), n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2 w-full">
              {sourceData.slice(0, 5).map((s, i) => (
                <div key={s.source} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-gray-600 font-medium truncate max-w-28">{s.source}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Course-wise */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Course-wise Applications vs Enrollments</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={courseData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="course" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
              <Bar dataKey="apps" name="Applications" fill="#003087" radius={[0, 4, 4, 0]} />
              <Bar dataKey="enrolled" name="Enrolled" fill="#f5a623" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Conversion funnel */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Enrollment Conversion Funnel</h3>
          <div className="space-y-2 mt-2">
            {funnelData.map((stage, i) => {
              const pct = Math.round((stage.value / (funnelData[0].value || 1)) * 100)
              return (
                <div key={stage.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 font-medium">{stage.name}</span>
                    <span className="text-xs font-semibold text-gray-700">{stage.value.toLocaleString()} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-5 relative overflow-hidden">
                    <div className="h-5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: stage.fill }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
