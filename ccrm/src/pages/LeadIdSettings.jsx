import React, { useState, useEffect } from 'react'
import { Tag, ArrowRight, RefreshCw, Info } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'
import { Card, Button, Input } from '../components/ui'

const AVATAR_COLORS = ['bg-primary-500', 'bg-accent-500', 'bg-success-500']

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// Clean a code the same way the server does — letters only, short. Applied
// on every keystroke so the live preview never shows a character the save
// would silently have stripped anyway.
function cleanCode(v, max = 4) {
  return v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, max)
}
function cleanYear(v) {
  return v.replace(/\D/g, '').slice(0, 2)
}

export default function LeadIdSettings() {
  const { showToast } = useCcrm()
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState([])
  const [defaultSeason, setDefaultSeason] = useState('26')
  const [savingId, setSavingId] = useState(null)
  const [seasonConfirm, setSeasonConfirm] = useState(false)
  const [seasonSaving, setSeasonSaving] = useState(false)

  const token = () => localStorage.getItem('ccrm_token')
  const authHeaders = { Authorization: `Bearer ${token()}` }

  const load = async () => {
    setLoading(true)
    try {
      const [tRes, dRes] = await Promise.all([
        fetch('/api/platform/tenants', { headers: authHeaders }),
        fetch('/api/platform/lead-id-defaults', { headers: authHeaders }),
      ])
      if (tRes.ok) {
        const rows = await tRes.json()
        setTenants(rows.map(t => ({
          ...t,
          _prefix: t.leadIdPrefix || '',
          _prefixSocial: t.leadIdPrefixSocial || '',
          _seasonMode: t.leadIdSeason ? 'custom' : 'shared',
          _customYear: t.leadIdSeason || '',
        })))
      }
      if (dRes.ok) setDefaultSeason((await dRes.json()).defaultSeason || '26')
    } catch {
      showToast('Failed to load Lead ID settings.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const patchTenant = (id, patch) => {
    setTenants(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  const effectiveYear = t => t._seasonMode === 'custom' ? (t._customYear || defaultSeason) : defaultSeason

  const saveTenant = async (t) => {
    setSavingId(t.id)
    try {
      const body = {
        leadIdPrefix: t._prefix,
        leadIdPrefixSocial: t._prefixSocial,
        leadIdSeason: t._seasonMode === 'custom' ? (t._customYear || '') : '',
      }
      const res = await fetch(`/api/platform/tenants/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error || 'Failed to save.', 'error')
      showToast(`Saved — ${t.name.split(' ')[0]} now uses ${t._prefix || 'CULDAI'}${effectiveYear(t)}…`, 'success')
      load()
    } catch {
      showToast('Failed to save.', 'error')
    } finally {
      setSavingId(null)
    }
  }

  const startNewSeason = async () => {
    const next = String(Number(defaultSeason) + 1).padStart(2, '0')
    setSeasonSaving(true)
    try {
      const res = await fetch('/api/platform/lead-id-defaults', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ defaultSeason: next }),
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error || 'Failed to update season.', 'error')
      setDefaultSeason(data.defaultSeason)
      setSeasonConfirm(false)
      showToast(`Season updated — shared default is now ${data.defaultSeason}`, 'success')
    } catch {
      showToast('Failed to update season.', 'error')
    } finally {
      setSeasonSaving(false)
    }
  }

  const nextSeasonLabel = String(Number(defaultSeason) + 1).padStart(2, '0')

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
        Platform <ArrowRight size={11} /> Tenants <ArrowRight size={11} /> <span className="text-gray-600 font-medium">Lead ID Formats</span>
      </div>
      <h1 className="text-xl font-bold text-gray-800 mb-1.5">Lead ID Formats</h1>
      <p className="text-sm text-gray-500 max-w-2xl mb-6">
        Every lead gets a reference like <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">CULDAI26226287</code> the
        moment it's created. Nothing about it is fixed platform-wide — the prefix and the admission season are both set per tenant here,
        and a change only affects leads created from that point on.
      </p>

      {/* Global season */}
      <div className="rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 to-white shadow-card p-6 mb-4 flex flex-wrap items-center gap-6">
        <div className="flex-1 min-w-[240px]">
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-white bg-accent-500 px-2 py-0.5 rounded-full mb-2">
            Shared default
          </span>
          <h2 className="font-bold text-gray-800 text-base mb-1">Active admission season</h2>
          <p className="text-sm text-gray-500 max-w-md">
            Tenants left on "shared" below switch to this the moment it changes. A tenant with its own season is unaffected.
          </p>
        </div>
        <div className="flex items-center gap-3.5 bg-white border border-gray-200 rounded-2xl px-5 py-3 shadow-soft">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Season code</div>
            <div className="font-mono text-3xl font-bold text-accent-600 leading-none">{defaultSeason}</div>
          </div>
          <Button variant="primary" className="!bg-accent-500 hover:!bg-accent-600" onClick={() => setSeasonConfirm(true)}>
            Start 20{nextSeasonLabel} season <ArrowRight size={14} />
          </Button>
        </div>
      </div>

      {seasonConfirm && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-warning-50 border border-warning-500 rounded-xl px-4 py-3 text-sm text-gray-700">
          <span>
            Set the shared season to <strong className="font-mono">{nextSeasonLabel}</strong>? Every tenant still on "shared" starts
            using it for new leads immediately.
          </span>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setSeasonConfirm(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={seasonSaving} onClick={startNewSeason}>Confirm</Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 my-6">
        Tenants <span className="flex-1 h-px bg-gray-200" />
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading tenants…</div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t, idx) => {
            const yr = effectiveYear(t)
            const seqPreview = '226290'
            return (
              <Card key={t.id} className="!p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                      {initials(t.name)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-sm">{t.name}</h3>
                      <span className="text-xs text-gray-400 font-mono">/{t.slug}</span>
                    </div>
                  </div>
                  {t._prefix || t._prefixSocial ? (
                    <span className="text-[11px] font-bold bg-success-100 text-success-700 px-2.5 py-1 rounded-full">Customized</span>
                  ) : (
                    <span className="text-[11px] font-bold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">Using platform default</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1.3fr] gap-5 items-end">
                  <div className="flex gap-2.5">
                    <Input
                      label="Direct-source prefix"
                      className="font-mono uppercase"
                      placeholder="CULDAI"
                      value={t._prefix}
                      onChange={e => patchTenant(t.id, { _prefix: cleanCode(e.target.value, 20) })}
                    />
                    <Input
                      label="Social-source prefix"
                      className="font-mono uppercase"
                      placeholder="CULDSM"
                      value={t._prefixSocial}
                      onChange={e => patchTenant(t.id, { _prefixSocial: cleanCode(e.target.value, 20) })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Season</label>
                    <div className="flex gap-1.5">
                      <button
                        className={`flex-1 text-xs font-semibold rounded-lg py-2 border transition ${t._seasonMode === 'shared' ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                        onClick={() => patchTenant(t.id, { _seasonMode: 'shared' })}
                      >
                        Shared ({defaultSeason})
                      </button>
                      <button
                        className={`flex-1 text-xs font-semibold rounded-lg py-2 border transition ${t._seasonMode === 'custom' ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                        onClick={() => patchTenant(t.id, { _seasonMode: 'custom' })}
                      >
                        Custom
                      </button>
                    </div>
                    {t._seasonMode === 'custom' && (
                      <input
                        className="input-field font-mono mt-2"
                        maxLength={2}
                        value={t._customYear}
                        onChange={e => patchTenant(t.id, { _customYear: cleanYear(e.target.value) })}
                        placeholder={defaultSeason}
                      />
                    )}
                  </div>

                  <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg px-3.5 py-2.5 text-xs">
                    <div className="flex justify-between text-gray-500 mb-1.5">
                      <span>Direct</span>
                      <span className="font-mono font-bold text-gray-800">{(t._prefix || 'CULDAI')}{yr}{seqPreview}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Social</span>
                      <span className="font-mono font-bold text-gray-800">{(t._prefixSocial || t._prefix || 'CULDSM')}{yr}{seqPreview}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                  <span className="text-xs text-gray-400">
                    Shared sequence — next record <span className="font-mono text-gray-500">#{t.leads ? (Number(seqPreview)) : seqPreview}</span>
                  </span>
                  <Button variant="primary" size="sm" loading={savingId === t.id} onClick={() => saveTenant(t)}>
                    Save changes
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 my-6">
        How an ID is built <span className="flex-1 h-px bg-gray-200" />
      </div>
      <Card className="!p-6">
        <div className="flex items-start gap-3 text-sm text-gray-600">
          <Info size={16} className="text-primary-500 flex-shrink-0 mt-0.5" />
          <p>
            <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">CULDAI26226290</code> breaks down as{' '}
            <strong className="text-gray-800">prefix</strong> (<span className="font-mono">CULDAI</span> — entirely tenant-defined above,
            nothing in it is hardcoded) + <strong className="text-gray-800">season</strong> (<span className="font-mono">26</span> —
            shared or per-tenant, above) + <strong className="text-gray-800">sequence</strong> (<span className="font-mono">226290</span> —
            one counter shared by every tenant, so numbers won't run consecutively within a single tenant — that's expected, not a gap
            in the data). Changing any of this only affects leads created afterward; nothing already issued is ever renumbered.
          </p>
        </div>
      </Card>
    </div>
  )
}
