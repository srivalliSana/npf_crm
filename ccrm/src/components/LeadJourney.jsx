import React from 'react'
import {
  Users, User, Phone, Ban, PhoneMissed, MessageSquare, Star,
  CalendarDays, MapPin, CreditCard, BadgeCheck, GraduationCap,
  CalendarClock, Bell, ChevronRight
} from 'lucide-react'

// Progress-state palette: completed = green, in-process (current) = orange, not done = red
const TONE = {
  green:  { box: 'bg-green-50 border-green-300 text-green-700',    on: 'bg-green-600 border-green-600 text-white ring-green-300' },
  orange: { box: 'bg-orange-50 border-orange-300 text-orange-700', on: 'bg-orange-500 border-orange-500 text-white ring-orange-300' },
  red:    { box: 'bg-red-50 border-red-300 text-red-700',          on: 'bg-red-600 border-red-600 text-white ring-red-300' },
  slate:  { box: 'bg-slate-700 border-slate-700 text-white',       on: 'bg-slate-700 border-slate-700 text-white ring-slate-300' },
}

// Happy-path order; off-ramps are never "completed" (only current → orange, else red)
const PATH = ['Untouched', 'Contacted', 'Interested', 'Campus Visit Scheduled', 'Campus Visit Completed', 'Process for Payment', 'Payment Success', 'Admission Confirmed']
const OFFRAMP = ['Invalid Number', 'No Response', 'Further Talk']

function stageState(s, cur) {
  if (s === cur) return 'orange'              // in process
  if (OFFRAMP.includes(s)) return 'red'       // a branch the lead didn't take
  const cP = PATH.indexOf(cur), sP = PATH.indexOf(s)
  if (cP === -1) return sP <= 1 ? 'green' : 'red'   // current is an off-ramp → only Untouched/Contacted done
  return sP !== -1 && sP < cP ? 'green' : 'red'     // before current = done, after = not done
}

export default function LeadJourney({ stage, onSelect }) {
  const Node = ({ s, label, icon: Icon, dashed = false }) => {
    const active = stage === s
    const t = TONE[stageState(s, stage)] || TONE.red
    return (
      <button
        type="button"
        onClick={() => onSelect?.(s)}
        title={`Set stage: ${s}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition hover:shadow-sm
          ${dashed ? 'border-dashed ' : ''}${active ? t.on + ' ring-2 ring-offset-1 shadow' : t.box}`}
      >
        {Icon && <Icon size={13} className="flex-shrink-0" />}
        <span>{label}</span>
        {active && <BadgeCheck size={12} className="ml-0.5 flex-shrink-0" />}
      </button>
    )
  }
  const Arrow = () => <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />

  return (
    <div className="space-y-3 text-xs">
      {/* Trunk */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 text-white text-[11px] font-bold">
          <Users size={13} /> All Leads
        </span>
        <Arrow />
        <Node s="Untouched" label="Untouched" icon={User} />
        <Arrow />
        <Node s="Contacted" label="Contacted" icon={Phone} />
      </div>

      {/* Branches after Contacted */}
      <div className="pl-3 border-l-2 border-gray-100 space-y-2">
        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">After Contacted</div>
        <div className="flex flex-wrap items-center gap-2">
          <Node s="Invalid Number" label="Invalid Number" icon={Ban} />
          <span className="inline-flex items-center gap-1"><Node s="No Response" label="No Response" icon={PhoneMissed} /><Node s="No Response" label="Schedule again" icon={CalendarClock} dashed /></span>
          <span className="inline-flex items-center gap-1"><Node s="Further Talk" label="Further Talk" icon={MessageSquare} /><Node s="Further Talk" label="Reminder" icon={Bell} dashed /></span>
          <Node s="Interested" label="Interested" icon={Star} />
        </div>
      </div>

      {/* Interested → two paths (horizontal chains) */}
      <div className="pl-3 border-l-2 border-green-100 space-y-2">
        <div className="text-[10px] uppercase font-bold text-green-600 tracking-wide">If Interested</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 w-24">Path 1 · Campus Visit</span>
          <Node s="Campus Visit Scheduled" label="Visit Scheduled" icon={CalendarDays} />
          <Arrow />
          <Node s="Campus Visit Completed" label="Visit Completed" icon={MapPin} />
          <Arrow />
          <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} />
          <Arrow />
          <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} />
          <Arrow />
          <Node s="Admission Confirmed" label="Admission Confirmed" icon={GraduationCap} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 w-24">Path 2 · Direct Pay</span>
          <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} />
          <Arrow />
          <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} />
          <Arrow />
          <Node s="Admission Confirmed" label="Admission Confirmed" icon={GraduationCap} />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t border-gray-100 text-[11px]">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500" /> Completed</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-500" /> In Process</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /> Not Done</span>
      </div>

      {/* Legacy stage not in the flow (e.g. Not Interested) */}
      {stage && ![...PATH, ...OFFRAMP].includes(stage) && (
        <div className="text-[11px] text-gray-500">Current stage: <span className="font-semibold text-gray-700">{stage}</span></div>
      )}
    </div>
  )
}
