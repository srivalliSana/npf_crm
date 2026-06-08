import React from 'react'
import {
  Users, User, Phone, Ban, PhoneMissed, MessageSquare, Star,
  CalendarDays, MapPin, CreditCard, BadgeCheck,
  CalendarClock, Bell, ChevronRight, CornerDownRight
} from 'lucide-react'

// Progress-state palette: completed = green, in-process (current) = orange, not done = red
const TONE = {
  green:  { box: 'bg-green-50 border-green-300 text-green-700',    on: 'bg-green-600 border-green-600 text-white ring-green-300' },
  orange: { box: 'bg-orange-50 border-orange-300 text-orange-700', on: 'bg-orange-500 border-orange-500 text-white ring-orange-300' },
  red:    { box: 'bg-red-50 border-red-300 text-red-700',          on: 'bg-red-600 border-red-600 text-white ring-red-300' },
}

const PATH = ['Untouched', 'Contacted', 'Interested', 'Campus Visit Scheduled', 'Campus Visit Completed', 'Process for Payment', 'Payment Success']
const OFFRAMP = ['Invalid Number', 'No Response', 'Further Talk']

function stageState(s, cur) {
  if (s === cur) return 'orange'
  if (OFFRAMP.includes(s)) return 'red'
  const cP = PATH.indexOf(cur), sP = PATH.indexOf(s)
  if (cP === -1) return sP <= 1 ? 'green' : 'red'
  return sP !== -1 && sP < cP ? 'green' : 'red'
}

export default function LeadJourney({ stage, onSelect }) {
  // block = full-width (branch columns); otherwise inline (trunk / chains)
  const Node = ({ s, label, icon: Icon, dashed = false, block = false }) => {
    const active = stage === s
    const t = TONE[stageState(s, stage)] || TONE.red
    return (
      <button
        type="button"
        onClick={() => onSelect?.(s)}
        title={`Set stage: ${s}`}
        className={`${block ? 'w-full justify-start' : 'inline-flex'} flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition hover:shadow-sm
          ${dashed ? 'border-dashed ' : ''}${active ? t.on + ' ring-2 ring-offset-1 shadow' : t.box}`}
      >
        {Icon && <Icon size={13} className="flex-shrink-0" />}
        <span>{label}</span>
        {active && <BadgeCheck size={12} className="ml-auto flex-shrink-0" />}
      </button>
    )
  }
  const Arrow = () => <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
  const Sub = ({ s, label, icon: Icon }) => (
    <div className="flex items-center gap-1 pl-3">
      <CornerDownRight size={12} className="text-gray-300 flex-shrink-0" />
      <Node s={s} label={label} icon={Icon} dashed block />
    </div>
  )

  return (
    <div className="space-y-4 text-xs">
      {/* 1 · Trunk */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 text-white text-[11px] font-bold">
          <Users size={13} /> All Leads
        </span>
        <Arrow />
        <Node s="Untouched" label="Untouched" icon={User} />
        <Arrow />
        <Node s="Contacted" label="Contacted" icon={Phone} />
      </div>

      {/* 2 · Outcomes after Contacted — one column per outcome */}
      <div>
        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide mb-2">After Contacted, pick one outcome</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Node s="Invalid Number" label="Invalid Number" icon={Ban} block />
          </div>
          <div className="space-y-1">
            <Node s="No Response" label="No Response" icon={PhoneMissed} block />
            <Sub s="No Response" label="Schedule again" icon={CalendarClock} />
          </div>
          <div className="space-y-1">
            <Node s="Further Talk" label="Further Talk" icon={MessageSquare} block />
            <Sub s="Further Talk" label="Reminder" icon={Bell} />
          </div>
          <div className="space-y-1">
            <Node s="Interested" label="Interested" icon={Star} block />
          </div>
        </div>
      </div>

      {/* 3 · If Interested → choose a path (each a left-to-right chain) */}
      <div>
        <div className="text-[10px] uppercase font-bold text-green-600 tracking-wide mb-2">If Interested → continue on one path</div>
        <div className="space-y-2">
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
            <div className="text-[10px] font-bold text-gray-500 mb-1.5">Path 1 · Campus Visit</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Node s="Campus Visit Scheduled" label="Visit Scheduled" icon={CalendarDays} />
              <Arrow />
              <Node s="Campus Visit Completed" label="Visit Completed" icon={MapPin} />
              <Arrow />
              <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} />
              <Arrow />
              <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} />
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-2">
            <div className="text-[10px] font-bold text-gray-500 mb-1.5">Path 2 · Direct Payment</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} />
              <Arrow />
              <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} />
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t border-gray-100 text-[11px]">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500" /> Completed</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-500" /> In Process</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /> Not Done</span>
      </div>

      {stage && ![...PATH, ...OFFRAMP].includes(stage) && (
        <div className="text-[11px] text-gray-500">Current stage: <span className="font-semibold text-gray-700">{stage}</span></div>
      )}
    </div>
  )
}
