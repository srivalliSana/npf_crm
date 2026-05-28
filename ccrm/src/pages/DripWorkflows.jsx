import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  Zap, Plus, MessageCircle, Mail, Phone, Clock,
  ChevronRight, Play, Pause, Trash2, Edit2, X, Save,
  CheckCircle2, Users, BarChart2, ArrowDown
} from 'lucide-react'

const CHANNEL_CONFIG = {
  WhatsApp: { icon: MessageCircle, color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
  SMS:      { icon: Phone,         color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'  },
  Email:    { icon: Mail,          color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
}

const DEFAULT_SEQUENCES = [
  {
    id: 1, name: 'Application Follow-up', status: 'Active', enrolled: 0,
    description: 'Nurture interested leads through the application process',
    steps: [
      { day: 0,  channel: 'WhatsApp', template: 'Hi {name}! 👋 Thanks for your interest in CUTM. Your counselor will call you shortly. Meanwhile, explore our programs at cutm.ac.in' },
      { day: 2,  channel: 'SMS',      template: 'Dear {name}, apply online for CUEE 2026 at cutm.ac.in. Seats are limited — register today! -CUTMAD' },
      { day: 5,  channel: 'Email',    template: 'Subject: Your CUTM application awaits!\n\nDear {name},\n\nWe noticed you haven\'t completed your application yet. Complete it today and secure your seat at CUTM.\n\nApply: cutm.ac.in\n\nBest,\nAdmissions Team' },
      { day: 10, channel: 'WhatsApp', template: 'Hello {name}! 🎓 Last reminder — CUEE 2026 application deadline is approaching. Don\'t miss your chance to join CUTM!' },
    ]
  },
  {
    id: 2, name: 'Scholarship Alert', status: 'Active', enrolled: 0,
    description: 'Inform eligible leads about available merit scholarships',
    steps: [
      { day: 0, channel: 'WhatsApp', template: 'Great news {name}! 🎉 You may qualify for CUTM Merit Scholarship. Apply before June 30 to avail up to 50% fee waiver!' },
      { day: 3, channel: 'SMS',      template: 'Dear {name}, CUTM Merit Scholarship 2026 — up to 50% fee waiver available. Apply now at cutm.ac.in -CUTMAD' },
      { day: 7, channel: 'Email',    template: 'Subject: CUTM Scholarship — You\'re eligible!\n\nDear {name},\n\nBased on your profile, you qualify for our Merit Scholarship. Apply now and save on your education.\n\nDetails: cutm.ac.in/scholarships' },
    ]
  },
  {
    id: 3, name: 'Payment Reminder', status: 'Active', enrolled: 0,
    description: 'Follow up on pending application fee payments',
    steps: [
      { day: 0,  channel: 'WhatsApp', template: 'Hi {name}, your CUEE application fee payment of ₹25,000 is pending. Pay now to confirm your seat: cutm.ac.in/pay' },
      { day: 2,  channel: 'SMS',      template: 'Dear {name}, complete your CUEE 2026 fee payment to secure your admission. Visit cutm.ac.in/pay -CUTMAD' },
      { day: 5,  channel: 'WhatsApp', template: '⚠️ {name}, your CUTM seat will be released in 48 hours if payment is not received. Pay now at cutm.ac.in/pay' },
    ]
  },
  {
    id: 4, name: 'Counselor Introduction', status: 'Paused', enrolled: 0,
    description: 'Introduce assigned counselor to new leads',
    steps: [
      { day: 0, channel: 'WhatsApp', template: 'Hi {name}! I\'m your dedicated CUTM admissions counselor. I\'m here to guide you through the entire admission process. Feel free to reach out anytime! 😊' },
      { day: 1, channel: 'SMS',      template: 'Dear {name}, your CUTM counselor has been assigned. They will call you today between 10 AM - 6 PM. -CUTMAD' },
    ]
  },
]

export default function DripWorkflows() {
  const { leads, showToast, enrollDrip, sendBulkWhatsApp, sendBulkSMS } = useCcrm()

  const [sequences, setSequences] = useState(DEFAULT_SEQUENCES)
  const [selectedSeq, setSelectedSeq] = useState(null)
  const [showNewSeq, setShowNewSeq] = useState(false)
  const [showEnrollModal, setShowEnrollModal] = useState(null) // sequence id
  const [enrollFilter, setEnrollFilter] = useState({ stage: '', source: '' })
  const [enrolling, setEnrolling] = useState(false)

  // New sequence form
  const [newSeq, setNewSeq] = useState({ name: '', description: '', steps: [] })
  const [editingStep, setEditingStep] = useState(null) // { day, channel, template }

  const toggleStatus = (id) => {
    setSequences(prev => prev.map(s => s.id === id ? { ...s, status: s.status === 'Active' ? 'Paused' : 'Active' } : s))
    const seq = sequences.find(s => s.id === id)
    showToast(`"${seq.name}" ${seq.status === 'Active' ? 'paused' : 'activated'}.`, 'info')
  }

  const deleteSequence = (id) => {
    setSequences(prev => prev.filter(s => s.id !== id))
    if (selectedSeq?.id === id) setSelectedSeq(null)
    showToast('Sequence deleted.', 'success')
  }

  const handleEnrollLeads = async (seqId) => {
    const seq = sequences.find(s => s.id === seqId)
    if (!seq) return
    const eligible = leads.filter(l => {
      if (enrollFilter.stage && l.stage !== enrollFilter.stage) return false
      if (enrollFilter.source && l.source !== enrollFilter.source) return false
      return true
    })
    if (!eligible.length) return showToast('No leads match the selected filters.', 'warning')

    setEnrolling(true)
    // Send Day 0 messages immediately
    const day0Step = seq.steps.find(s => s.day === 0)
    if (day0Step) {
      const ids = eligible.map(l => l.id)
      if (day0Step.channel === 'WhatsApp') await sendBulkWhatsApp(ids, day0Step.template, seq.name)
      if (day0Step.channel === 'SMS') await sendBulkSMS(ids, day0Step.template)
    }
    setSequences(prev => prev.map(s => s.id === seqId ? { ...s, enrolled: (s.enrolled || 0) + eligible.length } : s))
    setEnrolling(false)
    setShowEnrollModal(null)
    setEnrollFilter({ stage: '', source: '' })
    showToast(`${eligible.length} leads enrolled in "${seq.name}". Day 0 messages sent.`, 'success')
  }

  const stageOptions = [...new Set(leads.map(l => l.stage).filter(Boolean))]
  const sourceOptions = [...new Set(leads.map(l => l.source).filter(Boolean))]

  const activeCount = sequences.filter(s => s.status === 'Active').length
  const totalEnrolled = sequences.reduce((s, sq) => s + (sq.enrolled || 0), 0)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Zap size={22} className="text-primary-500" /> Drip Workflows
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Automated multi-step nurturing sequences — set once, run forever</p>
        </div>
        <button onClick={() => setShowNewSeq(true)}
          className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5">
          <Plus size={14} /> New Sequence
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Active Sequences', value: activeCount,    icon: Zap,         color: 'text-primary-600', bg: 'bg-primary-50'  },
          { label: 'Leads Enrolled',   value: totalEnrolled,  icon: Users,       color: 'text-green-600',   bg: 'bg-green-50'    },
          { label: 'Total Sequences',  value: sequences.length, icon: BarChart2, color: 'text-purple-600',  bg: 'bg-purple-50'   },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
              <c.icon size={20} className={c.color} />
            </div>
            <div>
              <div className={`text-2xl font-extrabold ${c.color}`}>{c.value}</div>
              <div className="text-xs text-gray-500">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sequence List */}
        <div className="lg:col-span-1 space-y-3">
          {sequences.map(seq => (
            <div key={seq.id}
              onClick={() => setSelectedSeq(seq)}
              className={`bg-white rounded-xl border shadow-sm p-4 cursor-pointer transition-all hover:shadow-md ${selectedSeq?.id === seq.id ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm">{seq.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{seq.description}</p>
                </div>
                <span className={`badge text-[10px] font-bold flex-shrink-0 ml-2 ${seq.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {seq.status}
                </span>
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Clock size={11} />{seq.steps.length} steps</span>
                  <span className="flex items-center gap-1"><Users size={11} />{seq.enrolled || 0} enrolled</span>
                </div>
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setShowEnrollModal(seq.id)}
                    className="text-xs text-primary-600 border border-primary-200 rounded-lg px-2 py-1 hover:bg-primary-50 transition-colors">
                    Enroll
                  </button>
                  <button onClick={() => toggleStatus(seq.id)}
                    className={`p-1.5 rounded hover:bg-gray-100 ${seq.status === 'Active' ? 'text-yellow-500' : 'text-green-500'}`}
                    title={seq.status === 'Active' ? 'Pause' : 'Activate'}>
                    {seq.status === 'Active' ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button onClick={() => deleteSequence(seq.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {sequences.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <Zap size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-400">No sequences yet. Create one to start automating.</p>
            </div>
          )}
        </div>

        {/* Sequence Detail */}
        <div className="lg:col-span-2">
          {selectedSeq ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-bold text-gray-900 text-base">{selectedSeq.name}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedSeq.description}</p>
                </div>
                <button onClick={() => setShowEnrollModal(selectedSeq.id)}
                  className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5">
                  <Users size={14} /> Enroll Leads
                </button>
              </div>

              {/* Step timeline */}
              <div className="space-y-1">
                {selectedSeq.steps.map((step, i) => {
                  const ch = CHANNEL_CONFIG[step.channel] || CHANNEL_CONFIG.WhatsApp
                  const ChIcon = ch.icon
                  return (
                    <React.Fragment key={i}>
                      <div className={`flex items-start gap-3 p-3 rounded-xl border ${ch.border} ${ch.bg}`}>
                        <div className={`w-9 h-9 rounded-lg bg-white border ${ch.border} flex items-center justify-center flex-shrink-0`}>
                          <ChIcon size={16} className={ch.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`badge text-[10px] font-bold ${ch.bg} ${ch.color} border ${ch.border}`}>{step.channel}</span>
                            <span className="text-xs text-gray-500 font-medium flex items-center gap-1">
                              <Clock size={10} /> Day {step.day}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{step.template}</p>
                        </div>
                      </div>
                      {i < selectedSeq.steps.length - 1 && (
                        <div className="flex justify-center">
                          <ArrowDown size={14} className="text-gray-300" />
                        </div>
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 flex flex-col items-center justify-center text-center h-full">
              <Zap size={40} className="text-gray-200 mb-4" />
              <p className="text-sm font-medium text-gray-400">Select a sequence to view its steps</p>
              <p className="text-xs text-gray-300 mt-1">or create a new one to start automating your outreach</p>
            </div>
          )}
        </div>
      </div>

      {/* Enroll Modal */}
      {showEnrollModal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Users size={18} className="text-primary-500" /> Enroll Leads
              </h2>
              <button onClick={() => setShowEnrollModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Enrolling into: <strong className="text-gray-800">{sequences.find(s => s.id === showEnrollModal)?.name}</strong>
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Filter by Stage (optional)</label>
                <select value={enrollFilter.stage} onChange={e => setEnrollFilter(p => ({ ...p, stage: e.target.value }))} className="input-field text-sm">
                  <option value="">All Stages</option>
                  {stageOptions.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Filter by Source (optional)</label>
                <select value={enrollFilter.source} onChange={e => setEnrollFilter(p => ({ ...p, source: e.target.value }))} className="input-field text-sm">
                  <option value="">All Sources</option>
                  {sourceOptions.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Preview count */}
            <div className="bg-primary-50 border border-primary-100 rounded-xl p-3 mb-4 text-sm text-primary-700 font-medium">
              {leads.filter(l => {
                if (enrollFilter.stage && l.stage !== enrollFilter.stage) return false
                if (enrollFilter.source && l.source !== enrollFilter.source) return false
                return true
              }).length} leads will be enrolled — Day 0 messages sent immediately
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowEnrollModal(null)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
              <button onClick={() => handleEnrollLeads(showEnrollModal)} disabled={enrolling}
                className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {enrolling ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Zap size={15} />}
                {enrolling ? 'Enrolling...' : 'Enroll & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Sequence Modal */}
      {showNewSeq && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 flex items-center gap-2"><Plus size={18} className="text-primary-500" /> New Drip Sequence</h2>
              <button onClick={() => setShowNewSeq(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sequence Name *</label>
                <input value={newSeq.name} onChange={e => setNewSeq(p => ({ ...p, name: e.target.value }))} className="input-field text-sm" placeholder="e.g. Re-engagement Campaign" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Description</label>
                <input value={newSeq.description} onChange={e => setNewSeq(p => ({ ...p, description: e.target.value }))} className="input-field text-sm" placeholder="Brief description of the sequence goal" />
              </div>

              {/* Step builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Steps</label>
                  <button type="button" onClick={() => setNewSeq(p => ({ ...p, steps: [...p.steps, { day: p.steps.length * 3, channel: 'WhatsApp', template: '' }] }))}
                    className="text-xs text-primary-500 flex items-center gap-1"><Plus size={12} /> Add Step</button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {newSeq.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                      <input type="number" value={step.day} min={0}
                        onChange={e => setNewSeq(p => ({ ...p, steps: p.steps.map((s, j) => j === i ? { ...s, day: parseInt(e.target.value) || 0 } : s) }))}
                        className="w-16 input-field text-xs py-1 px-2" placeholder="Day" />
                      <select value={step.channel}
                        onChange={e => setNewSeq(p => ({ ...p, steps: p.steps.map((s, j) => j === i ? { ...s, channel: e.target.value } : s) }))}
                        className="input-field text-xs py-1 px-2 w-28">
                        <option>WhatsApp</option><option>SMS</option><option>Email</option>
                      </select>
                      <input value={step.template} placeholder="Message template..."
                        onChange={e => setNewSeq(p => ({ ...p, steps: p.steps.map((s, j) => j === i ? { ...s, template: e.target.value } : s) }))}
                        className="flex-1 input-field text-xs py-1 px-2" />
                      <button onClick={() => setNewSeq(p => ({ ...p, steps: p.steps.filter((_, j) => j !== i) }))}
                        className="text-red-400 hover:text-red-600 p-1"><X size={12} /></button>
                    </div>
                  ))}
                  {newSeq.steps.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No steps yet — click "Add Step" above</p>}
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setShowNewSeq(false)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
                <button onClick={() => {
                  if (!newSeq.name) return showToast('Name is required.', 'error')
                  const newId = Math.max(...sequences.map(s => s.id), 0) + 1
                  setSequences(p => [...p, { ...newSeq, id: newId, status: 'Active', enrolled: 0 }])
                  setNewSeq({ name: '', description: '', steps: [] })
                  setShowNewSeq(false)
                  showToast(`"${newSeq.name}" created successfully.`, 'success')
                }} className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-1.5">
                  <Save size={15} /> Create Sequence
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
