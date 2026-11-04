import React, { useMemo, useState } from 'react'
import { MessageCircle, Phone, Mail, MapPin, CreditCard } from 'lucide-react'

const SHOW = 30

// The generic admission journey, in order. Any other stage found in the data gets its own column after these.
const JOURNEY = ['Unverified', 'Verified', 'Application Started', 'Payment Approved', 'Application Submitted', 'Enrolment']

const STAGE_DOT = {
  'Unverified': 'bg-red-500', 'Verified': 'bg-blue-500', 'Application Started': 'bg-orange-500',
  'Payment Approved': 'bg-emerald-500', 'Application Submitted': 'bg-cyan-500', 'Enrolment': 'bg-green-700',
}

const initials = (name = '') => name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

const formChip = (v) => v === 'Complete' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
const payChip = (v = '') => /approved|done|paid|success/i.test(v) ? 'bg-green-50 text-green-700'
  : /pending/i.test(v) ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'

// Pipeline board for applications: one column per stage, one card per application.
//   apps           the applications to show (already filtered by the page)
//   onOpen         open an application
//   onMove         (app, toStage) -> saves the new stage
//   onPaymentLink  open the payment link dialog for a pending application
export default function ApplicationBoard({ apps, onOpen, onMove, onPaymentLink }) {
  const stages = useMemo(() => {
    const extra = Array.from(new Set(apps.map(a => a.stage).filter(Boolean))).filter(s => !JOURNEY.includes(s))
    return [...JOURNEY, ...extra]
  }, [apps])

  const byStage = useMemo(() => {
    const m = Object.fromEntries(stages.map(s => [s, []]))
    apps.forEach(a => { (m[a.stage] || (m[a.stage] = [])).push(a) })
    return m
  }, [apps, stages])

  const [shown, setShown] = useState({})      // stage -> how many to render
  const [dragOver, setDragOver] = useState(null)

  const onDrop = (e, stage) => {
    e.preventDefault()
    setDragOver(null)
    try {
      const { id, from } = JSON.parse(e.dataTransfer.getData('application/json') || '{}')
      if (!id || from === stage) return
      const app = apps.find(a => String(a.id) === String(id))
      if (app) onMove(app, stage)
    } catch { /* ignore malformed drops */ }
  }

  return (
    <div className="relative flex flex-col md:flex-1 md:min-h-0">
      <div className="relative flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory md:snap-none md:flex-1 md:min-h-0 md:overflow-y-hidden" aria-label="Application pipeline">
        {stages.map(stage => {
          const list = byStage[stage] || []
          const count = shown[stage] || SHOW
          const isOver = dragOver === stage
          return (
            <section
              key={stage}
              onDragOver={e => { e.preventDefault(); if (dragOver !== stage) setDragOver(stage) }}
              onDragLeave={() => setDragOver(d => (d === stage ? null : d))}
              onDrop={e => onDrop(e, stage)}
              className={`relative snap-start flex-shrink-0 w-[84vw] sm:w-72 rounded-lg p-2.5 flex flex-col max-h-[70vh] md:max-h-none md:h-full min-h-[12rem] ${isOver ? 'bg-gray-300/80' : 'bg-gray-200/70'}`}
            >
              <header className="flex items-center justify-between px-1.5 pb-3 pt-1">
                <h3 className="flex items-center gap-2 text-[14px] font-medium text-gray-900">
                  <span className={`w-2 h-2 rounded-full ${STAGE_DOT[stage] || 'bg-gray-400'}`} aria-hidden="true" />
                  {stage}
                </h3>
                <span className="min-w-[1.75rem] text-center px-2 py-0.5 rounded-full bg-white text-[12px] font-medium text-gray-700 tabular-nums">{list.length.toLocaleString()}</span>
              </header>

              <div className="space-y-2.5 overflow-y-auto pr-0.5 flex-1">
                {list.slice(0, count).map(app => {
                  const needsPayment = app.payStatus === 'Payment Pending' || app.payStatus === 'Pending'
                  return (
                    <article
                      key={app.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ id: app.id, from: stage })); e.dataTransfer.effectAllowed = 'move' }}
                      className="group bg-white rounded-lg border border-gray-200 hover:border-gray-400 transition-colors cursor-grab active:cursor-grabbing overflow-hidden"
                    >
                      <div className="p-3.5">
                        <div className="flex items-start gap-3">
                          <span className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-[12px] font-medium flex-shrink-0" aria-hidden="true">{initials(app.name) || '?'}</span>
                          <div className="min-w-0 flex-1">
                            <button onClick={() => onOpen(app)} className="block max-w-full text-left text-[15px] font-medium text-gray-900 group-hover:underline leading-snug break-words">{app.name}</button>
                            <div className="mt-0.5 text-[12px] text-gray-500 truncate"><span className="font-mono select-all">{app.appNo}</span>{app.course ? ` · ${app.course}` : ''}</div>
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {app.formStatus && <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${formChip(app.formStatus)}`}>Form {String(app.formStatus).toLowerCase()}</span>}
                          {app.payStatus && <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${payChip(app.payStatus)}`}>{app.payStatus}</span>}
                        </div>

                        <div className="mt-3 space-y-1.5 text-[13px] text-gray-700">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 tabular-nums"><Phone size={13} className="text-gray-400" />{app.mobile}</span>
                            <span className="flex items-center gap-1">
                              <a href={`tel:${app.mobile}`} aria-label={`Call ${app.name}`} title="Call"
                                className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-900 hover:text-white text-gray-600 transition-colors"><Phone size={13} /></a>
                              <a href={`https://wa.me/91${app.mobile}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${app.name}`} title="WhatsApp"
                                className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-900 hover:text-white text-gray-600 transition-colors"><MessageCircle size={13} /></a>
                            </span>
                          </div>
                          {app.email && <div className="flex items-center gap-2 min-w-0"><Mail size={13} className="text-gray-400 flex-shrink-0" /><span className="truncate">{app.email}</span></div>}
                          {app.campus && <div className="flex items-center gap-2"><MapPin size={13} className="text-gray-400 flex-shrink-0" />{app.campus}</div>}
                        </div>

                        {needsPayment && (
                          <button onClick={() => onPaymentLink(app)}
                            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary-500 hover:bg-primary-600 text-white text-[13px] font-medium">
                            <CreditCard size={14} /> Send payment link
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-gray-50 px-3.5 py-2.5">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${app.owner ? 'bg-gray-200 text-gray-700' : 'border border-dashed border-gray-300 text-gray-400'}`}>{initials(app.owner) || '–'}</span>
                          <span className={`text-[12px] truncate ${app.owner ? 'text-gray-800' : 'text-gray-400'}`}>{app.owner || 'Unassigned'}</span>
                        </span>
                        <label className="sr-only" htmlFor={`mva-${app.id}`}>Move {app.name} to another stage</label>
                        <select
                          id={`mva-${app.id}`}
                          value={stage}
                          onChange={e => { if (e.target.value !== stage) onMove(app, e.target.value) }}
                          className="text-[12px] border border-gray-300 rounded-md bg-white py-1 pl-1.5 pr-1 max-w-[8.5rem] text-gray-700"
                        >
                          {stages.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </article>
                  )
                })}

                {list.length === 0 && <p className="py-8 text-center text-[13px] text-gray-500">No applications in this stage.</p>}
                {list.length > count && (
                  <button onClick={() => setShown(p => ({ ...p, [stage]: count + SHOW }))}
                    className="w-full py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-200 rounded-md">
                    Show more ({(list.length - count).toLocaleString()} left)
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
