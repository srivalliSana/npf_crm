import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import { ChevronDown, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react'

const QUICK_VIEWS = [
  'Quick Summary',
  'Lead Summary',
  'Application Summary',
  'Telephony Status',
  'Query Status',
  'Effort Analysis',
]

function BlueNum({ n }) {
  return (
    <button className="text-primary-500 hover:text-primary-700 hover:underline font-semibold focus:outline-none">
      {n}
    </button>
  )
}

export default function ProductivityReport() {
  const { leads, applications, payments, counselors, showToast } = useCcrm()
  const [activeView, setActiveView] = useState('Quick Summary')
  const [dateFilter, setDateFilter] = useState('Last 30 Days')
  const [currentPage, setCurrentPage] = useState(1)

  // 1. Compile REPORT_DATA dynamically
  const REPORT_DATA = counselors.map(c => {
    const simplName = c.name.split(' ')[0]
    
    const assignedLeads = leads.filter(l => l.owner === c.name || l.owner?.split(' ')[0] === simplName).length
    const untouchedCount = leads.filter(l => (l.owner === c.name || l.owner?.split(' ')[0] === simplName) && l.stage === 'Untouched').length
    const engagedCount = assignedLeads - untouchedCount
    
    const assignedApps = applications.filter(app => {
      const lead = leads.find(l => l.name === app.name)
      return lead && (lead.owner === c.name || lead.owner?.split(' ')[0] === simplName)
    }).length

    const approvedCount = payments.filter(p => {
      if (p.status !== 'Approved' && p.status !== 'Payment Approved') return false
      const app = applications.find(a => a.appNo === p.appNo)
      if (!app) return false
      const lead = leads.find(l => l.name === app.name)
      return lead && (lead.owner === c.name || lead.owner?.split(' ')[0] === simplName)
    }).length

    const submittedCount = applications.filter(app => {
      if (app.stage !== 'Application Submitted') return false
      const lead = leads.find(l => l.name === app.name)
      return lead && (lead.owner === c.name || lead.owner?.split(' ')[0] === simplName)
    }).length

    const enrolledCount = applications.filter(app => {
      if (app.stage !== 'Enrolment' && app.stage !== 'Enrolments') return false
      const lead = leads.find(l => l.name === app.name)
      return lead && (lead.owner === c.name || lead.owner?.split(' ')[0] === simplName)
    }).length

    return {
      owner: c.name,
      email: c.email || `${simplName.toLowerCase()}@cutm.ac.in`,
      leadAssigned: assignedLeads || Math.floor(c.leads / 8),
      leadsNotEngaged: untouchedCount || Math.floor(c.untouched / 8),
      leadsEngaged: engagedCount || Math.floor(c.engaged / 8),
      untouched: untouchedCount || Math.floor(c.untouched / 8),
      appAssigned: assignedApps || Math.floor(c.apps / 8),
      payApproved: approvedCount || Math.floor(c.payApproved / 8),
      appSubmitted: submittedCount || Math.floor(c.submitted / 8),
      enrolment: enrolledCount || Math.floor(c.enrolled / 8)
    }
  })

  // 2. Compute TOTALS dynamically
  const TOTALS = REPORT_DATA.reduce((acc, row) => ({
    leadAssigned:    acc.leadAssigned    + row.leadAssigned,
    leadsNotEngaged: acc.leadsNotEngaged + row.leadsNotEngaged,
    leadsEngaged:    acc.leadsEngaged    + row.leadsEngaged,
    untouched:       acc.untouched       + row.untouched,
    appAssigned:     acc.appAssigned     + row.appAssigned,
    payApproved:     acc.payApproved     + row.payApproved,
    appSubmitted:    acc.appSubmitted    + row.appSubmitted,
    enrolment:       acc.enrolment       + row.enrolment,
  }), { leadAssigned: 0, leadsNotEngaged: 0, leadsEngaged: 0, untouched: 0, appAssigned: 0, payApproved: 0, appSubmitted: 0, enrolment: 0 })

  const rowsPerPage = 6
  const totalPages = Math.ceil(REPORT_DATA.length / rowsPerPage) || 1
  const pageData = REPORT_DATA.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  const handleExport = () => {
    const headers = ['Owner Name', 'Email', 'Leads Assigned', 'Leads Engaged', 'Untouched', 'App Assigned', 'Pay Approved', 'App Submitted', 'Enrolment']
    const rows = REPORT_DATA.map(r => [
      r.owner,
      r.email,
      r.leadAssigned,
      r.leadsEngaged,
      r.untouched,
      r.appAssigned,
      r.payApproved,
      r.appSubmitted,
      r.enrolment
    ])
    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(","))].join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `counselor_productivity_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Exported counselor productivity stats.', 'success')
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Productivity Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Counselor-wise performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
            >
              {['Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'This Month'].map(o => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <button onClick={handleExport} className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors focus:outline-none">
            <Download size={14} />
            Export
          </button>
          <button onClick={() => showToast('Re-aggregating counselor telemetry logs...', 'info')} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-500 transition-colors focus:outline-none">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Quick Views */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 overflow-x-auto">
        {QUICK_VIEWS.map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors focus:outline-none ${
              activeView === view
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
        {[
          { label: 'Lead Assigned',    value: TOTALS.leadAssigned,    color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Not Engaged',      value: TOTALS.leadsNotEngaged, color: 'text-red-600',    bg: 'bg-red-50' },
          { label: 'Engaged',          value: TOTALS.leadsEngaged,    color: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Untouched',        value: TOTALS.untouched,       color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'App Assigned',     value: TOTALS.appAssigned,     color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Pay Approved',     value: TOTALS.payApproved,     color: 'text-emerald-600',bg: 'bg-emerald-50' },
          { label: 'App Submitted',    value: TOTALS.appSubmitted,    color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Enrolment',        value: TOTALS.enrolment,       color: 'text-pink-600',   bg: 'bg-pink-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center border border-white shadow-sm`}>
            <div className={`text-xl font-extrabold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5 leading-tight font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-550 font-medium">
            Showing <span className="font-semibold text-gray-700">{REPORT_DATA.length}</span> counselors · {dateFilter}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Owner Name</th>
                <th className="table-th text-center">Lead Assigned</th>
                <th className="table-th text-center">Leads Not Engaged</th>
                <th className="table-th text-center">Leads Engaged Overall</th>
                <th className="table-th text-center">Untouched Stage</th>
                <th className="table-th text-center">Application Assigned</th>
                <th className="table-th text-center">Payment Approved</th>
                <th className="table-th text-center">Application Submitted</th>
                <th className="table-th text-center">Enrolment</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map((row, idx) => (
                <tr key={row.owner} className={`hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                  <td className="table-td">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{row.owner}</p>
                      <p className="text-xs text-gray-400">{row.email}</p>
                    </div>
                  </td>
                  <td className="table-td text-center"><BlueNum n={row.leadAssigned} /></td>
                  <td className="table-td text-center"><BlueNum n={row.leadsNotEngaged} /></td>
                  <td className="table-td text-center"><BlueNum n={row.leadsEngaged} /></td>
                  <td className="table-td text-center"><BlueNum n={row.untouched} /></td>
                  <td className="table-td text-center"><BlueNum n={row.appAssigned} /></td>
                  <td className="table-td text-center"><BlueNum n={row.payApproved} /></td>
                  <td className="table-td text-center"><BlueNum n={row.appSubmitted} /></td>
                  <td className="table-td text-center"><BlueNum n={row.enrolment} /></td>
                </tr>
              ))}

              {/* Totals row */}
              <tr className="bg-primary-50 border-t-2 border-primary-200 font-semibold">
                <td className="table-td text-primary-700 font-bold">Total</td>
                <td className="table-td text-center text-primary-700">{TOTALS.leadAssigned}</td>
                <td className="table-td text-center text-primary-700">{TOTALS.leadsNotEngaged}</td>
                <td className="table-td text-center text-primary-700">{TOTALS.leadsEngaged}</td>
                <td className="table-td text-center text-primary-700">{TOTALS.untouched}</td>
                <td className="table-td text-center text-primary-700">{TOTALS.appAssigned}</td>
                <td className="table-td text-center text-primary-700">{TOTALS.payApproved}</td>
                <td className="table-td text-center text-primary-700">{TOTALS.appSubmitted}</td>
                <td className="table-td text-center text-primary-700">{TOTALS.enrolment}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            Page {currentPage} of {totalPages} · {REPORT_DATA.length} counselors
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                  p === currentPage ? 'bg-primary-500 text-white' : 'hover:bg-gray-200 text-gray-600'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
