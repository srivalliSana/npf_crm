import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Download, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, MessageCircle, Phone,
  Plus, X, Save, Upload, AlertCircle,
  CheckCircle2, FileSpreadsheet, HelpCircle, Trash2,
  MessageSquare, Zap, Target, BarChart2, ArrowRight
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

const STAGE_COLORS = {
  red:     { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-400' },
  blue:    { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-400' },
  green:   { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-400' },
  orange:  { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-400' },
  yellow:  { bg: 'bg-yellow-100',  text: 'text-yellow-700',  border: 'border-yellow-400' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-400' },
}

const getStageColorName = (stage) => ({
  'Untouched': 'red', 'Unverified': 'red', 'Contacted': 'blue',
  'Unqualified Leads': 'orange', 'Follow Up': 'yellow', 'Interested': 'green',
  'Qualified Leads': 'green', 'Converted': 'emerald'
}[stage] || 'blue')

const QUICK_VIEWS = ['All Leads', 'My Leads', 'Untouched', 'Follow Up Today', 'Hot Leads']
const COURSES = ['B.Tech CSE', 'B.Tech ECE', 'MBA', 'BCA', 'BBA', 'M.Sc Agriculture', 'B.Tech Civil', 'M.Tech', 'B.Com']
const SOURCES = ['Google Ads', 'Facebook Ads', 'LinkedIn', 'Walk-in', 'Referral', 'Website', 'WhatsApp', 'Education Fair', 'SMS Campaign', 'Instagram']
const CRM_FIELDS = ['name', 'email', 'mobile', 'state', 'city', 'course', 'source', 'owner']
const WA_TEMPLATES = [
  { label: 'Course Enquiry', msg: 'Hi {name}! 👋 Thanks for showing interest in CUTM. We have excellent programs in {course}. Call us: +91-674-2559441' },
  { label: 'Application Reminder', msg: 'Dear {name}, seats are limited for CUEE 2026 {course}! Apply today at cutm.ac.in 🎓' },
  { label: 'Follow Up', msg: 'Hello {name}! 🌟 Following up on your inquiry for {course} at CUTM. Any questions? Reply here!' },
  { label: 'Scholarship Alert', msg: 'Great news {name}! 🎉 You may qualify for CUTM Merit Scholarship for {course}. Apply before June 30!' },
]

export default function LeadManager() {
  const navigate = useNavigate()
  const { leads, setLeads, addLead, deleteLead, currentUser, counselors, showToast, fetchAllData,
          checkDuplicate, getNextAssignee, sendBulkWhatsApp, sendBulkSMS, enrollDrip, logCall } = useCcrm()

  const [selectedRows, setSelectedRows] = useState([])
  const [quickView, setQuickView] = useState('All Leads')
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ stage: '', owner: '', campaign: '', state: '' })

  // Add Lead modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [newLead, setNewLead] = useState({ name:'', email:'', mobile:'', state:'', city:'', course:'B.Tech CSE', source:'Google Ads', owner:'' })
  const [autoAssign, setAutoAssign] = useState(true)
  const [addLoading, setAddLoading] = useState(false)
  const [dupWarning, setDupWarning] = useState(null) // {duplicates, hasDuplicate}

  // Multi-channel send modal
  const [showWAModal, setShowWAModal]   = useState(false)
  const [waTemplate, setWaTemplate]     = useState(0)
  const [waCustomMsg, setWaCustomMsg]   = useState('')
  const [waSending, setWaSending]       = useState(false)
  const [sendChannels, setSendChannels] = useState({ whatsapp: true, sms: false })

  // Drip enroll
  const [dripLoading, setDripLoading] = useState(false)

  // Call log modal
  const [callLead, setCallLead] = useState(null) // lead being called
  const [callOutcome, setCallOutcome] = useState('Called')
  const [callNotes, setCallNotes] = useState('')
  const [callDuration, setCallDuration] = useState('')

  // Bulk upload wizard
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkStep, setBulkStep] = useState(1) // 1:upload 2:preview 3:uploading 4:done
  const [bulkFile, setBulkFile] = useState(null)
  const [previewData, setPreviewData] = useState(null) // {headers, preview, autoMap, totalRows, duplicateCount, estimatedDupRate}
  const [columnMap, setColumnMap] = useState({})
  const [dupHandling, setDupHandling] = useState('skip')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const rowsPerPage = 15

  // ----------- FILTERS -----------
  const matchQuickView = (l) => {
    if (quickView === 'All Leads') return true
    if (quickView === 'My Leads') return l.owner?.toLowerCase().includes(currentUser?.name?.split(' ')[0]?.toLowerCase() || '')
    if (quickView === 'Untouched') return l.stage === 'Untouched'
    if (quickView === 'Follow Up Today') return l.stage === 'Follow Up' || l.stage === 'Qualified Leads'
    if (quickView === 'Hot Leads') return (l.score || 0) > 70
    return true
  }
  const matchSelectFilters = (l) => {
    if (filters.stage && l.stage !== filters.stage) return false
    if (filters.state && l.state !== filters.state) return false
    if (filters.owner && l.owner !== filters.owner) return false
    if (filters.campaign && l.source !== filters.campaign) return false
    return true
  }
  const filtered = leads.filter(l => {
    const s = search.toLowerCase()
    return (!search || l.name.toLowerCase().includes(s) || l.email.toLowerCase().includes(s) || l.mobile.includes(s) || (l.city || '').toLowerCase().includes(s))
      && matchQuickView(l) && matchSelectFilters(l)
  })
  const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1
  const pageData = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
  const toggleRow = (id) => setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id])
  const toggleAll = () => setSelectedRows(selectedRows.length === pageData.length ? [] : pageData.map(r => r.id))

  // ----------- ADD LEAD WITH DEDUP + AUTO-ASSIGN -----------
  const handleMobileBlur = async () => {
    if (!newLead.mobile || newLead.mobile.length < 7) return
    const result = await checkDuplicate(newLead.mobile, newLead.email)
    setDupWarning(result.hasDuplicate ? result : null)
  }

  const handleCreateLead = async (e, forceSave = false) => {
    e?.preventDefault()
    if (!newLead.name || !newLead.mobile) return showToast('Name and Mobile are required.', 'error')
    if (dupWarning && !forceSave) return // show warning first

    setAddLoading(true)
    let owner = newLead.owner
    if (autoAssign || !owner) {
      owner = await getNextAssignee()
    }

    const leadData = {
      ...newLead,
      owner,
      stage: 'Untouched',
      stageColor: 'red',
      score: calcScore(newLead.source, newLead.course, newLead)
    }
    await addLead(leadData)
    setDupWarning(null)
    setAddLoading(false)
    setShowAddModal(false)
    setNewLead({ name:'', email:'', mobile:'', state:'', city:'', course:'B.Tech CSE', source:'Google Ads', owner:'' })
  }

  function calcScore(source, course, lead = {}) {
    // Source quality (0-30)
    const srcScore = { 'Referral':30,'Walk-in':28,'Education Fair':25,'LinkedIn':22,'Google Ads':20,'Facebook Ads':18,'Instagram':14,'Website':13,'WhatsApp':12,'SMS Campaign':10 }[source] || 10

    // Course demand/fee tier (0-25)
    const highCourses = ['MBA','MBA (Finance)','MBA (Marketing)','MBA (HR)','M.Tech','MCA']
    const midCourses  = ['B.Tech CSE','B.Tech ECE','B.Tech CSE (AI/ML)','B.Tech CSE (Cyber Security)','B.Sc Agriculture']
    const crsScore = highCourses.includes(course) ? 25 : midCourses.includes(course) ? 18 : 12

    // Profile completeness (0-25)
    let profileScore = 0
    if (lead.email) profileScore += 10
    if (lead.state) profileScore += 8
    if (lead.city)  profileScore += 7

    // Stage engagement bonus (0-20) — set at creation; updated when stage changes
    const stageBonus = { 'Interested':20,'Qualified Leads':20,'Follow Up':15,'Contacted':10,'Untouched':0,'Unverified':2,'Converted':20,'Unqualified Leads':0 }[lead.stage] || 0

    return Math.min(srcScore + crsScore + profileScore + stageBonus, 100)
  }

  function getQualCategory(score) {
    if (score >= 75) return { label: 'Hot',     bg: 'bg-red-100',    text: 'text-red-700'    }
    if (score >= 50) return { label: 'Warm',    bg: 'bg-orange-100', text: 'text-orange-700' }
    if (score >= 25) return { label: 'Nurture', bg: 'bg-yellow-100', text: 'text-yellow-700' }
    return               { label: 'Cold',    bg: 'bg-slate-100',  text: 'text-slate-500'  }
  }

  // ----------- MULTI-CHANNEL SEND -----------
  const handleSendWA = async () => {
    if (!selectedRows.length) return showToast('Select at least one lead.', 'warning')
    if (!sendChannels.whatsapp && !sendChannels.sms) return showToast('Select at least one channel.', 'warning')
    const tmpl = waCustomMsg || WA_TEMPLATES[waTemplate].msg
    if (!tmpl) return showToast('Please enter a message.', 'error')
    setWaSending(true)
    if (sendChannels.whatsapp) await sendBulkWhatsApp(selectedRows, tmpl, WA_TEMPLATES[waTemplate].label)
    if (sendChannels.sms) await sendBulkSMS(selectedRows, tmpl)
    setWaSending(false)
    setShowWAModal(false)
    setSelectedRows([])
  }

  // ----------- DRIP ENROLL -----------
  const handleEnrollDrip = async () => {
    if (!selectedRows.length) return showToast('Select leads to enroll in drip.', 'warning')
    setDripLoading(true)
    for (const id of selectedRows) {
      const lead = leads.find(l => l.id === id)
      if (lead) await enrollDrip(lead)
    }
    setDripLoading(false)
    setSelectedRows([])
    showToast(`${selectedRows.length} leads enrolled in drip sequence.`, 'success')
  }

  // ----------- CALL LOG -----------
  const handleLogCall = async () => {
    if (!callLead) return
    await logCall({ leadName: callLead.name, leadMobile: callLead.mobile, counselor: currentUser?.name || 'Unknown', duration: callDuration, outcome: callOutcome, notes: callNotes })
    setCallLead(null); setCallOutcome('Called'); setCallNotes(''); setCallDuration('')
  }

  // ----------- BULK UPLOAD WITH PREVIEW -----------
  const handleFileSelect = async (file) => {
    if (!file) return
    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      return showToast('Please upload CSV or Excel file.', 'error')
    }
    setBulkFile(file)
    setBulkStep(2)

    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/leads/preview-upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        setPreviewData(data)
        setColumnMap(data.autoMap || {})
        setBulkStep(2)
      } else {
        showToast('Preview failed. Please check file format.', 'error')
        setBulkStep(1)
      }
    } catch {
      showToast('Server error during preview.', 'error')
      setBulkStep(1)
    }
  }

  const handleBulkImport = async () => {
    if (!bulkFile) return
    setIsUploading(true)
    setBulkStep(3)
    const formData = new FormData()
    formData.append('file', bulkFile)
    formData.append('columnMap', JSON.stringify(columnMap))
    formData.append('dupHandling', dupHandling)
    try {
      const res = await fetch('/api/leads/bulk-upload-mapped', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        setUploadResult(data)
        setBulkStep(4)
        fetchAllData()
        showToast(`Imported: ${data.imported}, Skipped: ${data.skipped}, Updated: ${data.updated}`, 'success')
      } else {
        const err = await res.json()
        showToast(err.error || 'Import failed.', 'error')
        setBulkStep(2)
      }
    } catch {
      showToast('Import failed — server error.', 'error')
      setBulkStep(2)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDownloadTemplate = () => {
    const headers = ['Name', 'Email', 'Mobile', 'State', 'City', 'Course', 'Source']
    const samples = [
      ['Rahul Sharma',  'rahul.sharma@gmail.com',  '9876543210', 'Odisha',        'Bhubaneswar', 'B.Tech CSE',       'Google Ads'    ],
      ['Priya Patel',   'priya.patel@yahoo.com',   '9123456789', 'Andhra Pradesh','Vizianagaram','MBA',              'Facebook Ads'  ],
      ['Amit Kumar',    'amit.kumar@outlook.com',  '8765432109', 'Jharkhand',     'Ranchi',      'BCA',              'Referral'      ],
      ['Sneha Rao',     '',                        '9012345678', 'Telangana',     'Hyderabad',   'B.Sc Agriculture', 'Education Fair'],
      ['Vikram Singh',  'vikram@gmail.com',        '7890123456', 'Bihar',         'Patna',       'B.Tech ECE',       'Walk-in'       ],
    ]
    const csv = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...samples.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = encodeURI(csv)
    a.download = 'CCRM_Lead_Upload_Template.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    showToast('Template downloaded — counselors auto-assigned on upload!', 'success')
  }

  const closeBulkModal = () => {
    setShowBulkModal(false); setBulkStep(1); setBulkFile(null); setPreviewData(null)
    setColumnMap({}); setUploadResult(null); setDupHandling('skip')
  }

  // ----------- DELETE -----------
  const confirmDelete = () => {
    if (deleteConfirm === 'bulk') { selectedRows.forEach(id => deleteLead(id)); setSelectedRows([]) }
    else deleteLead(deleteConfirm)
    setDeleteConfirm(null)
  }

  // ----------- EXPORT -----------
  const handleExport = () => {
    if (!filtered.length) return showToast('No leads to export.', 'warning')
    const hdrs = ['Name','Email','Mobile','State','City','RegDate','Stage','Owner','Source','Score']
    const rows = filtered.map(l => [l.name, l.email, l.mobile, l.state||'', l.city||'', l.regDate||'', l.stage, l.owner||'', l.source||'', l.score||0])
    const csv = "data:text/csv;charset=utf-8," + [hdrs.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n')
    const a = document.createElement('a'); a.href = encodeURI(csv); a.download = `leads_${Date.now()}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    showToast(`Exported ${filtered.length} leads.`, 'success')
  }

  const stateOptions = [...new Set(leads.map(l => l.state).filter(Boolean))]
  const sourceOptions = [...new Set(leads.map(l => l.source).filter(Boolean))]
  const ownerOptions  = [...new Set(leads.map(l => l.owner).filter(Boolean))]
  const stageOptions  = [...new Set(leads.map(l => l.stage).filter(Boolean))]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Lead Manager</h1>
          <div className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-lg p-1">
            {QUICK_VIEWS.map(v => (
              <button key={v} onClick={() => { setQuickView(v); setCurrentPage(1) }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${quickView === v ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <Download size={14} /> Export
          </button>
          <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <Upload size={14} /> Bulk Upload
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5">
            <Plus size={14} /> Add Lead
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search leads by name, email, mobile..."
              value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          {[{label:'Stage', key:'stage', opts:stageOptions},{label:'Owner', key:'owner', opts:ownerOptions},{label:'Source', key:'campaign', opts:sourceOptions},{label:'State', key:'state', opts:stateOptions}].map(f => (
            <div key={f.key} className="relative">
              <select value={filters[f.key]} onChange={e => { setFilters(p => ({ ...p, [f.key]: e.target.value })); setCurrentPage(1) }}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer">
                <option value="">{f.label}</option>
                {f.opts.map(o => <option key={o}>{o}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          ))}
          <button onClick={() => { setFilters({ stage:'', owner:'', campaign:'', state:'' }); setSearch('') }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 flex items-center gap-1">
            <RefreshCw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            Showing <span className="font-semibold text-gray-700">{filtered.length}</span> leads
            {selectedRows.length > 0 && <span className="ml-2 text-primary-600 font-medium">· {selectedRows.length} selected</span>}
          </span>
          {selectedRows.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowWAModal(true)}
                className="flex items-center gap-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg px-2.5 py-1 transition-colors">
                <MessageSquare size={13} /> WhatsApp ({selectedRows.length})
              </button>
              <button onClick={handleEnrollDrip} disabled={dripLoading}
                className="flex items-center gap-1 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg px-2.5 py-1 disabled:opacity-50">
                <Zap size={13} /> {dripLoading ? 'Enrolling...' : 'Drip Enroll'}
              </button>
              {currentUser?.role === 'Admin' && (
                <button onClick={() => setDeleteConfirm('bulk')}
                  className="flex items-center gap-1 text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50">
                  <Trash2 size={13} /> Delete ({selectedRows.length})
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th w-10"><input type="checkbox" checked={selectedRows.length === pageData.length && pageData.length > 0} onChange={toggleAll} className="w-4 h-4 rounded border-gray-300 text-primary-500" /></th>
                <th className="table-th">Lead ID</th>
                <th className="table-th">Name</th>
                <th className="table-th">Email</th>
                <th className="table-th">Mobile</th>
                <th className="table-th">Course</th>
                <th className="table-th">Source</th>
                <th className="table-th">Stage</th>
                <th className="table-th">Score</th>
                <th className="table-th">Owner</th>
                <th className="table-th w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map(lead => {
                const colors = STAGE_COLORS[getStageColorName(lead.stage)] || STAGE_COLORS.blue
                const score = lead.score || 0
                const scoreColor = score >= 70 ? 'text-green-600' : score >= 40 ? 'text-yellow-600' : 'text-red-500'
                return (
                  <tr key={lead.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer border-l-4 ${colors.border}`}
                    onClick={() => navigate(`/leads/${lead.id}`)}>
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedRows.includes(lead.id)} onChange={() => toggleRow(lead.id)} className="w-4 h-4 rounded border-gray-300 text-primary-500" />
                    </td>
                    <td className="table-td">
                      <span className="font-mono text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                        CUTMLD26{String(lead.id).padStart(4, '0')}
                      </span>
                    </td>
                    <td className="table-td">
                      <span className="text-primary-500 hover:text-primary-700 font-medium hover:underline">{lead.name}</span>
                    </td>
                    <td className="table-td text-gray-600 text-xs">{lead.email}</td>
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-700 text-sm">{lead.mobile}</span>
                        <a href={`https://wa.me/91${lead.mobile}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-600" title="WhatsApp">
                          <MessageCircle size={13} />
                        </a>
                        <button onClick={() => { setCallLead(lead); setCallOutcome('Called'); setCallNotes('') }}
                          className="text-blue-400 hover:text-blue-600" title="Log Call">
                          <Phone size={13} />
                        </button>
                      </div>
                    </td>
                    <td className="table-td text-gray-600 text-xs">{lead.course || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{lead.source || '—'}</td>
                    <td className="table-td">
                      <span className={`badge ${colors.bg} ${colors.text}`}>{lead.stage}</span>
                    </td>
                    <td className="table-td">
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-xs font-bold ${scoreColor}`}>{score}</span>
                        <span className={`badge text-[9px] font-bold px-1.5 ${getQualCategory(score).bg} ${getQualCategory(score).text}`}>
                          {getQualCategory(score).label}
                        </span>
                      </div>
                    </td>
                    <td className="table-td text-gray-500 text-xs">{lead.owner || 'Unassigned'}</td>
                    <td className="table-td" onClick={e => e.stopPropagation()}>
                      {currentUser?.role === 'Admin' && (
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(lead.id) }}
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {pageData.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400 text-sm">No leads found matching your criteria.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <span className="text-xs text-gray-500">Page {currentPage} of {totalPages} · {filtered.length} total</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage===1} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><ChevronLeft size={16} /></button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setCurrentPage(p)} className={`w-7 h-7 rounded text-xs font-medium ${p===currentPage ? 'bg-primary-500 text-white' : 'hover:bg-gray-200 text-gray-600'}`}>{p}</button>
            ))}
            {totalPages > 7 && <span className="text-gray-400 text-xs">...</span>}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage===totalPages} className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* ============ ADD LEAD MODAL ============ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Plus className="text-primary-500" size={20}/> Add New Lead</h2>
              <button onClick={() => { setShowAddModal(false); setDupWarning(null) }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* Duplicate Warning Banner */}
            {dupWarning && (
              <div className="mx-6 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={16} className="text-yellow-600" />
                  <span className="text-sm font-semibold text-yellow-800">Possible Duplicate Found</span>
                </div>
                {dupWarning.duplicates.slice(0, 2).map(d => (
                  <div key={d.id} className="text-xs text-yellow-700 mb-1 bg-yellow-100 rounded px-2 py-1">
                    {d.name} · {d.mobile} · {d.stage}
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setDupWarning(null); setShowAddModal(false); navigate(`/leads/${dupWarning.duplicates[0].id}`) }}
                    className="flex-1 text-xs border border-yellow-400 text-yellow-700 rounded-lg px-3 py-1.5 hover:bg-yellow-100">
                    Open Existing Lead
                  </button>
                  <button onClick={(e) => handleCreateLead(e, true)} disabled={addLoading}
                    className="flex-1 text-xs bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50">
                    {addLoading ? 'Saving...' : 'Save Anyway'}
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateLead} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  {key:'name', label:'Student Name *', type:'text', placeholder:'Full name', required:true},
                  {key:'mobile', label:'Mobile Number *', type:'tel', placeholder:'10-digit mobile', required:true},
                  {key:'email', label:'Email Address', type:'email', placeholder:'student@example.com'},
                  {key:'state', label:'State', type:'text', placeholder:'e.g. Odisha'},
                  {key:'city', label:'City', type:'text', placeholder:'e.g. Bhubaneswar'},
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</label>
                    <input type={f.type} value={newLead[f.key]}
                      onChange={e => setNewLead(p => ({ ...p, [f.key]: e.target.value }))}
                      onBlur={f.key === 'mobile' ? handleMobileBlur : undefined}
                      placeholder={f.placeholder} required={f.required}
                      className="input-field text-sm" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Course</label>
                  <select value={newLead.course} onChange={e => setNewLead(p => ({ ...p, course: e.target.value }))} className="input-field text-sm">
                    {COURSES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Lead Source</label>
                  <select value={newLead.source} onChange={e => setNewLead(p => ({ ...p, source: e.target.value }))} className="input-field text-sm">
                    {SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Auto-assign toggle */}
              <div className="flex items-center justify-between bg-primary-50 rounded-xl p-3 border border-primary-100">
                <div className="flex items-center gap-2">
                  <Target size={16} className="text-primary-600" />
                  <span className="text-sm font-medium text-primary-800">Auto-assign to counselor</span>
                  <span className="text-xs text-primary-500">(load-balanced round-robin)</span>
                </div>
                <button type="button" onClick={() => setAutoAssign(!autoAssign)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoAssign ? 'bg-primary-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoAssign ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {!autoAssign && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Assign to Counselor</label>
                  <select value={newLead.owner} onChange={e => setNewLead(p => ({ ...p, owner: e.target.value }))} className="input-field text-sm">
                    <option value="">-- Select --</option>
                    {counselors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => { setShowAddModal(false); setDupWarning(null) }} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button type="submit" disabled={addLoading} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Save size={16} /> {addLoading ? 'Saving...' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ WHATSAPP BULK MODAL ============ */}
      {showWAModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <MessageSquare className="text-green-500" size={22} /> Multi-Channel Outreach
              </h2>
              <button onClick={() => setShowWAModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Sending to <strong className="text-gray-800">{selectedRows.length} leads</strong></p>

            {/* Channel toggles */}
            <div className="flex gap-3 mb-4">
              {[
                { key: 'whatsapp', label: 'WhatsApp', icon: '💬', color: 'border-green-400 bg-green-50 text-green-700' },
                { key: 'sms',      label: 'SMS',       icon: '📱', color: 'border-blue-400 bg-blue-50 text-blue-700'  },
              ].map(ch => (
                <button key={ch.key} type="button"
                  onClick={() => setSendChannels(p => ({ ...p, [ch.key]: !p[ch.key] }))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${sendChannels[ch.key] ? ch.color : 'border-gray-200 bg-white text-gray-400'}`}>
                  <span>{ch.icon}</span> {ch.label}
                  {sendChannels[ch.key] && <span className="text-[10px] bg-current/20 rounded px-1">ON</span>}
                </button>
              ))}
            </div>

            <div className="space-y-3 mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase">Quick Template</label>
              <div className="grid grid-cols-2 gap-2">
                {WA_TEMPLATES.map((t, i) => (
                  <button key={i} type="button" onClick={() => { setWaTemplate(i); setWaCustomMsg('') }}
                    className={`text-left text-xs p-2 rounded-lg border transition ${waTemplate === i && !waCustomMsg ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600 hover:border-green-300'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Message Preview / Custom</label>
              <textarea
                value={waCustomMsg || WA_TEMPLATES[waTemplate].msg}
                onChange={e => setWaCustomMsg(e.target.value)}
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                placeholder="Use {name} for personalization..."
              />
              <p className="text-xs text-gray-400 mt-1">Variables: <code className="bg-gray-100 px-1 rounded">{'{name}'}</code></p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowWAModal(false)} className="flex-1 btn-secondary text-sm py-2.5">Cancel</button>
              <button onClick={handleSendWA} disabled={waSending}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {waSending ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <MessageSquare size={16} />}
                {waSending ? 'Sending...' : `Send to ${selectedRows.length} Leads`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ CALL LOG MODAL ============ */}
      {callLead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Phone size={18} className="text-blue-500" /> Log Call</h2>
              <button onClick={() => setCallLead(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <div className="font-semibold text-slate-800">{callLead.name}</div>
              <a href={`tel:${callLead.mobile}`} className="text-blue-600 font-mono text-lg font-bold flex items-center gap-2">
                <Phone size={16} /> {callLead.mobile}
              </a>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Outcome</label>
                <select value={callOutcome} onChange={e => setCallOutcome(e.target.value)} className="input-field text-sm">
                  {['Called', 'Connected', 'No Answer', 'Busy', 'Callback Requested', 'Not Interested'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Duration</label>
                <input type="text" value={callDuration} onChange={e => setCallDuration(e.target.value)} placeholder="e.g. 3:45" className="input-field text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Notes</label>
                <textarea value={callNotes} onChange={e => setCallNotes(e.target.value)} rows={2} className="input-field text-sm resize-none" placeholder="Call notes..." />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setCallLead(null)} className="flex-1 btn-secondary text-sm py-2">Cancel</button>
              <button onClick={handleLogCall} className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-2">
                <Save size={15} /> Save Call Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ DELETE CONFIRM MODAL ============ */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex flex-col items-center text-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center"><Trash2 size={22} className="text-red-500" /></div>
              <h3 className="font-bold text-gray-900 text-base">Delete Lead{deleteConfirm === 'bulk' ? 's' : ''}</h3>
              <p className="text-sm text-gray-500">{deleteConfirm === 'bulk' ? `Delete ${selectedRows.length} selected leads? Cannot be undone.` : 'Delete this lead permanently?'}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 btn-secondary py-2 text-sm">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 text-sm font-semibold rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ BULK UPLOAD MODAL (with smart column mapper) ============ */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary-50 rounded-lg text-primary-600"><FileSpreadsheet size={20} /></div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Smart Bulk Import</h2>
                  <p className="text-xs text-gray-500">Auto-detects columns · duplicate protection · 100k+ rows</p>
                </div>
              </div>
              {!isUploading && <button onClick={closeBulkModal}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>}
            </div>

            {/* Progress steps */}
            <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 text-xs font-semibold">
              {[{n:1,label:'Upload'},{n:2,label:'Preview & Map'},{n:3,label:'Importing'},{n:4,label:'Done'}].map((s, i, arr) => (
                <React.Fragment key={s.n}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${bulkStep === s.n ? 'bg-primary-500 text-white' : bulkStep > s.n ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                      {bulkStep > s.n ? '✓' : s.n}
                    </div>
                    <span className={bulkStep === s.n ? 'text-primary-600 font-bold' : bulkStep > s.n ? 'text-gray-600' : 'text-gray-400'}>{s.label}</span>
                  </div>
                  {i < arr.length - 1 && <div className="h-px w-8 bg-gray-200" />}
                </React.Fragment>
              ))}
            </div>

            <div className="p-6 overflow-y-auto max-h-[65vh]">
              {/* STEP 1: Upload */}
              {bulkStep === 1 && (
                <div className="space-y-4">
                  <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if(f) handleFileSelect(f) }}
                    className={`border-2 border-dashed rounded-2xl p-12 text-center transition ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'}`}>
                    <FileSpreadsheet size={48} className="mx-auto mb-4 text-primary-300" />
                    <h3 className="font-bold text-gray-700 mb-2">Drag & Drop your Excel / CSV file here</h3>
                    <p className="text-sm text-gray-400 mb-4">Supports .xlsx, .xls, .csv · up to 100,000+ rows</p>
                    <label className="btn-primary cursor-pointer text-sm px-5 py-2 rounded-lg">
                      Browse Files
                      <input type="file" accept=".csv,.xlsx,.xls" onChange={e => handleFileSelect(e.target.files?.[0])} className="hidden" />
                    </label>
                  </div>
                  {/* Download Template */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                        <Download size={14} /> Download CSV Template
                      </p>
                      <p className="text-xs text-emerald-600 mt-0.5">
                        7 columns: Name, Email, Mobile, State, City, Course, Source — counselors are <strong>auto-assigned round-robin</strong>, no Owner column needed
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadTemplate}
                      className="flex-shrink-0 flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 transition-colors font-medium"
                    >
                      <Download size={14} /> Template
                    </button>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                    <p className="font-semibold mb-2 flex items-center gap-2"><HelpCircle size={14} className="text-primary-500" /> How it works</p>
                    <ul className="space-y-1 text-xs list-disc list-inside text-slate-500">
                      <li>Download the template above, fill in your leads, then upload it here</li>
                      <li>Or upload any Excel/CSV — column names are auto-detected</li>
                      <li>Preview and remap columns if needed before import</li>
                      <li>Duplicate mobile numbers are flagged before import</li>
                      <li>All leads get auto-scored based on source and profile</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* STEP 2: Preview + Column Mapper */}
              {bulkStep === 2 && previewData && (
                <div className="space-y-5">
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                      <div className="text-xl font-bold text-blue-700">{previewData.totalRows.toLocaleString()}</div>
                      <div className="text-xs text-blue-500">Total Rows</div>
                    </div>
                    <div className={`rounded-xl p-3 text-center border ${previewData.duplicateCount > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-green-50 border-green-100'}`}>
                      <div className={`text-xl font-bold ${previewData.duplicateCount > 0 ? 'text-yellow-700' : 'text-green-700'}`}>{previewData.duplicateCount}</div>
                      <div className={`text-xs ${previewData.duplicateCount > 0 ? 'text-yellow-500' : 'text-green-500'}`}>~Duplicates (~{previewData.estimatedDupRate}%)</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                      <div className="text-xl font-bold text-slate-700">{previewData.headers.length}</div>
                      <div className="text-xs text-slate-500">Columns Detected</div>
                    </div>
                  </div>

                  {/* Duplicate handling */}
                  {previewData.duplicateCount > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Duplicates detected — how should we handle them?</p>
                      <div className="flex gap-3">
                        {[{v:'skip',label:'Skip duplicates'},{v:'update',label:'Update existing'},{v:'import',label:'Import all'}].map(o => (
                          <label key={o.v} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border cursor-pointer ${dupHandling===o.v ? 'border-yellow-500 bg-yellow-100 font-semibold text-yellow-800' : 'border-yellow-200 text-yellow-700'}`}>
                            <input type="radio" name="dup" value={o.v} checked={dupHandling===o.v} onChange={e => setDupHandling(e.target.value)} className="hidden" />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Column mapper */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-3">Column Mapping <span className="text-xs text-gray-400 font-normal">(auto-detected — adjust if needed)</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      {CRM_FIELDS.map(field => (
                        <div key={field} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          <span className="text-xs font-medium text-slate-600 w-20 capitalize">{field}</span>
                          <ArrowRight size={12} className="text-slate-300 flex-shrink-0" />
                          <select value={columnMap[field] || ''} onChange={e => setColumnMap(p => ({ ...p, [field]: e.target.value }))}
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400">
                            <option value="">-- not mapped --</option>
                            {previewData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview table */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">First 5 rows preview</p>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50">
                          <tr>{previewData.headers.map(h => <th key={h} className="px-3 py-2 text-left text-slate-500 font-medium">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewData.preview.map((row, i) => (
                            <tr key={i}>{previewData.headers.map(h => <td key={h} className="px-3 py-2 text-slate-600 truncate max-w-24">{row[h] || ''}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Importing */}
              {bulkStep === 3 && (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <svg className="animate-spin h-8 w-8 text-primary-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                  <h3 className="font-bold text-gray-800">Importing {previewData?.totalRows?.toLocaleString()} rows...</h3>
                  <p className="text-sm text-gray-400 mt-2">Please wait. Do not close this window.</p>
                </div>
              )}

              {/* STEP 4: Done */}
              {bulkStep === 4 && uploadResult && (
                <div className="py-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 size={36} />
                  </div>
                  <h3 className="font-bold text-lg text-gray-800">Import Complete! 🎉</h3>
                  <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                    <div className="bg-green-50 rounded-xl p-3"><div className="text-xl font-bold text-green-700">{uploadResult.imported}</div><div className="text-xs text-green-500">Imported</div></div>
                    <div className="bg-yellow-50 rounded-xl p-3"><div className="text-xl font-bold text-yellow-700">{uploadResult.skipped}</div><div className="text-xs text-yellow-500">Skipped</div></div>
                    <div className="bg-blue-50 rounded-xl p-3"><div className="text-xl font-bold text-blue-700">{uploadResult.updated}</div><div className="text-xs text-blue-500">Updated</div></div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex gap-3 justify-end">
              <button onClick={closeBulkModal} className="btn-secondary py-2 px-4 text-sm">{bulkStep === 4 ? 'Close' : 'Cancel'}</button>
              {bulkStep === 2 && (
                <button onClick={handleBulkImport}
                  className="btn-primary py-2 px-5 text-sm flex items-center gap-2">
                  <Upload size={15} /> Import {previewData?.totalRows?.toLocaleString()} Leads
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
