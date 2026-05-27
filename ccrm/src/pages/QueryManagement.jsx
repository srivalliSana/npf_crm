import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  MessageSquare, Plus, Search, Filter, Clock, CheckCircle,
  AlertCircle, MoreHorizontal, ChevronDown, Send, X, Save
} from 'lucide-react'

const STATUS_COLORS = {
  Open:        { bg: 'bg-red-100',    text: 'text-red-700'    },
  'In Progress':{ bg: 'bg-yellow-100',text: 'text-yellow-700' },
  Resolved:    { bg: 'bg-green-100',  text: 'text-green-700'  },
  Closed:      { bg: 'bg-gray-100',   text: 'text-gray-600'   },
}
const PRIORITY_COLORS = {
  High:   { bg: 'bg-red-100',    text: 'text-red-700'    },
  Medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Low:    { bg: 'bg-green-100',  text: 'text-green-700'  },
}
const CATEGORY_COLORS = {
  Admission:   'bg-blue-100 text-blue-700',
  Finance:     'bg-green-100 text-green-700',
  Hostel:      'bg-purple-100 text-purple-700',
  Scholarship: 'bg-orange-100 text-orange-700',
  Academic:    'bg-teal-100 text-teal-700',
}

export default function QueryManagement() {
  const { queries, addQuery, updateQueryStatus, addQueryReply, leads, counselors, showToast } = useCcrm()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [reply, setReply] = useState('')

  // Create Query form state
  const [newQuery, setNewQuery] = useState({
    student: '',
    subject: '',
    category: 'Admission',
    priority: 'Medium',
    assignee: 'Vikram K.'
  })

  const tabs = ['All', 'Open', 'In Progress', 'Resolved']
  
  const filtered = queries.filter(q =>
    (filter === 'All' || q.status === filter) &&
    (q.student.toLowerCase().includes(search.toLowerCase()) || q.subject.toLowerCase().includes(search.toLowerCase()))
  )

  const open       = queries.filter(q => q.status === 'Open').length
  const inProgress = queries.filter(q => q.status === 'In Progress').length
  const resolved   = queries.filter(q => q.status === 'Resolved').length

  const selectedQuery = selected ? queries.find(q => q.id === selected.id) : null

  const handleCreateQuery = (e) => {
    e.preventDefault()
    if (!newQuery.student || !newQuery.subject.trim()) {
      showToast('Please select a student and enter subject.', 'error')
      return
    }

    addQuery(newQuery)
    setShowCreate(false)
    setNewQuery({
      student: '',
      subject: '',
      category: 'Admission',
      priority: 'Medium',
      assignee: 'Vikram K.'
    })
  }

  const handleSendReply = () => {
    if (!reply.trim() || !selectedQuery) return
    addQueryReply(selectedQuery.id, reply)
    setReply('')
  }

  const handleStatusChange = (status) => {
    if (!selectedQuery) return
    updateQueryStatus(selectedQuery.id, status)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Query Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Student queries, tickets &amp; support management</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors focus:outline-none">
          <Plus size={14} /> New Query
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Open Queries',    value: open,       color: 'text-red-600',    bg: 'bg-red-50',    icon: AlertCircle  },
          { label: 'In Progress',     value: inProgress, color: 'text-yellow-600', bg: 'bg-yellow-50', icon: Clock        },
          { label: 'Resolved',        value: resolved,   color: 'text-green-600',  bg: 'bg-green-50',  icon: CheckCircle  },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}>
              <s.icon size={22} className={s.color} />
            </div>
            <div>
              <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* List */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {tabs.map(t => (
                <button key={t} onClick={() => setFilter(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none ${filter === t ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search queries..."
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 w-44" />
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {filtered.map(q => {
              const sc = STATUS_COLORS[q.status] || STATUS_COLORS.Open
              const pc = PRIORITY_COLORS[q.priority] || PRIORITY_COLORS.Medium
              const cc = CATEGORY_COLORS[q.category] || 'bg-gray-100 text-gray-600'
              return (
                <div key={q.id}
                  onClick={() => setSelected(q)}
                  className={`px-4 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedQuery?.id === q.id ? 'bg-primary-50 border-l-4 border-primary-500' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{q.subject}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{q.student} · {q.created}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`badge ${sc.bg} ${sc.text}`}>{q.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`badge ${cc}`}>{q.category}</span>
                    <span className={`badge ${pc.bg} ${pc.text}`}>{q.priority}</span>
                    <span className="text-xs text-gray-400 font-medium">Assigned: {q.assignee}</span>
                  </div>
                </div>
              )}
            )}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">No queries registered</p>
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedQuery && (
          <div className="w-full lg:w-96 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden animate-slide-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-bold text-gray-800 text-sm">Query Details</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <span className="text-[10px] font-bold bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                  Ticket #{selectedQuery.id}
                </span>
                <h4 className="font-semibold text-gray-900 text-sm mt-2">{selectedQuery.subject}</h4>
              </div>
              
              <div className="space-y-2 text-xs border-t border-b border-gray-100 py-3">
                {[
                  ['Student Name', selectedQuery.student],
                  ['Category', selectedQuery.category],
                  ['Priority', selectedQuery.priority],
                  ['Status', selectedQuery.status],
                  ['Assigned To', selectedQuery.assignee],
                  ['Raised Date', selectedQuery.created],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-0.5">
                    <span className="text-gray-500 font-medium">{k}</span>
                    <span className="font-semibold text-gray-700">{v}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Update status</p>
                <div className="flex gap-1.5 flex-wrap">
                  {['Open','In Progress','Resolved','Closed'].map(s => (
                    <button key={s}
                      onClick={() => handleStatusChange(s)}
                      className={`text-xs px-2.5 py-1 rounded-md border font-semibold transition-colors focus:outline-none ${selectedQuery.status === s ? 'bg-primary-500 text-white border-primary-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Reply to Student</p>
                <textarea value={reply} onChange={e => setReply(e.target.value)}
                  rows={3} placeholder="Type your counselor reply here..."
                  className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none font-medium" />
                <button
                  onClick={handleSendReply}
                  disabled={!reply.trim()}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs bg-primary-500 hover:bg-primary-600 disabled:bg-gray-200 text-white rounded-lg py-2 transition-colors font-bold focus:outline-none"
                >
                  <Send size={12} /> Send Reply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Create New Query</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateQuery} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Select Student *</label>
                <select
                  value={newQuery.student}
                  onChange={e => setNewQuery(p => ({ ...p, student: e.target.value }))}
                  className="input-field text-sm"
                  required
                >
                  <option value="">-- Choose student lead --</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.name}>{l.name} ({l.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Subject / Question *</label>
                <input
                  type="text"
                  required
                  value={newQuery.subject}
                  onChange={e => setNewQuery(p => ({ ...p, subject: e.target.value }))}
                  placeholder="e.g. Scholarship application status"
                  className="input-field text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Category</label>
                  <select
                    value={newQuery.category}
                    onChange={e => setNewQuery(p => ({ ...p, category: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {['Admission','Finance','Hostel','Scholarship','Academic','Other'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Priority</label>
                  <select
                    value={newQuery.priority}
                    onChange={e => setNewQuery(p => ({ ...p, priority: e.target.value }))}
                    className="input-field text-sm"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Assign To Counselor</label>
                <select
                  value={newQuery.assignee}
                  onChange={e => setNewQuery(p => ({ ...p, assignee: e.target.value }))}
                  className="input-field text-sm"
                >
                  {counselors.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 btn-secondary text-sm py-2.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-1.5"
                >
                  <Save size={15} /> Create Query
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
