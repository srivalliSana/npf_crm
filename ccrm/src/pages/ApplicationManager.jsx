import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Download, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, MessageCircle, Plus,
  SlidersHorizontal, MoreHorizontal, X, Save
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

const EXAM_OPTIONS = [
  { label: 'CUEE Application 2026', courses: ['B.Tech CSE', 'B.Tech ECE', 'BCA', 'BBA', 'B.Com', 'B.Tech Civil', 'B.Tech Mech'], year: '2026' },
  { label: 'CUEE Application 2025', courses: ['B.Tech CSE', 'B.Tech ECE', 'BCA', 'BBA', 'B.Com'], year: '2025' },
  { label: 'CUTM MBA 2026',         courses: ['MBA', 'MBA (Finance)', 'MBA (Marketing)', 'MBA (HR)'], year: '2026' },
  { label: 'CUTM PhD 2026',         courses: ['M.Tech', 'M.Sc Agriculture (Genetics)', 'M.Sc', 'PhD'], year: '2026' },
]
const QUICK_VIEWS = ['All Applications', 'My Applications', 'Payment Pending', 'Approved', 'Submitted']

export default function ApplicationManager() {
  const navigate = useNavigate()
  const { applications, addApplication, leads, currentUser, showToast } = useCcrm()

  const [selectedRows, setSelectedRows] = useState([])
  const [exam, setExam] = useState('CUEE Application 2026')
  const selectedExamObj = EXAM_OPTIONS.find(e => e.label === exam) || EXAM_OPTIONS[0]
  const [quickView, setQuickView] = useState('All Applications')
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ payStatus: '', owner: '', appStage: '', formStatus: '' })

  // Add application modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [chooseLeadId, setChooseLeadId] = useState('')
  const [newApp, setNewApp] = useState({
    name: '',
    email: '',
    mobile: '',
    campus: 'Bhubaneswar',
    course: 'B.Tech CSE',
    formStatus: 'Complete',
    payStatus: 'Payment Pending',
    payMethod: 'Online',
    stage: 'Application Started'
  })

  const rowsPerPage = 10

  const handleLeadSelect = (leadId) => {
    setChooseLeadId(leadId)
    if (!leadId) {
      setNewApp(p => ({ ...p, name: '', email: '', mobile: '' }))
      return
    }
    const lead = leads.find(l => l.id === parseInt(leadId))
    if (lead) {
      setNewApp(p => ({
        ...p,
        name: lead.name,
        email: lead.email,
        mobile: lead.mobile
      }))
    }
  }

  // 1. Quick View filters
  const matchQuickView = (app) => {
    if (quickView === 'All Applications') return true
    if (quickView === 'My Applications') {
      // Simplistic counselor assignment match on name
      const simplifiedCns = currentUser?.name?.split(' ')[0]
      // We can also find if there's a matching lead with owner
      const matchingLead = leads.find(l => l.name === app.name)
      if (matchingLead) {
        return matchingLead.owner?.toLowerCase().includes(simplifiedCns?.toLowerCase() || '')
      }
      return false
    }
    if (quickView === 'Payment Pending') return app.payStatus === 'Payment Pending'
    if (quickView === 'Approved') return app.payStatus === 'Approved' || app.payStatus === 'Payment Approved'
    if (quickView === 'Submitted') return app.stage === 'Application Submitted'
    return true
  }

  // 2. Select Filter options
  const matchSelectFilters = (app) => {
    if (filters.payStatus && app.payStatus !== filters.payStatus) return false
    if (filters.formStatus && app.formStatus !== filters.formStatus) return false
    if (filters.appStage && app.stage !== filters.appStage) return false
    
    if (filters.owner) {
      // Find lead to match owner counselor
      const lead = leads.find(l => l.name === app.name)
      if (!lead || lead.owner !== filters.owner) return false
    }
    return true
  }

  const filtered = applications.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
                          a.appNo.toLowerCase().includes(search.toLowerCase()) ||
                          a.email.toLowerCase().includes(search.toLowerCase()) ||
                          a.mobile.toLowerCase().includes(search.toLowerCase())

    // Exam/application type filter — match course to selected exam bucket
    const matchesExam = selectedExamObj.courses.some(c =>
      a.course?.toLowerCase().includes(c.toLowerCase()) ||
      c.toLowerCase().includes(a.course?.toLowerCase() || '')
    )

    return matchesSearch && matchesExam && matchQuickView(a) && matchSelectFilters(a)
  })

  const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1
  const pageData = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  const toggleRow = (id) => setSelectedRows(prev =>
    prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
  )
  
  const toggleAll = () => {
    if (selectedRows.length === pageData.length) setSelectedRows([])
    else setSelectedRows(pageData.map(r => r.id))
  }

  const formStatusBadge = (s) => s === 'Complete'
    ? 'bg-green-100 text-green-700'
    : 'bg-orange-100 text-orange-700'

  const payStatusBadge = (s) => (s === 'Approved' || s === 'Payment Approved')
    ? 'bg-green-100 text-green-700'
    : s === 'Failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'

  const payMethodBadge = (s) => {
    if (!s) return 'bg-gray-100 text-gray-500'
    return s === 'Online' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
  }

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('No applications available to export.', 'warning')
      return
    }
    const headers = ['Name', 'Application No', 'Email', 'Mobile', 'Form Status', 'Payment Status', 'Payment Method', 'Campus', 'Course', 'Stage']
    const rows = filtered.map(a => [
      a.name,
      a.appNo,
      a.email,
      a.mobile,
      a.formStatus,
      a.payStatus,
      a.payMethod || 'None',
      a.campus || 'Bhubaneswar',
      a.course || 'B.Tech CSE',
      a.stage
    ])
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(","))].join("\n")
      
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `ccrm_applications_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast(`Successfully exported ${filtered.length} applications to CSV.`, 'success')
  }

  const handleCreateApplication = (e) => {
    e.preventDefault()
    if (!newApp.name || !newApp.email || !newApp.mobile) {
      showToast('Please select a student lead or fill required fields.', 'error')
      return
    }

    const appNo = `CUEE2026${Math.floor(10000 + Math.random() * 90000)}`
    addApplication({
      ...newApp,
      appNo
    })

    setShowAddModal(false)
    setChooseLeadId('')
    setNewApp({
      name: '',
      email: '',
      mobile: '',
      campus: 'Bhubaneswar',
      course: 'B.Tech CSE',
      formStatus: 'Complete',
      payStatus: 'Payment Pending',
      payMethod: 'Online',
      stage: 'Application Started'
    })
  }

  // Derive dynamic filters
  const stageOptions = Array.from(new Set(applications.map(a => a.stage))).filter(Boolean)
  const ownerOptions = Array.from(new Set(leads.map(l => l.owner))).filter(Boolean)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Application Manager</h1>
          {/* Exam/Application-type selector */}
          <div className="relative flex items-center gap-2">
            <div className="relative">
              <select
                value={exam}
                onChange={e => { setExam(e.target.value); setCurrentPage(1); }}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-primary-300 rounded-lg bg-primary-50 text-primary-700 font-medium focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
              >
                {EXAM_OPTIONS.map(o => {
                  const cnt = applications.filter(a =>
                    o.courses.some(c =>
                      a.course?.toLowerCase().includes(c.toLowerCase()) ||
                      c.toLowerCase().includes(a.course?.toLowerCase() || '')
                    )
                  ).length
                  return <option key={o.label} value={o.label}>{o.label} ({cnt})</option>
                })}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-500 pointer-events-none" />
            </div>
          </div>
          {/* Quick views */}
          <div className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-lg p-1">
            {QUICK_VIEWS.map(v => (
              <button
                key={v}
                onClick={() => { setQuickView(v); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  quickView === v ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <Download size={14} />
            Export
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={14} />
            Add Application
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search applications by student name, app no, email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
          </div>

          {[
            { label: 'Payment Status', key: 'payStatus', opts: ['Approved', 'Payment Approved', 'Payment Pending', 'Failed'] },
            { label: 'Application Owner', key: 'owner', opts: ownerOptions },
            { label: 'Application Stage', key: 'appStage', opts: stageOptions },
            { label: 'Form Status', key: 'formStatus', opts: ['Complete', 'Incomplete'] },
          ].map(f => (
            <div key={f.key} className="relative">
              <select
                value={filters[f.key]}
                onChange={e => { setFilters(prev => ({ ...prev, [f.key]: e.target.value })); setCurrentPage(1); }}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
              >
                <option value="">{f.label}</option>
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          ))}

          <button
            onClick={() => { setFilters({ payStatus: '', owner: '', appStage: '', formStatus: '' }); setSearch('') }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
          >
            <RefreshCw size={13} />
            Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            Showing <span className="font-semibold text-gray-700">{filtered.length}</span> applications
            {selectedRows.length > 0 && (
              <span className="ml-2 text-primary-600 font-medium">· {selectedRows.length} selected</span>
            )}
          </span>
          <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <MoreHorizontal size={14} />
            Actions
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th w-10">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === pageData.length && pageData.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-primary-500"
                  />
                </th>
                <th className="table-th">Registered Name</th>
                <th className="table-th">Application No</th>
                <th className="table-th">Registered Email</th>
                <th className="table-th">Registered Mobile</th>
                <th className="table-th">Form Status</th>
                <th className="table-th">Payment Status</th>
                <th className="table-th">Payment Method</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map(app => (
                <tr
                  key={app.id}
                  className="hover:bg-blue-50/30 transition-colors cursor-pointer border-l-4 border-primary-400"
                  onClick={() => navigate(`/applications/${app.id}`)}
                >
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(app.id)}
                      onChange={() => toggleRow(app.id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-500"
                    />
                  </td>
                  <td className="table-td">
                    <span className="text-primary-500 hover:text-primary-700 font-medium hover:underline">
                      {app.name}
                    </span>
                  </td>
                  <td className="table-td">
                    <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                      {app.appNo}
                    </span>
                  </td>
                  <td className="table-td text-gray-600">{app.email}</td>
                  <td className="table-td">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-700">{app.mobile}</span>
                      <a
                        href={`https://wa.me/91${app.mobile}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-green-500 hover:text-green-600"
                        title="WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </a>
                    </div>
                  </td>
                  <td className="table-td">
                    <span className={`badge ${formStatusBadge(app.formStatus)}`}>{app.formStatus}</span>
                  </td>
                  <td className="table-td">
                    <span className={`badge ${payStatusBadge(app.payStatus)}`}>{app.payStatus}</span>
                  </td>
                  <td className="table-td">
                    <span className={`badge ${payMethodBadge(app.payMethod)}`}>{app.payMethod || 'None'}</span>
                  </td>
                </tr>
              ))}
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">
                    No applications found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            Page {currentPage} of {totalPages} · {filtered.length} total records
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

      {/* Add Application Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="text-primary-500" size={20} />
                Create Student Application
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateApplication} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Link with Existing Lead (Optional)</label>
                <select
                  value={chooseLeadId}
                  onChange={e => handleLeadSelect(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="">-- Create custom student / Enter below --</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.email})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Student Name *</label>
                  <input
                    type="text"
                    required
                    value={newApp.name}
                    onChange={e => setNewApp(p => ({ ...p, name: e.target.value }))}
                    placeholder="Enter student name"
                    className="input-field text-sm"
                    disabled={!!chooseLeadId}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={newApp.email}
                    onChange={e => setNewApp(p => ({ ...p, email: e.target.value }))}
                    placeholder="student@example.com"
                    className="input-field text-sm"
                    disabled={!!chooseLeadId}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    value={newApp.mobile}
                    onChange={e => setNewApp(p => ({ ...p, mobile: e.target.value }))}
                    placeholder="e.g. 9876543210"
                    className="input-field text-sm"
                    disabled={!!chooseLeadId}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Campus of Choice</label>
                  <select
                    value={newApp.campus}
                    onChange={e => setNewApp(p => ({ ...p, campus: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {['Bhubaneswar', 'Paralakhemundi', 'Vizianagaram', 'Rayagada', 'Balasore'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Course Applied For</label>
                  <select
                    value={newApp.course}
                    onChange={e => setNewApp(p => ({ ...p, course: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {['B.Tech CSE', 'B.Tech ECE', 'B.Tech Civil', 'B.Tech Mech', 'MBA', 'MBA (Finance)', 'MBA (Marketing)', 'MBA (HR)', 'BCA', 'BBA', 'B.Com', 'M.Sc Agriculture (Genetics)', 'M.Tech', 'PhD'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Form Status</label>
                  <select
                    value={newApp.formStatus}
                    onChange={e => setNewApp(p => ({ ...p, formStatus: e.target.value }))}
                    className="input-field text-sm"
                  >
                    <option value="Complete">Complete</option>
                    <option value="Incomplete">Incomplete</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Payment Status</label>
                  <select
                    value={newApp.payStatus}
                    onChange={e => setNewApp(p => ({ ...p, payStatus: e.target.value }))}
                    className="input-field text-sm"
                  >
                    <option value="Payment Pending">Payment Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Payment Method</label>
                  <select
                    value={newApp.payMethod}
                    onChange={e => setNewApp(p => ({ ...p, payMethod: e.target.value }))}
                    className="input-field text-sm"
                  >
                    <option value="">None / Pending</option>
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 btn-secondary py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-1.5"
                >
                  <Save size={16} />
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
