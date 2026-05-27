import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  Plus, Search, Clock, AlertCircle, CheckCircle,
  Phone, Mail, MessageCircle, Calendar, MoreHorizontal, ChevronDown, X
} from 'lucide-react'

const PRIORITY_COLORS = {
  High:   { bg: 'bg-red-100',    text: 'text-red-700'    },
  Medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  Low:    { bg: 'bg-green-100',  text: 'text-green-700'  },
}
const STATUS_COLORS = {
  Pending:    { bg: 'bg-orange-100', text: 'text-orange-700' },
  Completed:  { bg: 'bg-green-100',  text: 'text-green-700'  },
  Overdue:    { bg: 'bg-red-100',    text: 'text-red-700'    },
}
const TYPE_ICONS = {
  Call:     Phone,
  Email:    Mail,
  WhatsApp: MessageCircle,
  Meeting:  Calendar,
  Task:     CheckCircle,
}

export default function Tasks() {
  const { tasks, addTask, toggleTaskComplete, leads, counselors, currentUser } = useCcrm()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    type: 'Call',
    priority: 'Medium',
    due: '',
    assignee: currentUser?.name || 'Vikram K.',
    lead: ''
  })

  const filters = ['All', 'Pending', 'Completed', 'High Priority', 'Today']
  
  const filtered = tasks.filter(t => {
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
                        t.lead.toLowerCase().includes(search.toLowerCase())
    
    if (!matchSearch) return false
    if (filter === 'All') return true
    if (filter === 'Pending') return t.status === 'Pending'
    if (filter === 'Completed') return t.status === 'Completed'
    if (filter === 'High Priority') return t.priority === 'High'
    if (filter === 'Today') {
      // Just showing today's tasks based on string match for simplicity or first 5
      return t.status === 'Pending' // fallback
    }
    return true
  })

  const pending   = tasks.filter(t => t.status === 'Pending').length
  const completed = tasks.filter(t => t.status === 'Completed').length
  const high      = tasks.filter(t => t.priority === 'High' && t.status === 'Pending').length

  const handleCreate = (e) => {
    e.preventDefault()
    if (!newTask.title.trim()) return

    // format date/time
    let formattedDue = newTask.due
    if (newTask.due) {
      const d = new Date(newTask.due)
      formattedDue = d.toLocaleString('en-IN', { hour12: true })
    } else {
      formattedDue = new Date().toLocaleString('en-IN', { hour12: true })
    }

    addTask({
      ...newTask,
      due: formattedDue,
      status: 'Pending'
    })

    setShowCreate(false)
    setNewTask({
      title: '',
      type: 'Call',
      priority: 'Medium',
      due: '',
      assignee: currentUser?.name || 'Vikram K.',
      lead: ''
    })
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tasks &amp; Follow-ups</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all counselor tasks and follow-up activities</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors focus:outline-none">
          <Plus size={14} /> Add Task
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending Tasks',    value: pending,   color: 'text-orange-600', bg: 'bg-orange-50', icon: Clock        },
          { label: 'Completed Today',  value: completed, color: 'text-green-600',  bg: 'bg-green-50',  icon: CheckCircle  },
          { label: 'High Priority',    value: high,      color: 'text-red-600',    bg: 'bg-red-50',    icon: AlertCircle  },
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

      {/* Filters + Search */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 p-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none ${filter === f ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="relative ml-auto flex-1 md:flex-initial min-w-44">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks by title or lead..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filtered.map(task => {
          const Icon = TYPE_ICONS[task.type] || CheckCircle
          const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.Medium
          const sc = STATUS_COLORS[task.status] || STATUS_COLORS.Pending
          return (
            <div key={task.id}
              className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition-shadow ${task.status === 'Completed' ? 'opacity-60 bg-gray-50/50' : ''}`}>
              <button onClick={() => toggleTaskComplete(task.id)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors focus:outline-none ${task.status === 'Completed' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-primary-400'}`}>
                {task.status === 'Completed' && <span className="text-white text-[10px] font-bold">✓</span>}
              </button>

              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${task.status === 'Completed' ? 'bg-gray-100' : 'bg-primary-50'}`}>
                <Icon size={16} className={task.status === 'Completed' ? 'text-gray-400' : 'text-primary-500'} />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${task.status === 'Completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">Lead: <span className="text-primary-500 font-medium">{task.lead}</span> · Assignee: {task.assignee}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <span className={`badge ${pc.bg} ${pc.text}`}>{task.priority}</span>
                <span className={`badge ${sc.bg} ${sc.text}`}>{task.status}</span>
                <div className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                  <Clock size={12} />
                  {task.due}
                </div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 shadow-sm text-gray-400">
            <CheckCircle size={40} className="mx-auto mb-3 opacity-30 text-green-500 animate-bounce" />
            <p className="text-sm font-semibold">All caught up! No tasks found</p>
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Create New Task</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  value={newTask.title}
                  onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Follow up with student"
                  className="input-field text-sm"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Task Type</label>
                  <select
                    value={newTask.type}
                    onChange={e => setNewTask(p => ({ ...p, type: e.target.value }))}
                    className="input-field text-sm"
                  >
                    <option value="Call">Phone Call</option>
                    <option value="Email">Email</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Task">Task Checkoff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}
                    className="input-field text-sm"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Due Date &amp; Time *</label>
                <input
                  type="datetime-local"
                  required
                  value={newTask.due}
                  onChange={e => setNewTask(p => ({ ...p, due: e.target.value }))}
                  className="input-field text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Related Lead</label>
                  <select
                    value={newTask.lead}
                    onChange={e => setNewTask(p => ({ ...p, lead: e.target.value }))}
                    className="input-field text-sm"
                  >
                    <option value="">-- Select student lead --</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.name}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Assignee Counselor</label>
                  <select
                    value={newTask.assignee}
                    onChange={e => setNewTask(p => ({ ...p, assignee: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {counselors.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
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
                  <CheckCircle size={15} /> Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
