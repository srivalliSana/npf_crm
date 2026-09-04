import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, MessageCircle, Mail, Share2, Edit3,
  Calendar, ArrowRightLeft, Star, Phone, MapPin, X,
  User, BookOpen, Building2, GraduationCap, ChevronRight,
  Clock, CheckCircle2, Circle, AlertCircle, Plus, Send, Save, HelpCircle, PhoneCall, Sparkles
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'
import RcsComposeModal from '../components/RcsComposeModal'
import LeadJourney from '../components/LeadJourney'
import AdmissionMethodModal from '../components/AdmissionMethodModal'
import { Modal, Button } from '../components/ui'

// Ameyo calls removed — use EasyGoIVR via initiateCall() from context

const APP_STAGES = [
  'Unverified',
  'Verified',
  'Application Started',
  'Payment Approved',
  'Application Submitted',
  'Enrolment',
]

const LEAD_STAGES = [
  'Untouched',
  'Contacted',
  'Invalid Number',
  'No Response',
  'Follow Up',
  'Interested',
  'Campus Visit Scheduled',
  'Campus Visit Completed',
  'Process for Payment',
  'Payment Success',
]

// Alias used generically (kept for backward compat)
const STAGES = APP_STAGES

const TABS = [
  'Lead Details',
  'Timeline',
  'Calendar Pro',
  'Notes',
  'Communication Logs',
  'Tickets',
  'Documents',
]

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export default function ApplicationDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isApp = location.pathname.startsWith('/applications')

  const {
    leads, updateLead,
    applications, updateApplication,
    addApplication,
    tasks, addTask,
    queries, addQuery, updateQueryStatus, addQueryReply,
    events, addEvent,
    payments, fetchAllData,
    documents, uploadDocument, updateDocStatus, deleteDocument,
    generatePaymentLink,
    users, counselors,
    showToast, currentUser,
    initiateCall
  } = useCcrm()

  // The context only holds a recent slice of leads (the full table is paginated
  // server-side), so a lead opened from search / an older page may not be in it.
  // Fetch the single record by id as a fallback.
  const [fetchedLead, setFetchedLead] = useState(null)
  useEffect(() => {
    if (isApp) { setFetchedLead(null); return }
    const idNum = parseInt(id)
    if (!idNum) return
    if (leads.find(l => l.id === idNum)) { setFetchedLead(null); return }
    const token = localStorage.getItem('ccrm_token')
    fetch(`/api/leads/${idNum}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => setFetchedLead(d || null))
      .catch(() => setFetchedLead(null))
  }, [id, isApp, leads])

  // 1. Fetch current lead or application
  let record = null
  let associatedLead = null
  let associatedApp = null

  if (isApp) {
    record = applications.find(a => a.id === parseInt(id)) || applications[0]
    if (record) {
      associatedApp = record
      associatedLead = leads.find(l => l.email?.toLowerCase() === record.email?.toLowerCase() || l.name?.toLowerCase() === record.name?.toLowerCase())
    }
  } else {
    record = leads.find(l => l.id === parseInt(id)) || fetchedLead || null
    if (record) {
      associatedLead = record
      associatedApp = applications.find(a => a.email?.toLowerCase() === record.email?.toLowerCase() || a.name?.toLowerCase() === record.name?.toLowerCase())
    }
  }

  // Fallback to empty if not found
  if (!record) {
    record = { name: 'Student Not Found', email: '', mobile: '' }
  }

  // Derive unified student attributes
  const studentName = record.name || ''
  const studentEmail = record.email || ''
  const studentMobile = record.mobile || ''
  const studentState = record.state || associatedLead?.state || 'Odisha'
  const studentCity = record.city || associatedLead?.city || 'Bhubaneswar'
  const leadStage = record.stage && !isApp ? record.stage : (associatedLead?.stage || 'Contacted')
  const appStage = isApp ? record.stage : (associatedApp?.stage || 'Unverified')
  const score = record.score || associatedLead?.score || 68
  const owner = record.owner || associatedLead?.owner || 'Vikram K.'
  const source = record.source || associatedLead?.source || 'Website'
  const altMobile = record.altMobile || associatedLead?.altMobile || ''
  const formInterest = record.formInterest || associatedLead?.formInterest || 'CUEE 2026'
  const campus = record.campus || associatedApp?.campus || 'Bhubaneswar'
  const school = record.school || associatedLead?.school || 'School of Engineering'
  const course = record.course || associatedApp?.course || 'B.Tech CSE'
  const followup = record.followup || associatedLead?.followup || 'Next week'
  const lastActive = record.lastActive || associatedLead?.lastActive || 'Today'

  const [activeTab, setActiveTab] = useState('Lead Details')
  const [callInitiating, setCallInitiating] = useState(false)
  const [easyGoReady, setEasyGoReady]       = useState(null)
  const [showRcsModal, setShowRcsModal]   = useState(false)

  // Payment modal state
  const [showPayModal, setShowPayModal]   = useState(false)
  const [payMode, setPayMode]             = useState('online')  // 'online' | 'offline'
  const [utrNumber, setUtrNumber]         = useState('')
  const [paySubmitting, setPaySubmitting] = useState(false)

  // Not Interested modal state
  const [showNiModal, setShowNiModal] = useState(false)

  // Admission details modal + letter send state
  const [showAdmissionForm, setShowAdmissionForm] = useState(false)
  const [letterSending, setLetterSending]         = useState(false)
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)
  const [showAdmissionMethodModal, setShowAdmissionMethodModal] = useState(false)
  const [admissionEmail, setAdmissionEmail] = useState('')
  const [admissionSending, setAdmissionSending] = useState(false)
  const [adForm, setAdForm] = useState(() => ({
    studentName: '', studentEmail: '', studentMobile: '',
    parentName: '', parentEmail: '', parentMobile: '',
    aadharNumber: '', address: '', pincode: '',
    tenthBoard: '', tenthSchool: '', tenthPercentage: '', tenthYear: '',
    twelfthBoard: '', twelfthSchool: '', twelfthPercentage: '', twelfthYear: '',
    joiningCourse: '', schoolDept: '', seatBookingAmount: '10000'
  }))
  const [adSaving, setAdSaving] = useState(false)

  // Hydrate form from existing record/app on first open
  useEffect(() => {
    if (!showAdmissionForm) return
    const d = associatedApp?.admissionDetails || {}
    setAdForm(prev => ({
      ...prev,
      studentName:   d.studentName   || studentName,
      studentEmail:  d.studentEmail  || studentEmail,
      studentMobile: d.studentMobile || studentMobile,
      parentName:    d.parentName    || prev.parentName,
      parentEmail:   d.parentEmail   || prev.parentEmail,
      parentMobile:  d.parentMobile  || prev.parentMobile,
      aadharNumber:  d.aadharNumber  || prev.aadharNumber,
      address:       d.address       || prev.address,
      pincode:       d.pincode       || prev.pincode,
      tenthBoard:    d.tenthBoard    || prev.tenthBoard,
      tenthSchool:   d.tenthSchool   || prev.tenthSchool,
      tenthPercentage: d.tenthPercentage || prev.tenthPercentage,
      tenthYear:     d.tenthYear     || prev.tenthYear,
      twelfthBoard:  d.twelfthBoard  || prev.twelfthBoard,
      twelfthSchool: d.twelfthSchool || prev.twelfthSchool,
      twelfthPercentage: d.twelfthPercentage || prev.twelfthPercentage,
      twelfthYear:   d.twelfthYear   || prev.twelfthYear,
      joiningCourse: d.joiningCourse || associatedApp?.course || course,
      schoolDept:    d.schoolDept    || associatedApp?.schoolDept || '',
      seatBookingAmount: d.seatBookingAmount || '10000',
    }))
  }, [showAdmissionForm, associatedApp, studentName, studentEmail, studentMobile, course])

  const handleSaveAdmissionDetails = async () => {
    if (!associatedApp?.id) return showToast('Application must exist first. Move the lead to "Process for Payment" to create one.', 'warning')
    if (!adForm.studentName || !adForm.studentMobile) return showToast('Student name and mobile are required.', 'error')
    setAdSaving(true)
    try {
      const res = await fetch(`/api/applications/${associatedApp.id}/admission-details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adForm)
      })
      if (res.ok) {
        showToast('Admission details saved.', 'success')
        await fetchAllData()
        setShowAdmissionForm(false)
      } else {
        const e = await res.json()
        showToast(e.error || 'Save failed.', 'error')
      }
    } catch { showToast('Network error.', 'error') }
    setAdSaving(false)
  }

  const handleSendLetter = async () => {
    if (!associatedApp?.id) return
    setLetterSending(true)
    try {
      const res = await fetch(`/api/applications/${associatedApp.id}/send-letter`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        showToast(`📧 Provisional Letter sent to ${data.sentTo}${data.ccTo ? ` (CC: ${data.ccTo})` : ''}`, 'success')
        await fetchAllData()
      } else {
        showToast(data.error || 'Failed to send letter.', 'error')
      }
    } catch { showToast('Network error.', 'error') }
    setLetterSending(false)
  }
  const [niReason, setNiReason]       = useState('')
  const [niOther, setNiOther]         = useState('')

  const NI_REASONS = [
    'Budget Constraints', 'Already Enrolled Elsewhere', 'Not Reachable',
    'Not Eligible', 'Course Not Available', 'Location Issue', 'Other'
  ]

  const handleMarkNotInterested = async () => {
    if (!niReason) return showToast('Please select a reason.', 'error')
    const reason = niReason === 'Other' ? (niOther || 'Other') : niReason
    await updateLead(associatedLead.id, {
      stage: 'Not Interested',
      stageColor: 'red',
      not_interested_reason: reason
    })
    showToast(`Lead marked as Not Interested: ${reason}`, 'info')
    setShowNiModal(false); setNiReason(''); setNiOther('')
  }

  useEffect(() => {
    const token = localStorage.getItem('ccrm_token')
    fetch('/api/integration-settings', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
      .then(cfg => {
        // Check EasyGoIVR configuration
        const easyGoConfigured = !!(cfg.easygo_email && cfg.easygo_password_hash && cfg.easygo_did)
        setEasyGoReady(easyGoConfigured)
      })
      .catch(() => {
        setEasyGoReady(false)
      })
  }, [])
  const [editMode, setEditMode] = useState(false)

  // Quick click-to-edit for the header name (in addition to the full edit form)
  const [editingHeaderName, setEditingHeaderName] = useState(false)
  const [headerNameVal, setHeaderNameVal] = useState('')
  const saveHeaderName = async () => {
    const v = headerNameVal.trim()
    if (!v) { showToast('Name cannot be empty.', 'error'); return }
    if (associatedApp)  updateApplication(associatedApp.id, { name: v })
    if (associatedLead) updateLead(associatedLead.id, { name: v })
    setFormData(prev => ({ ...prev, name: v }))
    setEditingHeaderName(false)
    showToast('Name updated.', 'success')
  }
  const [formData, setFormData] = useState({
    formInterest,
    email: studentEmail,
    mobile: studentMobile,
    altMobile,
    name: studentName,
    state: studentState,
    city: studentCity,
    campus,
    school,
    course,
    owner,
    source,
    // Comprehensive lead details (saved as JSONB to leads.lead_details)
    leadDetails: associatedLead?.leadDetails || record.leadDetails || {
      parentName: '', parentMobile: '', parentEmail: '',
      aadharNumber: '', address: '', pincode: '',
      tenthBoard: '', tenthSchool: '', tenthPercentage: '', tenthYear: '',
      twelfthBoard: '', twelfthSchool: '', twelfthPercentage: '', twelfthYear: '',
      schoolDept: '',
    },
  })

  // Re-sync the edit form when the resolved record changes (navigation or a
  // lead fetched by id arriving after mount), unless the user is mid-edit.
  useEffect(() => {
    if (editMode) return
    setFormData({
      formInterest, email: studentEmail, mobile: studentMobile, altMobile,
      name: studentName, state: studentState, city: studentCity,
      campus, school, course, owner, source,
      leadDetails: associatedLead?.leadDetails || record.leadDetails || {
        parentName: '', parentMobile: '', parentEmail: '',
        aadharNumber: '', address: '', pincode: '',
        tenthBoard: '', tenthSchool: '', tenthPercentage: '', tenthYear: '',
        twelfthBoard: '', twelfthSchool: '', twelfthPercentage: '', twelfthYear: '',
        schoolDept: '',
      },
    })
  }, [record?.id])

  // Dynamic Timeline State stored inside the lead/app or generated
  const [localTimeline, setLocalTimeline] = useState(() => {
    return record.timeline || [
      { date: '26/05/2026, 10:30 AM', type: 'note', text: 'Lead created in CRM source: ' + source },
      { date: '26/05/2026, 11:00 AM', type: 'email', text: 'Welcome admission brochure sent automatically' },
      { date: '26/05/2026, 02:15 PM', type: 'call', text: 'Outbound call: Student confirmed interest in ' + course }
    ]
  })

  const [localNotes, setLocalNotes] = useState(() => {
    return record.notes || [
      { text: 'Interested in ' + course + ' on ' + campus + ' campus. Needs hostel details.', author: 'Anita S.', date: '26/05/2026, 03:00 PM' }
    ]
  })

  const [noteText, setNoteText] = useState('')

  // Query / Tickets States specific to this student
  const studentQueries = queries.filter(q => q.student.toLowerCase() === studentName.toLowerCase())
  const [querySubject, setQuerySubject] = useState('')
  const [queryCategory, setQueryCategory] = useState('Admission')
  const [queryPriority, setQueryPriority] = useState('Medium')
  const [showAddQuery, setShowAddQuery] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [selectedQueryId, setSelectedQueryId] = useState(null)

  // Scheduling States
  const studentEvents = events.filter(e => e.title.toLowerCase().includes(studentName.toLowerCase()))
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [eventForm, setEventForm] = useState({
    title: 'PI Interview – ' + studentName,
    date: new Date().toISOString().split('T')[0],
    time: '11:00 AM',
    type: 'PI',
    venue: 'Online Google Meet'
  })

  // Use correct stage list depending on whether viewing lead or application
  const activeStages = isApp ? APP_STAGES : LEAD_STAGES
  const activeCurrentStage = isApp ? appStage : leadStage
  const stageIdx = activeStages.indexOf(activeCurrentStage) !== -1 ? activeStages.indexOf(activeCurrentStage) : 0

  const stageBadgeColor = (stage) => {
    const map = {
      'Untouched':           'bg-red-100 text-red-700 border border-red-200',
      'Contacted':           'bg-blue-100 text-blue-700 border border-blue-200',
      'No Response':         'bg-gray-100 text-gray-600 border border-gray-200',
      'Interested':          'bg-green-100 text-green-700 border border-green-200',
      'Follow Up':        'bg-purple-100 text-purple-700 border border-purple-200',
      'Campus Visit Scheduled':'bg-cyan-100 text-cyan-700 border border-cyan-200',
      'Campus Visit Completed':'bg-cyan-100 text-cyan-700 border border-cyan-200',
      'Process for Payment': 'bg-amber-100 text-amber-700 border border-amber-200',
      'Payment Success':     'bg-emerald-100 text-emerald-700 border border-emerald-200',
      'Admission Confirmed': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      'Not Interested':      'bg-red-100 text-red-700 border border-red-200',
      'Invalid Number':      'bg-red-100 text-red-700 border border-red-200',
      // legacy fallbacks
      'Qualified Leads':     'bg-amber-100 text-amber-700 border border-amber-200',
      'Converted':           'bg-emerald-100 text-emerald-700 border border-emerald-200',
      'Unqualified Leads':   'bg-orange-100 text-orange-700 border border-orange-200',
    }
    return map[stage] || 'bg-gray-100 text-gray-700 border border-gray-200'
  }

  const appStageBadgeColor = (stage) => {
    const map = {
      'Unverified': 'bg-gray-100 text-gray-600 border border-gray-200',
      'Verified': 'bg-blue-100 text-blue-700 border border-blue-200',
      'Application Started': 'bg-orange-100 text-orange-700 border border-orange-200',
      'Payment Approved': 'bg-green-100 text-green-700 border border-green-200',
      'Application Submitted': 'bg-purple-100 text-purple-700 border border-purple-200',
      'Enrolment': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      'Enrolments': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    }
    return map[stage] || 'bg-gray-100 text-gray-700 border border-gray-200'
  }

  const handleSaveChanges = () => {
    const updateData = {
      name: formData.name,
      email: formData.email,
      mobile: formData.mobile,
      state: formData.state,
      city: formData.city,
      campus: formData.campus,
      course: formData.course,
      altMobile: formData.altMobile,
      school: formData.school,
      formInterest: formData.formInterest,
      // Comprehensive admission fields stored in lead_details JSONB
      leadDetails: formData.leadDetails || {},
    }

    // Admin/Manager-only fields — only include when user actually has permission
    if (['Admin', 'Manager'].includes(currentUser?.role)) {
      if (formData.owner)  updateData.owner  = formData.owner
      if (formData.source) updateData.source = formData.source
    }

    if (isApp && associatedApp) {
      updateApplication(associatedApp.id, updateData)
    } else if (associatedLead) {
      updateLead(associatedLead.id, updateData)
    }

    if (associatedLead && isApp) {
      updateLead(associatedLead.id, updateData)
    }
    if (associatedApp && !isApp) {
      updateApplication(associatedApp.id, updateData)
    }


    setEditMode(false)
    showToast('Student information successfully saved.', 'success')
  }

  const handleStageClick = async (stageName, stageIndex) => {
    const dateStr = new Date().toLocaleString('en-IN', { hour12: true })

    const changeLog = {
      date: dateStr,
      type: 'stage',
      text: `Stage updated: ${activeCurrentStage} → ${stageName}`
    }
    const newTimeline = [changeLog, ...localTimeline]
    setLocalTimeline(newTimeline)

    if (!isApp) {
      // ---- Lead stage update ----
      const stageColorMap = {
        'Untouched':              'red',
        'Contacted':              'blue',
        'No Response':            'gray',
        'Follow Up':           'purple',
        'Interested':             'green',
        'Campus Visit Scheduled': 'cyan',
        'Campus Visit Completed': 'cyan',
        'Process for Payment':    'orange',
        'Payment Success':        'emerald',
        'Admission Confirmed':    'emerald',
        'Not Interested':         'red',
        'Invalid Number':         'red',
      }
      updateLead(associatedLead.id, {
        stage: stageName,
        stageColor: stageColorMap[stageName] || 'blue',
        timeline: newTimeline
      })
      showToast(`Lead stage updated to "${stageName}"`, 'success')

      // ── Auto-create Application only when moving toward payment ───────────
      // 'Interested' is now a lightweight status change — it must NOT force an
      // application or require any details. The application is created later,
      // when the lead reaches 'Process for Payment'.
      if (stageName === 'Process for Payment' && !associatedApp) {
        try {
          const isSM = ['Facebook Ads','Google Ads','LinkedIn','Instagram','Social Media','sm'].some(
            s => (record.source || '').toLowerCase().includes(s.toLowerCase())
          )
          const idRes = await fetch(`/api/applications/next-app-id?type=${isSM ? 'sm' : 'ai'}`)
          const { appNo } = await idRes.json()
          await addApplication({
            name: studentName,
            email: studentEmail,
            mobile: studentMobile,
            campus,
            course,
            formStatus: 'Incomplete',
            payStatus:  'Payment Pending',
            payMethod:  '',
            stage:      'Application Started',
            appNo,
            owner: record.owner || ''
          })
          showToast(`📋 Application ${appNo} created — visible in Application Manager`, 'success')
        } catch (e) {
          showToast('Application auto-creation failed — create manually.', 'warning')
        }
      }
      return
    }

    // ---- Application stage update ----
    if (associatedApp) {
      updateApplication(associatedApp.id, {
        stage: stageName,
        timeline: newTimeline
      })
    } else if (associatedLead) {
      // Auto-create application if none exists when pushing through app stages from lead view
      const newCreatedApp = addApplication({
        name: studentName,
        email: studentEmail,
        mobile: studentMobile,
        campus: campus,
        course: course,
        formStatus: 'Complete',
        payStatus: stageIndex >= 3 ? 'Approved' : 'Payment Pending',
        payMethod: stageIndex >= 3 ? 'Online' : '',
        stage: stageName,
        timeline: newTimeline
      })
      showToast(`Created matching Application: ${newCreatedApp?.appNo || ''}`, 'success')

      updateLead(associatedLead.id, {
        stage: stageIndex >= 4 ? 'Payment Success' : 'Process for Payment',
        timeline: newTimeline
      })
    }

    showToast(`Application stage updated to "${stageName}"`, 'success')
  }

  const handleAddNote = () => {
    if (!noteText.trim()) return
    const dateStr = new Date().toLocaleString('en-IN', { hour12: true })
    const author = currentUser?.name || 'Counselor'
    
    const newNote = {
      text: noteText,
      author,
      date: dateStr
    }
    
    const nextNotes = [newNote, ...localNotes]
    setLocalNotes(nextNotes)

    const timelineLog = {
      date: dateStr,
      type: 'note',
      text: `Note added by ${author}: "${noteText.length > 50 ? noteText.slice(0, 50) + '...' : noteText}"`
    }
    const nextTimeline = [timelineLog, ...localTimeline]
    setLocalTimeline(nextTimeline)

    if (isApp && associatedApp) {
      updateApplication(associatedApp.id, { notes: nextNotes, timeline: nextTimeline })
    } else if (associatedLead) {
      updateLead(associatedLead.id, { notes: nextNotes, timeline: nextTimeline })
    }

    setNoteText('')
    showToast('New note logged to student file.', 'success')
  }

  const handleCreateQuery = (e) => {
    e.preventDefault()
    if (!querySubject.trim()) return

    addQuery({
      student: studentName,
      subject: querySubject,
      category: queryCategory,
      priority: queryPriority,
      assignee: owner
    })

    const dateStr = new Date().toLocaleString('en-IN', { hour12: true })
    const nextTimeline = [{
      date: dateStr,
      type: 'ticket',
      text: `Raised support query: "${querySubject}"`
    }, ...localTimeline]
    
    setLocalTimeline(nextTimeline)
    if (isApp && associatedApp) {
      updateApplication(associatedApp.id, { timeline: nextTimeline })
    } else if (associatedLead) {
      updateLead(associatedLead.id, { timeline: nextTimeline })
    }

    setQuerySubject('')
    setShowAddQuery(false)
    showToast('Support ticket registered.', 'success')
  }

  const handleQueryStatusChange = (qId, status) => {
    updateQueryStatus(qId, status)
    showToast(`Query status updated to ${status}.`, 'info')
  }

  const handleQueryReplySubmit = (e) => {
    e.preventDefault()
    if (!replyText.trim() || !selectedQueryId) return

    addQueryReply(selectedQueryId, replyText)
    setReplyText('')
    setSelectedQueryId(null)
  }

  const handleCreateEvent = (e) => {
    e.preventDefault()
    addEvent({
      ...eventForm,
      participants: 1
    })

    const dateStr = new Date().toLocaleString('en-IN', { hour12: true })
    const nextTimeline = [{
      date: dateStr,
      type: 'calendar',
      text: `Scheduled ${eventForm.type} session: "${eventForm.title}"`
    }, ...localTimeline]
    
    setLocalTimeline(nextTimeline)
    if (isApp && associatedApp) {
      updateApplication(associatedApp.id, { timeline: nextTimeline })
    } else if (associatedLead) {
      updateLead(associatedLead.id, { timeline: nextTimeline })
    }

    setShowAddEvent(false)
    showToast(`Event successfully scheduled for student.`, 'success')
  }

  return (
    <>
    <div className="p-6">
      {/* Back button */}
      <button
        onClick={() => navigate(isApp ? '/applications' : '/leads')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors focus:outline-none"
      >
        <ArrowLeft size={16} />
        Back to {isApp ? 'Application Manager' : 'Lead Manager'}
      </button>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left panel */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-4">
          {/* Profile card */}
          <div className="card p-5">
            {/* Avatar */}
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-md mb-3 select-none">
                {getInitials(studentName)}
              </div>
              {editingHeaderName ? (
                <div className="flex items-center gap-1">
                  <input autoFocus value={headerNameVal}
                    onChange={e => setHeaderNameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveHeaderName(); if (e.key === 'Escape') setEditingHeaderName(false) }}
                    className="input-field text-sm py-1 text-center w-48" />
                  <button onClick={saveHeaderName} className="text-green-600 hover:text-green-700" title="Save"><Save size={15} /></button>
                  <button onClick={() => setEditingHeaderName(false)} className="text-gray-400 hover:text-gray-600" title="Cancel"><X size={15} /></button>
                </div>
              ) : (
                <h2 className="font-bold text-gray-900 text-base flex items-center gap-1.5 group">
                  {studentName}
                  <button onClick={() => { setHeaderNameVal(studentName); setEditingHeaderName(true) }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary-600 transition-opacity" title="Edit name">
                    <Edit3 size={13} />
                  </button>
                </h2>
              )}
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                <span className={`badge text-[10px] uppercase font-bold tracking-wider ${stageBadgeColor(leadStage)}`}>
                  {leadStage}
                </span>
                <span className={`badge text-[10px] uppercase font-bold tracking-wider ${appStageBadgeColor(appStage)}`}>
                  {appStage}
                </span>
              </div>
            </div>

            {/* Contact info */}
            <div className="space-y-2.5 text-sm pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-gray-600">
                <Mail size={14} className="text-gray-400 flex-shrink-0" />
                <span className="truncate" title={studentEmail}>{studentEmail}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Phone size={14} className="text-gray-400 flex-shrink-0" />
                <span>{studentMobile}</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  {/* WhatsApp */}
                  <a href={`https://wa.me/91${studentMobile}`} target="_blank" rel="noopener noreferrer"
                    className="text-green-500 hover:text-green-600" title="WhatsApp">
                    <MessageCircle size={14} />
                  </a>
                  {/* RCS message */}
                  <button onClick={() => setShowRcsModal(true)}
                    className="text-fuchsia-500 hover:text-fuchsia-700" title="Send RCS message">
                    <Sparkles size={14} />
                  </button>
                  {/* Click-to-Call (EasyGoIVR) */}
                  {easyGoReady === true ? (
                    <button
                      disabled={callInitiating}
                      onClick={async () => {
                        setCallInitiating(true)
                        try {
                          let counselorMobile = currentUser?.mobile_number
                          if (!counselorMobile) {
                            const token = localStorage.getItem('ccrm_token')
                            const res = await fetch(`/api/users/${currentUser?.id}/profile`, { headers: { 'Authorization': `Bearer ${token}` } })
                            if (res.ok) {
                              const userData = await res.json()
                              counselorMobile = userData.mobile_number
                            }
                          }
                          if (!counselorMobile) return showToast('Please set your mobile number in Profile Settings.', 'error')
                          const data = await initiateCall(associatedLead?.id || associatedApp?.id, studentMobile, counselorMobile)
                          if (data?.success) showToast('Call initiated ✓', 'success')
                        } catch (e) {
                          showToast(e.message || 'Call failed.', 'error')
                        }
                        setCallInitiating(false)
                      }}
                      className="text-violet-500 hover:text-violet-700 disabled:opacity-50"
                      title="Click-to-Call (EasyGoIVR)"
                    >
                      {callInitiating ? <span className="animate-spin inline-block w-3.5 h-3.5 border border-violet-400 border-t-violet-700 rounded-full" /> : <PhoneCall size={14} />}
                    </button>
                  ) : (
                    <button disabled className="text-gray-400 cursor-not-allowed disabled:opacity-50" title="EasyGoIVR not configured">
                      <PhoneCall size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                <span>{studentCity}, {studentState}</span>
              </div>
            </div>

            {/* Lead ID + Application ID */}
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
              {/* Lead Reference ID — prefix based on source type */}
              {(() => {
                const src = (associatedLead?.source || record.source || '').toLowerCase()
                const isSM = ['facebook','google ads','linkedin','instagram','social media','sm'].some(s => src.includes(s))
                const lid  = associatedLead?.id || record.id || 0
                const prefix = isSM ? 'CULDSM26' : 'CULDAI26'
                return (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium">Lead ID</span>
                    <span className="font-mono text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded select-all">
                      {prefix}{String(lid).padStart(4,'0')}
                    </span>
                  </div>
                )
              })()}
              {/* Application ID — show if application exists */}
              {associatedApp?.appNo && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">App ID</span>
                  <span className="font-mono text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded select-all font-bold">
                    {associatedApp.appNo}
                  </span>
                </div>
              )}
              {/* Admission Details — appears once app exists */}
              {associatedApp?.appNo && (
                <>
                  {showAdmissionMethodModal ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => { setShowAdmissionMethodModal(false); setShowAdmissionForm(true) }}
                        className="w-full text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                      >
                        <span>📝</span> Manual Entry
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdmissionMethodModal(false)
                          showToast('Email link sent! Student can fill details via email.', 'success')
                        }}
                        className="w-full text-xs bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                      >
                        <span>✉️</span> Online Form (Email)
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAdmissionMethodModal(false)}
                        className="w-full text-xs bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-1.5 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAdmissionMethodModal(true)}
                      className={`w-full text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                        associatedApp.admissionDetails && associatedApp.admissionDetails.studentName
                          ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                          : 'bg-orange-500 hover:bg-orange-600 text-white'
                      }`}
                    >
                      {associatedApp.admissionDetails && associatedApp.admissionDetails.studentName
                        ? '✓ Admission Details Filled — Edit'
                        : '📝 Fill Admission Details'}
                    </button>
                  )}
                </>
              )}
              {/* Payment — show when app exists and payment not yet done */}
              {associatedApp && !['Paid','Payment Done'].includes(associatedApp.payStatus) && (
                <button
                  onClick={() => { setShowPayModal(true); setPayMode('online'); setUtrNumber('') }}
                  className="w-full text-xs bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  💳 Generate / Record Payment
                </button>
              )}
              {associatedApp?.payStatus === 'Payment Done' && (
                <div className="text-center text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg py-1.5 font-semibold">
                  ✓ Payment Done — Pending Approval
                </div>
              )}
              {associatedApp?.payStatus === 'Paid' && (
                <div className="text-center text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 font-semibold">
                  ✅ Payment Approved
                </div>
              )}
              {/* Provisional Letter status + manual resend */}
              {associatedApp?.appNo && ['Paid','Payment Done'].includes(associatedApp.payStatus) && (
                <>
                  {associatedApp.admissionLetterSentAt ? (
                    <div className="text-center text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg py-1.5 font-semibold">
                      📧 Letter sent {new Date(associatedApp.admissionLetterSentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </div>
                  ) : null}
                  <button
                    onClick={() => handleSendLetter()}
                    disabled={letterSending}
                    className="w-full text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {letterSending ? <><span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" /> Sending...</> : associatedApp.admissionLetterSentAt ? '↻ Resend Letter' : '📨 Send Provisional Letter'}
                  </button>
                </>
              )}
            </div>

            {/* Post-admission: email verify → doc upload → semester fee → ERP */}
            {associatedApp?.appNo && associatedApp.payStatus === 'Paid' && (
              <PostAdmissionPanel application={associatedApp} currentUser={currentUser} showToast={showToast} fetchAllData={fetchAllData} generatePaymentLink={generatePaymentLink} />
            )}

            {/* Score */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-xs text-gray-500 font-medium flex items-center gap-1 cursor-help"
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
                  Lead Score
                  <HelpCircle size={11} className="text-gray-400" />
                </span>
                <span className="text-sm font-bold text-primary-600">{score}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-primary-400 to-primary-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${score}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">
                {score >= 75 ? '🔥 Hot lead — high conversion likelihood'
                  : score >= 50 ? '🌟 Warm lead — strong engagement signals'
                  : score >= 25 ? '🌱 Nurture — needs more follow-up'
                  : '❄️ Cold lead — low engagement, may need re-qualification'}
              </p>
            </div>

            {/* Quick stage actions — only for leads */}
            {!isApp && leadStage !== 'Payment Success' && (
              <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                {/* Unable to Connect → Follow Up — hides once connected */}
                {!['Contacted','Follow Up','Interested','Not Interested','Process for Payment'].includes(leadStage) && (
                  <button
                    onClick={async () => {
                      await updateLead(associatedLead.id, {
                        stage: 'Follow Up',
                        stageColor: 'purple',
                        not_interested_reason: 'Unable to Connect — needs follow-up'
                      })
                      showToast('Marked as Unable to Connect → Follow Up', 'info')
                    }}
                    className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-colors flex items-center justify-center gap-1.5"
                  >
                    📞 Unable to Connect → Follow Up
                  </button>
                )}
                {/* Mark Not Interested — hides once Interested */}
                {!['Interested','Not Interested','Process for Payment'].includes(leadStage) && (
                  <button
                    onClick={() => setShowNiModal(true)}
                    className="w-full text-xs font-semibold py-2 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <X size={13} /> Mark as Not Interested
                  </button>
                )}
              </div>
            )}
            {!isApp && leadStage === 'Not Interested' && record.notInterestedReason && (
              <div className="mt-4 pt-3 border-t border-gray-100 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs">
                <p className="font-bold text-red-700 mb-0.5">Marked Not Interested</p>
                <p className="text-red-600">Reason: <strong>{record.notInterestedReason}</strong></p>
              </div>
            )}

            {/* Action icons */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-around">
              {[
                { icon: ArrowRightLeft, label: 'Transfer', color: 'text-blue-500', onClick: () => showToast('Lead transfer requested.', 'info') },
                { icon: Calendar,       label: 'Schedule', color: 'text-purple-500', onClick: () => setShowAddEvent(true) },
                { icon: Edit3,          label: 'Edit',     color: 'text-orange-500', onClick: () => { setEditMode(true); setActiveTab('Lead Details') } },
                { icon: Mail,           label: 'Email',    color: 'text-green-500', onClick: () => showToast('Opening system email composer...', 'info') },
              ].map(({ icon: Icon, label, color, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  title={label}
                  className={`flex flex-col items-center gap-1 ${color} hover:opacity-75 transition-opacity focus:outline-none`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                    <Icon size={15} />
                  </div>
                  <span className="text-[9px] text-gray-500">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Assignment Details */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assignment Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Assigned Counselor</p>
                {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && !isApp ? (
                  <select
                    value={owner}
                    onChange={async (e) => {
                      const newOwner = e.target.value
                      await updateLead(associatedLead.id, { owner: newOwner })
                      showToast(`Counselor changed to ${newOwner}`, 'success')
                    }}
                    className="w-full text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  >
                    <option value="Unassigned">Unassigned</option>
                    {(counselors && counselors.length > 0
                      ? counselors.map(c => c.name)
                      : (users || []).filter(u => ['Counselor','Manager','Admin'].includes(u.role) && u.status === 'Active').map(u => u.name)
                    ).map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold select-none">
                      {owner.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{owner}</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Lead Source</p>
                <span className="text-sm text-gray-700 font-medium">{source}</span>
              </div>
            </div>
          </div>

          {/* Important Dates */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Important Dates</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Upcoming Followup</p>
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-orange-500" />
                  <span className="text-sm text-gray-700 font-medium">{followup}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Last Active</p>
                <div className="flex items-center gap-1.5">
                  <Clock size={13} className="text-gray-400" />
                  <span className="text-sm text-gray-700">{lastActive}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Progress — leads use the admission journey flowchart; applications keep the linear stepper */}
          {!isApp ? (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Lead Journey</h3>
                <span className="text-xs text-gray-400 font-semibold">Current: <span className="text-primary-600">{activeCurrentStage}</span></span>
              </div>
              <LeadJourney stage={activeCurrentStage} onSelect={(s) => handleStageClick(s)} />
            </div>
          ) : (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-700">Application Progress</h3>
              <span className="text-xs text-gray-400 font-semibold">Application Stage {stageIdx + 1} of {activeStages.length}</span>
            </div>

            {/* Interactive stage bubbles */}
            <div className="flex items-center mt-3 overflow-x-auto pb-2">
              {activeStages.map((stage, idx) => {
                const isCompleted = idx < stageIdx
                const isCurrent = idx === stageIdx
                const isLast = idx === activeStages.length - 1
                return (
                  <React.Fragment key={stage}>
                    <button
                      onClick={() => handleStageClick(stage, idx)}
                      className="flex flex-col items-center flex-shrink-0 focus:outline-none group"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                        isCompleted
                          ? 'bg-primary-500 border-primary-500 text-white'
                          : isCurrent
                          ? 'bg-white border-primary-500 text-primary-600 scale-110 shadow-sm'
                          : 'bg-white border-gray-300 text-gray-400 group-hover:border-primary-300 group-hover:text-primary-400'
                      }`}>
                        {isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                      </div>
                      <span className={`text-[9px] mt-1.5 text-center max-w-16 leading-tight font-medium ${
                        isCurrent ? 'text-primary-600 font-bold' : isCompleted ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {stage}
                      </span>
                    </button>
                    {!isLast && (
                      <div className={`flex-1 h-0.5 mx-1 mb-5 min-w-4 ${
                        idx < stageIdx ? 'bg-primary-500' : 'bg-gray-200'
                      }`}></div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>
          )}

          {/* Tabs */}
          <div className="card p-0 overflow-hidden">
            <div className="flex border-b border-gray-200 overflow-x-auto bg-gray-50/50">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 focus:outline-none ${
                    activeTab === tab
                      ? 'border-primary-500 text-primary-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-5">
              {activeTab === 'Lead Details' && (() => {
                // Section-organised fields. Top-level (formData[key]) values for basic fields.
                // Nested admission-details fields stored in formData.leadDetails[key].
                const SECTIONS = [
                  {
                    title: 'Student Information',
                    fields: [
                      { label: 'Student Name',   key: 'name',                  required: true },
                      { label: 'Student Mobile', key: 'mobile',                required: true },
                      { label: 'Alternate Mobile', key: 'altMobile' },
                      { label: 'Student Email',  key: 'email' },
                      { label: 'Aadhar Number',  key: 'leadDetails.aadharNumber' },
                    ]
                  },
                  {
                    title: 'Parent / Guardian Information',
                    fields: [
                      { label: 'Parent Name',   key: 'leadDetails.parentName' },
                      { label: 'Parent Mobile', key: 'leadDetails.parentMobile' },
                      { label: 'Parent Email',  key: 'leadDetails.parentEmail' },
                    ]
                  },
                  {
                    title: 'Address',
                    fields: [
                      { label: 'Address',          key: 'leadDetails.address', wide: true },
                      { label: 'City',             key: 'city' },
                      { label: 'State',            key: 'state' },
                      { label: 'Pincode',          key: 'leadDetails.pincode' },
                    ]
                  },
                  {
                    title: '10th Standard',
                    fields: [
                      { label: '10th Board Name',     key: 'leadDetails.tenthBoard' },
                      { label: '10th School Name',    key: 'leadDetails.tenthSchool' },
                      { label: '10th Percentage',     key: 'leadDetails.tenthPercentage' },
                      { label: '10th Pass-out Year',  key: 'leadDetails.tenthYear' },
                    ]
                  },
                  {
                    title: '12th Standard',
                    fields: [
                      { label: '12th Board Name',     key: 'leadDetails.twelfthBoard' },
                      { label: '12th School Name',    key: 'leadDetails.twelfthSchool' },
                      { label: '12th Percentage',     key: 'leadDetails.twelfthPercentage' },
                      { label: '12th Pass-out Year',  key: 'leadDetails.twelfthYear' },
                    ]
                  },
                  {
                    title: 'Joining Program',
                    fields: [
                      { label: 'Joining Course',     key: 'course' },
                      { label: 'School / Department',key: 'leadDetails.schoolDept' },
                      { label: 'Campus Preference',  key: 'campus' },
                      { label: 'Form Interested In', key: 'formInterest' },
                    ]
                  },
                  {
                    title: 'Assignment (Admin / Manager only)',
                    adminOnly: true,
                    fields: [
                      {
                        label:   'Assigned Counsellor',
                        key:     'owner',
                        select:  true,
                        options: [
                          'Unassigned',
                          ...((counselors && counselors.length > 0)
                            ? counselors.map(c => c.name)
                            : (users || []).filter(u => ['Counselor','Manager','Admin'].includes(u.role) && u.status === 'Active').map(u => u.name)
                          )
                        ]
                      },
                      { label: 'Lead Source', key: 'source', select: true,
                        options: ['Google Ads','Facebook Ads','LinkedIn','Instagram','Website','WhatsApp','Walk-in','Referral','Education Fair','SMS Campaign','AI','SM']
                      },
                    ]
                  },
                ].filter(sec => !sec.adminOnly || ['Admin','Manager'].includes(currentUser?.role))

                const getVal = (key) => {
                  if (!key.includes('.')) return formData[key] || ''
                  const [parent, child] = key.split('.')
                  return formData[parent]?.[child] || ''
                }
                const setVal = (key, value) => {
                  if (!key.includes('.')) {
                    setFormData(prev => ({ ...prev, [key]: value }))
                  } else {
                    const [parent, child] = key.split('.')
                    setFormData(prev => ({ ...prev, [parent]: { ...(prev[parent] || {}), [child]: value } }))
                  }
                }

                return (
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="font-semibold text-gray-800">Lead Information</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Fill these once the candidate shows interest — auto-copied to the Provisional Admission Letter on payment.</p>
                      </div>
                      <button
                        onClick={() => setEditMode(!editMode)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors focus:outline-none ${
                          editMode
                            ? 'bg-primary-500 text-white hover:bg-primary-600'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Edit3 size={13} />
                        {editMode ? 'Cancel Edit' : 'Edit Information'}
                      </button>
                    </div>

                    {/* Section-by-section render */}
                    <div className="space-y-5">
                      {SECTIONS.map(section => (
                        <div key={section.title}>
                          <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2 border-b border-gray-200 pb-1">
                            {section.title}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {section.fields.map(({ label, key, required, wide, select, options }) => (
                              <div key={key} className={wide ? 'md:col-span-2' : ''}>
                                <label className="block text-xs text-gray-400 font-medium mb-1">
                                  {label}{required ? ' *' : ''}
                                </label>
                                {editMode ? (
                                  select ? (
                                    <select
                                      value={getVal(key)}
                                      onChange={e => setVal(key, e.target.value)}
                                      className="input-field text-sm"
                                    >
                                      <option value="">— Select —</option>
                                      {(options || []).map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={getVal(key)}
                                      onChange={e => setVal(key, e.target.value)}
                                      placeholder={`Enter ${label.toLowerCase()}`}
                                      className="input-field text-sm"
                                    />
                                  )
                                ) : (
                                  <div className="py-2 px-3 bg-gray-50 rounded-lg border border-gray-100">
                                    <span className="text-sm text-gray-700">{getVal(key) || <span className="text-gray-300 italic">—</span>}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {editMode && (
                      <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4">
                        <button
                          onClick={() => setEditMode(false)}
                          className="text-xs border border-gray-300 rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveChanges}
                          className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                        >
                          <Save size={14} />
                          Save All Changes
                        </button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {activeTab === 'Timeline' && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-4">Activity Timeline</h3>
                  <div className="relative pl-6 border-l-2 border-gray-200 ml-3 space-y-5 py-2">
                    {localTimeline.map((event, idx) => {
                      let color = 'bg-blue-100 text-blue-600'
                      if (event.type === 'stage') color = 'bg-orange-100 text-orange-600'
                      if (event.type === 'calendar') color = 'bg-purple-100 text-purple-600'
                      if (event.type === 'ticket') color = 'bg-red-100 text-red-600'
                      if (event.type === 'email') color = 'bg-green-100 text-green-600'

                      return (
                        <div key={idx} className="relative">
                          <div className={`absolute -left-[35px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center ${color} text-xs font-bold shadow-sm`}>
                            {event.type === 'stage' ? '⚙' : event.type === 'calendar' ? '📅' : event.type === 'ticket' ? '🎫' : '✎'}
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 shadow-sm">
                            <p className="text-sm text-gray-700 leading-relaxed">{event.text}</p>
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                              <Clock size={11} /> {event.date}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'Notes' && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-4">Counselor Student File Notes</h3>
                  <div className="flex flex-col gap-2">
                    <textarea
                      placeholder="Add a new custom note regarding this student's profile..."
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                      rows={3}
                    />
                    <button
                      onClick={handleAddNote}
                      className="btn-primary text-xs py-2 px-4 w-fit flex items-center gap-1"
                    >
                      <Plus size={14} /> Add Note
                    </button>
                  </div>
                  
                  <div className="mt-6 space-y-3">
                    {localNotes.map((note, nidx) => (
                      <div key={nidx} className="bg-yellow-50/70 border border-yellow-200/80 rounded-xl p-3 shadow-sm">
                        <p className="text-sm text-gray-700 leading-relaxed">{note.text}</p>
                        <p className="text-xs text-gray-400 mt-2 font-medium">
                          {note.author} · {note.date}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'Calendar Pro' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Student Events &amp; Interviews</h3>
                    <button
                      onClick={() => setShowAddEvent(true)}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                    >
                      <Plus size={13} /> Schedule Event
                    </button>
                  </div>

                  {studentEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <Calendar size={32} className="mb-2 opacity-30" />
                      <p className="text-xs font-medium">No active calendar events</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {studentEvents.map(evt => (
                        <div key={evt.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50 flex items-start gap-3 shadow-sm">
                          <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-lg flex items-center justify-center text-xs font-bold">
                            {evt.type}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-gray-800">{evt.title}</h4>
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                              <Calendar size={11} /> {evt.date} · {evt.time}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5 font-medium">📍 {evt.venue}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Event Modal inline */}
                  <Modal open={showAddEvent} onClose={() => setShowAddEvent(false)} title="Schedule Call / Interview" size="sm">
                        <form onSubmit={handleCreateEvent} className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-0.5">Event Title</label>
                            <input
                              type="text"
                              value={eventForm.title}
                              onChange={e => setEventForm(p => ({ ...p, title: e.target.value }))}
                              className="input-field text-xs"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-0.5">Date</label>
                              <input
                                type="date"
                                value={eventForm.date}
                                onChange={e => setEventForm(p => ({ ...p, date: e.target.value }))}
                                className="input-field text-xs"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-0.5">Time</label>
                              <input
                                type="text"
                                value={eventForm.time}
                                onChange={e => setEventForm(p => ({ ...p, time: e.target.value }))}
                                className="input-field text-xs"
                                placeholder="e.g. 10:30 AM"
                                required
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-0.5">Session Type</label>
                            <select
                              value={eventForm.type}
                              onChange={e => setEventForm(p => ({ ...p, type: e.target.value }))}
                              className="input-field text-xs"
                            >
                              <option value="Call">Phone Call</option>
                              <option value="PI">Personal Interview</option>
                              <option value="GD">Group Discussion</option>
                              <option value="WAT">Written Ability Test</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-0.5">Venue</label>
                            <input
                              type="text"
                              value={eventForm.venue}
                              onChange={e => setEventForm(p => ({ ...p, venue: e.target.value }))}
                              className="input-field text-xs"
                              required
                            />
                          </div>
                          
                          <div className="flex gap-2 pt-3">
                            <button
                              type="button"
                              onClick={() => setShowAddEvent(false)}
                              className="flex-1 btn-secondary text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="flex-1 btn-primary text-xs"
                            >
                              Schedule
                            </button>
                          </div>
                        </form>
                  </Modal>
                </div>
              )}

              {activeTab === 'Tickets' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Support Queries</h3>
                    <button
                      onClick={() => setShowAddQuery(true)}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                    >
                      <Plus size={13} /> Raise Ticket
                    </button>
                  </div>

                  {studentQueries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <HelpCircle size={32} className="mb-2 opacity-30" />
                      <p className="text-xs font-medium">No open tickets registered</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {studentQueries.map(q => (
                        <div key={q.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50 shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-primary-500 font-bold bg-primary-50 px-2.5 py-0.5 rounded-full">
                              🎫 Ticket #{q.id}
                            </span>
                            <div className="flex gap-1.5">
                              <span className={`badge text-[10px] font-bold ${
                                q.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {q.priority}
                              </span>
                              <span className={`badge text-[10px] font-bold ${
                                q.status === 'Open' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {q.status}
                              </span>
                            </div>
                          </div>
                          
                          <h4 className="text-sm font-semibold text-gray-800">{q.subject}</h4>
                          <p className="text-xs text-gray-400">Category: {q.category} · Created: {q.created}</p>
                          
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                            {q.status !== 'Resolved' && (
                              <>
                                <button
                                  onClick={() => setSelectedQueryId(q.id)}
                                  className="text-xs text-primary-500 hover:underline focus:outline-none"
                                >
                                  Reply
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  onClick={() => handleQueryStatusChange(q.id, 'Resolved')}
                                  className="text-xs text-green-500 hover:underline focus:outline-none"
                                >
                                  Mark Resolved
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Query Modal */}
                  <Modal open={showAddQuery} onClose={() => setShowAddQuery(false)} title="Raise Support Ticket" size="sm">
                        <form onSubmit={handleCreateQuery} className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-0.5">Subject</label>
                            <input
                              type="text"
                              value={querySubject}
                              onChange={e => setQuerySubject(e.target.value)}
                              className="input-field text-xs"
                              placeholder="e.g. Fee installment query"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-0.5">Category</label>
                              <select
                                value={queryCategory}
                                onChange={e => setQueryCategory(e.target.value)}
                                className="input-field text-xs"
                              >
                                <option>Admission</option>
                                <option>Finance</option>
                                <option>Hostel</option>
                                <option>Scholarship</option>
                                <option>Academic</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-0.5">Priority</label>
                              <select
                                value={queryPriority}
                                onChange={e => setQueryPriority(e.target.value)}
                                className="input-field text-xs"
                              >
                                <option>High</option>
                                <option>Medium</option>
                                <option>Low</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-3">
                            <button
                              type="button"
                              onClick={() => setShowAddQuery(false)}
                              className="flex-1 btn-secondary text-xs"
                            >
                              Cancel
                            </button>
                            <button type="submit" className="flex-1 btn-primary text-xs">
                              Raise Ticket
                            </button>
                          </div>
                        </form>
                  </Modal>

                  {/* Reply Dialog */}
                  <Modal open={!!selectedQueryId} onClose={() => setSelectedQueryId(null)} title="Send Response to Student" size="sm">
                        <form onSubmit={handleQueryReplySubmit} className="space-y-3">
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder="Type reply message to student..."
                            className="w-full border border-gray-300 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none font-medium"
                            rows={3}
                            required
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedQueryId(null)}
                              className="flex-1 btn-secondary text-xs"
                            >
                              Cancel
                            </button>
                            <button type="submit" className="flex-1 btn-primary text-xs flex items-center justify-center gap-1">
                              <Send size={12} /> Send Response
                            </button>
                          </div>
                        </form>
                  </Modal>
                </div>
              )}

              {activeTab === 'Communication Logs' && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-800">Automated Communication Records</h3>
                  <div className="space-y-3">
                    {[
                      { channel: 'Email', status: 'Delivered', subject: 'CUTM CUEE 2026 Registration Confirmation', time: '26/05/2026, 11:00 AM', detail: 'Sent via automated trigger registration_welcome.' },
                      { channel: 'WhatsApp', status: 'Read', subject: 'Greeting & brochure link sent', time: '26/05/2026, 12:45 PM', detail: 'Hi Ravi, thank you for your inquiry about B.Tech CSE at Centurion...' },
                      { channel: 'SMS', status: 'Delivered', subject: 'CUEE 2026 Application Pending', time: '27/05/2026, 09:00 AM', detail: 'Remember to complete your form payment to lock in your scholarship eligibility.' }
                    ].map((log, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex items-start justify-between shadow-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              log.channel === 'Email' ? 'bg-green-100 text-green-700' : log.channel === 'WhatsApp' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {log.channel}
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold">{log.time}</span>
                          </div>
                          <h4 className="text-sm font-semibold text-gray-800 mt-1">{log.subject}</h4>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{log.detail}</p>
                        </div>
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200 font-semibold">
                          {log.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'Documents' && (
                <InlineDocumentsTab
                  studentName={studentName}
                  documents={documents}
                  uploadDocument={uploadDocument}
                  updateDocStatus={updateDocStatus}
                  deleteDocument={deleteDocument}
                  showToast={showToast}
                  currentUser={currentUser}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ── Admission Details Modal ─────────────────────────────── */}
    <Modal
      open={showAdmissionForm}
      onClose={() => setShowAdmissionForm(false)}
      title="📝 Admission Details"
      subtitle={<>Required before generating payment link · Application <strong>{associatedApp?.appNo}</strong></>}
      size="2xl"
      footer={(
        <>
          <Button variant="secondary" className="flex-1" onClick={() => setShowAdmissionForm(false)}>Cancel</Button>
          <Button className="flex-1" icon={Save} loading={adSaving} onClick={handleSaveAdmissionDetails}>
            {adSaving ? 'Saving...' : 'Save Admission Details'}
          </Button>
        </>
      )}
    >
          <div className="space-y-5">
            {/* Student Info */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">Student Information</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'studentName',   label: 'Student Name *', placeholder: 'Full name', required: true },
                  { k: 'studentMobile', label: 'Student Mobile *', placeholder: '10-digit mobile', required: true },
                  { k: 'studentEmail',  label: 'Student Email',  placeholder: 'student@gmail.com' },
                  { k: 'aadharNumber',  label: 'Aadhar Number',  placeholder: '1234 5678 9012' },
                ].map(f => (
                  <div key={f.k}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">{f.label}</label>
                    <input type="text" value={adForm[f.k] || ''} onChange={e => setAdForm(p => ({ ...p, [f.k]: e.target.value }))}
                      placeholder={f.placeholder} className="input-field text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* Parent Info */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">Parent / Guardian Information</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'parentName',   label: 'Parent Name',   placeholder: 'Full name' },
                  { k: 'parentMobile', label: 'Parent Mobile', placeholder: '10-digit mobile' },
                  { k: 'parentEmail',  label: 'Parent Email',  placeholder: 'parent@gmail.com' },
                ].map(f => (
                  <div key={f.k}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">{f.label}</label>
                    <input type="text" value={adForm[f.k] || ''} onChange={e => setAdForm(p => ({ ...p, [f.k]: e.target.value }))}
                      placeholder={f.placeholder} className="input-field text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* Address */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">Permanent Address</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Address</label>
                  <input type="text" value={adForm.address || ''} onChange={e => setAdForm(p => ({ ...p, address: e.target.value }))}
                    placeholder="House no, Street, Locality, City, State" className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Pincode</label>
                  <input type="text" value={adForm.pincode || ''} onChange={e => setAdForm(p => ({ ...p, pincode: e.target.value }))}
                    placeholder="6-digit pincode" className="input-field text-sm" />
                </div>
              </div>
            </div>

            {/* 10th */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">10th Standard</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'tenthBoard',      label: '10th Board Name',  placeholder: 'e.g. CBSE / ICSE / State Board' },
                  { k: 'tenthSchool',     label: '10th School Name', placeholder: 'School name' },
                  { k: 'tenthPercentage', label: '10th Percentage',  placeholder: 'e.g. 87.5' },
                  { k: 'tenthYear',       label: '10th Pass-out Year', placeholder: 'e.g. 2022' },
                ].map(f => (
                  <div key={f.k}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">{f.label}</label>
                    <input type="text" value={adForm[f.k] || ''} onChange={e => setAdForm(p => ({ ...p, [f.k]: e.target.value }))}
                      placeholder={f.placeholder} className="input-field text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* 12th */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">12th Standard</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'twelfthBoard',      label: '12th Board Name',  placeholder: 'e.g. CBSE / ICSE / State Board' },
                  { k: 'twelfthSchool',     label: '12th School Name', placeholder: 'School/College name' },
                  { k: 'twelfthPercentage', label: '12th Percentage',  placeholder: 'e.g. 92.0' },
                  { k: 'twelfthYear',       label: '12th Pass-out Year', placeholder: 'e.g. 2024' },
                ].map(f => (
                  <div key={f.k}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">{f.label}</label>
                    <input type="text" value={adForm[f.k] || ''} onChange={e => setAdForm(p => ({ ...p, [f.k]: e.target.value }))}
                      placeholder={f.placeholder} className="input-field text-sm" />
                  </div>
                ))}
              </div>
            </div>

            {/* Joining course */}
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase mb-2 border-b border-gray-200 pb-1">Joining Program</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Joining Course / Program</label>
                  <input type="text" value={adForm.joiningCourse || ''} onChange={e => setAdForm(p => ({ ...p, joiningCourse: e.target.value }))}
                    placeholder="e.g. B.Tech CSE / MBA / BSc Forensic Science" className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">School / Department</label>
                  <input type="text" value={adForm.schoolDept || ''} onChange={e => setAdForm(p => ({ ...p, schoolDept: e.target.value }))}
                    placeholder="e.g. School of Engineering & Tech" className="input-field text-sm" />
                </div>
              </div>
            </div>
          </div>
    </Modal>

    {/* ── Not Interested Modal ─────────────────────────────── */}
    <Modal
      open={showNiModal}
      onClose={() => setShowNiModal(false)}
      title={<span className="flex items-center gap-2 text-danger-600"><X size={18} className="text-danger-500" /> Mark Not Interested</span>}
      footer={(
        <>
          <Button variant="secondary" className="flex-1" onClick={() => setShowNiModal(false)}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={handleMarkNotInterested}>Confirm Not Interested</Button>
        </>
      )}
    >
          <p className="text-sm text-gray-500 mb-4">
            Mark <strong>{studentName}</strong> as Not Interested. Please select a reason.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Reason *</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {NI_REASONS.map(r => (
                <button key={r} type="button" onClick={() => setNiReason(r)}
                  className={`text-xs text-left px-3 py-2 rounded-lg border transition ${niReason === r ? 'border-danger-500 bg-danger-50 text-danger-700 font-semibold' : 'border-gray-200 text-gray-600 hover:border-danger-300'}`}>
                  {r}
                </button>
              ))}
            </div>
            {niReason === 'Other' && (
              <input type="text" value={niOther} onChange={e => setNiOther(e.target.value)}
                placeholder="Specify reason..."
                className="input-field text-sm" />
            )}
          </div>
    </Modal>

    {showRcsModal && (
      <RcsComposeModal
        lead={{ id: associatedLead?.id || associatedApp?.lead_id, name: studentName, mobile: studentMobile }}
        onClose={() => setShowRcsModal(false)}
      />
    )}

    {/* ── Payment Modal (Online / Offline) ─────────────────────────────── */}
    <Modal
      open={showPayModal && !!associatedApp}
      onClose={() => setShowPayModal(false)}
      title={associatedApp ? <>💳 Record Payment — <span className="font-mono text-primary-600 text-sm">{associatedApp.appNo}</span></> : ''}
    >
        {associatedApp && (
        <>
          {/* Mode tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            {[{id:'online',label:'🌐 Online (Razorpay)'},{id:'offline',label:'🏦 Offline (UTR/Ref)'}].map(m => (
              <button key={m.id} onClick={() => setPayMode(m.id)}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${payMode === m.id ? 'bg-white shadow text-primary-600' : 'text-gray-500'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {payMode === 'online' ? (
            <div className="space-y-4">
              <div className="bg-info-50 border border-info-200 rounded-xl p-4 text-sm text-info-700">
                <p className="font-semibold mb-1">Online Payment via Razorpay</p>
                <p className="text-xs leading-relaxed">Click "Generate Link" to create a Razorpay payment link. Share it with the student. Once they pay, the UTR will be auto-fetched and status updated.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Amount (₹)</label>
                <input type="number" defaultValue="25000" className="input-field text-sm" id="pay-amount" />
              </div>
              <button
                disabled={paySubmitting}
                onClick={async () => {
                  setPaySubmitting(true)
                  try {
                    const amt = parseInt(document.getElementById('pay-amount')?.value) || 25000
                    await generatePaymentLink(associatedApp.appNo, studentName, studentEmail, studentMobile, amt)
                    showToast(`Razorpay link generated for ${associatedApp.appNo}`, 'success')
                    setShowPayModal(false)
                  } catch { showToast('Failed to generate payment link.', 'error') }
                  setPaySubmitting(false)
                }}
                className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {paySubmitting ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : '🔗'}
                Generate Razorpay Link
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 text-sm text-warning-700">
                <p className="font-semibold mb-1">Offline Payment</p>
                <p className="text-xs leading-relaxed">Student/Counselor enters the UTR or bank reference number from the payment receipt. Status changes to "Payment Done" for accounts team approval.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">UTR / Reference Number *</label>
                <input type="text" value={utrNumber} onChange={e => setUtrNumber(e.target.value)}
                  placeholder="e.g. UTR123456789 or REF987654" className="input-field text-sm" />
              </div>
              <button
                disabled={paySubmitting || !utrNumber.trim()}
                onClick={async () => {
                  setPaySubmitting(true)
                  try {
                    const payRec = payments?.find(p => p.appNo === associatedApp.appNo)
                    if (!payRec) { showToast('Payment record not found.', 'error'); setPaySubmitting(false); return }
                    const res = await fetch(`/api/payments/${payRec.id}/submit-utr`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ utrNumber: utrNumber.trim(), payMode: 'offline' })
                    })
                    if (res.ok) {
                      showToast(`UTR recorded. Status → Payment Done (awaiting approval)`, 'success')
                      setShowPayModal(false)
                      fetchAllData()
                    } else {
                      const d = await res.json(); showToast(d.error || 'Failed.', 'error')
                    }
                  } catch { showToast('Network error.', 'error') }
                  setPaySubmitting(false)
                }}
                className="w-full bg-warning-500 hover:bg-warning-600 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2"
              >
                {paySubmitting ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : '✓'}
                Submit UTR — Mark Payment Done
              </button>
            </div>
          )}
        </>
        )}
    </Modal>
    </>
  )
}

// ── Post-Admission Panel — email OTP → doc upload link → semester fee → ERP ──
function PostAdmissionPanel({ application: app, currentUser, showToast, fetchAllData, generatePaymentLink }) {
  const [resending, setResending] = React.useState(false)
  const [unlocking, setUnlocking] = React.useState(false)
  const [genSemLink, setGenSemLink] = React.useState(false)
  const isAdminOrManager = ['Admin', 'Manager'].includes(currentUser?.role) || currentUser?.isSuperAdmin
  const authHeaders = () => {
    const token = localStorage.getItem('ccrm_token')
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }

  const resendOtp = async () => {
    setResending(true)
    try {
      const res = await fetch('/api/public/resend-email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appNo: app.appNo })
      })
      const d = await res.json()
      showToast(res.ok ? 'OTP resent to student\'s email' : (d.error || 'Failed to resend OTP'), res.ok ? 'success' : 'error')
    } catch { showToast('Network error.', 'error') }
    setResending(false)
  }

  const unlockSemesterFee = async () => {
    setUnlocking(true)
    try {
      const res = await fetch(`/api/applications/${app.id}/unlock-semester-fee`, { method: 'POST', headers: authHeaders() })
      const d = await res.json()
      if (res.ok) { showToast('Semester fee unlocked for the student.', 'success'); fetchAllData() }
      else showToast(d.error || 'Failed to unlock.', 'error')
    } catch { showToast('Network error.', 'error') }
    setUnlocking(false)
  }

  const generateSemesterFeeLink = async () => {
    setGenSemLink(true)
    try {
      const res = await fetch(`/api/applications/${app.id}/generate-semester-fee`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ amount: 45000 })
      })
      const payRec = await res.json()
      if (!res.ok) { showToast(payRec.error || 'Failed to create semester-fee payment.', 'error'); setGenSemLink(false); return }
      await generatePaymentLink(app.appNo, app.name, app.email, app.mobile, 45000, payRec.id)
      fetchAllData()
    } catch { showToast('Network error.', 'error') }
    setGenSemLink(false)
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
      <p className="text-xs text-gray-400 font-medium mb-1">Post-Admission</p>

      {/* Email verification */}
      {app.emailVerified ? (
        <div className="text-center text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 font-semibold">
          ✅ Email Verified
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex-1 text-center text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg py-1.5 font-semibold">
            ⏳ Awaiting Email OTP Verification
          </div>
          <button onClick={resendOtp} disabled={resending}
            className="text-xs px-2.5 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 whitespace-nowrap">
            {resending ? '...' : '↻ Resend'}
          </button>
        </div>
      )}

      {/* Semester fee */}
      {app.semesterFeeStatus === 'Locked' && (
        isAdminOrManager ? (
          <button onClick={unlockSemesterFee} disabled={unlocking || !app.emailVerified}
            title={!app.emailVerified ? 'Student must verify their email first' : 'Unlock once required documents are verified'}
            className="w-full text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 font-semibold py-1.5 rounded-lg">
            🔒 Unlock Semester Fee
          </button>
        ) : (
          <div className="text-center text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg py-1.5 font-semibold">
            🔒 Semester Fee Locked
          </div>
        )
      )}
      {app.semesterFeeStatus === 'Pending' && (
        <button onClick={generateSemesterFeeLink} disabled={genSemLink}
          className="w-full text-xs bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5">
          {genSemLink ? <span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" /> : '💰'}
          Generate Semester Fee Link
        </button>
      )}
      {app.semesterFeeStatus === 'Payment Done' && (
        <div className="text-center text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg py-1.5 font-semibold">
          🧾 Semester Fee — Pending Approval
        </div>
      )}
      {app.semesterFeeStatus === 'Paid' && (
        <div className="text-center text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 font-semibold">
          ✅ Semester Fee Paid
        </div>
      )}

      {/* ERP access */}
      {app.erpAccessGranted && (
        <div className="text-center text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg py-1.5 font-semibold">
          🎓 ERP Access Granted
        </div>
      )}
    </div>
  )
}

// ── Inline Documents Tab — upload + verify in the lead window directly ───────
function InlineDocumentsTab({ studentName, documents, uploadDocument, updateDocStatus, deleteDocument, showToast, currentUser, leadId }) {
  const fileRef = React.useRef(null)
  const [docType, setDocType]   = React.useState('10th Marksheet')
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const [generatingLink, setGeneratingLink] = React.useState(false)
  const isAdmin = ['Admin','Manager'].includes(currentUser?.role)

  const REQUIRED = [
    '10th Marksheet','12th Marksheet','Aadhar Card','Passport Photo',
    'Transfer Certificate','Migration Certificate','Caste Certificate',
    'Income Certificate','Character Certificate','Medical Certificate'
  ]

  const studentDocs = (documents || []).filter(d =>
    d.student?.toLowerCase() === studentName.toLowerCase()
  )

  const handleFile = async (file) => {
    if (!file) return
    const valid = ['image/jpeg','image/png','image/jpg','application/pdf']
    if (!valid.includes(file.type)) return showToast('Only PDF/JPG/PNG supported', 'error')
    if (file.size > 5 * 1024 * 1024) return showToast('File must be under 5MB', 'error')

    setUploading(true)
    try {
      // Upload file to server
      const fd = new FormData()
      fd.append('document', file)
      const uploadRes = await fetch('/api/upload/document', { method: 'POST', body: fd })
      const { fileUrl } = uploadRes.ok ? await uploadRes.json() : { fileUrl: '' }

      // Create document record
      await uploadDocument({
        student: studentName,
        type: docType,
        fileUrl: fileUrl || URL.createObjectURL(file),
        status: 'Pending'
      })
      showToast(`${docType} uploaded successfully`, 'success')
    } catch {
      showToast('Upload failed', 'error')
    }
    setUploading(false)
  }

  const handleGenerateShareLink = async () => {
    if (!leadId) return showToast('Lead ID not available', 'error')
    setGeneratingLink(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const headers = { 'Authorization': `Bearer ${token}` }
      const res = await fetch(`/api/leads/${leadId}/documents/generate-link`, { method: 'POST', headers })
      if (res.ok) {
        const { shareUrl } = await res.json()
        navigator.clipboard.writeText(shareUrl)
        showToast('Share link copied to clipboard!', 'success')
      } else {
        showToast('Failed to generate share link', 'error')
      }
    } catch (err) {
      console.error(err)
      showToast('Error generating share link', 'error')
    } finally {
      setGeneratingLink(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Documents</h3>
        <span className="text-xs text-gray-400">
          {studentDocs.filter(d => d.status === 'Verified').length} of {studentDocs.length || 0} verified
        </span>
      </div>

      {/* Inline upload area */}
      <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 mb-5">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-semibold text-gray-700">Upload Documents</h4>
          <button
            onClick={handleGenerateShareLink}
            disabled={generatingLink}
            className="text-xs px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-50"
          >
            {generatingLink ? 'Generating...' : '🔗 Share Upload Link'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)} className="input-field text-sm">
              {REQUIRED.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                dragOver ? 'border-primary-500 bg-primary-50' :
                uploading ? 'border-primary-300 bg-primary-50/50' :
                'border-gray-300 hover:border-primary-400'
              }`}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-primary-600">
                  <span className="animate-spin w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full" />
                  Uploading {docType}...
                </div>
              ) : (
                <>
                  <Plus size={20} className="mx-auto text-gray-400 mb-1" />
                  <p className="text-xs text-gray-600 font-semibold">Click to upload or drag & drop</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">PDF, JPG, PNG up to 5MB</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => handleFile(e.target.files?.[0])} />
            </div>
          </div>
        </div>
      </div>

      {/* Required checklist */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
        {REQUIRED.slice(0, 5).map(type => {
          const uploaded = studentDocs.find(d => d.type === type)
          const status = uploaded?.status || 'Not uploaded'
          const tone = uploaded?.status === 'Verified' ? 'green'
                     : uploaded?.status === 'Rejected' ? 'red'
                     : uploaded ? 'yellow' : 'gray'
          const cls = {
            green:  'bg-green-50 border-green-200 text-green-700',
            yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
            red:    'bg-red-50 border-red-200 text-red-700',
            gray:   'bg-gray-50 border-gray-200 text-gray-500',
          }[tone]
          return (
            <div key={type} className={`flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg border ${cls}`}>
              {uploaded ? <CheckCircle2 size={12} className="flex-shrink-0" /> : <Circle size={12} className="flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{type}</p>
                <p className="text-[10px] opacity-75">{status}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* All uploaded docs */}
      {studentDocs.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-8 border-2 border-dashed border-gray-200 rounded-xl">
          No documents uploaded yet. Use the upload box above ↑
        </div>
      ) : (
        <div className="overflow-x-auto card p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Document Type','Status','Uploaded','File','Actions'].map(h => (
                  <th key={h} className="table-th text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {studentDocs.map(d => (
                <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="table-td text-xs font-medium text-gray-800">{d.type}</td>
                  <td className="table-td">
                    <span className={`badge text-xs font-bold ${
                      d.status === 'Verified' ? 'bg-green-100 text-green-700' :
                      d.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{d.status}</span>
                  </td>
                  <td className="table-td text-xs text-gray-500">{d.uploadDate || '—'}</td>
                  <td className="table-td">
                    {d.fileUrl ? (
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline">View</a>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1">
                      {isAdmin && d.status !== 'Verified' && (
                        <button onClick={() => updateDocStatus(d.id, 'Verified')}
                          className="text-xs text-green-600 hover:bg-green-50 px-1.5 py-0.5 rounded">✓ Verify</button>
                      )}
                      {isAdmin && d.status !== 'Rejected' && (
                        <button onClick={() => updateDocStatus(d.id, 'Rejected')}
                          className="text-xs text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded">✗ Reject</button>
                      )}
                      {isAdmin && (
                        <button onClick={() => { if (confirm(`Delete ${d.type}?`)) deleteDocument(d.id) }}
                          className="text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 px-1.5 py-0.5 rounded">🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── PHASE 7-8: Registration Number & CampusOne Sync ─── */}
      {isApp && isAdmin && (
        <div className="mt-6 space-y-4">
          {/* Phase 7: Registration Number Generation */}
          <div className="card">
            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Registration Number</h3>
              {record?.registration_number && (
                <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
                  Generated
                </span>
              )}
            </div>
            {record?.registration_number ? (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-600 mb-2">Registration Number:</p>
                <p className="text-2xl font-bold text-blue-600">{record.registration_number}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Generated on {record.reg_number_generated_at ? new Date(record.reg_number_generated_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            ) : (
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <p className="text-sm text-gray-600 mb-3">Preconditions for registration number generation:</p>
                <ul className="space-y-2 text-sm">
                  <li className={`flex items-center gap-2 ${record?.form_status === 'Complete' ? 'text-green-600' : 'text-gray-600'}`}>
                    <span>{record?.form_status === 'Complete' ? '✓' : '○'}</span> Application Submitted
                  </li>
                  <li className={`flex items-center gap-2 ${record?.pay_status === 'Payment Approved' ? 'text-green-600' : 'text-gray-600'}`}>
                    <span>{record?.pay_status === 'Payment Approved' ? '✓' : '○'}</span> Application Fee Paid
                  </li>
                  <li className={`flex items-center gap-2 ${record?.booking_fee_status === 'Paid' ? 'text-green-600' : 'text-gray-600'}`}>
                    <span>{record?.booking_fee_status === 'Paid' ? '✓' : '○'}</span> Booking Fee Paid
                  </li>
                  <li className={`flex items-center gap-2 text-gray-600`}>
                    <span>○</span> All Documents Verified
                  </li>
                  <li className={`flex items-center gap-2 ${record?.finance_status === 'Verified' ? 'text-green-600' : 'text-gray-600'}`}>
                    <span>{record?.finance_status === 'Verified' ? '✓' : '○'}</span> Finance Verified
                  </li>
                </ul>
                <button
                  onClick={() => {
                    if (confirm('Generate registration number? All preconditions must be met.')) {
                      const token = localStorage.getItem('ccrm_token')
                      fetch(`/api/applications/${record.id}/generate-registration`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                      })
                        .then(r => r.json())
                        .then(d => {
                          if (d.success) {
                            alert('Registration number generated: ' + d.registrationNumber)
                            fetchAllData()
                          } else {
                            alert('Error: ' + d.error)
                          }
                        })
                        .catch(e => alert('Failed: ' + e.message))
                    }
                  }}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  Generate Registration Number
                </button>
              </div>
            )}
          </div>

          {/* Phase 8: CampusOne API Sync */}
          {record?.registration_number && (
            <div className="card">
              <div className="flex items-center justify-between mb-4 pb-4 border-b">
                <h3 className="text-lg font-bold text-gray-900">CampusOne Integration</h3>
                {record?.campusone_sync_status === 'Success' && (
                  <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
                    Synced
                  </span>
                )}
                {record?.campusone_sync_status === 'Failed' && (
                  <span className="inline-block px-3 py-1 bg-red-100 text-red-800 text-sm font-semibold rounded-full">
                    Failed
                  </span>
                )}
              </div>

              {record?.campusone_sync_status === 'Success' ? (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-sm text-gray-600 mb-2">CampusOne Student ID:</p>
                  <p className="text-xl font-bold text-green-600">{record.campusone_student_id}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Synced on {record.campusone_synced_at ? new Date(record.campusone_synced_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              ) : record?.campusone_sync_status === 'Failed' ? (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="text-sm text-red-600 font-semibold mb-2">Sync Failed</p>
                  <p className="text-sm text-red-700">{record.campusone_sync_error}</p>
                  <button
                    onClick={() => {
                      const token = localStorage.getItem('ccrm_token')
                      fetch(`/api/applications/${record.id}/sync-campusone`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                      })
                        .then(r => r.json())
                        .then(d => {
                          if (d.success) {
                            alert(d.message)
                            fetchAllData()
                          } else {
                            alert('Error: ' + d.error)
                          }
                        })
                        .catch(e => alert('Failed: ' + e.message))
                    }}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Retry Sync
                  </button>
                </div>
              ) : (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm text-gray-600 mb-3">Ready to sync with CampusOne</p>
                  <button
                    onClick={() => {
                      if (confirm('Sync this application to CampusOne? All data will be transferred.')) {
                        const token = localStorage.getItem('ccrm_token')
                        fetch(`/api/applications/${record.id}/sync-campusone`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` }
                        })
                          .then(r => r.json())
                          .then(d => {
                            if (d.success) {
                              alert(d.message)
                              fetchAllData()
                            } else {
                              alert('Error: ' + d.error)
                            }
                          })
                          .catch(e => alert('Failed: ' + e.message))
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Sync to CampusOne
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Phase 9: Admission Details Link & Login Credentials */}
          {(currentUser?.role === 'Admin' || currentUser?.role === 'Counselor') && (
            <div className="mt-8 space-y-6">
              {/* Step 1: Send Admission Details Form */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">📋 Step 1: Admission Details Form</h3>
                <p className="text-gray-700 mb-4">Send a secure link to the student to fill in their admission details (personal + academic information).</p>

                <div className="flex gap-3">
                <button
                  onClick={() => {
                    setAdmissionEmail(record?.email || '')
                    setShowAdmissionModal(true)
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-2"
                >
                  <Mail size={16} />
                  Send Admission Form Link
                </button>
              </div>
            </div>

            {/* Step 2: Send Login Credentials */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">✅ Step 2: Send Login Credentials</h3>
                <p className="text-gray-700 mb-4">After verifying admission details, send student their login credentials to access the portal and pay fees.</p>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (!record?.email) {
                        alert('Student email not found')
                        return
                      }
                      const token = localStorage.getItem('ccrm_token')
                      setAdmissionSending(true)
                      fetch(`/api/applications/${record.id}/send-login-credentials`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json'
                        }
                      })
                        .then(r => r.json())
                        .then(d => {
                          if (d.success) {
                            showToast('Login credentials sent to student', 'success')
                          } else {
                            alert('Error: ' + d.error)
                          }
                        })
                        .catch(e => alert('Failed: ' + e.message))
                        .finally(() => setAdmissionSending(false))
                    }}
                    disabled={admissionSending}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {admissionSending ? '📤 Sending...' : '🔑 Send Login Credentials'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Admission Method Modal - Choose Manual or Online */}
          <AdmissionMethodModal
            isOpen={showAdmissionMethodModal}
            onClose={() => setShowAdmissionMethodModal(false)}
            app={associatedApp}
            onConfirm={(method) => {
              setShowAdmissionMethodModal(false)
              if (method === 'manual') {
                setShowAdmissionForm(true)
              } else if (method === 'online') {
                showToast('Email sent! Student can now fill details via the secure link.', 'success')
              }
            }}
          />

          {/* Admission Details Modal */}
          {showAdmissionModal && (
            <Modal onClose={() => setShowAdmissionModal(false)}>
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">📧 Send Admission Form</h2>
                <p className="text-gray-600 mb-6">Enter the email address to send the admission form link to:</p>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={admissionEmail}
                    onChange={(e) => setAdmissionEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-purple-900">
                    <strong>ℹ️ Note:</strong> A secure link will be sent to this email. The link expires in 30 days.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      if (!admissionEmail) {
                        alert('Please enter an email address')
                        return
                      }

                      setAdmissionSending(true)
                      const token = localStorage.getItem('ccrm_token')
                      try {
                        const res = await fetch(`/api/applications/${record.id}/send-admission-details`, {
                          method: 'POST',
                          headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ email: admissionEmail })
                        })
                        const d = await res.json()
                        if (d.success) {
                          showToast(`Email sent to ${admissionEmail}`, 'success')
                          setShowAdmissionModal(false)
                        } else {
                          alert('Error: ' + d.error)
                        }
                      } catch (e) {
                        alert('Failed: ' + e.message)
                      } finally {
                        setAdmissionSending(false)
                      }
                    }}
                    disabled={admissionSending}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {admissionSending ? '📤 Sending...' : '✉️ Send Email'}
                  </button>
                  <button
                    onClick={() => setShowAdmissionModal(false)}
                    className="px-6 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  )
}
