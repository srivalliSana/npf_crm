import React from 'react'
import {
  Users, User, Phone, Ban, PhoneMissed, MessageSquare, Star,
  CalendarDays, MapPin, CreditCard, BadgeCheck, GraduationCap,
  CalendarClock, Bell, ChevronRight
} from 'lucide-react'

// Tone palette (inactive box / active fill)
const TONE = {
  slate:  { box: 'bg-slate-50 border-slate-300 text-slate-700',    on: 'bg-slate-700 border-slate-700 text-white ring-slate-300' },
  blue:   { box: 'bg-blue-50 border-blue-300 text-blue-700',       on: 'bg-blue-600 border-blue-600 text-white ring-blue-300' },
  red:    { box: 'bg-red-50 border-red-300 text-red-700',          on: 'bg-red-600 border-red-600 text-white ring-red-300' },
  amber:  { box: 'bg-amber-50 border-amber-300 text-amber-700',    on: 'bg-amber-500 border-amber-500 text-white ring-amber-300' },
  purple: { box: 'bg-purple-50 border-purple-300 text-purple-700', on: 'bg-purple-600 border-purple-600 text-white ring-purple-300' },
  green:  { box: 'bg-green-50 border-green-300 text-green-700',     on: 'bg-green-600 border-green-600 text-white ring-green-300' },
}

// Compact lead-journey flow (mirrors the admission flowchart).
// Props: stage (current), onSelect(stage)
export default function LeadJourney({ stage, onSelect }) {
  const Node = ({ s, label, icon: Icon, tone = 'green', dashed = false }) => {
    const active = stage === s
    const t = TONE[tone] || TONE.green
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
        <Node s="Untouched" label="Untouched" icon={User} tone="blue" />
        <Arrow />
        <Node s="Contacted" label="Contacted" icon={Phone} tone="blue" />
      </div>

      {/* Branches after Contacted */}
      <div className="pl-3 border-l-2 border-gray-100 space-y-2">
        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">After Contacted</div>
        <div className="flex flex-wrap items-center gap-2">
          <Node s="Invalid Number" label="Invalid Number" icon={Ban} tone="red" />
          <span className="inline-flex items-center gap-1"><Node s="No Response" label="No Response" icon={PhoneMissed} tone="amber" /><Node s="No Response" label="Schedule again" icon={CalendarClock} tone="amber" dashed /></span>
          <span className="inline-flex items-center gap-1"><Node s="Further Talk" label="Further Talk" icon={MessageSquare} tone="purple" /><Node s="Further Talk" label="Reminder" icon={Bell} tone="purple" dashed /></span>
          <Node s="Interested" label="Interested" icon={Star} tone="green" />
        </div>
      </div>

      {/* Interested → two paths (horizontal chains) */}
      <div className="pl-3 border-l-2 border-green-100 space-y-2">
        <div className="text-[10px] uppercase font-bold text-green-600 tracking-wide">If Interested</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 w-24">Path 1 · Campus Visit</span>
          <Node s="Campus Visit Scheduled" label="Visit Scheduled" icon={CalendarDays} tone="green" />
          <Arrow />
          <Node s="Campus Visit Completed" label="Visit Completed" icon={MapPin} tone="green" />
          <Arrow />
          <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} tone="green" />
          <Arrow />
          <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} tone="green" />
          <Arrow />
          <Node s="Admission Confirmed" label="Admission Confirmed" icon={GraduationCap} tone="green" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 w-24">Path 2 · Direct Pay</span>
          <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} tone="green" />
          <Arrow />
          <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} tone="green" />
          <Arrow />
          <Node s="Admission Confirmed" label="Admission Confirmed" icon={GraduationCap} tone="green" />
        </div>
      </div>

      {/* Legacy stage not in the flow (e.g. Not Interested) */}
      {stage && ![
        'Untouched','Contacted','Invalid Number','No Response','Further Talk','Interested',
        'Campus Visit Scheduled','Campus Visit Completed','Process for Payment','Payment Success','Admission Confirmed'
      ].includes(stage) && (
        <div className="text-[11px] text-gray-500">Current stage: <span className="font-semibold text-gray-700">{stage}</span></div>
      )}
    </div>
  )
}
