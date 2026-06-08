import React from 'react'
import {
  Users, User, PhoneCall, PhoneOff, MessageSquare, Star,
  Building2, MapPin, CreditCard, BadgeCheck, GraduationCap,
  CalendarClock, Bell, XCircle
} from 'lucide-react'

// Lead journey flow — mirrors the admission flowchart.
// Props: stage (current lead stage), onSelect(stage) → change stage.
// Tone palette (inactive / active)
const TONE = {
  slate:  { box: 'bg-slate-50 border-slate-300 text-slate-700',   on: 'bg-slate-700 border-slate-700 text-white' },
  blue:   { box: 'bg-blue-50 border-blue-300 text-blue-700',      on: 'bg-blue-600 border-blue-600 text-white' },
  red:    { box: 'bg-red-50 border-red-300 text-red-700',         on: 'bg-red-600 border-red-600 text-white' },
  amber:  { box: 'bg-amber-50 border-amber-300 text-amber-700',   on: 'bg-amber-500 border-amber-500 text-white' },
  purple: { box: 'bg-purple-50 border-purple-300 text-purple-700',on: 'bg-purple-600 border-purple-600 text-white' },
  green:  { box: 'bg-green-50 border-green-300 text-green-700',    on: 'bg-green-600 border-green-600 text-white' },
}

export default function LeadJourney({ stage, onSelect }) {
  const Node = ({ s, label, icon: Icon, tone = 'green', sub, clickable = true }) => {
    const active = stage === s
    const t = TONE[tone] || TONE.green
    return (
      <button
        type="button"
        disabled={!clickable}
        onClick={() => clickable && onSelect?.(s)}
        title={clickable ? `Set stage: ${s}` : undefined}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition
          ${active ? t.on + ' ring-2 ring-offset-1 shadow' : t.box + (clickable ? ' hover:shadow-sm hover:-translate-y-px' : ' cursor-default')}`}
      >
        {Icon && <Icon size={15} className="flex-shrink-0" />}
        <span className="text-left leading-tight">{label}</span>
        {active && <BadgeCheck size={14} className="ml-auto flex-shrink-0" />}
      </button>
    )
  }
  const Down = () => <div className="w-px h-3 bg-gray-300 mx-auto" />

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
      <div className="min-w-[760px]">
        {/* Trunk: All Leads → Untouched → Contacted */}
        <div className="max-w-xs mx-auto space-y-0">
          <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 text-white text-xs font-bold">
            <Users size={15} /> ALL LEADS
          </div>
          <Down />
          <Node s="Untouched" label="UNTOUCHED" icon={User} tone="blue" />
          <Down />
          <Node s="Contacted" label="CONTACTED" icon={PhoneCall} tone="blue" />
        </div>

        <Down />

        {/* Branches from Contacted */}
        <div className="grid grid-cols-4 gap-3 items-start">
          {/* Invalid Number */}
          <div>
            <Node s="Invalid Number" label="INVALID NUMBER" icon={XCircle} tone="red" />
          </div>

          {/* No Response → Schedule Contact Again */}
          <div className="space-y-0">
            <Node s="No Response" label="NO RESPONSE" icon={PhoneOff} tone="amber" />
            <Down />
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 text-amber-700 text-[11px] font-medium">
              <CalendarClock size={14} /> Schedule contact again
            </div>
          </div>

          {/* Further Talk → Reminder */}
          <div className="space-y-0">
            <Node s="Further Talk" label="FURTHER TALK" icon={MessageSquare} tone="purple" />
            <Down />
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-purple-300 bg-purple-50/60 text-purple-700 text-[11px] font-medium">
              <Bell size={14} /> Reminder
            </div>
          </div>

          {/* Interested → two paths */}
          <div className="space-y-0">
            <Node s="Interested" label="INTERESTED" icon={Star} tone="green" />
            <Down />
            <div className="grid grid-cols-2 gap-2">
              {/* Path 1 — Campus Visit */}
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-gray-500 text-center uppercase">Path 1 · Campus Visit</div>
                <Node s="Campus Visit Scheduled" label="Campus Visit Scheduled" icon={Building2} tone="green" />
                <Down />
                <Node s="Campus Visit Completed" label="Campus Visit Completed" icon={MapPin} tone="green" />
                <Down />
                <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} tone="green" />
                <Down />
                <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} tone="green" />
                <Down />
                <Node s="Admission Confirmed" label="Admission Confirmed" icon={GraduationCap} tone="green" />
              </div>
              {/* Path 2 — Direct Payment */}
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-gray-500 text-center uppercase">Path 2 · Direct Pay</div>
                <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} tone="green" />
                <Down />
                <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} tone="green" />
                <Down />
                <Node s="Admission Confirmed" label="Admission Confirmed" icon={GraduationCap} tone="green" />
              </div>
            </div>
          </div>
        </div>

        {/* Current stage that sits outside the flow (e.g. legacy 'Not Interested') */}
        {stage && ![
          'Untouched','Contacted','Invalid Number','No Response','Further Talk','Interested',
          'Campus Visit Scheduled','Campus Visit Completed','Process for Payment','Payment Success','Admission Confirmed'
        ].includes(stage) && (
          <div className="mt-3 text-center text-xs text-gray-500">
            Current stage: <span className="font-semibold text-gray-700">{stage}</span> (outside the standard flow)
          </div>
        )}
      </div>
    </div>
  )
}
