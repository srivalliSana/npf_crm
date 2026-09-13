import React from 'react'
import {
  Users, User, Phone, Ban, PhoneMissed, MessageSquare, Star,
  CalendarDays, MapPin, CreditCard, BadgeCheck, CalendarClock, Bell
} from 'lucide-react'
import { Badge } from './ui'

const PATH = ['Untouched', 'Contacted', 'Interested', 'Campus Visit Scheduled', 'Campus Visit Completed', 'Process for Payment', 'Payment Success']
const OFFRAMP = ['Invalid Number', 'No Response', 'Follow Up']

// done / current / pending / off — off-ramp only applies when it's actually
// the live stage (a stage the lead is genuinely sitting in right now); an
// off-ramp that ISN'T current is just an unused alternate outcome, not a
// failure, so it reads the same as any other not-yet-reached step.
function nodeState(s, cur) {
  if (s === cur) return OFFRAMP.includes(s) ? 'off' : 'current'
  const cP = PATH.indexOf(cur), sP = PATH.indexOf(s)
  if (sP !== -1 && cP !== -1 && sP < cP) return 'done'
  return 'pending'
}

const STATE_CLASS = {
  done:    'bg-success-50 border-success-200 text-success-700',
  current: 'bg-primary-500 border-primary-500 text-white ring-4 ring-primary-100 shadow-sm',
  off:     'bg-danger-500 border-danger-500 text-white ring-4 ring-danger-100 shadow-sm',
  pending: 'bg-gray-50 border-gray-200 text-gray-500',
}

// Redesigned to Campus One Neo's card/pill/token language. Interactive nodes
// are only ever bound to a real, distinct stage value — the old version's
// "Schedule again" / "Reminder" sub-notes shared their parent's stage value,
// which meant both nodes lit up together whenever that stage was current;
// they're static hint text here instead, since they were never real stages.
export default function LeadJourney({ stage, onSelect }) {
  const Node = ({ s, label, icon: Icon }) => (
    <button
      type="button"
      onClick={() => onSelect?.(s)}
      title={`Set stage: ${s}`}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-semibold whitespace-nowrap transition hover:shadow-sm ${STATE_CLASS[nodeState(s, stage)]}`}
    >
      {Icon && <Icon size={13} className="flex-shrink-0" />}
      {label}
    </button>
  )
  const Hint = ({ label, icon: Icon }) => (
    <span className="inline-flex items-center gap-1 pl-4 text-[11px] text-gray-400">
      <Icon size={11} className="flex-shrink-0" /> {label}
    </span>
  )
  const Arrow = () => <div className="w-4 h-px bg-gray-200 flex-shrink-0" />

  return (
    <div className="space-y-5">
      {/* Trunk */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 text-white text-[12px] font-bold">
          <Users size={13} /> All Leads
        </span>
        <Arrow />
        <Node s="Untouched" label="Untouched" icon={User} />
        <Arrow />
        <Node s="Contacted" label="Contacted" icon={Phone} />
      </div>

      {/* Outcomes after Contacted */}
      <div>
        <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">After Contacted, pick one outcome</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Node s="Invalid Number" label="Invalid Number" icon={Ban} />
          <div className="space-y-1.5">
            <Node s="No Response" label="No Response" icon={PhoneMissed} />
            <Hint label="Schedule again" icon={CalendarClock} />
          </div>
          <div className="space-y-1.5">
            <Node s="Follow Up" label="Further Talk / Follow Up" icon={MessageSquare} />
            <Hint label="Reminder set" icon={Bell} />
          </div>
          <Node s="Interested" label="Interested" icon={Star} />
        </div>
      </div>

      {/* If Interested → one path */}
      <div>
        <div className="text-[10.5px] font-bold text-success-600 uppercase tracking-wide mb-2.5">If Interested → continue on one path</div>
        <div className="space-y-2.5">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
            <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide mb-2">Path 1 · Campus Visit</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Node s="Campus Visit Scheduled" label="Visit Scheduled" icon={CalendarDays} />
              <Arrow />
              <Node s="Campus Visit Completed" label="Visit Completed" icon={MapPin} />
              <Arrow />
              <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} />
              <Arrow />
              <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} />
            </div>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
            <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide mb-2">Path 2 · Direct Payment</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Node s="Process for Payment" label="Process for Payment" icon={CreditCard} />
              <Arrow />
              <Node s="Payment Success" label="Payment Success" icon={BadgeCheck} />
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
        <Badge variant="success" dot>Completed</Badge>
        <Badge variant="primary" dot>In Process</Badge>
        <Badge variant="danger" dot>Not Done</Badge>
      </div>

      {stage && ![...PATH, ...OFFRAMP].includes(stage) && (
        <div className="text-[11px] text-gray-500">Current stage: <span className="font-semibold text-gray-700">{stage}</span></div>
      )}
    </div>
  )
}
