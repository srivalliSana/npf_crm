import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Phone, Loader2 } from 'lucide-react'
import { stageLabel } from '../stageLabel'

const PAGE = 20

// Stages that can exist in older data but are not in a tenant's configured pipeline.
// They only get a column when they actually hold leads.
const LEGACY = ['Qualified Leads', 'Unqualified Leads']
const ALWAYS = ['Not Interested']

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
    <div>
      {error && <div className="mb-3 text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-md px-4 py-2">{error}</div>}
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none" aria-label="Lead pipeline">
        {visible.map(stage => {
          const c = cols[stage] || { rows: [], total: 0, loading: true }
          const isOver = dragOver === stage
          return (
            <section
              key={stage}
              onDragOver={e => { e.preventDefault(); if (dragOver !== stage) setDragOver(stage) }}
              onDragLeave={() => setDragOver(d => (d === stage ? null : d))}
              onDrop={e => onDrop(e, stage)}
              className={`snap-start flex-shrink-0 w-[84vw] sm:w-72 rounded-lg p-2.5 flex flex-col max-h-[calc(100vh-15rem)] min-h-[12rem] ${isOver ? 'bg-gray-300/80' : 'bg-gray-200/70'}`}
            >
              <header className="flex items-baseline justify-between px-1.5 pb-2.5 pt-1">
                <h3 className="text-[14px] font-medium text-gray-900">{stageLabel(stage)}</h3>
                <span className="text-[13px] text-gray-600 tabular-nums">{c.total.toLocaleString()}</span>
              </header>

              <div className="space-y-2 overflow-y-auto pr-0.5 flex-1">
                {c.rows.map(lead => (
                  <article
                    key={lead.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ id: lead.id, from: stage })); e.dataTransfer.effectAllowed = 'move' }}
                    className="bg-white rounded-md border border-gray-200 p-3 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => onOpen(lead)} className="text-left text-[14px] font-medium text-gray-900 hover:underline leading-snug break-words">{lead.name}</button>
                      <span className="text-[13px] text-gray-700 tabular-nums flex-shrink-0" title="Lead score">{lead.score || 0}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-gray-500 truncate">{[lead.source, lead.state].filter(Boolean).join(' · ') || ' '}</div>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="text-[13px] text-gray-700 tabular-nums">{lead.mobile}</span>
                      <span className="flex items-center gap-1">
                        <a href={`tel:${lead.mobile}`} aria-label={`Call ${lead.name}`} title="Call"
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600"><Phone size={13} /></a>
                        <a href={`https://wa.me/91${lead.mobile}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${lead.name}`} title="WhatsApp"
                          className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600"><MessageCircle size={13} /></a>
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${lead.owner ? 'bg-gray-200 text-gray-700' : 'border border-dashed border-gray-300 text-gray-400'}`}>{initials(lead.owner) || '–'}</span>
                        <span className={`text-[12px] truncate ${lead.owner ? 'text-gray-700' : 'text-gray-400'}`}>{lead.owner || 'Unassigned'}</span>
                      </span>
                      {/* Move: the touch- and keyboard-friendly alternative to dragging */}
                      <label className="sr-only" htmlFor={`mv-${lead.id}`}>Move {lead.name} to another stage</label>
                      <select
                        id={`mv-${lead.id}`}
                        value={stage}
                        onChange={e => { if (e.target.value !== stage) onMove(lead, e.target.value) }}
                        className="text-[12px] border border-gray-300 rounded-md bg-white py-1 pl-1.5 pr-1 max-w-[8.5rem] text-gray-700"
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
