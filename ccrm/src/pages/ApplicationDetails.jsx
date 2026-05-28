import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, MessageCircle, Mail, Share2, Edit3,
  Calendar, ArrowRightLeft, Star, Phone, MapPin,
  User, BookOpen, Building2, GraduationCap, ChevronRight,
  Clock, CheckCircle2, Circle, AlertCircle, Plus, Send, Save, HelpCircle, PhoneCall
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

async function initiateAmeyoCall(mobile) {
  // Always call our backend — avoids CORS and handles Exotel/Ameyo detection server-side
  const res = await fetch('/api/ameyo/click2call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: mobile })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Call failed')
  return data
}

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
  'Follow Up',
  'Interested',
  'Qualified Leads',
  'Converted',
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
    showToast, currentUser
  } = useCcrm()

  // 1. Fetch current lead or application
  let record = null
  let associatedLead = null
  let associatedApp = null

  if (isApp) {
    record = applications.find(a => a.id === parseInt(id)) || applications[0]
    if (record) {
      associatedApp = record
      associatedLead = leads.find(l => l.email.toLowerCase() === record.email.toLowerCase() || l.name.toLowerCase() === record.name.toLowerCase())
    }
  } else {
    record = leads.find(l => l.id === parseInt(id)) || leads[0]
    if (record) {
      associatedLead = record
      associatedApp = applications.find(a => a.email.toLowerCase() === record.email.toLowerCase() || a.name.toLowerCase() === record.name.toLowerCase())
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
  const [ameyoCalling, setAmeyoCalling]   = useState(false)
  const [ameyoReady, setAmeyoReady]       = useState(null)
  const [ameyoCfg, setAmeyoCfg]           = useState(null)

  useEffect(() => {
    fetch('/api/integration-settings').then(r => r.json())
      .then(cfg => {
        setAmeyoCfg(cfg)
        const isExotel = (cfg.ameyo_api_url || '').toLowerCase().includes('exotel')
        const ready = isExotel
          ? !!(cfg.ameyo_api_url && cfg.ameyo_username && cfg.ameyo_password && cfg.ameyo_virtual_number && cfg.ameyo_agent_number)
          : !!(cfg.ameyo_api_url && cfg.ameyo_username && cfg.ameyo_password)
        setAmeyoReady(ready)
      })
      .catch(() => setAmeyoReady(false))
  }, [])
  const [editMode, setEditMode] = useState(false)
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
  })

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
      'Untouched': 'bg-red-100 text-red-700 border border-red-200',
      'Contacted': 'bg-blue-100 text-blue-700 border border-blue-200',
      'Interested': 'bg-green-100 text-green-700 border border-green-200',
      'Follow Up': 'bg-yellow-100 text-yellow-700 border border-yellow-200',
      'Converted': 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      'Qualified Leads': 'bg-green-100 text-green-700 border border-green-200',
      'Unqualified Leads': 'bg-orange-100 text-orange-700 border border-orange-200'
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
      formInterest: formData.formInterest
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

  const handleStageClick = (stageName, stageIndex) => {
    const dateStr = new Date().toLocaleString('en-IN', { hour12: true })

    // Add timeline event
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
        'Untouched': 'red',
        'Contacted': 'blue',
        'Follow Up': 'yellow',
        'Interested': 'green',
        'Qualified Leads': 'green',
        'Converted': 'emerald',
      }
      updateLead(associatedLead.id, {
        stage: stageName,
        stageColor: stageColorMap[stageName] || 'blue',
        timeline: newTimeline
      })
      showToast(`Lead stage updated to "${stageName}"`, 'success')
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
        stage: stageIndex >= 4 ? 'Converted' : 'Qualified Leads',
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            {/* Avatar */}
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xl font-bold shadow-md mb-3 select-none">
                {getInitials(studentName)}
              </div>
              <h2 className="font-bold text-gray-900 text-base">{studentName}</h2>
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
                  {/* Click-to-Call */}
                  {ameyoReady === true ? (
                    <button
                      disabled={ameyoCalling}
                      onClick={async () => {
                        setAmeyoCalling(true)
                        try {
                          const data = await initiateAmeyoCall(studentMobile)
                          showToast(`Call initiated via ${data.provider === 'exotel' ? 'Exotel' : 'Ameyo'} ✓`, 'success')
                        } catch (e) {
                          showToast(e.message || 'Call failed.', 'error')
                        }
                        setAmeyoCalling(false)
                      }}
                      className="text-violet-500 hover:text-violet-700 disabled:opacity-50"
                      title="Click-to-Call"
                    >
                      {ameyoCalling
                        ? <span className="animate-spin inline-block w-3.5 h-3.5 border border-violet-400 border-t-violet-700 rounded-full" />
                        : <PhoneCall size={14} />}
                    </button>
                  ) : ameyoCfg?.ameyo_api_url && ameyoReady === false ? (
                    // Telephony partially configured — show warning that links to settings
                    <button
                      onClick={() => {
                        const isExotel = (ameyoCfg.ameyo_api_url || '').toLowerCase().includes('exotel')
                        const missing = []
                        if (!ameyoCfg.ameyo_virtual_number) missing.push('Virtual Number')
                        if (!ameyoCfg.ameyo_agent_number)   missing.push('Agent Number')
                        if (!ameyoCfg.ameyo_password)        missing.push('Auth Token/Password')
                        showToast(`Telephony incomplete — missing: ${missing.join(', ')}. Go to Integrations → Telephony to configure.`, 'warning')
                        navigate('/integrations')
                      }}
                      className="text-yellow-500 hover:text-yellow-700"
                      title="Telephony not fully configured — click to configure"
                    >
                      <PhoneCall size={14} />
                    </button>
                  ) : (
                    // No telephony configured — plain tel: link
                    <a href={`tel:${studentMobile}`} className="text-blue-400 hover:text-blue-600" title="Call">
                      <PhoneCall size={14} />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                <span>{studentCity}, {studentState}</span>
              </div>
            </div>

            {/* Score */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500 font-medium">Application Score</span>
                <span className="text-sm font-bold text-primary-600">{score}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-primary-400 to-primary-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${score}%` }}
                ></div>
              </div>
            </div>

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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assignment Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Assigned Counselor</p>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold select-none">
                    {owner.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{owner}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Lead Source</p>
                <span className="text-sm text-gray-700 font-medium">{source}</span>
              </div>
            </div>
          </div>

          {/* Important Dates */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
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
          {/* Progress stages */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-700">Application Progress</h3>
              <span className="text-xs text-gray-400 font-semibold">{isApp ? 'Application' : 'Lead'} Stage {stageIdx + 1} of {activeStages.length}</span>
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

          {/* Tabs */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
              {activeTab === 'Lead Details' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-800">Lead Information</h3>
                    <button
                      onClick={() => setEditMode(!editMode)}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors focus:outline-none font-semibold ${
                        editMode
                          ? 'bg-primary-500 text-white hover:bg-primary-600'
                          : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Edit3 size={13} />
                      {editMode ? 'Cancel Edit' : 'Edit Information'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: 'Form Interested In', key: 'formInterest', icon: BookOpen },
                      { label: 'Email Address', key: 'email', icon: Mail },
                      { label: 'Mobile Number', key: 'mobile', icon: Phone },
                      { label: 'Alternate Mobile', key: 'altMobile', icon: Phone },
                      { label: 'Full Student Name', key: 'name', icon: User },
                      { label: 'State', key: 'state', icon: MapPin },
                      { label: 'City', key: 'city', icon: MapPin },
                      { label: 'Campus Preference', key: 'campus', icon: Building2 },
                      { label: 'School Category', key: 'school', icon: GraduationCap },
                      { label: 'Course Preference', key: 'course', icon: BookOpen },
                    ].map(({ label, key, icon: Icon }) => (
                      <div key={key}>
                        <label className="block text-xs text-gray-400 font-medium mb-1">{label}</label>
                        {editMode ? (
                          <input
                            type="text"
                            value={formData[key] || ''}
                            onChange={e => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                            className="input-field text-sm"
                          />
                        ) : (
                          <div className="flex items-center gap-2 py-2 px-3 bg-gray-50 rounded-lg border border-gray-100">
                            <Icon size={13} className="text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-700 truncate">{formData[key] || '—'}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {editMode && (
                    <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4">
                      <button
                        onClick={handleSaveChanges}
                        className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                      >
                        <Save size={14} />
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                  {showAddEvent && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 animate-scale-up">
                        <h3 className="font-bold text-gray-900 mb-3 text-base">Schedule Call / Interview</h3>
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
                      </div>
                    </div>
                  )}
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
                  {showAddQuery && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 animate-scale-up">
                        <h3 className="font-bold text-gray-900 mb-3 text-base">Raise Support Ticket</h3>
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
                      </div>
                    </div>
                  )}

                  {/* Reply Dialog */}
                  {selectedQueryId && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 animate-scale-up">
                        <h3 className="font-bold text-gray-900 mb-2 text-sm">Send Response to Student</h3>
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
                      </div>
                    </div>
                  )}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
