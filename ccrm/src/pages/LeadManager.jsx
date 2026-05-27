import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Filter, Download, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, MessageCircle, MoreHorizontal,
  Plus, SlidersHorizontal, X, Save, Upload, AlertCircle,
  CheckCircle2, FileSpreadsheet, HelpCircle, Trash2
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

const STAGE_COLORS = {
  red:    { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-400' },
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-400' },
  green:  { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-400' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-400' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-400' },
  emerald:{ bg: 'bg-emerald-100',text: 'text-emerald-700',border: 'border-emerald-400' },
}

const getStageColorName = (stage) => {
  const map = {
    'Untouched': 'red',
    'Unverified': 'red',
    'Contacted': 'blue',
    'Unqualified Leads': 'orange',
    'Follow Up': 'yellow',
    'Interested': 'green',
    'Qualified Leads': 'green',
    'Converted': 'emerald'
  }
  return map[stage] || 'blue'
}

const QUICK_VIEWS = ['All Leads', 'My Leads', 'Untouched', 'Follow Up Today', 'Hot Leads']

const CRM_FIELDS = [
  { key: 'name', label: 'Student Name', required: true, description: 'Full name of the student' },
  { key: 'email', label: 'Email Address', required: true, description: 'Used for communication & notification updates' },
  { key: 'mobile', label: 'Mobile Number', required: true, description: 'Primary 10-digit contact number' },
  { key: 'state', label: 'State', required: false, description: 'Regional state location' },
  { key: 'city', label: 'City', required: false, description: 'City of residence' },
  { key: 'course', label: 'Course of Interest', required: false, description: 'e.g. B.Tech CSE, MBA' },
  { key: 'source', label: 'Lead Source', required: false, description: 'e.g. Google Ads, Walk-in' },
  { key: 'owner', label: 'Assigned Counselor', required: false, description: 'Counselor in charge' },
]

const AUTO_MAP_KEYWORDS = {
  name: ['name', 'student name', 'full name', 'lead name', 'registered name', 'fullname', 'first name', 'last name'],
  email: ['email', 'email address', 'registered email', 'mail', 'mail id', 'emailid'],
  mobile: ['mobile', 'phone', 'contact', 'mobile number', 'phone number', 'contact number', 'cell', 'registered mobile', 'phoneno', 'mobileno'],
  state: ['state', 'region', 'province'],
  city: ['city', 'location', 'town'],
  course: ['course', 'course of interest', 'program', 'specialization', 'branch'],
  source: ['source', 'lead source', 'campaign', 'channel', 'medium'],
  owner: ['owner', 'counselor', 'assigned', 'assigned counselor', 'manager', 'lead owner']
}

export default function LeadManager() {
  const navigate = useNavigate()
  const { leads, setLeads, addLead, deleteLead, currentUser, counselors, campaigns, showToast, fetchAllData } = useCcrm()

  const [selectedRows, setSelectedRows] = useState([])
  const [quickView, setQuickView] = useState('All Leads')
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    regDate: '', stage: '', owner: '', campaign: '', state: ''
  })

  // Add lead modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    mobile: '',
    state: '',
    city: '',
    course: 'B.Tech CSE',
    source: 'Google Ads',
    owner: currentUser?.name || 'Vikram K.'
  })

  // Bulk upload wizard state
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkStep, setBulkStep] = useState(1) // 1: Upload, 2: Processing, 3: Success
  const [bulkFile, setBulkFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadCount, setUploadCount] = useState(0)
  const [dragOver, setDragOver] = useState(false)

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(null) // id of lead to delete

  const handleDeleteLead = (id, e) => {
    e.stopPropagation()
    setDeleteConfirm(id)
  }

  const confirmDelete = () => {
    if (deleteConfirm === 'bulk') {
      selectedRows.forEach(id => deleteLead(id))
      setSelectedRows([])
      showToast(`${selectedRows.length} leads deleted successfully.`, 'success')
    } else {
      deleteLead(deleteConfirm)
    }
    setDeleteConfirm(null)
  }

  const rowsPerPage = 10

  const handleFileUpload = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    processFile(selected)
  }

  // ── Client-side CSV parser ─────────────────────────────────────────────────
  const parseCSVText = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []

    // Parse a single CSV line respecting quoted fields
    const parseLine = (line) => {
      const result = []
      let cur = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          result.push(cur.trim()); cur = ''
        } else {
          cur += ch
        }
      }
      result.push(cur.trim())
      return result
    }

    const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
    const rows = []

    // Map header index to CRM field using AUTO_MAP_KEYWORDS
    const fieldIndex = {}
    Object.entries(AUTO_MAP_KEYWORDS).forEach(([field, keywords]) => {
      const idx = headers.findIndex(h => keywords.some(kw => h.includes(kw.replace(/[^a-z0-9]/g, ''))))
      if (idx !== -1) fieldIndex[field] = idx
    })

    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i])
      if (cols.every(c => !c)) continue
      const row = {}
      Object.entries(fieldIndex).forEach(([field, idx]) => {
        row[field] = cols[idx] || ''
      })
      if (row.name || row.email || row.mobile) rows.push(row)
    }
    return rows
  }

  const processFile = (file) => {
    const validExtensions = ['.csv', '.xlsx', '.xls']
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    if (!hasValidExtension) {
      showToast('Please upload a standard Excel (.xlsx, .xls) or CSV (.csv) file.', 'error')
      return
    }

    // Only CSV is supported client-side without a library; .xlsx shows a helpful message
    if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
      showToast('Excel files require a backend. Please save as CSV (.csv) and re-upload.', 'error')
      return
    }

    setBulkFile(file)
    setBulkStep(2)
    setIsUploading(true)
    showToast(`Processing "${file.name}"...`, 'info')

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        const rows = parseCSVText(text)

        if (rows.length === 0) {
          setIsUploading(false)
          setBulkStep(1)
          showToast('No valid rows found. Check that your CSV has Name, Email, and Mobile columns.', 'error')
          return
        }

        // Batch-insert all rows via addLead (uses context, falls back to localStorage)
        let imported = 0
        const now = new Date().toLocaleString('en-IN', { hour12: true })
        const nextId = leads.length > 0 ? Math.max(...leads.map(l => l.id)) + 1 : 1

        const newLeads = rows.map((row, i) => ({
          id: nextId + i,
          name:       row.name    || 'Unknown',
          email:      row.email   || '',
          mobile:     row.mobile  || '',
          state:      row.state   || '',
          city:       row.city    || '',
          course:     row.course  || '',
          source:     row.source  || 'Bulk Import',
          owner:      row.owner   || 'Unassigned',
          regDate:    now,
          stage:      'Untouched',
          stageColor: 'red',
          score:      0,
        }))

        imported = newLeads.length
        setLeads(prev => [...newLeads, ...prev])

        setIsUploading(false)
        setUploadCount(imported)
        setBulkStep(3)
        showToast(`Successfully imported ${imported.toLocaleString()} leads!`, 'success')
      } catch (err) {
        console.error(err)
        setIsUploading(false)
        setBulkStep(1)
        showToast('Failed to parse the file. Please check the format and try again.', 'error')
      }
    }
    reader.onerror = () => {
      setIsUploading(false)
      setBulkStep(1)
      showToast('Could not read the file. Please try again.', 'error')
    }
    reader.readAsText(file)
  }

  const downloadSampleCSV = () => {
    const headers = ['Student Name', 'Email Address', 'Mobile Number', 'State', 'City', 'Course of Interest', 'Lead Source', 'Assigned Counselor']
    const sampleRows = [
      ['Aarav Mehta', 'aarav.mehta@gmail.com', '9876543210', 'Odisha', 'Bhubaneswar', 'B.Tech CSE', 'Google Ads', 'Vikram Kumar'],
      ['Diya Sharma', 'diya.sharma@yahoo.com', '8765432109', 'West Bengal', 'Kolkata', 'MBA', 'Facebook Ads', 'Nisha Sharma'],
      ['Kabir Singh', 'kabir.singh@outlook.com', '7654321098', 'Karnataka', 'Bengaluru', 'BCA', 'LinkedIn', 'Unassigned']
    ]
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...sampleRows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "ccrm_leads_bulk_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Sample template CSV downloaded.', 'success')
  }

  // 1. Quick View logic
  const matchQuickView = (l) => {
    if (quickView === 'All Leads') return true
    if (quickView === 'My Leads') {
      const simplifiedCns = currentUser?.name?.split(' ')[0] // e.g. "Vikram" from "Vikram Kumar"
      return l.owner?.toLowerCase().includes(simplifiedCns?.toLowerCase() || '') || l.owner === currentUser?.name
    }
    if (quickView === 'Untouched') return l.stage === 'Untouched'
    if (quickView === 'Follow Up Today') return l.stage === 'Follow Up' || l.stage === 'Qualified Leads' // follow-ups
    if (quickView === 'Hot Leads') return l.score > 70
    return true
  }

  // 2. Select Filter logic
  const matchSelectFilters = (l) => {
    if (filters.stage && l.stage !== filters.stage) return false
    if (filters.state && l.state !== filters.state) return false
    if (filters.owner && l.owner !== filters.owner) return false
    if (filters.campaign && l.source !== filters.campaign) return false
    return true
  }

  // 3. Search and combined filters
  const filtered = leads.filter(l => {
    const matchesSearch = l.name.toLowerCase().includes(search.toLowerCase()) ||
                          l.email.toLowerCase().includes(search.toLowerCase()) ||
                          l.mobile.toLowerCase().includes(search.toLowerCase()) ||
                          (l.city && l.city.toLowerCase().includes(search.toLowerCase()))
    
    return matchesSearch && matchQuickView(l) && matchSelectFilters(l)
  })

  const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1
  const pageData = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  const toggleRow = (id) => {
    setSelectedRows(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    )
  }
  const toggleAll = () => {
    if (selectedRows.length === pageData.length) setSelectedRows([])
    else setSelectedRows(pageData.map(r => r.id))
  }

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('No leads available to export.', 'warning')
      return
    }
    const headers = ['Name', 'Email', 'Mobile', 'State', 'City', 'Registration Date', 'Stage', 'Owner', 'Source', 'Score']
    const rows = filtered.map(l => [
      l.name,
      l.email,
      l.mobile,
      l.state,
      l.city,
      l.regDate,
      l.stage,
      l.owner || 'Unassigned',
      l.source || 'Direct',
      l.score || 0
    ])
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(","))].join("\n")
      
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `ccrm_leads_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast(`Successfully exported ${filtered.length} leads to CSV.`, 'success')
  }

  const handleCreateLead = (e) => {
    e.preventDefault()
    if (!newLead.name || !newLead.email || !newLead.mobile) {
      showToast('Please fill in Name, Email, and Mobile.', 'error')
      return
    }
    const score = Math.floor(40 + Math.random() * 55) // generate random score for lead
    const stage = 'Untouched'
    const color = 'red'

    const added = addLead({
      ...newLead,
      score,
      stage,
      stageColor: color
    })
    setShowAddModal(false)
    setNewLead({
      name: '',
      email: '',
      mobile: '',
      state: '',
      city: '',
      course: 'B.Tech CSE',
      source: 'Google Ads',
      owner: currentUser?.name || 'Vikram K.'
    })
  }

  // Derive filter selections dynamically
  const stateOptions = Array.from(new Set(leads.map(l => l.state))).filter(Boolean)
  const sourceOptions = Array.from(new Set(leads.map(l => l.source))).filter(Boolean)
  const ownerOptions = Array.from(new Set(leads.map(l => l.owner))).filter(Boolean)
  const stageOptions = Array.from(new Set(leads.map(l => l.stage))).filter(Boolean)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Lead Manager</h1>
          <div className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-lg p-1">
            {QUICK_VIEWS.map(v => (
              <button
                key={v}
                onClick={() => { setQuickView(v); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  quickView === v
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
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
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <Download size={14} />
            Export
          </button>
          <button
            onClick={() => {
              setBulkStep(1)
              setBulkFile(null)
              setShowBulkModal(true)
            }}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <Upload size={14} />
            Bulk Upload
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus size={14} />
            Add Lead
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search leads by name, email, city..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
            />
          </div>

          {[
            { label: 'Lead Stage', key: 'stage', options: stageOptions },
            { label: 'Lead Owner', key: 'owner', options: ownerOptions },
            { label: 'Campaign Source', key: 'campaign', options: sourceOptions },
            { label: 'State', key: 'state', options: stateOptions },
          ].map(f => (
            <div key={f.key} className="relative">
              <select
                value={filters[f.key]}
                onChange={e => { setFilters(prev => ({ ...prev, [f.key]: e.target.value })); setCurrentPage(1); }}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
              >
                <option value="">{f.label}</option>
                {f.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          ))}

          <button
            onClick={() => { setFilters({ regDate: '', stage: '', owner: '', campaign: '', state: '' }); setSearch('') }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
          >
            <RefreshCw size={13} />
            Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Table header info */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            Showing <span className="font-semibold text-gray-700">{filtered.length}</span> leads
            {selectedRows.length > 0 && (
              <span className="ml-2 text-primary-600 font-medium">· {selectedRows.length} selected</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {selectedRows.length > 0 && (
              <button
                onClick={() => setDeleteConfirm('bulk')}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
                Delete Selected ({selectedRows.length})
              </button>
            )}
          </div>
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
                <th className="table-th">Registered Email</th>
                <th className="table-th">Registered Mobile</th>
                <th className="table-th">State</th>
                <th className="table-th">City</th>
                <th className="table-th">Registration Date</th>
                <th className="table-th">Lead Stage</th>
                <th className="table-th w-12">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map(lead => {
                const stageColorName = getStageColorName(lead.stage)
                const colors = STAGE_COLORS[stageColorName] || STAGE_COLORS.blue
                return (
                  <tr
                    key={lead.id}
                    className={`hover:bg-blue-50/30 transition-colors cursor-pointer border-l-4 ${colors.border}`}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(lead.id)}
                        onChange={() => toggleRow(lead.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-500"
                      />
                    </td>
                    <td className="table-td">
                      <span className="text-primary-500 hover:text-primary-700 font-medium hover:underline">
                        {lead.name}
                      </span>
                    </td>
                    <td className="table-td text-gray-600">{lead.email}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-700">{lead.mobile}</span>
                        <a
                          href={`https://wa.me/91${lead.mobile}`}
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
                    <td className="table-td text-gray-600">{lead.state || '—'}</td>
                    <td className="table-td text-gray-600">{lead.city || '—'}</td>
                    <td className="table-td text-gray-600">{lead.regDate || '—'}</td>
                    <td className="table-td">
                      <span className={`badge ${colors.bg} ${colors.text}`}>
                        {lead.stage}
                      </span>
                    </td>
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleDeleteLead(lead.id, e)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete lead"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400 text-sm">
                    No leads found matching your criteria.
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
                  p === currentPage
                    ? 'bg-primary-500 text-white'
                    : 'hover:bg-gray-200 text-gray-600'
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

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="text-primary-500" size={20} />
                Add New Lead
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateLead} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Student Name *</label>
                  <input
                    type="text"
                    required
                    value={newLead.name}
                    onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))}
                    placeholder="Enter full name"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={newLead.email}
                    onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))}
                    placeholder="student@example.com"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    value={newLead.mobile}
                    onChange={e => setNewLead(p => ({ ...p, mobile: e.target.value }))}
                    placeholder="e.g. 9876543210"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">State</label>
                  <input
                    type="text"
                    value={newLead.state}
                    onChange={e => setNewLead(p => ({ ...p, state: e.target.value }))}
                    placeholder="e.g. Odisha"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">City</label>
                  <input
                    type="text"
                    value={newLead.city}
                    onChange={e => setNewLead(p => ({ ...p, city: e.target.value }))}
                    placeholder="e.g. Bhubaneswar"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Course of Interest</label>
                  <select
                    value={newLead.course}
                    onChange={e => setNewLead(p => ({ ...p, course: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {['B.Tech CSE', 'B.Tech ECE', 'MBA', 'BCA', 'BBA', 'M.Sc Agriculture'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Lead Source</label>
                  <select
                    value={newLead.source}
                    onChange={e => setNewLead(p => ({ ...p, source: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {['Google Ads', 'Facebook Ads', 'LinkedIn', 'Walk-in', 'Referral', 'Website'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Assigned Counselor</label>
                  <select
                    value={newLead.owner}
                    onChange={e => setNewLead(p => ({ ...p, owner: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {counselors.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100 mt-6">
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
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-scale-up">
            <div className="flex flex-col items-center text-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Delete Lead{deleteConfirm === 'bulk' ? 's' : ''}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {deleteConfirm === 'bulk'
                    ? `Are you sure you want to permanently delete ${selectedRows.length} selected leads? This cannot be undone.`
                    : 'Are you sure you want to permanently delete this lead? This cannot be undone.'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 btn-secondary py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 text-sm font-semibold rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-scale-up border border-gray-100 flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
                  <Upload size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Bulk Import Leads</h2>
                  <p className="text-xs text-gray-550">Upload CSV or Excel spreadsheets and save leads in bulk</p>
                </div>
              </div>
              {!isUploading && (
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 hover:bg-gray-100 rounded-lg"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Modal Steps Progress bar */}
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/20 flex items-center justify-between gap-4 text-xs font-semibold text-gray-500">
              {[
                { step: 1, label: 'Upload Template' },
                { step: 2, label: 'Processing & Batching' },
                { step: 3, label: 'Success' }
              ].map(s => (
                <div key={s.step} className="flex items-center gap-2 flex-1 justify-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border font-bold ${
                    bulkStep === s.step
                      ? 'bg-primary-500 border-primary-500 text-white shadow-sm shadow-primary-200'
                      : bulkStep > s.step
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                  }`}>
                    {bulkStep > s.step ? '✓' : s.step}
                  </div>
                  <span className={`${bulkStep === s.step ? 'text-primary-600 font-bold' : bulkStep > s.step ? 'text-gray-700' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                  {s.step < 3 && <div className="flex-1 h-0.5 max-w-24 bg-gray-200 hidden md:block" />}
                </div>
              ))}
            </div>

            {/* Modal Body */}
            <div className="p-6 bg-white">
              
              {/* STEP 1: Upload Zone */}
              {bulkStep === 1 && (
                <div className="space-y-6 animate-scale-up">
                  <div className="flex flex-col md:flex-row gap-4 items-stretch">
                    
                    {/* Drag-Drop Box */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const file = e.dataTransfer.files?.[0]
                        if (file) processFile(file);
                      }}
                      className={`flex-1 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all ${
                        dragOver
                          ? 'border-primary-500 bg-primary-50/40'
                          : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className="p-4 bg-primary-50 rounded-full text-primary-500 mb-4 animate-bounce">
                        <FileSpreadsheet size={32} />
                      </div>
                      <h3 className="font-bold text-sm text-gray-800 mb-1">Drag and drop your spreadsheet here</h3>
                      <p className="text-xs text-gray-400 mb-4">Accepts Excel (.xlsx, .xls) or CSV (.csv) up to 100,000+ rows</p>
                      
                      <label className="btn-primary cursor-pointer text-xs font-semibold px-4 py-2 hover:shadow-lg hover:shadow-primary-100 transition-all rounded-lg inline-block">
                        Browse Files
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Guidelines Sidebar */}
                    <div className="w-full md:w-80 bg-gray-50 border border-gray-100 rounded-2xl p-4 flex flex-col justify-between">
                      <div className="space-y-3">
                        <h4 className="font-bold text-xs text-gray-700 flex items-center gap-1.5 uppercase tracking-wider">
                          <HelpCircle size={14} className="text-primary-500" />
                          Import Guidelines
                        </h4>
                        <ul className="text-xs text-gray-500 space-y-2 list-disc list-inside leading-relaxed">
                          <li>Supports large sheets containing **1 Lakh (100,000) rows** seamlessly.</li>
                          <li>Required spreadsheet headers: <b>Student Name, Email Address, Mobile Number</b>.</li>
                          <li>Optional headers: <b>State, City, Course of Interest, Lead Source, Assigned Counselor</b>.</li>
                          <li>Transactional inserts: invalid formats rollback safely to keep database clean.</li>
                        </ul>
                      </div>
                      <div className="pt-4 border-t border-gray-200 mt-4">
                        <button
                          onClick={downloadSampleCSV}
                          className="w-full btn-secondary text-xs font-semibold py-2 px-3 border border-gray-300 flex items-center justify-center gap-1.5 rounded-lg hover:bg-gray-100"
                        >
                          <Download size={13} />
                          Download Sample Template
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* STEP 2: Processing & Batching */}
              {bulkStep === 2 && (
                <div className="py-12 text-center space-y-4 animate-scale-up flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-primary-500 mb-2 shadow-inner animate-pulse">
                    <svg className="animate-spin h-8 w-8 text-primary-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-800">Processing Bulk Upload...</h3>
                    <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">
                      Parsing your CSV, mapping columns, and importing leads. This will take a moment. Please do not close this window.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 3: Success Completion */}
              {bulkStep === 3 && (
                <div className="py-8 text-center space-y-4 animate-scale-up">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 border border-emerald-100 flex items-center justify-center mx-auto mb-2 shadow-inner">
                    <CheckCircle2 size={36} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-805">Leads Uploaded Successfully!</h3>
                    <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">
                      Spreadsheet records from <span className="font-bold text-gray-700">"{bulkFile?.name}"</span> have been parsed and imported into the lead registry successfully.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-4 py-2.5 px-6 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs text-emerald-800 font-semibold shadow-sm">
                    <span>Leads Imported Successfully: <span className="text-emerald-700 font-extrabold text-sm">{uploadCount.toLocaleString()}</span></span>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                disabled={isUploading}
                className="btn-secondary py-2 px-4 text-xs font-semibold rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkStep === 3 ? 'Close' : 'Cancel'}
              </button>
              
              {bulkStep === 3 && (
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="btn-primary py-2 px-5 text-xs font-semibold rounded-lg hover:shadow-lg"
                >
                  Done
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
