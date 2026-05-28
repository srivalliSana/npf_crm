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

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildMonthlyData(leads, applications) {
  // Group by month using regDate / date fields (format: DD/MM/YYYY or DD/MM/YYYY, HH:MM AM/PM)
  const parseMonth = (dateStr) => {
    if (!dateStr) return null
    // Try DD/MM/YYYY format
    const parts = dateStr.split(/[/,\s]/)
    if (parts.length >= 3) {
      const month = parseInt(parts[1], 10)
      if (month >= 1 && month <= 12) return month - 1 // 0-indexed
    }
    return null
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  // Show last 6 months
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, now.getMonth() - i, 1)
    months.push({ monthIdx: d.getMonth(), label: MONTH_LABELS[d.getMonth()] })
  }

  return months.map(({ monthIdx, label }) => {
    const leadsCount = leads.filter(l => parseMonth(l.regDate) === monthIdx).length
    const appsCount  = applications.filter(a => parseMonth(a.date) === monthIdx).length
    const enrolled   = applications.filter(a =>
      parseMonth(a.date) === monthIdx &&
      (a.stage === 'Enrolment' || a.stage === 'Enrolments')
    ).length
    return { month: label, leads: leadsCount, apps: appsCount, enrolled }
  })
}

const REPORT_TYPES = [
  'Lead Summary', 'Application Summary', 'Conversion Report',
  'Campaign Performance', 'Source Performance', 'Team Productivity',
  'Course-wise Report', 'Payment Report', 'Enrollment Report',
  'Source-to-Enrollment Funnel'
]

export default function Reports() {
  const { leads, applications, payments, campaigns, counselors, showToast } = useCcrm()
  const [activeReport, setActiveReport] = useState('Lead Summary')
  const [dateRange, setDateRange] = useState('Last 30 Days')

  // Build monthly trend from real data
  const monthlyData = buildMonthlyData(leads, applications)

  // 1. Calculate KPI Metrics dynamically
  const totalLeads = leads.length
  const totalApps = applications.length
  const enrolledCount = applications.filter(a => a.stage === 'Enrolment' || a.stage === 'Enrolments').length
  const totalRevenue = payments.filter(p => p.status === 'Approved' || p.status === 'Payment Approved').reduce((s, p) => s + Number(p.amount || 0), 0)

  // 2. Compute dynamic sources
  const allSources = Array.from(new Set(leads.map(l => l.source).filter(Boolean)))
  const sourceData = allSources.map(src => {
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
    { name: 'Contacted',            value: contacted,  fill: '#1d4ed8' },
    { name: 'Interested',           value: interested, fill: '#3b82f6' },
    { name: 'Application Started',  value: started,    fill: '#60a5fa' },
    { name: 'Payment Done',         value: paid,       fill: '#93c5fd' },
    { name: 'Enrolled',             value: enrolled,   fill: '#bfdbfe' },
  ]

  // 4. Compute dynamic courses (from actual application data)
  const allCourses = Array.from(new Set(applications.map(a => a.course).filter(Boolean)))
  const courseData = allCourses.map(c => {
    const cApps = applications.filter(a => a.course === c).length
    const cEnrolled = applications.filter(a => a.course === c && (a.stage === 'Enrolment' || a.stage === 'Enrolments')).length
    const cPaid = payments.filter(p => {
      const app = applications.find(a => a.appNo === p.appNo && a.course === c)
      return app && (p.status === 'Approved' || p.status === 'Payment Approved')
    }).length
    return { course: c, apps: cApps, enrolled: cEnrolled, paid: cPaid }
  }).sort((a, b) => b.apps - a.apps)

  // 5. Campaign performance data (from live campaigns)
  const campaignData = campaigns.map(c => ({
    name: c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name,
    fullName: c.name,
    channel: c.channel,
    budget: Number(c.budget || 0),
    spent: Number(c.spent || 0),
    leads: Number(c.leads || 0),
    conversions: Number(c.conversions || 0),
    roi: c.spent > 0 ? Math.round(((c.conversions * 25000 - c.spent) / c.spent) * 100) : 0,
    cpl: c.leads > 0 ? Math.round(c.spent / c.leads) : 0,
    status: c.status
  }))

  // 6. Team productivity data (from live counselors)
  const teamData = counselors.map(c => ({
    name: c.name.split(' ')[0],
    fullName: c.name,
    leads: c.leads || 0,
    apps: c.apps || 0,
    enrolled: c.enrolled || 0,
    submitted: c.submitted || 0,
    payApproved: c.payApproved || 0,
    convRate: c.leads > 0 ? Math.round((c.apps / c.leads) * 100) : 0,
  })).filter(c => c.leads > 0).sort((a, b) => b.leads - a.leads)

  // 7. Payment breakdown
  const payApproved = payments.filter(p => p.status === 'Approved' || p.status === 'Payment Approved')
  const payPending  = payments.filter(p => p.status === 'Pending')
  const payFailed   = payments.filter(p => p.status === 'Failed')
  const payMethodData = [
    { method: 'Online',  count: payments.filter(p => p.method === 'Online').length,  amount: payments.filter(p => p.method === 'Online').reduce((s,p) => s+Number(p.amount||0), 0) },
    { method: 'Offline', count: payments.filter(p => p.method === 'Offline').length, amount: payments.filter(p => p.method === 'Offline').reduce((s,p) => s+Number(p.amount||0), 0) },
    { method: 'Pending', count: payPending.length, amount: payPending.reduce((s,p) => s+Number(p.amount||0), 0) },
  ].filter(m => m.count > 0)

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

  const renderActiveReport = () => {
    switch (activeReport) {
      case 'Lead Summary':
        return (
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Monthly Lead Trend</h3>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={monthlyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="leadsGradOnly" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#003087" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#003087" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
                  <Area type="monotone" dataKey="leads" name="Leads Registered" stroke="#003087" fill="url(#leadsGradOnly)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      case 'Application Summary':
        return (
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Course-wise Applications Breakdown</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={courseData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="course" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
                  <Bar dataKey="apps" name="Applications Started" fill="#003087" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      case 'Conversion Report':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Monthly Lead &amp; Enrollment Trend</h3>
              <ResponsiveContainer width="100%" height={260}>
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
        )
      case 'Source Performance':
        return (
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Lead Source Distribution</h3>
              <div className="flex items-center gap-8 flex-col md:flex-row">
                <ResponsiveContainer width="100%" height={240} className="md:w-1/2">
                  <PieChart>
                    <Pie data={sourceData} dataKey="leads" nameKey="source" cx="50%" cy="50%" outerRadius={85} innerRadius={45}>
                      {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v.toLocaleString(), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3 w-full">
                  {sourceData.map((s, i) => (
                    <div key={s.source} className="flex items-center justify-between border-b border-gray-50 pb-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-gray-600 font-semibold truncate max-w-40">{s.source}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-medium">{s.leads} leads</span>
                        <span className="text-xs font-bold text-gray-750">{s.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      case 'Campaign Performance':
        return (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Campaign ROI & Lead Generation</h3>
              {campaignData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No campaigns found.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={campaignData} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v, n) => [v.toLocaleString(), n]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
                    <Bar dataKey="leads" name="Leads Generated" fill="#003087" radius={[4,4,0,0]} />
                    <Bar dataKey="conversions" name="Conversions" fill="#f5a623" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full">
                <thead><tr className="bg-gray-50">
                  {['Campaign','Channel','Status','Budget','Spent','Leads','Conv.','CPL','ROI%'].map(h => (
                    <th key={h} className="table-th text-xs">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {campaignData.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50 border-t border-gray-100">
                      <td className="table-td text-xs font-medium text-gray-800 max-w-32 truncate" title={c.fullName}>{c.name}</td>
                      <td className="table-td text-xs text-gray-500">{c.channel}</td>
                      <td className="table-td"><span className={`badge text-[10px] font-bold ${c.status === 'Active' ? 'bg-green-100 text-green-700' : c.status === 'Paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span></td>
                      <td className="table-td text-xs text-gray-600">₹{c.budget.toLocaleString()}</td>
                      <td className="table-td text-xs text-gray-600">₹{c.spent.toLocaleString()}</td>
                      <td className="table-td text-xs font-semibold text-primary-600">{c.leads.toLocaleString()}</td>
                      <td className="table-td text-xs font-semibold text-green-600">{c.conversions}</td>
                      <td className="table-td text-xs text-gray-600">₹{c.cpl.toLocaleString()}</td>
                      <td className="table-td text-xs font-bold text-emerald-600">{c.roi}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )

      case 'Team Productivity':
        return (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Counselor Performance Comparison</h3>
              {teamData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No counselor data found.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={teamData.slice(0, 10)} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v, n) => [v.toLocaleString(), n]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
                    <Bar dataKey="leads" name="Total Leads" fill="#003087" radius={[4,4,0,0]} />
                    <Bar dataKey="apps" name="Applications" fill="#f5a623" radius={[4,4,0,0]} />
                    <Bar dataKey="enrolled" name="Enrolled" fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full">
                <thead><tr className="bg-gray-50">
                  {['Counselor','Leads','Apps','Submitted','Enrolled','Pay Approved','Conv. Rate'].map(h => (
                    <th key={h} className="table-th text-xs">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {teamData.map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50 border-t border-gray-100">
                      <td className="table-td font-semibold text-sm text-gray-800">{c.fullName}</td>
                      <td className="table-td text-xs font-semibold text-primary-600">{c.leads.toLocaleString()}</td>
                      <td className="table-td text-xs text-gray-600">{c.apps}</td>
                      <td className="table-td text-xs text-purple-600 font-medium">{c.submitted}</td>
                      <td className="table-td text-xs font-bold text-emerald-600">{c.enrolled}</td>
                      <td className="table-td text-xs font-bold text-green-600">{c.payApproved}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-12">
                            <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${Math.min(c.convRate, 100)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-700">{c.convRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )

      case 'Course-wise Report':
        return (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Course-wise Applications & Enrollments</h3>
              {courseData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No application data found.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={courseData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="course" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '12px' }} iconType="circle" iconSize={8} />
                    <Bar dataKey="apps" name="Applications" fill="#003087" radius={[0,4,4,0]} />
                    <Bar dataKey="enrolled" name="Enrolled" fill="#10b981" radius={[0,4,4,0]} />
                    <Bar dataKey="paid" name="Payment Approved" fill="#f5a623" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )

      case 'Payment Report':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Payment Status Overview</h3>
              <div className="space-y-3 mt-2">
                {[
                  { label: 'Approved', count: payApproved.length, amount: payApproved.reduce((s,p) => s+Number(p.amount||0),0), color: '#10b981', bg: 'bg-green-50', text: 'text-green-700' },
                  { label: 'Pending',  count: payPending.length,  amount: payPending.reduce((s,p) => s+Number(p.amount||0),0),  color: '#f5a623', bg: 'bg-yellow-50',text: 'text-yellow-700' },
                  { label: 'Failed',   count: payFailed.length,   amount: payFailed.reduce((s,p) => s+Number(p.amount||0),0),   color: '#ef4444', bg: 'bg-red-50',   text: 'text-red-700'   },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between p-3 ${row.bg} rounded-lg`}>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ background: row.color }} />
                      <span className={`text-sm font-semibold ${row.text}`}>{row.label}</span>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${row.text}`}>{row.count} transactions</p>
                      <p className="text-xs text-gray-500">₹{row.amount.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex justify-between text-sm font-bold text-gray-900">
                    <span>Total Collected</span>
                    <span className="text-primary-600">₹{totalRevenue.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Payment Method Breakdown</h3>
              {payMethodData.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No payment data found.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={payMethodData} dataKey="count" nameKey="method" cx="50%" cy="50%" outerRadius={75} innerRadius={40}>
                      {payMethodData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="mt-3 space-y-1.5">
                {payMethodData.map((m, i) => (
                  <div key={m.method} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-600 font-medium">{m.method}</span>
                    </div>
                    <span className="font-semibold text-gray-700">₹{m.amount.toLocaleString()} ({m.count})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent approved payments table */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-800 text-sm">Recent Approved Payments</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="bg-gray-50">
                    {['Student','App No','Amount','Method','Date','Txn ID'].map(h => <th key={h} className="table-th text-xs">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {payApproved.slice(0, 8).map(p => (
                      <tr key={p.id} className="hover:bg-gray-50 border-t border-gray-100">
                        <td className="table-td font-medium text-sm text-gray-800">{p.name}</td>
                        <td className="table-td font-mono text-xs text-gray-600">{p.appNo}</td>
                        <td className="table-td text-sm font-bold text-green-600">₹{Number(p.amount).toLocaleString()}</td>
                        <td className="table-td text-xs text-gray-600">{p.method || '—'}</td>
                        <td className="table-td text-xs text-gray-600">{p.date}</td>
                        <td className="table-td font-mono text-xs text-gray-500">{p.txnId || '—'}</td>
                      </tr>
                    ))}
                    {payApproved.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No approved payments yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )

      case 'Enrollment Report':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Applications',  value: totalApps,    color: 'text-blue-600',   bg: 'bg-blue-50'   },
                { label: 'Payment Approved',     value: paid,          color: 'text-green-600',  bg: 'bg-green-50'  },
                { label: 'Submitted',            value: applications.filter(a => a.stage === 'Application Submitted').length, color: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Enrolled',             value: enrolledCount, color: 'text-emerald-600',bg: 'bg-emerald-50'},
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
                  <div className={`text-2xl font-extrabold ${card.color}`}>{card.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
                  <div className={`w-full mt-2 ${card.bg} h-1.5 rounded-full`}>
                    <div className={`h-1.5 rounded-full ${card.color.replace('text','bg')}`}
                      style={{ width: `${Math.min((card.value / (totalApps || 1)) * 100, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Application Stage Distribution</h3>
              {(() => {
                const stagesMap = {}
                applications.forEach(a => {
                  stagesMap[a.stage] = (stagesMap[a.stage] || 0) + 1
                })
                const stagesArr = Object.entries(stagesMap).map(([stage, count]) => ({ stage, count })).sort((a,b) => b.count - a.count)
                return stagesArr.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No application data found.</p>
                ) : (
                  <div className="space-y-2">
                    {stagesArr.map((s, i) => {
                      const pct = Math.round((s.count / (totalApps || 1)) * 100)
                      return (
                        <div key={s.stage}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600 font-medium">{s.stage}</span>
                            <span className="text-xs font-semibold text-gray-700">{s.count} ({pct}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-4">
                            <div className="h-4 rounded-full transition-all" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        )

      case 'Source-to-Enrollment Funnel':
        return (() => {
          const totalLeadsN = leads.length
          const contacted = leads.filter(l => ['Contacted','Follow Up','Interested','Qualified Leads','Converted'].includes(l.stage)).length
          const appsN = applications.length
          const payApprovedN = payments.filter(p => p.status === 'Approved').length
          const enrolledN = applications.filter(a => a.stage === 'Enrolment' || a.stage === 'Enrolments').length

          const funnelSteps = [
            { stage: 'Total Leads', count: totalLeadsN, color: '#003087' },
            { stage: 'Contacted', count: contacted, color: '#2563eb' },
            { stage: 'Applications', count: appsN, color: '#f5a623' },
            { stage: 'Payment Approved', count: payApprovedN, color: '#10b981' },
            { stage: 'Enrolled', count: enrolledN, color: '#059669' },
          ]

          const sourceBreakdown = allSources.map(src => {
            const srcLeads = leads.filter(l => l.source === src)
            const srcApps = applications.filter(a => srcLeads.some(l => l.name === a.name))
            const srcEnrolled = srcApps.filter(a => a.stage === 'Enrolment' || a.stage === 'Enrolments')
            return { source: src, leads: srcLeads.length, apps: srcApps.length, enrolled: srcEnrolled.length, convRate: srcLeads.length ? ((srcEnrolled.length / srcLeads.length) * 100).toFixed(1) : '0.0' }
          }).sort((a, b) => b.leads - a.leads)

          return (
            <div className="space-y-4">
              {/* Funnel */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 mb-6">Lead to Enrollment Funnel</h3>
                <div className="space-y-2">
                  {funnelSteps.map((step, i) => {
                    const pct = totalLeadsN > 0 ? Math.min((step.count / totalLeadsN) * 100, 100) : 0
                    const dropPct = i > 0 && funnelSteps[i-1].count > 0 ? ((1 - step.count / funnelSteps[i-1].count) * 100).toFixed(0) : null
                    return (
                      <div key={step.stage} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-36 flex-shrink-0 text-right font-medium">{step.stage}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                          <div className="h-8 rounded-full flex items-center pl-3 transition-all" style={{ width: `${Math.max(pct, 3)}%`, background: step.color }}>
                            <span className="text-white text-xs font-bold">{step.count.toLocaleString()}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">{pct.toFixed(0)}%</span>
                        {dropPct && parseInt(dropPct) > 0 && (
                          <span className="text-xs text-red-400 w-16">↓ {dropPct}% lost</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Source breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Source-wise Funnel Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50">
                      {['Source', 'Leads', 'Applications', 'Enrolled', 'Conv. Rate'].map(h => <th key={h} className="table-th">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {sourceBreakdown.map((s, i) => (
                        <tr key={s.source} className="hover:bg-gray-50 border-t border-gray-100">
                          <td className="table-td font-medium text-gray-800">{s.source}</td>
                          <td className="table-td text-primary-600 font-semibold">{s.leads}</td>
                          <td className="table-td text-orange-600">{s.apps}</td>
                          <td className="table-td text-emerald-600 font-bold">{s.enrolled}</td>
                          <td className="table-td">
                            <span className={`font-semibold ${parseFloat(s.convRate) >= 10 ? 'text-green-600' : 'text-orange-500'}`}>{s.convRate}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })()

      default:
        return (
          <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-gray-200 shadow-sm text-center">
            <div className="w-16 h-16 bg-blue-50/50 text-blue-500 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v7m-18 0h18" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-805">No Data Logs Found</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm font-medium">
              There are currently no analytic records compiled under <strong>"{activeReport}"</strong>. Nothing is there to show yet.
            </p>
          </div>
        )
    }
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

      {/* Dynamic Report View Container */}
      <div className="mt-4">
        {renderActiveReport()}
      </div>
    </div>
  )
}
