import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Download, RefreshCw, ChevronDown,
  ChevronLeft, ChevronRight, MessageCircle, Phone,
  Plus, X, Save, Upload, AlertCircle,
  CheckCircle2, FileSpreadsheet, HelpCircle, Trash2,
  MessageSquare, Zap, Target, BarChart2, ArrowRight,
  Mail, Calendar, ArrowRightLeft
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
  'Unqualified Leads': 'orange', 'Follow Up': 'yellow',
  'Interested': 'green', 'Not Interested': 'red',
  'Process for Payment': 'orange', 'Payment Success': 'emerald',
  // legacy
  'Qualified Leads': 'orange', 'Converted': 'emerald',
}[stage] || 'blue')

const QUICK_VIEWS = ['All Leads', 'My Leads', 'Untouched', 'Follow Up Today', 'Hot Leads']

// Reference Colleges (formerly 'Course Preference') — dropdown only
const REFERENCE_COLLEGES = [
  'CUTM Bhubaneswar',
  'CUTM Paralakhemundi',
  'CUTM Balasore',
  'CUTM Vizianagaram',
  'GIET University',
  'KIIT University',
  'SRM University AP',
  'VIT-AP',
  'Centurion School of Rural Enterprise',
  'Other',
]

// CUTM operates only in Andhra Pradesh and Odisha
const STATES = ['Andhra Pradesh', 'Odisha']

// CUTM campuses
const CAMPUSES = ['Bhubaneswar', 'Paralakhemundi', 'Balasore', 'Vizianagaram']
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
  const { leads, setLeads, addLead, deleteLead, updateLead, currentUser, counselors, showToast, fetchAllData,
          checkDuplicate, getNextAssignee, sendBulkWhatsApp, sendBulkSMS, sendBulkRCS,
          rcsTemplates, fetchRcsTemplates, enrollDrip, logCall } = useCcrm()

  const [selectedRows, setSelectedRows] = useState([])
  const [selectAllPages, setSelectAllPages] = useState(false)
  const [quickView, setQuickView] = useState('All Leads')
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ stage: '', owner: '', campaign: '', state: '' })

  // Add Lead modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [newLead, setNewLead] = useState({ name:'', email:'', mobile:'', state:'', city:'', course:'', source:'Google Ads', owner:'' })
  const [autoAssign, setAutoAssign] = useState(true)
  const [addLoading, setAddLoading] = useState(false)
  const [dupWarning, setDupWarning] = useState(null) // {duplicates, hasDuplicate}

  // Multi-channel send modal
  const [showWAModal, setShowWAModal]   = useState(false)

  // Transfer (re-assign) modal
  const [transferLead, setTransferLead] = useState(null)   // lead being transferred
  const [transferTo, setTransferTo]     = useState('')
  const [transferRemark, setTransferRemark] = useState('')
  const [transferLoading, setTransferLoading] = useState(false)

  const handleSubmitTransfer = async () => {
    if (!transferLead || !transferTo) return showToast('Please pick a counsellor.', 'error')
    setTransferLoading(true)
    try {
      const isAdminOrManager = ['Admin','Manager'].includes(currentUser?.role)
      if (isAdminOrManager) {
        // Direct transfer
        await updateLead(transferLead.id, { owner: transferTo })
        showToast(`Lead transferred to ${transferTo}`, 'success')
      } else {
        // Counsellor request → pending approval
        const res = await fetch('/api/lead-transfers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: transferLead.id,
            fromOwner: currentUser?.name,
            toOwner: transferTo,
            remark: transferRemark
          })
        })
        if (res.ok) showToast('Transfer request submitted for admin approval', 'info')
        else showToast('Failed to submit transfer request', 'error')
      }
    } catch {
      showToast('Transfer failed', 'error')
    }
    setTransferLoading(false)
    setTransferLead(null); setTransferTo(''); setTransferRemark('')
  }

  // Admin: preview + delete junk leads (course-as-name / invalid mobile)
  const handleCleanJunk = async () => {
    try {
      const preview = await fetch('/api/admin/clean-junk-leads').then(r => r.json())
      if (!preview.count) return showToast('No junk leads found — all clean!', 'success')

      const sampleText = (preview.sample || []).slice(0, 8).map(s => `• ${s.name} (${s.mobile || 'no mobile'})`).join('\n')
      if (!confirm(`Found ${preview.count} junk lead(s) — names that look like courses or invalid mobiles:\n\n${sampleText}\n\nDelete all ${preview.count}? This cannot be undone.`)) return

      const res = await fetch('/api/admin/clean-junk-leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPhrase: 'DELETE JUNK' })
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`Removed ${data.deleted} junk leads`, 'success')
        fetchAllData?.()
      } else {
        showToast(data.error || 'Cleanup failed', 'error')
      }
    } catch { showToast('Network error', 'error') }
  }

  const handleSchedule = (lead) => {
    // Quick-schedule via prompt — full calendar event creation lives in lead detail
    const date = prompt(`Schedule follow-up call for ${lead.name}\n\nEnter date+time (DD/MM/YYYY HH:MM):`)
    if (!date) return
    // Reuse addTask mechanism (you can extend to full event creation later)
    showToast(`Reminder scheduled: ${lead.name} — ${date}`, 'success')
  }

  // Dedicated RCS modal state — templates come from context (rcsTemplates)
  const [showRCSModal, setShowRCSModal]   = useState(false)
  const [rcsTemplateId, setRcsTemplateId] = useState('')
  const [rcsType, setRcsType]             = useState('BASIC')
  const [rcsCustomMsg, setRcsCustomMsg]   = useState('')
  const [rcsSending, setRcsSending]       = useState(false)

  // Fetch templates from context whenever RCS modal opens
  useEffect(() => {
    if (!showRCSModal) return
    fetchRcsTemplates?.()
  }, [showRCSModal])

  // Auto-pick first approved template once loaded
  useEffect(() => {
    if (!showRCSModal || rcsTemplateId) return
    const approved = (rcsTemplates || []).find(t => t.status === 'APPROVED')
    if (approved) {
      setRcsTemplateId(approved.templateId)
      setRcsType(approved.rcsType || 'BASIC')
    }
  }, [showRCSModal, rcsTemplates, rcsTemplateId])

  const handleSendRCS = async () => {
    if (!selectedRows.length) return showToast('Select at least one lead.', 'warning')
    if (!rcsTemplateId)         return showToast('Please pick an approved template.', 'error')
    if (!rcsCustomMsg.trim())   return showToast('Please enter the message text.', 'error')
    setRcsSending(true)
    await sendBulkRCS(selectedRows, rcsCustomMsg, { templateId: rcsTemplateId, rcsType })
    setRcsSending(false)
    setShowRCSModal(false)
    setSelectedRows([])
    setSelectAllPages(false)
  }
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
  // Admin only: assignment mode for bulk-upload
  const [assignMode, setAssignMode] = useState('round_robin')
  const [assignedTo, setAssignedTo] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Not Interested modal state
  const [niLead, setNiLead]       = useState(null) // lead being marked NI
  const [niReason, setNiReason]   = useState('')
  const [niOther, setNiOther]     = useState('')

  const NI_REASONS = [
    'Budget Constraints', 'Already Enrolled Elsewhere', 'Not Reachable',
    'Not Eligible', 'Course Not Available', 'Location Issue', 'Other'
  ]

  const handleMarkNotInterested = async () => {
    if (!niReason) return showToast('Please select a reason.', 'error')
    const reason = niReason === 'Other' ? (niOther || 'Other') : niReason
    await updateLead(niLead.id, { stage: 'Not Interested', stageColor: 'red', not_interested_reason: reason })
    setNiLead(null); setNiReason(''); setNiOther('')
    showToast(`Lead marked as Not Interested: ${reason}`, 'info')
  }

  // Mark as "Unable to Connect" → moves the lead to Follow Up stage
  const handleUnableToConnect = async (lead) => {
    await updateLead(lead.id, {
      stage: 'Follow Up',
      stageColor: 'yellow',
      not_interested_reason: 'Unable to Connect — needs follow-up'
    })
    showToast(`${lead.name} marked as Unable to Connect — moved to Follow Up`, 'info')
  }

  const rowsPerPage = 15

  // ----------- FILTERS -----------
  // Counselors see only their own leads; Admin/Manager see all
  const visibleLeads = (currentUser?.role === 'Admin' || currentUser?.role === 'Manager')
    ? leads
    : leads.filter(l => l.owner?.toLowerCase() === (currentUser?.name || '').toLowerCase())

  const matchQuickView = (l) => {
    if (quickView === 'All Leads') return true
    if (quickView === 'My Leads') return l.owner?.toLowerCase().includes(currentUser?.name?.split(' ')[0]?.toLowerCase() || '')
    if (quickView === 'Untouched') return l.stage === 'Untouched'
    if (quickView === 'Follow Up Today') return l.stage === 'Follow Up' || l.stage === 'Process for Payment'
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
  const filtered = visibleLeads.filter(l => {
    const s = search.toLowerCase()
    return (!search || l.name.toLowerCase().includes(s) || (l.email || '').toLowerCase().includes(s) || l.mobile.includes(s) || (l.city || '').toLowerCase().includes(s))
      && matchQuickView(l) && matchSelectFilters(l)
  })
  const totalPages = Math.ceil(filtered.length / rowsPerPage) || 1
  const pageData = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
  
  const toggleRow = (id) => setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id])
  
  const toggleAll = () => {
    if (selectAllPages) {
      setSelectedRows([])
      setSelectAllPages(false)
    } else if (selectedRows.length === pageData.length && pageData.length > 0) {
      setSelectedRows([])
    } else {
      setSelectedRows(pageData.map(r => r.id))
    }
  }

  const handleSelectAllPages = () => {
    setSelectedRows(filtered.map(l => l.id))
    setSelectAllPages(true)
  }

  const handleClearSelection = () => {
    setSelectedRows([])
    setSelectAllPages(false)
  }

  // ----------- ADD LEAD WITH DEDUP + AUTO-ASSIGN -----------
  const handleMobileBlur = async () => {
    if (!newLead.mobile || newLead.mobile.length < 7) return
    const result = await checkDuplicate(newLead.mobile, newLead.email)
    setDupWarning(result.hasDuplicate ? result : null)
  }

  const handleCreateLead = async (e, forceSave = false) => {
    e?.preventDefault()
    if (!newLead.name || !newLead.mobile) return showToast('Name and Mobile are required.', 'error')
    // Reference college is optional — counsellor can pick later from the dropdown
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
    setNewLead({ name:'', email:'', mobile:'', state:'', city:'', course:'', source:'Google Ads', owner:'' })
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
    const stageBonus = {
      'Interested':20,'Process for Payment':20,'Payment Success':25,
      'Follow Up':15,'Contacted':10,'Untouched':0,'Unverified':2,
      'Not Interested':0,'Unqualified Leads':0,
      // legacy
      'Qualified Leads':20,'Converted':25
    }[lead.stage] || 0

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
    if (sendChannels.sms)      await sendBulkSMS(selectedRows, tmpl)
    setWaSending(false)
    setShowWAModal(false)
    setSelectedRows([])
    setSelectAllPages(false)
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
    setSelectAllPages(false)
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
    // Pass uploader identity — counselor assigns to self, admin does round-robin
    formData.append('uploaderRole', currentUser?.role || 'Admin')
    formData.append('uploaderName', currentUser?.name || '')
    // Admin assignment choice (ignored when counsellor uploads)
    formData.append('assignMode', assignMode)
    if (assignMode === 'specific') formData.append('assignedTo', assignedTo || '')
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
    // Course is OPTIONAL — counsellor can fill it in CRM after import
    const headers = ['Name', 'Mobile', 'Source', 'Email (Optional)', 'State (Optional)', 'City (Optional)', 'Course (Optional)']
    const samples = [
      ['Rahul Sharma',  '9876543210', 'AI', 'rahul@gmail.com', 'Odisha',        'Bhubaneswar',  ''],
      ['Priya Patel',   '9123456789', 'SM', 'priya@yahoo.com', 'Andhra Pradesh','Vizianagaram', 'MBA'],
      ['Amit Kumar',    '8765432109', 'AI', '',                'Jharkhand',     'Ranchi',       ''],
      ['Sneha Rao',     '9012345678', 'SM', '',                '',              '',             ''],
      ['Vikram Singh',  '7890123456', 'AI', 'vikram@gmail.com','Bihar',         'Patna',        'B.Tech CSE'],
    ]
    const csv = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...samples.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = encodeURI(csv)
    a.download = 'CCRM_Lead_Upload_Template.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    showToast('Template downloaded — only Name, Mobile, Source are required', 'success')
  }

  const closeBulkModal = () => {
    setShowBulkModal(false); setBulkStep(1); setBulkFile(null); setPreviewData(null)
    setColumnMap({}); setUploadResult(null); setDupHandling('skip')
  }

  // ----------- DELETE -----------
  const confirmDelete = () => {
    if (deleteConfirm === 'bulk') { 
      selectedRows.forEach(id => deleteLead(id))
      setSelectedRows([])
      setSelectAllPages(false)
    }
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

  const stateOptions = [...new Set(visibleLeads.map(l => l.state).filter(Boolean))]
  const sourceOptions = [...new Set(visibleLeads.map(l => l.source).filter(Boolean))]
  const ownerOptions  = currentUser?.role === 'Admin' || currentUser?.role === 'Manager'
    ? [...new Set(leads.map(l => l.owner).filter(Boolean))]
    : []
  const stageOptions  = [...new Set(visibleLeads.map(l => l.stage).filter(Boolean))]

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
          {currentUser?.role === 'Admin' && (
            <button onClick={handleCleanJunk} className="flex items-center gap-1.5 text-sm text-orange-600 border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-50">
              🧹 Clean Junk
            </button>
          )}
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Showing <span className="font-semibold text-gray-700">{filtered.length}</span> leads
              {selectedRows.length > 0 && (
                <span className="ml-2 text-primary-600 font-medium">· {selectedRows.length} selected</span>
              )}
            </span>
            {/* "Select all N leads" banner */}
            {selectedRows.length === pageData.length && pageData.length > 0 && !selectAllPages && filtered.length > rowsPerPage && (
              <button
                onClick={handleSelectAllPages}
                className="text-xs text-primary-600 hover:text-primary-800 underline underline-offset-2 font-medium"
              >
                Select all {filtered.length} leads
              </button>
            )}
            {selectAllPages && (
              <span className="text-xs text-primary-700 font-semibold bg-primary-50 border border-primary-200 rounded-lg px-2 py-0.5">
                All {filtered.length} leads selected ·{' '}
                <button onClick={handleClearSelection} className="underline hover:no-underline">Clear</button>
              </span>
            )}
          </div>
          {selectedRows.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowWAModal(true)}
                className="flex items-center gap-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg px-2.5 py-1 transition-colors">
                <MessageSquare size={13} /> WhatsApp ({selectedRows.length})
              </button>
              <button onClick={() => { setShowRCSModal(true); setRcsCustomMsg('') }}
                className="flex items-center gap-1 text-xs bg-pink-500 hover:bg-pink-600 text-white rounded-lg px-2.5 py-1 transition-colors">
                ✨ RCS ({selectedRows.length})
              </button>
              <button onClick={handleEnrollDrip} disabled={dripLoading}
                className="flex items-center gap-1 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded-lg px-2.5 py-1 disabled:opacity-50">
                <Zap size={13} /> {dripLoading ? 'Enrolling...' : 'Drip Enroll'}
              </button>
              {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                <button onClick={() => setDeleteConfirm('bulk')}
                  className="flex items-center gap-1 text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50 transition-colors">
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
                <th className="table-th">Date Added</th>
                <th className="table-th">Mobile</th>
                <th className="table-th">Ref. College</th>
                <th className="table-th">Source</th>
                <th className="table-th">Stage</th>
                <th className="table-th">
                  <span
                    className="inline-flex items-center gap-1 cursor-help"
                    title={
                      'AI Lead Score (0-100) — predicts conversion likelihood.\n\n' +
                      '• Source quality (0-30): Referral / Walk-in / Education Fair score highest\n' +
                      '• Course tier (0-25): MBA / B.Tech CSE / M.Tech score highest\n' +
                      '• Profile completeness (0-25): Email +10, State +8, City +7\n' +
                      '• Stage engagement (0-20): Interested / Process for Payment\n\n' +
                      'Buckets:\n' +
                      '🔥 75+ Hot · 🌟 50-74 Warm · 🌱 25-49 Nurture · ❄️ <25 Cold'
                    }
                  >
                    Score <HelpCircle size={10} className="text-gray-400" />
                  </span>
                </th>
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
                        {lead.sourceType === 'sm' ? 'CULDSM26' : 'CULDAI26'}{String(lead.id).padStart(4,'0')}
                      </span>
                    </td>
                    <td className="table-td">
                      <span className="text-primary-500 hover:text-primary-700 font-medium hover:underline">{lead.name}</span>
                    </td>
                    <td className="table-td text-gray-600 text-xs whitespace-nowrap" title={lead.email ? `Email: ${lead.email}` : 'No email on file'}>
                      {lead.regDate
                        ? lead.regDate.split(',')[0]   // "DD/MM/YYYY, HH:MM" → "DD/MM/YYYY"
                        : '—'}
                    </td>
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
                    <td className="table-td text-xs">
                      {lead.course
                        ? <span className="text-gray-600">{lead.course}</span>
                        : <span className="text-blue-400 italic hover:text-blue-600 hover:underline" title="Click row to open lead and pick reference college">+ Pick college</span>}
                    </td>
                    <td className="table-td text-gray-500 text-xs">{lead.source || '—'}</td>
                    <td className="table-td">
                      <div className="flex flex-col gap-0.5">
                        <span className={`badge ${colors.bg} ${colors.text}`}>{lead.stage}</span>
                        {lead.notInterestedReason && (
                          <span className="text-[9px] text-red-500 italic truncate max-w-24" title={lead.notInterestedReason}>
                            {lead.notInterestedReason}
                          </span>
                        )}
                      </div>
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
                      <div className="flex items-center gap-1">
                        {/* Interested — green pill */}
                        {!['Interested','Not Interested','Process for Payment','Payment Success'].includes(lead.stage) && (
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}
                            className="text-[10px] px-2 py-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 font-semibold whitespace-nowrap"
                            title="Open lead to mark Interested or change stage">
                            ✓ Interested
                          </button>
                        )}
                        {/* Unable to Connect — hides once you've connected (Contacted, Interested, etc.) */}
                        {!['Contacted','Follow Up','Interested','Not Interested','Process for Payment','Payment Success'].includes(lead.stage) && (
                          <button
                            onClick={e => { e.stopPropagation(); handleUnableToConnect(lead) }}
                            className="text-[10px] px-2 py-1 rounded-md bg-yellow-100 text-yellow-700 hover:bg-yellow-200 font-semibold whitespace-nowrap"
                            title="Unable to Connect — move to Follow Up">
                            📞 Unable to Connect
                          </button>
                        )}
                        {/* Not Interested — hides once they've shown interest */}
                        {!['Interested','Not Interested','Process for Payment','Payment Success'].includes(lead.stage) && (
                          <button
                            onClick={e => { e.stopPropagation(); setNiLead(lead); setNiReason(''); setNiOther('') }}
                            className="text-[10px] px-2 py-1 rounded-md bg-red-100 text-red-600 hover:bg-red-200 font-semibold whitespace-nowrap"
                            title="Mark as Not Interested with reason">
                            ✗ Not Interested
                          </button>
                        )}
                        {/* Email — opens mailto if email present */}
                        {lead.email && !lead.email.includes('noemail') && (
                          <a href={`mailto:${lead.email}?subject=${encodeURIComponent('Regarding your CUTM application')}`}
                            onClick={e => e.stopPropagation()}
                            className="p-1 rounded hover:bg-purple-50 text-gray-400 hover:text-purple-500" title={`Email ${lead.email}`}>
                            <Mail size={12} />
                          </a>
                        )}
                        {/* Schedule callback */}
                        <button onClick={e => { e.stopPropagation(); handleSchedule(lead) }}
                          className="p-1 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-500" title="Schedule follow-up">
                          <Calendar size={12} />
                        </button>
                        {/* Transfer (re-assign) — Admin/Manager direct, Counsellor requests approval */}
                        <button onClick={e => { e.stopPropagation(); setTransferLead(lead); setTransferTo(''); setTransferRemark('') }}
                          className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500" title="Transfer lead to another counsellor">
                          <ArrowRightLeft size={12} />
                        </button>
                        {/* Delete: Admin/Manager anytime; Counsellor only own + Untouched */}
                        {(() => {
                          const isAdmin = ['Admin','Manager'].includes(currentUser?.role)
                          const ownsIt = lead.owner === currentUser?.name || lead.owner?.split(' ')[0] === currentUser?.name?.split(' ')[0]
                          const canDelete = isAdmin || (ownsIt && lead.stage === 'Untouched')
                          if (!canDelete) return null
                          return (
                            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(lead.id) }}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                              title={isAdmin ? 'Delete' : 'Delete your untouched lead'}>
                              <Trash2 size={12} />
                            </button>
                          )
                        })()}
                      </div>
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
                  {key:'name',   label:'Student Name *',  type:'text',  placeholder:'Full name', required:true},
                  {key:'mobile', label:'Mobile Number *',  type:'tel',   placeholder:'10-digit mobile', required:true},
                  {key:'email',  label:'Email (Optional)', type:'email', placeholder:'student@example.com'},
                  {key:'city',   label:'City (Optional)',  type:'text',  placeholder:'e.g. Bhubaneswar'},
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

                {/* State — AP / Odisha only */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">State (Optional)</label>
                  <select value={newLead.state} onChange={e => setNewLead(p => ({ ...p, state: e.target.value }))} className="input-field text-sm">
                    <option value="">— Select state —</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Campus — dropdown of CUTM campuses */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Campus (Optional)</label>
                  <select value={newLead.campus || ''} onChange={e => setNewLead(p => ({ ...p, campus: e.target.value }))} className="input-field text-sm">
                    <option value="">— Select campus —</option>
                    {CAMPUSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Reference College — was Course Preference; dropdown only */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Reference College</label>
                  <select value={newLead.course} onChange={e => setNewLead(p => ({ ...p, course: e.target.value }))} className="input-field text-sm">
                    <option value="">— Select reference college —</option>
                    {REFERENCE_COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
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

      {/* ============ RCS DEDICATED MODAL ============ */}
      {showRCSModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <span className="text-2xl">✨</span> RCS Business Messaging
              </h2>
              <button onClick={() => setShowRCSModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Sending to <strong className="text-gray-800">{selectedRows.length} leads</strong> via rcssms.in
            </p>

            {/* Template picker */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Approved Template *</label>
              {rcsTemplates.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
                  ⚠️ No templates available. Go to <button onClick={() => navigate('/integrations')} className="font-semibold underline">Integrations</button> to add or wait for webhook approval.
                </div>
              ) : (
                <>
                  <select value={rcsTemplateId} onChange={e => {
                    const t = rcsTemplates.find(x => x.templateId === e.target.value)
                    setRcsTemplateId(e.target.value)
                    if (t?.rcsType) setRcsType(t.rcsType)
                  }} className="input-field text-sm">
                    <option value="">— Select template —</option>
                    {rcsTemplates.map(t => (
                      <option key={t.templateId} value={t.templateId} disabled={t.status !== 'APPROVED'}>
                        {t.name || t.templateId} — {t.rcsType} {t.status === 'APPROVED' ? '✓' : `(${t.status})`}
                      </option>
                    ))}
                  </select>
                  {rcsTemplateId && (
                    <div className="text-[10px] text-gray-400 mt-1">
                      Type: <strong className="text-pink-600">{rcsType}</strong> · Variables: as defined in template (will be filled with the message text below)
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Message body */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Message Variable Content *</label>
              <textarea
                value={rcsCustomMsg}
                onChange={e => setRcsCustomMsg(e.target.value)}
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
                placeholder="Use {name} for personalization. This text fills the template's variable slot."
              />
              <p className="text-xs text-gray-400 mt-1">Variables: <code className="bg-gray-100 px-1 rounded">{'{name}'}</code></p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowRCSModal(false)} className="flex-1 btn-secondary text-sm py-2.5">Cancel</button>
              <button onClick={handleSendRCS} disabled={rcsSending || !rcsTemplateId}
                className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2">
                {rcsSending ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <span>✨</span>}
                {rcsSending ? 'Sending...' : `Send RCS to ${selectedRows.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ WHATSAPP BULK MODAL ============ */}
      {showWAModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <MessageSquare className="text-green-500" size={22} /> WhatsApp / SMS Outreach
              </h2>
              <button onClick={() => setShowWAModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Sending to <strong className="text-gray-800">{selectedRows.length} leads</strong></p>

            {/* Channel toggles */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { key: 'whatsapp', label: 'WhatsApp', icon: '💬', color: 'border-green-400 bg-green-50 text-green-700' },
                { key: 'sms',      label: 'SMS',       icon: '📱', color: 'border-blue-400  bg-blue-50  text-blue-700'  },
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

      {/* ============ NOT INTERESTED MODAL ============ */}
      {niLead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <X size={16} className="text-red-500" /> Not Interested
              </h2>
              <button onClick={() => setNiLead(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Mark <strong>{niLead.name}</strong> as Not Interested and record reason.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Reason *</label>
                <select value={niReason} onChange={e => setNiReason(e.target.value)} className="input-field text-sm">
                  <option value="">-- Select reason --</option>
                  {NI_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              {niReason === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Specify</label>
                  <input value={niOther} onChange={e => setNiOther(e.target.value)}
                    className="input-field text-sm" placeholder="Enter reason..." />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setNiLead(null)} className="flex-1 btn-secondary text-sm">Cancel</button>
              <button onClick={handleMarkNotInterested}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ TRANSFER LEAD MODAL ============ */}
      {transferLead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-blue-500" /> Transfer Lead
              </h2>
              <button onClick={() => setTransferLead(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-sm">
              <p className="font-semibold text-blue-800">{transferLead.name}</p>
              <p className="text-xs text-blue-600 mt-0.5">Currently with: <strong>{transferLead.owner || 'Unassigned'}</strong></p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Transfer to *</label>
                <select value={transferTo} onChange={e => setTransferTo(e.target.value)} className="input-field text-sm">
                  <option value="">— Pick counsellor —</option>
                  {(counselors || []).filter(c => c.name !== transferLead.owner).map(c => (
                    <option key={c.id || c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Remark (optional)</label>
                <textarea value={transferRemark} onChange={e => setTransferRemark(e.target.value)}
                  rows={3} placeholder="Why transfer? Hand-off context for the new counsellor..."
                  className="input-field text-sm resize-none" />
              </div>
              {!['Admin','Manager'].includes(currentUser?.role) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-xs text-yellow-700">
                  ⚠️ Your request will be sent to admin for approval before the transfer happens.
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setTransferLead(null)} className="flex-1 btn-secondary text-sm py-2">Cancel</button>
              <button onClick={handleSubmitTransfer} disabled={transferLoading || !transferTo}
                className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1.5 disabled:opacity-50">
                {transferLoading ? <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> : <ArrowRightLeft size={13} />}
                {['Admin','Manager'].includes(currentUser?.role) ? 'Transfer Now' : 'Request Transfer'}
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
              <p className="text-sm text-gray-500">
                {deleteConfirm === 'bulk' 
                  ? `Delete ${selectedRows.length} selected lead${selectedRows.length !== 1 ? 's' : ''}? This cannot be undone.` 
                  : 'Delete this lead permanently?'
                }
              </p>
              {deleteConfirm === 'bulk' && selectedRows.length > 0 && (
                <div className="max-h-40 overflow-y-auto w-full bg-gray-50 rounded-lg p-2 mt-2 text-left">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Leads to delete:</p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    {selectedRows.slice(0, 10).map(id => {
                      const lead = filtered.find(l => l.id === id)
                      return lead ? (
                        <li key={id} className="truncate">
                          • {lead.name} ({lead.mobile})
                        </li>
                      ) : null
                    })}
                    {selectedRows.length > 10 && (
                      <li className="text-gray-400 italic">+ {selectedRows.length - 10} more...</li>
                    )}
                  </ul>
                </div>
              )}
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
                        <strong>Required:</strong> Name, Mobile, Source (AI or SM) ·
                        <strong> Optional:</strong> Email, State, City, Course (counsellor can fill later)
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

                  {/* Duplicate handling — always shown so user picks intentionally */}
                  <div className={`rounded-xl p-4 border ${previewData.duplicateCount > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
                    <p className={`text-sm font-semibold mb-2 ${previewData.duplicateCount > 0 ? 'text-yellow-800' : 'text-blue-800'}`}>
                      {previewData.duplicateCount > 0
                        ? `⚠️ ${previewData.duplicateCount} duplicate${previewData.duplicateCount === 1 ? '' : 's'} found in first 20 rows — what should we do?`
                        : '🔄 Duplicate Handling (applies when mobile/email already exists)'
                      }
                    </p>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { v: 'skip',   label: 'Skip duplicates',   desc: 'Default — leave existing leads untouched' },
                        { v: 'update', label: 'Update existing',   desc: 'Refresh name/course/source on matched leads' },
                        { v: 'import', label: 'Import all',        desc: 'Always create new leads (allows dupes)' },
                      ].map(o => (
                        <label key={o.v} className={`flex-1 min-w-[140px] cursor-pointer p-3 rounded-lg border-2 transition ${dupHandling === o.v ? 'border-primary-500 bg-white shadow-sm' : 'border-gray-200 bg-white/50 hover:border-primary-300'}`}>
                          <input type="radio" name="dup" value={o.v} checked={dupHandling === o.v} onChange={e => setDupHandling(e.target.value)} className="hidden" />
                          <div className={`text-sm font-semibold ${dupHandling === o.v ? 'text-primary-700' : 'text-gray-700'}`}>{o.label}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">{o.desc}</div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Lead assignment — admins choose round-robin OR specific counsellor */}
                  {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
                    <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-primary-800 mb-3 flex items-center gap-1.5">
                        <Target size={14} /> Lead Assignment
                      </p>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {[
                          { v: 'round_robin', label: '🔄 Round-Robin',          desc: 'Distribute equally across all active counsellors' },
                          { v: 'specific',    label: '👤 Specific Counsellor',  desc: 'Assign ALL leads in this upload to one person' },
                        ].map(o => (
                          <label key={o.v}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition ${assignMode === o.v ? 'border-primary-500 bg-white shadow-sm' : 'border-primary-100 bg-white/50 hover:border-primary-300'}`}>
                            <input type="radio" name="assign-mode" value={o.v}
                              checked={assignMode === o.v}
                              onChange={e => setAssignMode(e.target.value)}
                              className="hidden" />
                            <div className={`font-semibold text-sm ${assignMode === o.v ? 'text-primary-700' : 'text-gray-600'}`}>{o.label}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">{o.desc}</div>
                          </label>
                        ))}
                      </div>
                      {assignMode === 'specific' && (
                        <div>
                          <label className="block text-xs font-semibold text-primary-700 mb-1">Assign to *</label>
                          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                            className="input-field text-sm">
                            <option value="">— Choose counsellor —</option>
                            {(counselors || []).map(c => (
                              <option key={c.id || c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                          {!assignedTo && <p className="text-[11px] text-red-500 mt-1">Please pick a counsellor before importing.</p>}
                        </div>
                      )}
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
                <div className="py-6 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 size={36} />
                  </div>
                  <h3 className="font-bold text-lg text-gray-800">Import Complete! 🎉</h3>
                  <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                    <div className="bg-green-50 rounded-xl p-3"><div className="text-xl font-bold text-green-700">{uploadResult.imported}</div><div className="text-xs text-green-500">Imported</div></div>
                    <div className="bg-yellow-50 rounded-xl p-3"><div className="text-xl font-bold text-yellow-700">{uploadResult.skipped}</div><div className="text-xs text-yellow-500">Skipped</div></div>
                    <div className="bg-blue-50 rounded-xl p-3"><div className="text-xl font-bold text-blue-700">{uploadResult.updated}</div><div className="text-xs text-blue-500">Updated</div></div>
                  </div>

                  {/* Hint when most rows skipped */}
                  {uploadResult.hint && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-left max-w-2xl mx-auto">
                      <p className="text-sm text-yellow-800 whitespace-pre-line">{uploadResult.hint}</p>
                    </div>
                  )}

                  {/* Sample skip reasons */}
                  {uploadResult.skipReasons?.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left max-w-2xl mx-auto">
                      <p className="text-xs font-bold text-gray-600 uppercase mb-2">Why rows were skipped (first {uploadResult.skipReasons.length})</p>
                      <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                        {uploadResult.skipReasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                      <p className="text-[11px] text-gray-400 mt-3">
                        Tip: switch the <strong>Duplicate Handling</strong> option above from "Skip" to <strong>"Update existing"</strong> if you want these rows to refresh existing leads.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex gap-3 justify-end">
              <button onClick={closeBulkModal} className="btn-secondary py-2 px-4 text-sm">{bulkStep === 4 ? 'Close' : 'Cancel'}</button>
              {bulkStep === 2 && (
                <button onClick={handleBulkImport}
                  disabled={assignMode === 'specific' && !assignedTo}
                  className="btn-primary py-2 px-5 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
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
