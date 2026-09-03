import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Download, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, MessageCircle, Plus,
  X, Save, Trash2, Edit2, Mail, Eye, Link as LinkIcon, Copy
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'
import PageContainer from '../components/PageContainer'
import { Card, Modal, Button } from '../components/ui'

// Tenant-specific exam/program options
const TENANT_EXAM_OPTIONS = {
  cuedu: [
    { label: 'All Programs', courses: [], year: 'all' },
    { label: 'Undergraduate', courses: ['BBA', 'BCA', 'BCOM'], year: 'all' },
    { label: 'Postgraduate', courses: ['MBA', 'MCA', 'MSc (Maths)'], year: 'all' },
  ],
  default: [
    { label: 'All Programs',          courses: [],   year: 'all' },
    { label: 'CUEE Application 2026', courses: ['B.Tech CSE', 'B.Tech ECE', 'BCA', 'BBA', 'B.Com', 'B.Tech Civil', 'B.Tech Mech'], year: '2026' },
    { label: 'CUEE Application 2025', courses: ['B.Tech CSE', 'B.Tech ECE', 'BCA', 'BBA', 'B.Com'], year: '2025' },
    { label: 'CUTM MBA 2026',         courses: ['MBA', 'MBA (Finance)', 'MBA (Marketing)', 'MBA (HR)'], year: '2026' },
    { label: 'CUTM PhD 2026',         courses: ['M.Tech', 'M.Sc Agriculture (Genetics)', 'M.Sc', 'PhD'], year: '2026' },
  ]
}

const QUICK_VIEWS = ['All Applications', 'My Applications', 'Payment Pending', 'Approved', 'Submitted']

export default function ApplicationManager() {
  const navigate = useNavigate()
  const { applications, addApplication, updateApplication, deleteApplication, leads, currentUser, showToast, generatePaymentLink, payments, tenantConfig } = useCcrm()

  // Get tenant-specific exam options (from context or URL slug)
  let tenantName = tenantConfig?.name?.toLowerCase().replace(/\s+/g, '') || ''
  let tenantSlug = tenantConfig?.slug?.toLowerCase() || ''

  // Fallback: extract tenant slug from URL (e.g., /cuedu/applications → cuedu)
  if (!tenantSlug) {
    const pathParts = window.location.pathname.split('/')
    if (pathParts.length > 1 && pathParts[1]) {
      tenantSlug = pathParts[1]
    }
  }

  // Use slug first (more reliable), then name, then default
  const configKey = tenantSlug || tenantName || 'default'
  const EXAM_OPTIONS = TENANT_EXAM_OPTIONS[configKey] || TENANT_EXAM_OPTIONS.default

  const [selectedRows, setSelectedRows] = useState([])
  const [exam, setExam] = useState('All Programs')
  const selectedExamObj = EXAM_OPTIONS.find(e => e.label === exam) || EXAM_OPTIONS[0]
  const [quickView, setQuickView] = useState('All Applications')
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ payStatus: '', owner: '', appStage: '', formStatus: '' })

  // Default course for new applications based on tenant
  const defaultCourse = (tenantSlug === 'cuedu' || tenantName === 'cuedu') ? 'BBA' : 'B.Tech CSE'
  const defaultCampus = (tenantSlug === 'cuedu' || tenantName === 'cuedu') ? 'Online' : 'Bhubaneswar'

  // Add application modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [chooseLeadId, setChooseLeadId] = useState('')
  const [newApp, setNewApp] = useState({
    name: '',
    email: '',
    mobile: '',
    campus: defaultCampus,
    course: defaultCourse,
    formStatus: 'Complete',
    payStatus: 'Payment Pending',
    payMethod: 'Online',
    stage: 'Application Started'
  })

  // Edit modal state
  const [editApp, setEditApp]         = useState(null) // app being edited
  const [editForm, setEditForm]       = useState({})
  const [editSaving, setEditSaving]   = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // app id to delete

  // Payment link modal
  const [linkApp, setLinkApp]       = useState(null)  // app for which link is being generated
  const [payAmount, setPayAmount]   = useState('25000')
  const [payMode, setPayMode]       = useState('Online')   // Online | Offline
  const [linkResult, setLinkResult] = useState(null)       // { paymentLink, offlineRef }
  const [linkLoading, setLinkLoading] = useState(false)
  const [offlineUtr, setOfflineUtr] = useState('')

  const handleGenerateLink = async () => {
    if (!linkApp) return
    setLinkLoading(true)
    try {
      if (payMode === 'Online') {
        const result = await generatePaymentLink(linkApp.appNo, linkApp.name, linkApp.email, linkApp.mobile, Number(payAmount))
        if (result?.paymentLink) {
          setLinkResult({ ...result, mode: 'Online' })
          showToast(`Razorpay link generated for ${linkApp.appNo}`, 'success')
        } else {
          showToast('Razorpay link generation failed — check integration.', 'error')
        }
      } else {
        // Offline — show UTR entry form
        setLinkResult({ mode: 'Offline', appNo: linkApp.appNo, amount: payAmount })
      }
    } catch { showToast('Failed to generate.', 'error') }
    setLinkLoading(false)
  }

  const handleSubmitOfflineUtr = async () => {
    if (!offlineUtr.trim()) return showToast('Please enter UTR / reference number.', 'error')
    try {
      // Find pending payment for this app — read from already-authenticated context state
      const payment = payments?.find(p => p.appNo === linkApp.appNo && p.status === 'Pending')
      const paymentId = payment?.id

      if (paymentId) {
        const res = await fetch(`/api/payments/${paymentId}/submit-utr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ utrNumber: offlineUtr.trim(), payMode: 'offline' })
        })
        if (res.ok) {
          showToast(`UTR submitted — application marked as Payment Done`, 'success')
          // Refresh applications
          await updateApplication(linkApp.id, { payStatus: 'Payment Done', payMethod: 'Offline' })
        } else {
          showToast('UTR submission failed.', 'error')
        }
      } else {
        // No payment row yet — update application directly
        await updateApplication(linkApp.id, { payStatus: 'Payment Done', payMethod: 'Offline' })
        showToast(`UTR ${offlineUtr} recorded`, 'success')
      }
      setLinkApp(null); setLinkResult(null); setOfflineUtr('')
    } catch { showToast('Network error — try again.', 'error') }
  }

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text)
    showToast('Copied to clipboard!', 'success')
  }

  const rowsPerPage = 10

  const handleOpenEdit = (e, app) => {
    e.stopPropagation()
    setEditApp(app)
    setEditForm({
      name: app.name, email: app.email, mobile: app.mobile,
      campus: app.campus || 'Bhubaneswar', course: app.course || 'B.Tech CSE',
      formStatus: app.formStatus, payStatus: app.payStatus,
      payMethod: app.payMethod || '', stage: app.stage
    })
  }

  const handleSaveEdit = async () => {
    setEditSaving(true)
    await updateApplication(editApp.id, { ...editForm, appNo: editApp.appNo })
    setEditSaving(false)
    setEditApp(null)
  }

  const handleConfirmDelete = async () => {
    await deleteApplication(deleteConfirm)
    setDeleteConfirm(null)
  }

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

    // Exam/application type filter — bypass when "All Programs" selected
    const matchesExam = selectedExamObj.year === 'all' || selectedExamObj.courses.length === 0
      ? true
      : selectedExamObj.courses.some(c =>
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
    ? 'bg-success-100 text-success-700'
    : 'bg-warning-100 text-warning-700'

  const payStatusBadge = (s) => (s === 'Approved' || s === 'Payment Approved')
    ? 'bg-success-100 text-success-700'
    : s === 'Failed' ? 'bg-danger-100 text-danger-700' : 'bg-warning-100 text-warning-700'

  const payMethodBadge = (s) => {
    if (!s) return 'bg-gray-100 text-gray-500'
    return s === 'Online' ? 'bg-info-100 text-info-700' : 'bg-purple-100 text-purple-700'
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
    <PageContainer
      title="Application Manager"
      action={(
        <>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExport}>Export</Button>
          <Button size="sm" icon={Plus} onClick={() => setShowAddModal(true)}>Add Application</Button>
        </>
      )}
    >
      {/* Exam/Application-type selector + quick views */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <select
            value={exam}
            onChange={e => { setExam(e.target.value); setCurrentPage(1); }}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-primary-300 rounded-lg bg-primary-50 text-primary-700 font-medium focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
          >
            {EXAM_OPTIONS.map(o => {
              // "All Programs" → total count; other options → matching course count
              const cnt = o.year === 'all' || o.courses.length === 0
                ? applications.length
                : applications.filter(a =>
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
        {/* Quick views */}
        <div className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-lg p-1">
          {QUICK_VIEWS.map(v => (
            <button
              key={v}
              onClick={() => { setQuickView(v); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                quickView === v ? 'bg-white text-primary-600 shadow-soft' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <Card className="p-3 mb-4">
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
      </Card>

      {/* Table */}
      <Card padding={false} className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            Showing <span className="font-semibold text-gray-700">{filtered.length}</span> applications
            {selectedRows.length > 0 && (
              <span className="ml-2 text-primary-600 font-medium">· {selectedRows.length} selected</span>
            )}
          </span>
          <span className="text-xs text-gray-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
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
                <th className="table-th">Application ID</th>
                <th className="table-th">Student Name</th>
                <th className="table-th">Course</th>
                <th className="table-th">Email / Mobile</th>
                <th className="table-th">Form Status</th>
                <th className="table-th">Payment Status</th>
                <th className="table-th w-28">Actions</th>
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
                  {/* Application ID — highlighted */}
                  <td className="table-td">
                    <span className="font-mono text-xs font-bold text-success-700 bg-success-50 border border-success-200 px-2 py-0.5 rounded select-all">
                      {app.appNo}
                    </span>
                  </td>
                  {/* Student name */}
                  <td className="table-td">
                    <span className="text-primary-500 hover:text-primary-700 font-medium hover:underline">
                      {app.name}
                    </span>
                  </td>
                  {/* Course */}
                  <td className="table-td text-xs text-gray-600">{app.course || '—'}</td>
                  {/* Email + Mobile + WA */}
                  <td className="table-td">
                    <div className="text-xs text-gray-600 truncate max-w-36">{app.email}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-500">{app.mobile}</span>
                      <a href={`https://wa.me/91${app.mobile}`} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()} className="text-green-500 hover:text-green-600" title="WhatsApp">
                        <MessageCircle size={12} />
                      </a>
                    </div>
                  </td>
                  <td className="table-td">
                    <span className={`badge ${formStatusBadge(app.formStatus)}`}>{app.formStatus}</span>
                  </td>
                  {/* Payment Status — yellow highlight for pending */}
                  <td className="table-td">
                    <span className={`badge font-semibold ${payStatusBadge(app.payStatus)} ${app.payStatus === 'Payment Pending' ? 'ring-1 ring-warning-400' : ''}`}>
                      {app.payStatus}
                    </span>
                  </td>
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {/* Generate Payment Link — only when Payment Pending */}
                      {(app.payStatus === 'Payment Pending' || app.payStatus === 'Pending') && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setLinkApp(app); setLinkResult(null); setPayAmount('25000'); setPayMode('Online'); setOfflineUtr('')
                          }}
                          className="p-1.5 rounded hover:bg-warning-50 text-warning-500 hover:text-warning-600 border border-warning-200"
                          title="Generate Payment Link"
                        >
                          <LinkIcon size={14} />
                        </button>
                      )}
                      {/* View */}
                      <button
                        onClick={() => navigate(`/applications/${app.id}`)}
                        className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500"
                        title="View profile"
                      >
                        <Eye size={14} />
                      </button>
                      {/* Mail */}
                      <a
                        href={`mailto:${app.email}`}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded hover:bg-purple-50 text-gray-400 hover:text-purple-500"
                        title="Send email"
                      >
                        <Mail size={14} />
                      </a>
                      {/* Send Admission Details */}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          const token = localStorage.getItem('ccrm_token')
                          const email = app.email || prompt('Enter student email:')
                          if (!email) return
                          fetch(`/api/applications/${app.id}/send-admission-details`, {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${token}`,
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ email })
                          })
                            .then(r => r.json())
                            .then(d => {
                              if (d.success) alert(`Email sent to ${email}`)
                              else alert('Error: ' + d.error)
                            })
                            .catch(e => alert('Failed: ' + e.message))
                        }}
                        className="p-1.5 rounded hover:bg-purple-50 text-gray-400 hover:text-purple-600"
                        title="Send admission details form"
                      >
                        <Mail size={14} />
                      </button>
                      {/* Edit */}
                      <button
                        onClick={e => handleOpenEdit(e, app)}
                        className="p-1.5 rounded hover:bg-yellow-50 text-gray-400 hover:text-yellow-600"
                        title="Edit application"
                      >
                        <Edit2 size={14} />
                      </button>
                      {/* Delete — Admin only */}
                      {currentUser?.role === 'Admin' && (
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteConfirm(app.id) }}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                          title="Delete application"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
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
      </Card>

      {/* Edit Application Modal */}
      <Modal
        open={!!editApp}
        onClose={() => setEditApp(null)}
        title={<span className="flex items-center gap-2"><Edit2 className="text-primary-500" size={18} /> Edit Application</span>}
        size="lg"
        footer={(
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setEditApp(null)}>Cancel</Button>
            <Button className="flex-1" icon={Save} loading={editSaving} onClick={handleSaveEdit}>Save Changes</Button>
          </>
        )}
      >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'name',   label: 'Student Name',    type: 'text'  },
                  { key: 'email',  label: 'Email Address',   type: 'email' },
                  { key: 'mobile', label: 'Mobile Number',   type: 'text'  },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</label>
                    <input type={f.type} value={editForm[f.key] || ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} className="input-field text-sm" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Campus</label>
                  <select value={editForm.campus || ''} onChange={e => setEditForm(p => ({ ...p, campus: e.target.value }))} className="input-field text-sm">
                    <option value="">— Select campus —</option>
                    {['Bhubaneswar','Paralakhemundi','Balasore','Vizianagaram'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Reference College</label>
                  <select value={editForm.course || ''} onChange={e => setEditForm(p => ({ ...p, course: e.target.value }))} className="input-field text-sm">
                    <option value="">— Select reference college —</option>
                    {['CUTM Bhubaneswar','CUTM Paralakhemundi','CUTM Balasore','CUTM Vizianagaram','GIET University','KIIT University','SRM University AP','VIT-AP','Centurion School of Rural Enterprise','Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Form Status</label>
                  <select value={editForm.formStatus || ''} onChange={e => setEditForm(p => ({ ...p, formStatus: e.target.value }))} className="input-field text-sm">
                    <option>Complete</option><option>Incomplete</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Payment Status</label>
                  <select value={editForm.payStatus || ''} onChange={e => setEditForm(p => ({ ...p, payStatus: e.target.value }))} className="input-field text-sm">
                    <option>Payment Pending</option><option>Approved</option><option>Failed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Payment Method</label>
                  <select value={editForm.payMethod || ''} onChange={e => setEditForm(p => ({ ...p, payMethod: e.target.value }))} className="input-field text-sm">
                    <option value="">None / Pending</option><option>Online</option><option>Offline</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Application Stage</label>
                  <select value={editForm.stage || ''} onChange={e => setEditForm(p => ({ ...p, stage: e.target.value }))} className="input-field text-sm">
                    {['Application Started','Application Submitted','Payment Pending','Payment Approved','Enrolment','Rejected'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
      </Modal>

      {/* Payment Link Modal */}
      <Modal
        open={!!linkApp}
        onClose={() => { setLinkApp(null); setLinkResult(null) }}
        title={<span className="flex items-center gap-2"><LinkIcon size={18} className="text-warning-500" /> Generate Payment Link</span>}
      >
        {linkApp && (
            <div className="space-y-4">
              {/* Student info */}
              <div className="bg-info-50 border border-info-100 rounded-xl p-3">
                <p className="text-sm font-semibold text-info-800">{linkApp.name}</p>
                <p className="text-xs text-info-600 mt-0.5">
                  App ID: <span className="font-mono font-bold">{linkApp.appNo}</span> · {linkApp.email} · {linkApp.mobile}
                </p>
              </div>

              {!linkResult ? (
                <>
                  {/* Amount */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fee Amount (₹)</label>
                    <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                      className="input-field text-sm" placeholder="25000" />
                  </div>

                  {/* Mode toggle */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Payment Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: 'Online',  label: 'Online (Razorpay)',  desc: 'UTR auto-fetched on success', emoji: '💳' },
                        { v: 'Offline', label: 'Offline (Bank/Cash)', desc: 'Enter UTR/Ref manually',     emoji: '🏦' },
                      ].map(m => (
                        <button key={m.v} type="button" onClick={() => setPayMode(m.v)}
                          className={`text-left p-2.5 rounded-xl border-2 text-xs transition ${payMode === m.v ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300'}`}>
                          <div className="flex items-center gap-1.5 font-semibold text-gray-700">
                            <span>{m.emoji}</span> {m.label}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">{m.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleGenerateLink} disabled={linkLoading}
                    className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                    {linkLoading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <LinkIcon size={14} />}
                    {linkLoading ? 'Generating...' : payMode === 'Online' ? 'Generate Razorpay Link' : 'Proceed to Manual Entry'}
                  </button>
                </>
              ) : linkResult.mode === 'Online' && linkResult.paymentLink ? (
                <>
                  {/* Razorpay link result */}
                  <div className="bg-success-50 border border-success-200 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-success-800 flex items-center gap-1.5">
                      <span className="text-success-500">✓</span> Razorpay link created
                    </p>
                    <div className="bg-white border border-success-100 rounded-lg p-2 flex items-center gap-2">
                      <code className="flex-1 text-xs text-gray-700 truncate">{linkResult.paymentLink}</code>
                      <button onClick={() => handleCopy(linkResult.paymentLink)} className="p-1 hover:bg-success-100 rounded text-success-600">
                        <Copy size={12} />
                      </button>
                    </div>
                    <a href={linkResult.paymentLink} target="_blank" rel="noopener noreferrer"
                      className="block text-center text-xs bg-success-600 hover:bg-success-700 text-white rounded-lg py-2 transition-colors font-medium">
                      Open Payment Page →
                    </a>
                    <p className="text-[10px] text-success-700 text-center">UTR will be auto-fetched on successful payment.</p>
                  </div>
                  <a href={`https://wa.me/91${linkApp.mobile}?text=${encodeURIComponent(`Dear ${linkApp.name}, please complete your CUTM admission fee payment:\n${linkResult.paymentLink}\n\nApp ID: ${linkApp.appNo}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full block text-center bg-success-500 hover:bg-success-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
                    📱 Send via WhatsApp
                  </a>
                </>
              ) : (
                <>
                  {/* Offline UTR entry */}
                  <div className="bg-warning-50 border border-warning-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-warning-800 mb-2">📋 Enter Bank Reference</p>
                    <p className="text-xs text-warning-700 mb-3">
                      Student paid via NEFT/IMPS/UPI/Cash. Enter the UTR or reference number from the bank/receipt.
                    </p>
                    <input type="text" value={offlineUtr} onChange={e => setOfflineUtr(e.target.value.toUpperCase())}
                      placeholder="e.g. UTR1234567890 / RECEIPT2026-0042"
                      className="w-full input-field text-sm font-mono" />
                  </div>
                  <button onClick={handleSubmitOfflineUtr}
                    className="w-full bg-warning-600 hover:bg-warning-700 text-white font-semibold py-2.5 text-sm rounded-lg">
                    Save UTR → Mark as Payment Done
                  </button>
                  <p className="text-[10px] text-gray-400 text-center">Accounts team will approve to mark as Paid.</p>
                </>
              )}
            </div>
        )}
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleConfirmDelete}>Delete</Button>
          </>
        )}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-danger-100 flex items-center justify-center"><Trash2 size={22} className="text-danger-500" /></div>
          <h3 className="font-bold text-gray-900 text-base">Delete Application</h3>
          <p className="text-sm text-gray-500">This will permanently delete the application and cannot be undone.</p>
        </div>
      </Modal>

      {/* Add Application Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={<span className="flex items-center gap-2"><Plus className="text-primary-500" size={20} />Create Student Application</span>}
        size="lg"
      >
            <form onSubmit={handleCreateApplication} className="space-y-4">
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
      </Modal>
    </PageContainer>
  )
}
