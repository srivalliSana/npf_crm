import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Phone, Mail, MapPin, Loader2 } from 'lucide-react'
import { stageLabel } from '../stageLabel'
import { avatarTone } from '../lib/avatar'

const PAGE = 20

// Stages that can exist in older data but are not in a tenant's configured pipeline.
// They only get a column when they actually hold leads.
const LEGACY = ['Qualified Leads', 'Unqualified Leads']
const ALWAYS = ['Not Interested']

// Colour only where it carries meaning: how warm the lead is, and which stage a column is.
const temperature = (score = 0) =>
  score >= 75 ? { label: 'Hot', cls: 'bg-red-50 text-red-700' }
  : score >= 50 ? { label: 'Warm', cls: 'bg-amber-50 text-amber-700' }
  : score >= 25 ? { label: 'Nurture', cls: 'bg-sky-50 text-sky-700' }
  : { label: 'Cold', cls: 'bg-gray-100 text-gray-600' }

const STAGE_DOT = {
  'Untouched': 'bg-red-500', 'Contacted': 'bg-blue-500', 'Invalid Number': 'bg-gray-400', 'No Response': 'bg-gray-400',
  'Follow Up': 'bg-purple-500', 'Interested': 'bg-green-500', 'Campus Visit Scheduled': 'bg-cyan-500', 'Campus Visit Completed': 'bg-cyan-600',
  'Process for Payment': 'bg-orange-500', 'Payment Success': 'bg-emerald-600', 'Not Interested': 'bg-red-300',
  'Qualified Leads': 'bg-orange-400', 'Unqualified Leads': 'bg-orange-300',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (reg) => {
  const d = String(reg || '').split(',')[0].split('/')   // "DD/MM/YYYY, HH:MM"
  if (d.length !== 3) return ''
  const m = MONTHS[Number(d[1]) - 1]
  return m ? `${Number(d[0])} ${m}` : ''
}

const initials = (name = '') => name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

// Pipeline board: one column per stage, one card per lead.
//   stages     configured pipeline stages, in order
//   query      the active filters (search, owner, state, domain...), minus stage/page/limit
//   fetchPage  the same server-side page fetch the list view uses
//   onOpen     open a lead
//   onMove     (lead, toStage) -> moves it; the parent decides which moves need extra steps
//   nonce      bump to reload every column after a change
export default function LeadBoard({ stages, query, fetchPage, onOpen, onMove, nonce = 0 }) {
  const columnsList = useMemo(() => {
    const base = [...stages]
    ALWAYS.forEach(s => { if (!base.includes(s)) base.push(s) })
    LEGACY.forEach(s => { if (!base.includes(s)) base.push(s) })
    return base
  }, [stages])

  const [cols, setCols] = useState({})          // stage -> { rows, total, page, loading }
  const [dragOver, setDragOver] = useState(null)
  const [error, setError] = useState('')
  const queryKey = JSON.stringify(query)
  const seq = useRef(0)

  const loadAll = async () => {
    const mine = ++seq.current
    setError('')
    setCols(prev => {
      const next = {}
      columnsList.forEach(s => { next[s] = { rows: prev[s]?.rows || [], total: prev[s]?.total || 0, page: 1, loading: true } })
      return next
    })
    try {
      const results = await Promise.all(columnsList.map(s => fetchPage({ ...query, stage: s, page: 1, limit: PAGE })))
      if (mine !== seq.current) return
      const next = {}
      columnsList.forEach((s, i) => { next[s] = { rows: results[i].rows || [], total: results[i].total || 0, page: 1, loading: false } })
      setCols(next)
    } catch (e) {
      if (mine !== seq.current) return
      setError(e.message || 'Could not load the board.')
      setCols(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, loading: false }])))
    }
  }

  useEffect(() => { loadAll() }, [queryKey, nonce, columnsList.join('|')])

  const loadMore = async (stage) => {
    const cur = cols[stage]
    if (!cur || cur.loading) return
    setCols(p => ({ ...p, [stage]: { ...cur, loading: true } }))
    try {
      const r = await fetchPage({ ...query, stage, page: cur.page + 1, limit: PAGE })
      setCols(p => ({ ...p, [stage]: { rows: [...cur.rows, ...(r.rows || [])], total: r.total ?? cur.total, page: cur.page + 1, loading: false } }))
    } catch {
      setCols(p => ({ ...p, [stage]: { ...cur, loading: false } }))
    }
  }

  const visible = columnsList.filter(s => !LEGACY.includes(s) || stages.includes(s) || (cols[s]?.total || 0) > 0)

  const onDrop = (e, stage) => {
    e.preventDefault()
    setDragOver(null)
    try {
      const { id, from } = JSON.parse(e.dataTransfer.getData('application/json') || '{}')
      if (!id || from === stage) return
      const lead = cols[from]?.rows.find(r => String(r.id) === String(id))
      if (lead) onMove(lead, stage)
    } catch { /* ignore malformed drops */ }
  }

  return (
    <div className="relative flex flex-col md:flex-1 md:min-h-0">
      {error && <div className="mb-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-md px-4 py-2">{error}</div>}
      <div className="relative flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory md:snap-none md:flex-1 md:min-h-0 md:overflow-y-hidden" aria-label="Lead pipeline">
        {visible.map(stage => {
          const c = cols[stage] || { rows: [], total: 0, loading: true }
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
                  {stageLabel(stage)}
                </h3>
                <span className="min-w-[1.75rem] text-center px-2 py-0.5 rounded-full bg-white text-[12px] font-medium text-gray-700 tabular-nums">{c.total.toLocaleString()}</span>
              </header>

              <div className="space-y-2.5 overflow-y-auto pr-0.5 flex-1">
                {c.rows.map(lead => (
                  <article
                    key={lead.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ id: lead.id, from: stage })); e.dataTransfer.effectAllowed = 'move' }}
                    className="group bg-white rounded-lg border border-gray-200 hover:border-gray-400 transition-colors cursor-grab active:cursor-grabbing overflow-hidden"
                  >
                    <div className="p-3.5">
                      <div className="flex items-start gap-3">
                        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-medium flex-shrink-0 ${avatarTone(lead.name)}`} aria-hidden="true">{initials(lead.name) || '?'}</span>
                        <div className="min-w-0 flex-1">
                          <button onClick={() => onOpen(lead)} className="block max-w-full text-left text-[15px] font-medium text-gray-900 group-hover:underline leading-snug break-words">{lead.name}</button>
                          <div className="mt-1 flex items-center gap-2 min-w-0">
                            {(() => {
                              const t = temperature(lead.score || 0)
                              return <span title={`Lead score ${lead.score || 0}`} className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums ${t.cls}`}>{t.label} · {lead.score || 0}</span>
                            })()}
                            <span className="text-[12px] text-gray-500 truncate">{lead.source || 'Unknown source'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5 text-[13px] text-gray-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 tabular-nums"><Phone size={13} className="text-gray-400" />{lead.mobile}</span>
                          <span className="flex items-center gap-1">
                            <a href={`tel:${lead.mobile}`} aria-label={`Call ${lead.name}`} title="Call"
                              className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-100 hover:bg-primary-600 hover:text-white text-gray-600 transition-colors"><Phone size={13} /></a>
                            <a href={`https://wa.me/91${lead.mobile}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${lead.name}`} title="WhatsApp"
                              className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-100 hover:bg-primary-600 hover:text-white text-gray-600 transition-colors"><MessageCircle size={13} /></a>
                          </span>
                        </div>
                        {lead.email && !String(lead.email).includes('noemail') && (
                          <div className="flex items-center gap-2 min-w-0"><Mail size={13} className="text-gray-400 flex-shrink-0" /><span className="truncate">{lead.email}</span></div>
                        )}
                        {lead.state && (
                          <div className="flex items-center gap-2"><MapPin size={13} className="text-gray-400 flex-shrink-0" />{lead.state}{lead.city ? `, ${lead.city}` : ''}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-gray-50 px-3.5 py-2.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${lead.owner ? 'bg-gray-200 text-gray-700' : 'border border-dashed border-gray-300 text-gray-400'}`}>{initials(lead.owner) || '–'}</span>
                        <span className="min-w-0">
                          <span className={`block text-[12px] truncate leading-tight ${lead.owner ? 'text-gray-800' : 'text-gray-400'}`}>{lead.owner || 'Unassigned'}</span>
                          {shortDate(lead.regDate) && <span className="block text-[11px] text-gray-500 leading-tight">Added {shortDate(lead.regDate)}</span>}
                        </span>
                      </span>
                      {/* Move: the touch- and keyboard-friendly alternative to dragging */}
                      <label className="sr-only" htmlFor={`mv-${lead.id}`}>Move {lead.name} to another stage</label>
                      <select
                        id={`mv-${lead.id}`}
                        value={stage}
                        onChange={e => { if (e.target.value !== stage) onMove(lead, e.target.value) }}
                        className="text-[12px] border border-gray-300 rounded-md bg-white py-1 pl-1.5 pr-1 max-w-[8rem] text-gray-700"
                      >
                        {visible.map(s => <option key={s} value={s}>{stageLabel(s)}</option>)}
                      </select>
                    </div>
                  </article>
                ))}

                {c.loading && c.rows.length === 0 && (
                  <div className="py-8 flex justify-center text-gray-400"><Loader2 size={18} className="animate-spin" /></div>
                )}
                {!c.loading && c.rows.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-gray-500">No leads in this stage.</p>
                )}
                {c.rows.length < c.total && (
                  <button onClick={() => loadMore(stage)} disabled={c.loading}
                    className="w-full py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-200 rounded-md disabled:opacity-60">
                    {c.loading ? 'Loading…' : `Show more (${(c.total - c.rows.length).toLocaleString()} left)`}
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
