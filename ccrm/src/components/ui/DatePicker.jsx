import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`            // local date, no timezone shift

// value is "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" when withTime
const parse = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || '')
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3], hh: m[4] != null ? +m[4] : null, mm: m[5] != null ? +m[5] : null } : null
}
const to12 = (hh) => ({ h: hh % 12 === 0 ? 12 : hh % 12, pm: hh >= 12 })
const to24 = (h, pm) => (h % 12) + (pm ? 12 : 0)

const format = (v, withTime) => {
  const p = parse(v)
  if (!p) return ''
  const base = `${pad(p.d)} ${MONTHS[p.m].slice(0, 3)} ${p.y}`
  if (!withTime || p.hh == null) return base
  const { h, pm } = to12(p.hh)
  return `${base}, ${h}:${pad(p.mm)} ${pm ? 'PM' : 'AM'}`
}

// A calendar that matches the rest of the app. Drop-in for <input type="date"> and
// <input type="datetime-local"> (withTime): onChange receives { target: { name, value } }.
export default function DatePicker({
  value = '', onChange, name, placeholder, className = '', withTime = false,
  required = false, disabled = false, min, max, minYear, maxYear, id, 'aria-label': ariaLabel,
}) {
  const today = new Date()
  const sel = parse(value)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('days')                 // days | months | years
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [view, setView] = useState(() => ({ y: sel?.y ?? today.getFullYear(), m: sel?.m ?? today.getMonth() }))
  const root = useRef(null)
  const pop = useRef(null)
  const yearRef = useRef(null)

  const lo = minYear ?? (min ? parse(min)?.y : undefined) ?? 1940
  const hi = maxYear ?? (max ? parse(max)?.y : undefined) ?? today.getFullYear() + 10
  const years = useMemo(() => { const a = []; for (let y = lo; y <= hi; y++) a.push(y); return a }, [lo, hi])

  // time part (only used when withTime)
  const nowH = sel?.hh ?? today.getHours()
  const nowM = sel?.mm ?? (Math.ceil(today.getMinutes() / 5) * 5) % 60
  const t12 = to12(nowH)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (root.current?.contains(e.target) || pop.current?.contains(e.target)) return; setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { if (mode !== 'days') setMode('days'); else setOpen(false) } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open, mode])

  // bring the selected/current year into view when the year chooser opens
  useEffect(() => { if (mode === 'years') yearRef.current?.scrollIntoView({ block: 'center' }) }, [mode])

  // The calendar floats above the page (so dialogs cannot clip it) and flips above the field when there is no room below.
  const place = () => {
    const r = root.current?.getBoundingClientRect()
    if (!r) return
    const w = 304
    const h = pop.current?.offsetHeight || 430
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8))
    let top = r.bottom + 8
    if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8
    setPos({ top, left })
  }
  useLayoutEffect(() => { if (open) place() }, [open, mode, view.m, view.y])
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])

  const toggle = () => {
    if (disabled) return
    if (!open) {
      const p = parse(value)
      setView({ y: p?.y ?? today.getFullYear(), m: p?.m ?? today.getMonth() })
      setMode('days')
    }
    setOpen(o => !o)
  }

  const emit = (v) => { onChange?.({ target: { name, value: v } }) }
  const compose = (y, m, d, hh, mm) => withTime ? `${dateStr(y, m, d)}T${pad(hh)}:${pad(mm)}` : dateStr(y, m, d)

  const pickDay = (y, m, d) => {
    emit(compose(y, m, d, nowH, nowM))
    if (!withTime) setOpen(false)
    else setView({ y, m })
  }
  const setTime = (h12, mm, pm) => {
    const base = sel || { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() }
    emit(compose(base.y, base.m, base.d, to24(h12, pm), mm))
  }

  const go = (delta) => setView(v => {
    if (mode === 'months') return { ...v, y: Math.min(hi, Math.max(lo, v.y + delta)) }
    if (mode === 'years') return { ...v, y: Math.min(hi, Math.max(lo, v.y + delta * 12)) }
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
  const blocked = (c) => { const v = dateStr(c.y, c.m, c.d); return (min && v < min.slice(0, 10)) || (max && v > max.slice(0, 10)) }

  const label = value ? format(value, withTime) : (placeholder || (withTime ? 'Select date and time' : 'Select date'))
  const hdrBtn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[14px] font-medium text-gray-900 hover:bg-gray-100 transition-colors'

  return (
    <div ref={root} className="relative inline-block max-w-full">
      <button
        type="button" id={id} disabled={disabled} onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel}
        className={`inline-flex items-center justify-between gap-2 text-left bg-white disabled:opacity-50 ${className}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
        <Calendar size={14} className="text-gray-500 flex-shrink-0" />
      </button>
      {/* lets native form validation work for required pickers */}
      {required && <input tabIndex={-1} aria-hidden="true" required value={value || ''} onChange={() => {}} className="absolute inset-0 opacity-0 pointer-events-none" />}

      {open && createPortal(
        <div ref={pop} role="dialog" aria-label="Choose a date" style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-[80] w-[19rem] bg-white rounded-xl border border-gray-200 shadow-dropdown p-3">
          <div className="flex items-center justify-between gap-1 mb-3">
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-700"><ChevronLeft size={16} /></button>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => setMode(mode === 'months' ? 'days' : 'months')} aria-expanded={mode === 'months'} aria-label="Choose month"
                className={`${hdrBtn} ${mode === 'months' ? 'bg-gray-100' : ''}`}>
                {MONTHS[view.m]} {mode === 'months' ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
              </button>
              <button type="button" onClick={() => setMode(mode === 'years' ? 'days' : 'years')} aria-expanded={mode === 'years'} aria-label="Choose year"
                className={`${hdrBtn} tabular-nums ${mode === 'years' ? 'bg-gray-100' : ''}`}>
                {view.y} {mode === 'years' ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
              </button>
            </div>
            <button type="button" onClick={() => go(1)} aria-label="Next" className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-700"><ChevronRight size={16} /></button>
          </div>

          {mode === 'months' && (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {MONTHS.map((m, i) => (
                <button key={m} type="button" onClick={() => { setView(v => ({ ...v, m: i })); setMode('days') }}
                  className={`h-11 rounded-md text-[14px] transition-colors ${view.m === i ? 'bg-primary-500 text-white font-medium' : 'text-gray-900 hover:bg-gray-100'}`}>{m.slice(0, 3)}</button>
              ))}
            </div>
          )}

          {mode === 'years' && (
            <div className="grid grid-cols-4 gap-1.5 py-1 max-h-[17rem] overflow-y-auto pr-0.5">
              {years.map(y => (
                <button key={y} type="button" ref={y === view.y ? yearRef : null} onClick={() => { setView(v => ({ ...v, y })); setMode('days') }}
                  className={`h-10 rounded-md text-[14px] tabular-nums transition-colors ${view.y === y ? 'bg-primary-500 text-white font-medium' : y === today.getFullYear() ? 'border border-primary-600 text-gray-900 hover:bg-gray-100' : 'text-gray-900 hover:bg-gray-100'}`}>{y}</button>
              ))}
            </div>
          )}

          {mode === 'days' && (
            <>
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => <div key={d} className="h-8 flex items-center justify-center text-[12px] font-medium text-gray-500">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((c, i) => {
                  const s = isSel(c)
                  return (
                    <button
                      key={i} type="button" disabled={blocked(c)}
                      onClick={() => pickDay(c.y, c.m, c.d)}
                      aria-label={`${c.d} ${MONTHS[c.m]} ${c.y}`} aria-pressed={!!s}
                      className={`h-9 w-full flex items-center justify-center rounded-md text-[13px] tabular-nums transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                        ${s ? 'bg-primary-500 text-white font-medium' : isToday(c) ? 'border border-primary-600 text-gray-900 font-medium hover:bg-gray-100' : c.other ? 'text-gray-400 hover:bg-gray-100' : 'text-gray-900 hover:bg-gray-100'}`}
                    >{c.d}</button>
                  )
                })}
              </div>
            </>
          )}

          {withTime && mode === 'days' && (
            <div className="mt-3 pt-3 bg-gray-50 -mx-3 px-3 pb-3 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-gray-700">Time</span>
              <div className="flex items-center gap-1.5">
                <input aria-label="Hour" inputMode="numeric" value={t12.h}
                  onChange={e => { const n = Math.min(12, Math.max(1, parseInt(e.target.value.replace(/\D/g, '') || '1', 10))); setTime(n, nowM, t12.pm) }}
                  className="w-11 h-9 text-center text-[14px] tabular-nums rounded-md border border-gray-300 bg-white" />
                <span className="text-gray-500">:</span>
                <input aria-label="Minute" inputMode="numeric" value={pad(nowM)}
                  onChange={e => { const n = Math.min(59, Math.max(0, parseInt(e.target.value.replace(/\D/g, '') || '0', 10))); setTime(t12.h, n, t12.pm) }}
                  className="w-11 h-9 text-center text-[14px] tabular-nums rounded-md border border-gray-300 bg-white" />
                <div className="inline-flex rounded-md bg-gray-200 p-0.5 ml-1">
                  {[['AM', false], ['PM', true]].map(([l, pm]) => (
                    <button key={l} type="button" aria-pressed={t12.pm === pm} onClick={() => setTime(t12.h, nowM, pm)}
                      className={`px-2.5 h-8 rounded text-[13px] font-medium ${t12.pm === pm ? 'bg-white text-gray-900' : 'text-gray-600'}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <button type="button" onClick={() => { emit(''); setOpen(false) }} className="px-2 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-100">Clear</button>
            {withTime ? (
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-1.5 text-[13px] font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-md">Done</button>
            ) : (
              <button type="button" onClick={() => pickDay(today.getFullYear(), today.getMonth(), today.getDate())} className="px-2 py-1.5 text-[13px] font-medium text-gray-900 rounded-md hover:bg-gray-100">Today</button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
