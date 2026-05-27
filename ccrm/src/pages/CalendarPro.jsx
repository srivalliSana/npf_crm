import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Clock,
  MapPin, Users, X, Filter, Save
} from 'lucide-react'

const EVENT_COLORS = {
  GD:          'bg-blue-500',
  PI:          'bg-purple-500',
  WAT:         'bg-orange-500',
  Tour:        'bg-green-500',
  Orientation: 'bg-teal-500',
  Meeting:     'bg-gray-500',
  Task:        'bg-indigo-500',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

export default function CalendarPro() {
  const { events, addEvent, showToast } = useCcrm()
  const today = new Date(2026, 4, 27) // May 27 2026 reference
  const [current, setCurrent] = useState({ year: 2026, month: 4 })
  const [view, setView] = useState('month')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)

  // Create Event Form state
  const [newEvent, setNewEvent] = useState({
    title: '',
    type: 'GD',
    date: '',
    time: '10:00 AM',
    venue: '',
    participants: ''
  })

  const daysInMonth = getDaysInMonth(current.year, current.month)
  const firstDay    = getFirstDayOfMonth(current.year, current.month)

  const prevMonth = () => {
    setCurrent(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 })
  }
  const nextMonth = () => {
    setCurrent(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 })
  }

  const getEventsForDay = (day) => {
    const dateStr = `${current.year}-${String(current.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter(e => e.date === dateStr)
  }

  const handleCreateEvent = (e) => {
    e.preventDefault()
    if (!newEvent.title.trim() || !newEvent.date) {
      showToast('Please enter title and date.', 'error')
      return
    }

    addEvent({
      ...newEvent,
      participants: Number(newEvent.participants || 1)
    })

    setShowCreate(false)
    setNewEvent({
      title: '',
      type: 'GD',
      date: '',
      time: '10:00 AM',
      venue: '',
      participants: ''
    })
  }

  const allEventsSorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : []

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendar Pro</h1>
          <p className="text-sm text-gray-500 mt-0.5">Schedule GD/PI, campus tours, orientations &amp; meetings</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {['month', 'week', 'list'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors focus:outline-none ${view === v ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors focus:outline-none">
            <Plus size={14} /> Add Event
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4">
        {/* Calendar */}
        {view !== 'list' ? (
          <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Month nav */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors focus:outline-none">
                <ChevronLeft size={18} />
              </button>
              <h2 className="font-bold text-gray-800 text-sm md:text-base">{MONTHS[current.month]} {current.year}</h2>
              <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors focus:outline-none">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/20">
              {DAYS.map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-24 border-b border-r border-gray-100 bg-gray-50/30" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const dayEvents = getEventsForDay(day)
                const isToday = day === today.getDate() && current.month === today.getMonth() && current.year === today.getFullYear()
                const isSelected = selectedDay === day
                
                return (
                  <div key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`h-24 border-b border-r border-gray-100 p-1.5 cursor-pointer hover:bg-blue-50/30 transition-colors ${isSelected ? 'bg-primary-50/50' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${isToday ? 'bg-primary-500 text-white shadow-sm' : isSelected ? 'text-primary-600 font-extrabold' : 'text-gray-700'}`}>
                        {day}
                      </div>
                      {dayEvents.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                      )}
                    </div>
                    <div className="space-y-1 overflow-hidden">
                      {dayEvents.slice(0, 2).map(e => (
                        <div key={e.id} className={`text-white text-[9px] px-1 py-0.5 rounded truncate font-medium ${EVENT_COLORS[e.type] || 'bg-gray-400'}`} title={e.title}>
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[9px] text-gray-400 pl-1 font-semibold">+{dayEvents.length - 2} more</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-xl border border-gray-250 p-4 shadow-sm space-y-3">
            <h3 className="font-bold text-gray-800 text-sm">Full Scheduled Events Ledger</h3>
            <div className="divide-y divide-gray-100">
              {allEventsSorted.map(e => (
                <div key={e.id} className="py-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-800">{e.title}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Date: {e.date} · Time: {e.time}</p>
                  </div>
                  <span className={`badge uppercase text-[9px] text-white px-2 py-0.5 rounded-full ${EVENT_COLORS[e.type] || 'bg-gray-400'}`}>
                    {e.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sidebar */}
        <div className="w-full xl:w-72 space-y-4 flex-shrink-0">
          {selectedDay && selectedDayEvents.length > 0 && (
            <div className="bg-primary-50/50 rounded-xl border border-primary-200 shadow-sm p-4 animate-slide-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-primary-800 text-xs uppercase tracking-wider">Events for May {selectedDay}</h3>
                <button onClick={() => setSelectedDay(null)} className="text-primary-400 hover:text-primary-600 focus:outline-none">
                  ×
                </button>
              </div>
              <div className="space-y-3">
                {selectedDayEvents.map(e => (
                  <div key={e.id} className="p-3 bg-white rounded-lg border border-primary-100 shadow-sm space-y-1">
                    <span className={`badge text-[9px] text-white font-bold ${EVENT_COLORS[e.type] || 'bg-gray-400'}`}>{e.type}</span>
                    <h4 className="font-bold text-xs text-gray-850 truncate">{e.title}</h4>
                    <p className="text-[10px] text-gray-500">⏰ {e.time} · 👥 {e.participants} candidates</p>
                    <p className="text-[10px] text-gray-400 truncate">📍 {e.venue}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-bold text-gray-800 text-xs uppercase tracking-wider mb-3">Upcoming Events</h3>
            <div className="space-y-3">
              {allEventsSorted.slice(0, 4).map(e => (
                <div key={e.id} className="flex gap-3">
                  <div className={`w-1 rounded-full flex-shrink-0 ${EVENT_COLORS[e.type] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{e.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-500 flex items-center gap-1 font-medium">
                        <Clock size={10} /> {e.time}
                      </span>
                      <span className="text-[10px] text-gray-500 flex items-center gap-1 font-medium">
                        <Users size={10} /> {e.participants}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                      <MapPin size={10} /> {e.venue}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Event type legend */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-bold text-gray-850 text-xs uppercase tracking-wider mb-3">Event Types</h3>
            <div className="space-y-2">
              {Object.entries(EVENT_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <span className="text-xs text-gray-600 font-semibold">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Create Event Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Schedule New Event</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateEvent} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Event Title *</label>
                <input
                  type="text"
                  required
                  value={newEvent.title}
                  onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. GD Session – Batch B"
                  className="input-field text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Event Type</label>
                  <select
                    value={newEvent.type}
                    onChange={e => setNewEvent(p => ({ ...p, type: e.target.value }))}
                    className="input-field text-sm"
                  >
                    {['GD','PI','WAT','Tour','Orientation','Meeting'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={newEvent.date}
                    onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                    className="input-field text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Time *</label>
                  <input
                    type="text"
                    required
                    value={newEvent.time}
                    onChange={e => setNewEvent(p => ({ ...p, time: e.target.value }))}
                    placeholder="e.g. 10:00 AM"
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Max Participants</label>
                  <input
                    type="number"
                    value={newEvent.participants}
                    onChange={e => setNewEvent(p => ({ ...p, participants: e.target.value }))}
                    placeholder="e.g. 10"
                    className="input-field text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Venue *</label>
                <input
                  type="text"
                  required
                  value={newEvent.venue}
                  onChange={e => setNewEvent(p => ({ ...p, venue: e.target.value }))}
                  placeholder="e.g. Exam Hall 2 / Online Google Meet"
                  className="input-field text-sm"
                />
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
                  <Save size={15} /> Schedule Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
