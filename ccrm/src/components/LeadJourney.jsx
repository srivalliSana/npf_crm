import React from 'react'
import { Check, Ban, PhoneMissed, MessageSquare, CalendarClock, Bell } from 'lucide-react'

// The main path a lead walks, in order. Campus visit is optional: a lead can go from Interested straight to payment.
const PATH = [
  { s: 'Untouched', label: 'Untouched' },
  { s: 'Contacted', label: 'Contacted' },
  { s: 'Interested', label: 'Interested' },
  { s: 'Campus Visit Scheduled', label: 'Visit scheduled' },
  { s: 'Campus Visit Completed', label: 'Visit completed' },
  { s: 'Process for Payment', label: 'Payment' },
  { s: 'Payment Success', label: 'Paid' },
]
const ORDER = PATH.map(p => p.s)

// Outcomes that sit beside the path rather than on it.
const OUTCOMES = [
  { s: 'Invalid Number', label: 'Invalid number', icon: Ban },
  { s: 'No Response', label: 'No response', icon: PhoneMissed, hint: { kind: 'schedule', label: 'Schedule again', icon: CalendarClock } },
  { s: 'Follow Up', label: 'Further talk / follow up', icon: MessageSquare, hint: { kind: 'reminder', label: 'Set reminder', icon: Bell } },
]
const OFFRAMP = OUTCOMES.map(o => o.s)

// A step is done if it is earlier on the path than the current stage. An off-ramp stage
// (No Response, Follow Up...) is not on the path, so only Untouched and Contacted count as done.
function stepState(s, cur) {
  if (s === cur) return 'current'
  const c = ORDER.indexOf(cur), i = ORDER.indexOf(s)
  if (c !== -1 && i !== -1 && i < c) return 'done'
  if (OFFRAMP.includes(cur) && (s === 'Untouched' || s === 'Contacted')) return 'done'
  return 'todo'
}

// Path steps and outcomes are real stages: clicking one calls onSelect(stage).
export default function LeadJourney({ stage, onSelect, onSchedule, scheduled = {} }) {
  const currentIsOutcome = OFFRAMP.includes(stage)

  return (
    <div>
      {/* The path */}
      <ol className="flex items-start overflow-x-auto pb-1" aria-label="Lead pipeline">
        {PATH.map((p, i) => {
          const st = stepState(p.s, stage)
          return (
            <li key={p.s} className="flex items-start flex-1 min-w-[5.5rem] last:flex-none last:min-w-[4.5rem]">
              <button
                type="button" onClick={() => onSelect?.(p.s)} title={`Set stage: ${p.s}`} aria-current={st === 'current' ? 'step' : undefined}
                className="group flex flex-col items-center gap-2 w-[5.5rem] flex-shrink-0 focus:outline-none"
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium transition-colors
                  ${st === 'done' ? 'bg-gray-900 text-white' : st === 'current' ? 'bg-white text-gray-900 border-2 border-gray-900 ring-4 ring-gray-200' : 'bg-white text-gray-400 border border-gray-300 group-hover:border-gray-500 group-hover:text-gray-700'}`}>
                  {st === 'done' ? <Check size={15} strokeWidth={2.5} /> : i + 1}
                </span>
                <span className={`text-[12px] leading-tight text-center ${st === 'current' ? 'font-semibold text-gray-900' : st === 'done' ? 'text-gray-700' : 'text-gray-500'}`}>{p.label}</span>
              </button>
              {i < PATH.length - 1 && (
                <span aria-hidden="true" className={`flex-1 h-0.5 mt-[15px] -mx-3 min-w-4 rounded-full ${st === 'done' ? 'bg-gray-900' : 'bg-gray-200'}`} />
              )}
            </li>
          )
        })}
      </ol>

      {/* Outcomes that do not move the lead forward */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="text-[13px] text-gray-500">Or record an outcome</span>
        {OUTCOMES.map(o => {
          const Icon = o.icon
          const active = stage === o.s
          const when = o.hint ? scheduled[o.hint.kind] : null
          const HintIcon = o.hint?.icon
          return (
            <span key={o.s} className="inline-flex items-center gap-2">
              <button
                type="button" onClick={() => onSelect?.(o.s)} title={`Set stage: ${o.s}`} aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors
                  ${active ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-100'}`}
              >
                <Icon size={14} /> {o.label}
              </button>
              {o.hint && (
                <button type="button" onClick={() => onSchedule?.(o.hint.kind)}
                  className="inline-flex items-center gap-1 text-[13px] text-gray-700 hover:text-gray-900 underline underline-offset-4 decoration-gray-300 hover:decoration-gray-900">
                  <HintIcon size={13} />
                  {when ? `${o.hint.kind === 'reminder' ? 'Reminder' : 'Next call'}: ${when}` : o.hint.label}
                </button>
              )}
            </span>
          )
        })}
      </div>

      {currentIsOutcome && (
        <p className="mt-3 text-[13px] text-gray-500">Current outcome: <span className="text-gray-900 font-medium">{OUTCOMES.find(o => o.s === stage)?.label}</span></p>
      )}
    </div>
  )
}
