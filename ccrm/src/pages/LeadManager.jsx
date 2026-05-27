import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Filter, Download, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, MessageCircle, MoreHorizontal,
  Plus, SlidersHorizontal, X, Save, Upload, AlertCircle,
  CheckCircle2, FileSpreadsheet, HelpCircle
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
  const { leads, setLeads, addLead, currentUser, counselors, campaigns, showToast } = useCcrm()

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
  const [bulkStep, setBulkStep] = useState(1) // 1: Upload, 2: Map, 3: Review, 4: Done
  const [bulkFile, setBulkFile] = useState(null)
  const [parsedData, setParsedData] = useState([]) // Raw nested array rows
  const [fileHeaders, setFileHeaders] = useState([]) // CSV headers
  const [columnMapping, setColumnMapping] = useState({
    name: -1, email: -1, mobile: -1, state: -1, city: -1, course: -1, source: -1, owner: -1
  })
  const [mappedLeads, setMappedLeads] = useState([])
  const [validationReports, setValidationReports] = useState([])
  const [dragOver, setDragOver] = useState(false)

  const rowsPerPage = 10

  // Core RFC 4180 CSV parser
  const parseCSV = (text) => {
    const lines = []
    let row = [""]
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const nextChar = text[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          row[row.length - 1] += '"'
          i++ // skip double quote
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        row.push("")
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++
        }
        lines.push(row)
        row = [""]
      } else {
        row[row.length - 1] += char
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row)
    }
    return lines.map(r => r.map(c => c.trim()))
  }

  const handleFileUpload = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    processFile(selected)
  }

  const processFile = (file) => {
    if (!file.name.endsWith('.csv')) {
      showToast('Please upload a standard CSV file.', 'error')
      return
    }

    setBulkFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target.result
      const rawRows = parseCSV(text)

      if (rawRows.length < 2) {
        showToast('The CSV file appears to be empty or missing header columns.', 'error')
        return
      }

      const headers = rawRows[0]
      setFileHeaders(headers)
      setParsedData(rawRows.slice(1)) // Rows without headers

      // Smart Fuzzy Matching auto-mapper
      const initialMapping = {
        name: -1, email: -1, mobile: -1, state: -1, city: -1, course: -1, source: -1, owner: -1
      }

      CRM_FIELDS.forEach(field => {
        const keywords = AUTO_MAP_KEYWORDS[field.key]
        const idx = headers.findIndex(h => {
          const lower = h.toLowerCase().trim()
          return keywords.some(k => lower === k || lower.includes(k))
        })
        if (idx !== -1) {
          initialMapping[field.key] = idx
        }
      })

      setColumnMapping(initialMapping)
      setBulkStep(2) // Proceed to step 2: Column Mapping
      showToast('CSV loaded. Please confirm column mapping.', 'info')
    }
    reader.readAsText(file)
  }

  const handleProceedToReview = () => {
    const tempMappedLeads = []
    const tempReports = []

    parsedData.forEach((row, rowIndex) => {
      const name = columnMapping.name !== -1 && row[columnMapping.name] ? row[columnMapping.name] : ''
      const email = columnMapping.email !== -1 && row[columnMapping.email] ? row[columnMapping.email] : ''
      const mobile = columnMapping.mobile !== -1 && row[columnMapping.mobile] ? row[columnMapping.mobile] : ''
      const state = columnMapping.state !== -1 && row[columnMapping.state] ? row[columnMapping.state] : ''
      const city = columnMapping.city !== -1 && row[columnMapping.city] ? row[columnMapping.city] : ''
      const course = columnMapping.course !== -1 && row[columnMapping.course] ? row[columnMapping.course] : 'B.Tech CSE'
      const source = columnMapping.source !== -1 && row[columnMapping.source] ? row[columnMapping.source] : 'Direct'
      const owner = columnMapping.owner !== -1 && row[columnMapping.owner] ? row[columnMapping.owner] : 'Unassigned'

      const leadObj = { name, email, mobile, state, city, course, source, owner }
      tempMappedLeads.push(leadObj)

      // Validation logic
      const errors = []
      if (!name || !name.trim()) {
        errors.push('Missing Student Name')
      }
      
      if (!email || !email.trim()) {
        errors.push('Missing Email Address')
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        errors.push('Invalid Email Format')
      }

      if (!mobile || !mobile.trim()) {
        errors.push('Missing Mobile Number')
      } else {
        const cleanedMobile = mobile.replace(/\D/g, '')
        if (cleanedMobile.length < 10) {
          errors.push('Mobile must be at least 10 digits')
        }
      }

      tempReports.push({
        rowNumber: rowIndex + 2,
        isValid: errors.length === 0,
        errors
      })
    })

    setMappedLeads(tempMappedLeads)
    setValidationReports(tempReports)
    setBulkStep(3) // Proceed to step 3: Review and validation
  }

  const handleConfirmImport = () => {
    const validLeads = mappedLeads.filter((_, idx) => validationReports[idx].isValid)

    if (validLeads.length === 0) {
      showToast('No valid leads available to import.', 'error')
      return
    }

    let currentLeads = [...leads]
    let nextId = currentLeads.length > 0 ? Math.max(...currentLeads.map(l => l.id)) + 1 : 1

    const newLeads = validLeads.map((item, idx) => {
      const score = Math.floor(40 + Math.random() * 55)
      return {
        id: nextId + idx,
        name: item.name.trim(),
        email: item.email.trim().toLowerCase(),
        mobile: item.mobile.trim(),
        state: item.state?.trim() || '',
        city: item.city?.trim() || '',
        course: item.course?.trim() || 'B.Tech CSE',
        source: item.source?.trim() || 'Direct',
        owner: item.owner?.trim() || 'Unassigned',
        regDate: new Date().toLocaleString('en-IN', { hour12: true }),
        score,
        stage: 'Untouched',
        stageColor: 'red'
      }
    })

    setLeads(prev => [...newLeads, ...prev])
    setBulkStep(4) // Proceed to step 4: Completion screen
    showToast(`Successfully imported ${newLeads.length} leads!`, 'success')
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
              setParsedData([])
              setFileHeaders([])
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
            <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <MoreHorizontal size={14} />
              Actions
            </button>
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
                  </tr>
                )
              })}
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">
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

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-scale-up border border-gray-100 flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
                  <Upload size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Bulk Import Leads</h2>
                  <p className="text-xs text-gray-500">Upload CSV sheet, map columns, validate data and save leads in bulk</p>
                </div>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Steps Progress bar */}
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/20 flex items-center justify-between gap-4 text-xs font-semibold text-gray-500">
              {[
                { step: 1, label: 'Upload CSV' },
                { step: 2, label: 'Map Columns' },
                { step: 3, label: 'Review & Validate' },
                { step: 4, label: 'Success' }
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
                  {s.step < 4 && <div className="flex-1 h-0.5 max-w-16 bg-gray-200 hidden md:block" />}
                </div>
              ))}
            </div>

            {/* Modal Body / Scrollable Content */}
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              
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
                      <h3 className="font-bold text-sm text-gray-800 mb-1">Drag and drop your CSV file here</h3>
                      <p className="text-xs text-gray-400 mb-4">Accepts only standard CSV files (.csv)</p>
                      
                      <label className="btn-primary cursor-pointer text-xs font-semibold px-4 py-2 hover:shadow-lg hover:shadow-primary-100 transition-all rounded-lg inline-block">
                        Browse Files
                        <input
                          type="file"
                          accept=".csv"
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
                        <ul className="text-xs text-gray-500 space-y-2 list-disc list-inside">
                          <li>File format must be <b>CSV (Comma Separated Values)</b>.</li>
                          <li>Required CRM Fields: <b>Student Name, Email Address, and Mobile</b>.</li>
                          <li>Emails must have valid formatting (e.g., student@cutm.ac.in).</li>
                          <li>Mobile numbers must be at least 10 digits.</li>
                          <li>Smart mapper will auto-suggest column matches.</li>
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

              {/* STEP 2: Column Mapping */}
              {bulkStep === 2 && (
                <div className="space-y-4 animate-scale-up">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2.5 text-xs text-blue-800">
                    <AlertCircle size={16} className="text-blue-500 shrink-0" />
                    <div>
                      <span className="font-bold">Fuzzy Header Auto-Matching Completed!</span> Verify the auto-suggestions below and adjust if necessary to ensure headers link correctly.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[45vh] overflow-y-auto pr-1">
                    {CRM_FIELDS.map(field => {
                      const isMapped = columnMapping[field.key] !== -1
                      return (
                        <div key={field.key} className={`p-4 border rounded-xl flex flex-col justify-between gap-3 ${
                          field.required
                            ? isMapped ? 'border-primary-100 bg-primary-50/10' : 'border-red-200 bg-red-50/5'
                            : 'border-gray-200'
                        }`}>
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                                {field.label}
                                {field.required && <span className="text-red-500">*</span>}
                              </span>
                              <span className="text-[10px] text-gray-400">{field.description}</span>
                            </div>
                            {field.required && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isMapped ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {isMapped ? '✓ Linked' : '⚠ Required'}
                              </span>
                            )}
                          </div>

                          <div>
                            <select
                              value={columnMapping[field.key]}
                              onChange={(e) => {
                                setColumnMapping(prev => ({
                                  ...prev,
                                  [field.key]: parseInt(e.target.value)
                                }))
                              }}
                              className={`w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white ${
                                field.required && !isMapped ? 'border-red-300' : 'border-gray-300'
                              }`}
                            >
                              <option value={-1}>-- Ignore Field --</option>
                              {fileHeaders.map((hdr, idx) => (
                                <option key={idx} value={idx}>{hdr} (Column #{idx + 1})</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: Review & Validate */}
              {bulkStep === 3 && (
                <div className="space-y-4 animate-scale-up flex flex-col h-full">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-medium text-gray-500">
                    <div>
                      File: <span className="text-gray-800 font-bold">{bulkFile?.name}</span> ({parsedData.length} records parsed)
                    </div>
                    <div className="flex gap-3">
                      <span className="text-emerald-600 font-semibold">
                        Ready: {validationReports.filter(r => r.isValid).length} records
                      </span>
                      <span className="text-red-500 font-semibold">
                        Errors: {validationReports.filter(r => !r.isValid).length} records
                      </span>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden flex-1 overflow-y-auto max-h-[35vh]">
                    <table className="w-full border-collapse font-sans">
                      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                        <tr>
                          <th className="table-th text-[10px] w-12 text-center py-2">Row</th>
                          <th className="table-th text-[10px] py-2">Name</th>
                          <th className="table-th text-[10px] py-2">Email</th>
                          <th className="table-th text-[10px] py-2">Mobile</th>
                          <th className="table-th text-[10px] py-2">Course</th>
                          <th className="table-th text-[10px] py-2">Source</th>
                          <th className="table-th text-[10px] py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappedLeads.map((item, index) => {
                          const r = validationReports[index]
                          return (
                            <tr key={index} className={`border-b border-gray-100 hover:bg-gray-50/50 ${
                              r.isValid ? '' : 'bg-red-50/20'
                            }`}>
                              <td className="table-td text-[11px] text-center font-medium text-gray-400 py-1.5">{r.rowNumber}</td>
                              <td className="table-td text-[11px] font-semibold text-gray-800 py-1.5">{item.name || <span className="text-red-400 font-bold">Missing</span>}</td>
                              <td className="table-td text-[11px] text-gray-600 py-1.5">{item.email || <span className="text-red-400 font-bold">Missing</span>}</td>
                              <td className="table-td text-[11px] text-gray-600 py-1.5">{item.mobile || <span className="text-red-400 font-bold">Missing</span>}</td>
                              <td className="table-td text-[11px] text-gray-600 py-1.5">{item.course || '—'}</td>
                              <td className="table-td text-[11px] text-gray-600 py-1.5">{item.source || '—'}</td>
                              <td className="table-td text-[11px] py-1.5">
                                {r.isValid ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    <CheckCircle2 size={10} />
                                    ✓ Ready
                                  </span>
                                ) : (
                                  <div className="flex flex-col gap-0.5">
                                    {r.errors.map((err, eIdx) => (
                                      <span key={eIdx} className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 w-max">
                                        <AlertCircle size={8} />
                                        {err}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STEP 4: Success Completion */}
              {bulkStep === 4 && (
                <div className="py-8 text-center space-y-4 animate-scale-up">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 border border-emerald-100 flex items-center justify-center mx-auto mb-2 shadow-inner">
                    <CheckCircle2 size={36} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-800">Leads Uploaded Successfully!</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Your CSV sheet records have been parsed, validated and saved directly in the lead registry.
                    </p>
                  </div>
                  <div className="inline-flex flex-wrap gap-4 justify-center py-2.5 px-6 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-gray-600 font-medium">
                    <div>
                      Leads Imported: <span className="text-emerald-600 font-bold">{validationReports.filter(r => r.isValid).length}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-300 hidden sm:block" />
                    <div>
                      Records Skipped due to Errors: <span className="text-red-500 font-bold">{validationReports.filter(r => !r.isValid).length}</span>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center gap-3 justify-between">
              <div>
                {bulkStep > 1 && bulkStep < 4 && (
                  <button
                    onClick={() => setBulkStep(prev => prev - 1)}
                    className="btn-secondary py-2 px-4 text-xs font-semibold rounded-lg hover:bg-gray-100 border border-gray-300"
                  >
                    Back
                  </button>
                )}
              </div>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="btn-secondary py-2 px-4 text-xs font-semibold rounded-lg border border-gray-300 hover:bg-gray-100"
                >
                  {bulkStep === 4 ? 'Close' : 'Cancel'}
                </button>
                
                {bulkStep === 2 && (
                  <button
                    onClick={handleProceedToReview}
                    disabled={columnMapping.name === -1 || columnMapping.email === -1 || columnMapping.mobile === -1}
                    className="btn-primary py-2 px-4 text-xs font-semibold rounded-lg hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    Proceed to Review
                  </button>
                )}

                {bulkStep === 3 && (
                  <button
                    onClick={handleConfirmImport}
                    disabled={validationReports.filter(r => r.isValid).length === 0}
                    className="btn-primary py-2 px-4 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    Confirm & Import
                  </button>
                )}

                {bulkStep === 4 && (
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
        </div>
      )}
    </div>
  )
}
