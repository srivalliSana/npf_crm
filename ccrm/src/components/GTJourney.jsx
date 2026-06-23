import React from 'react'
import {
  Phone, Star, MessageSquare, FileText, ClipboardCheck,
  CreditCard, BadgeCheck, Ban, PhoneMissed, ChevronRight
} from 'lucide-react'

// Traffic-light tones: completed = green, current = orange, not-done = red
const TONE = {
  green:   'bg-green-50 border-green-300 text-green-700',
  orange:  'bg-orange-500 border-orange-500 text-white ring-2 ring-orange-300 shadow',
  greenOn: 'bg-green-600 border-green-600 text-white ring-2 ring-green-300 shadow',
  red:     'bg-red-50 border-red-300 text-red-700',
}

const PATH = [
  { s: 'Not Contacted',      icon: Phone },
  { s: 'Contacted',          icon: Phone },
  { s: 'Interested',         icon: Star },
  { s: 'Further Discussion', icon: MessageSquare },
  { s: 'Quote Requested',    icon: FileText },
  { s: 'PO Raised',          icon: ClipboardCheck },
  { s: 'Payment Done',       icon: CreditCard },
]
const OFFRAMP = [
  { s: 'Invalid Number', icon: Ban },
  { s: 'Not Interested', icon: PhoneMissed },
]
const PATH_KEYS = PATH.map(p => p.s)

function tone(s, cur) {
  if (s === cur) return s === 'Payment Done' ? 'greenOn' : 'orange'
  if (OFFRAMP.some(o => o.s === s)) return 'red'
  const cP = PATH_KEYS.indexOf(cur), sP = PATH_KEYS.indexOf(s)
  if (cP === -1) return sP === 0 ? 'green' : 'red'  // current is an off-ramp/unknown
  return sP !== -1 && sP <= cP ? 'green' : 'red'
}

export default function GTJourney({ status, onSelect }) {
  const Node = ({ s, icon: Icon }) => (
    <button type="button" onClick={() => onSelect?.(s)} title={`Set: ${s}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition hover:shadow-sm ${TONE[tone(s, status)] || TONE.red}`}>
      {Icon && <Icon size={13} className="flex-shrink-0" />}
      <span>{s}</span>
      {status === s && <BadgeCheck size={12} className="flex-shrink-0" />}
    </button>
  )
  const Arrow = () => <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Sales funnel</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PATH.map((p, i) => (
            <React.Fragment key={p.s}>
              <Node s={p.s} icon={p.icon} />
              {i < PATH.length - 1 && <Arrow />}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">If it doesn't proceed</p>
        <div className="flex items-center gap-2">
          {OFFRAMP.map(o => <Node key={o.s} s={o.s} icon={o.icon} />)}
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-1 border-t border-gray-100">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500" />Completed</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-500" />Current</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500" />Not done</span>
      </div>
    </div>
  )
}
