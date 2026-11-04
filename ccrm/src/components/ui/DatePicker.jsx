import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (n) => String(n).padStart(2, '0')
const toValue = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`            // local date, no timezone shift
const parse = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '')
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null
}
const format = (v) => {
  const p = parse(v)
  return p ? `${pad(p.d)} ${MONTHS[p.m].slice(0, 3)} ${p.y}` : ''
}

// A calendar that matches the rest of the app. Drop-in for <input type="date">:
// value is "YYYY-MM-DD" and onChange receives { target: { name, value } }.
export default function DatePicker({
  value = '', onChange, name, placeholder = 'Select date', className = '',
  required = false, disabled = false, min, max, minYear, maxYear, id, 'aria-label': ariaLabel,
}) {
  const today = new Date()
  const sel = parse(value)
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const [view, setView] = useState(() => ({ y: sel?.y ?? today.getFullYear(), m: sel?.m ?? today.getMonth() }))
  const root = useRef(null)

  const lo = minYear ?? (min ? parse(min)?.y : undefined) ?? 1940
  const hi = maxYear ?? (max ? parse(max)?.y : undefined) ?? today.getFullYear() + 10
  const years = useMemo(() => { const a = []; for (let y = hi; y >= lo; y--) a.push(y); return a }, [lo, hi])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (!open) {
      const p = parse(value)
      setView({ y: p?.y ?? today.getFullYear(), m: p?.m ?? today.getMonth() })
      const r = root.current?.getBoundingClientRect()
      setAlignRight(!!r && r.left + 296 > window.innerWidth - 8)
    }
    setOpen(o => !o)
  }

  const emit = (v) => { onChange?.({ target: { name, value: v } }) }
  const pick = (y, m, d) => { emit(toValue(y, m, d)); setOpen(false) }
  const go = (delta) => setView(v => {
    const n = v.m + delta
    return { y: v.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }
  })

  // 6 weeks, Sunday first
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay()
    const start = new Date(view.y, view.m, 1 - first)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), other: d.getMonth() !== view.m }
    })
  }, [view])

  const isSel = (c) => sel && sel.y === c.y && sel.m === c.m && sel.d === c.d
  const isToday = (c) => today.getFullYear() === c.y && today.getMonth() === c.m && today.getDate() === c.d
  const blocked = (c) => { const v = toValue(c.y, c.m, c.d); return (min && v < min) || (max && v > max) }

  return (
    <div ref={root} className="relative inline-block max-w-full">
      <button
        type="button" id={id} disabled={disabled} onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel}
        className={`inline-flex items-center justify-between gap-2 text-left bg-white disabled:opacity-50 ${className}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value ? format(value) : placeholder}</span>
        <Calendar size={14} className="text-gray-500 flex-shrink-0" />
      </button>
      {/* lets native form validation work for required pickers */}
      {required && <input tabIndex={-1} aria-hidden="true" required value={value || ''} onChange={() => {}} className="absolute inset-0 opacity-0 pointer-events-none" />}

      {open && (
        <div role="dialog" aria-label="Choose a date"
          className={`absolute z-50 mt-2 w-[18.5rem] bg-white rounded-xl border border-gray-200 shadow-dropdown p-3 ${alignRight ? 'right-0' : 'left-0'}`}>
          <div className="flex items-center gap-1.5 mb-3">
            <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-700"><ChevronLeft size={16} /></button>
            <select aria-label="Month" value={view.m} onChange={e => setView(v => ({ ...v, m: +e.target.value }))}
              className="flex-1 min-w-0 text-[14px] font-medium text-gray-900 bg-transparent hover:bg-gray-100 rounded-md py-1.5 px-1 cursor-pointer">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select aria-label="Year" value={view.y} onChange={e => setView(v => ({ ...v, y: +e.target.value }))}
              className="text-[14px] font-medium text-gray-900 bg-transparent hover:bg-gray-100 rounded-md py-1.5 px-1 cursor-pointer tabular-nums">
              {!years.includes(view.y) && <option value={view.y}>{view.y}</option>}
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" onClick={() => go(1)} aria-label="Next month" className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-700"><ChevronRight size={16} /></button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => <div key={d} className="h-8 flex items-center justify-center text-[12px] font-medium text-gray-500">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((c, i) => {
              const s = isSel(c)
              return (
                <button
                  key={i} type="button" disabled={blocked(c)}
                  onClick={() => pick(c.y, c.m, c.d)}
                  aria-label={`${c.d} ${MONTHS[c.m]} ${c.y}`} aria-pressed={!!s}
                  className={`h-9 w-full flex items-center justify-center rounded-md text-[13px] tabular-nums transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                    ${s ? 'bg-primary-500 text-white font-medium' : isToday(c) ? 'border border-gray-900 text-gray-900 font-medium hover:bg-gray-100' : c.other ? 'text-gray-400 hover:bg-gray-100' : 'text-gray-900 hover:bg-gray-100'}`}
                >{c.d}</button>
              )
            })}
          </div>

          <div className="flex items-center justify-between mt-3 pt-2">
            <button type="button" onClick={() => { emit(''); setOpen(false) }} className="px-2 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100">Clear</button>
            <button type="button" onClick={() => pick(today.getFullYear(), today.getMonth(), today.getDate())} className="px-2 py-1.5 text-[13px] font-medium text-gray-900 rounded-md hover:bg-gray-100">Today</button>
          </div>
        </div>
      )}
    </div>
  )
}
