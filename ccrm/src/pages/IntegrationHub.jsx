import React, { useState } from 'react'
import {
  Plug, Server, GraduationCap, ClipboardCheck, Wallet, Network,
  RefreshCw, Play, Trash2, Plus, Zap, AlertTriangle,
} from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { Tabs, Badge, Button, Modal, StatCard } from '../components/ui'
import { Panel, Loading, ErrorState, useAsync, ScrollX } from '../components/ModuleKit'
import { apiGet, apiPost, apiPut, apiDelete, fmtInt, fmtDateTime } from '../lib/api'
import { usePermissions } from '../hooks/usePermissions'

// Item 27 — Integration: CRM ↔ ERP ↔ LMS ↔ Examination.
//
// A connector says how to reach a system; a sync job says what to move and
// which way; a run log says what actually happened. Nothing on this page shows
// a healthy state it hasn't measured — an untested connector reads "Not
// checked", not "Connected".

const SYSTEM_ICON = {
  erp: Server, lms: GraduationCap, examination: ClipboardCheck, finance: Wallet, crm: Network,
}

const STATUS = {
  connected:      { variant: 'success', label: 'Connected' },
  error:          { variant: 'danger',  label: 'Unreachable' },
  not_configured: { variant: 'neutral', label: 'Not checked' },
}

const RUN_STATUS = { success: 'success', partial: 'warning', failed: 'danger', running: 'info' }

const BLANK = {
  code: '', name: '', systemType: 'erp', direction: 'outbound', baseUrl: '', healthPath: '',
  authType: 'none', authUsername: '', authSecret: '', headerName: '',
}

function ConnectorForm({ initial, onSubmit, onCancel, saving }) {
  // Blank the credential on open: the server treats an empty value as "keep
  // the stored one", so the field only ever carries a deliberate new secret.
  const [form, setForm] = useState({ ...initial, authSecret: '' })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const isNew = !initial.id

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" hint={isNew ? 'Short unique id, e.g. moodle' : 'Cannot be changed'}>
          <input className="input-field" value={form.code} onChange={set('code')} disabled={!isNew} />
        </Field>
        <Field label="Display name">
          <input className="input-field" value={form.name} onChange={set('name')} placeholder="Moodle LMS" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="System type">
          <select className="input-field" value={form.systemType} onChange={set('systemType')} disabled={!isNew}>
            {['erp', 'lms', 'examination', 'finance', 'crm'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
        </Field>
        <Field label="Direction">
          <select className="input-field" value={form.direction} onChange={set('direction')}>
            <option value="inbound">Inbound — we pull from it</option>
            <option value="outbound">Outbound — we push to it</option>
            <option value="bidirectional">Both</option>
          </select>
        </Field>
      </div>

      <Field label="Base URL" hint="Sync-job paths are appended to this.">
        <input className="input-field" value={form.baseUrl} onChange={set('baseUrl')} placeholder="https://erp.example.ac.in/api" />
      </Field>

      <Field label="Health-check path" hint="Requested by the Test button. Leave blank to hit the base URL.">
        <input className="input-field" value={form.healthPath} onChange={set('healthPath')} placeholder="/health" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Authentication">
          <select className="input-field" value={form.authType} onChange={set('authType')}>
            <option value="none">None</option>
            <option value="bearer">Bearer token</option>
            <option value="basic">Basic auth</option>
            <option value="api_key">API key header</option>
          </select>
        </Field>
        {form.authType === 'basic' && (
          <Field label="Username">
            <input className="input-field" value={form.authUsername} onChange={set('authUsername')} />
          </Field>
        )}
        {form.authType === 'api_key' && (
          <Field label="Header name">
            <input className="input-field" value={form.headerName} onChange={set('headerName')} placeholder="X-API-Key" />
          </Field>
        )}
      </div>

      {form.authType !== 'none' && (
        <Field
          label={form.authType === 'basic' ? 'Password' : 'Token / key'}
          hint="Encrypted at rest when SETTINGS_ENC_KEY is configured, and never returned by the API."
        >
          <input
            className="input-field" type="password" value={form.authSecret} onChange={set('authSecret')}
            placeholder={initial.hasSecret ? 'Leave unchanged to keep the stored credential' : ''}
          />
        </Field>
      )}

      <div className="flex gap-2 pt-2">
        <Button loading={saving} onClick={() => onSubmit(form)}>{isNew ? 'Add connector' : 'Save changes'}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function JobForm({ connectors, entities, onSubmit, onCancel, saving }) {
  const [form, setForm] = useState({
    connectorId: connectors[0]?.id || '', entity: 'academic_records',
    direction: 'pull', path: '', scheduleCron: '', enabled: true,
  })
  const spec = entities.find(e => e.entity === form.entity)
  const dirs = spec ? ['pull', 'push'].filter(d => spec[d]) : ['pull']

  return (
    <div className="space-y-3">
      <Field label="Connector">
        <select className="input-field" value={form.connectorId} onChange={e => setForm(f => ({ ...f, connectorId: Number(e.target.value) }))}>
          {connectors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.systemType.toUpperCase()})</option>)}
        </select>
      </Field>

      <Field label="What to sync">
        <select
          className="input-field" value={form.entity}
          onChange={e => {
            const entity = e.target.value
            const s = entities.find(x => x.entity === entity)
            // Keep direction legal for the newly chosen entity.
            setForm(f => ({ ...f, entity, direction: s?.pull ? 'pull' : 'push' }))
          }}
        >
          {entities.map(e => <option key={e.entity} value={e.entity}>{e.label}</option>)}
        </select>
      </Field>

      <Field label="Direction">
        <select className="input-field" value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
          {dirs.map(d => <option key={d} value={d}>{d === 'pull' ? 'Pull into the CRM' : 'Push out of the CRM'}</option>)}
        </select>
      </Field>

      <Field
        label="Path"
        hint={form.direction === 'pull'
          ? 'Appended to the base URL. Must return a JSON array, or an object with a data/records array.'
          : 'Appended to the base URL. Each admitted student is POSTed to it as JSON.'}
      >
        <input className="input-field" value={form.path} onChange={e => setForm(f => ({ ...f, path: e.target.value }))} placeholder="/v1/academic-records" />
      </Field>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="accent-primary-500" />
        Run automatically every hour (at :30)
      </label>

      <div className="flex gap-2 pt-2">
        <Button loading={saving} onClick={() => onSubmit(form)}>Create sync job</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

export default function IntegrationHub() {
  const { can } = usePermissions()
  const [tab, setTab] = useState('connectors')
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/integration-hub/overview'), [])
  const [editing, setEditing] = useState(null)     // connector object or BLANK
  const [addingJob, setAddingJob] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  if (loading) return <PageContainer title="Integrations"><Loading label="Loading connectors…" /></PageContainer>
  if (error) return <PageContainer title="Integrations"><ErrorState error={error} onRetry={reload} /></PageContainer>

  const manage = can('integrations.manage')
  const flash = (tone, text) => setMsg({ tone, text })

  const saveConnector = async (form) => {
    setSaving(true); setMsg(null)
    try {
      if (form.id) await apiPut(`/api/integration-hub/connectors/${form.id}`, form)
      else await apiPost('/api/integration-hub/connectors', form)
      setEditing(null); reload()
      flash('success', 'Connector saved.')
    } catch (e) { flash('danger', e.message) } finally { setSaving(false) }
  }

  const testConnector = async (c) => {
    setBusy(`test-${c.id}`); setMsg(null)
    try {
      const r = await apiPost(`/api/integration-hub/connectors/${c.id}/test`)
      flash(r.status === 'connected' ? 'success' : 'danger',
        r.status === 'connected'
          ? `${c.name} responded in ${r.latencyMs}ms (HTTP ${r.httpStatus}).`
          : `${c.name} unreachable: ${r.error}`)
      reload()
    } catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }

  const toggleConnector = async (c) => {
    setBusy(`toggle-${c.id}`)
    try { await apiPut(`/api/integration-hub/connectors/${c.id}`, { enabled: !c.enabled }); reload() }
    catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }

  const removeConnector = async (c) => {
    if (!confirm(`Remove "${c.name}"? Its sync jobs are deleted too. Data already synced is kept.`)) return
    setBusy(`del-${c.id}`)
    try { await apiDelete(`/api/integration-hub/connectors/${c.id}`); reload(); flash('success', 'Connector removed.') }
    catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }

  const createJob = async (form) => {
    setSaving(true); setMsg(null)
    try { await apiPost('/api/integration-hub/jobs', form); setAddingJob(false); reload(); flash('success', 'Sync job created.') }
    catch (e) { flash('danger', e.message) } finally { setSaving(false) }
  }

  const runJob = async (job) => {
    setBusy(`run-${job.id}`); setMsg(null)
    try {
      const r = await apiPost(`/api/integration-hub/jobs/${job.id}/run`)
      flash(r.status === 'success' ? 'success' : r.status === 'partial' ? 'warning' : 'danger',
        `${job.entityLabel}: read ${r.recordsRead}, wrote ${r.recordsWritten}, failed ${r.recordsFailed}.${r.error ? ` ${r.error}` : ''}`)
      reload()
    } catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }

  const deleteJob = async (job) => {
    if (!confirm('Delete this sync job? Records already synced are kept.')) return
    setBusy(`deljob-${job.id}`)
    try { await apiDelete(`/api/integration-hub/jobs/${job.id}`); reload() }
    catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }

  const TABS = [
    { id: 'connectors', label: `Connectors (${data.connectors.length})`, icon: Plug },
    { id: 'jobs',       label: `Sync jobs (${data.jobs.length})`,        icon: Zap },
    { id: 'logs',       label: 'Run history',                            icon: RefreshCw },
  ]

  return (
    <PageContainer
      title="Integrations"
      description="CRM ↔ ERP ↔ LMS ↔ Examination — connectors, scheduled syncs and run history"
      action={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard icon={Plug} label="Connectors" value={fmtInt(data.connectors.length)} tone="primary" />
        <StatCard icon={GraduationCap} label="Academic records" value={fmtInt(data.dataCounts.academicRecords)} tone="info" />
        <StatCard icon={ClipboardCheck} label="Exam results" value={fmtInt(data.dataCounts.examResults)} tone="info" />
        <StatCard icon={Server} label="Students in ERP" value={fmtInt(data.dataCounts.erpSynced)} tone="success" />
      </div>

      {msg && (
        <div className={`mb-4 text-xs rounded-lg px-3 py-2.5 ${
          msg.tone === 'success' ? 'bg-success-50 text-success-700'
          : msg.tone === 'warning' ? 'bg-warning-50 text-warning-700'
          : 'bg-danger-50 text-danger-700'}`}>
          {msg.text}
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-5 overflow-x-auto" />

      {tab === 'connectors' && (
        <div className="space-y-4">
          {data.legacyCampusOneEndpoint && !data.connectors.some(c => c.code === 'campusone') && (
            <div className="flex items-start gap-2 text-xs text-info-700 bg-info-50 rounded-xl px-3.5 py-3">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                A CampusOne endpoint is already configured under Integration Settings
                (<code className="font-mono break-all">{data.legacyCampusOneEndpoint}</code>) and is still used by the
                automatic push on admission. Add it as a connector here to also get run history, retries and a health check.
              </span>
            </div>
          )}

          <Panel
            title="Configured connectors"
            action={manage && <Button size="sm" icon={Plus} onClick={() => setEditing({ ...BLANK })}>Add connector</Button>}
          >
            {data.connectors.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No connectors yet.</p>
            ) : (
              <div className="space-y-3">
                {data.connectors.map(c => {
                  const Icon = SYSTEM_ICON[c.systemType] || Plug
                  const st = STATUS[c.status] || STATUS.not_configured
                  return (
                    <div key={c.id} className="border border-gray-200 rounded-xl p-4 flex items-start gap-3 flex-wrap">
                      <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                        <Icon size={17} className="text-primary-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-gray-900">{c.name}</h4>
                          <Badge variant="neutral">{c.systemType.toUpperCase()}</Badge>
                          <Badge variant={st.variant}>{st.label}</Badge>
                          {!c.enabled && <Badge variant="warning">Disabled</Badge>}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 break-all">{c.baseUrl || 'No base URL set'}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {c.authType === 'none' ? 'No authentication' : `${c.authType} auth`}
                          {c.hasSecret ? ' · credential stored' : ''}
                          {c.lastCheckedAt ? ` · checked ${fmtDateTime(c.lastCheckedAt)}` : ' · never checked'}
                        </p>
                        {c.lastError && <p className="text-[11px] text-danger-600 mt-1">{c.lastError}</p>}
                      </div>
                      {manage && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button size="sm" variant="secondary" loading={busy === `test-${c.id}`} onClick={() => testConnector(c)}>Test</Button>
                          <Button size="sm" variant="ghost" loading={busy === `toggle-${c.id}`} onClick={() => toggleConnector(c)}>
                            {c.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                          <Button size="sm" variant="ghost" icon={Trash2} className="!text-danger-600 hover:!bg-danger-50"
                            loading={busy === `del-${c.id}`} onClick={() => removeConnector(c)} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          {manage && data.available.length > 0 && (
            <Panel title="Common systems" subtitle="Start from a blueprint — nothing is saved until you fill in the details">
              <div className="flex gap-2 flex-wrap">
                {data.available.map(b => {
                  const Icon = SYSTEM_ICON[b.systemType] || Plug
                  return (
                    <button
                      key={b.code}
                      onClick={() => setEditing({ ...BLANK, code: b.code, name: b.name, systemType: b.systemType, direction: b.direction })}
                      className="flex items-center gap-2 border border-gray-200 rounded-xl px-3.5 py-2.5 hover:border-primary-300 hover:bg-primary-50/40 transition"
                    >
                      <Icon size={15} className="text-gray-500" />
                      <span className="text-sm text-gray-700">{b.name}</span>
                      <Plus size={13} className="text-gray-400" />
                    </button>
                  )
                })}
              </div>
            </Panel>
          )}
        </div>
      )}

      {tab === 'jobs' && (
        <Panel
          title="Sync jobs"
          subtitle="Enabled jobs run hourly at :30, and can be triggered manually at any time"
          action={manage && data.connectors.length > 0 && (
            <Button size="sm" icon={Plus} onClick={() => setAddingJob(true)}>Add sync job</Button>
          )}
        >
          {data.connectors.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Add a connector first — a sync job needs somewhere to talk to.</p>
          ) : data.jobs.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No sync jobs configured yet.</p>
          ) : (
            <ScrollX>
              <table className="w-full text-sm border-collapse min-w-[760px]">
                <thead>
                  <tr>
                    <th className="table-th">Connector</th>
                    <th className="table-th">Entity</th>
                    <th className="table-th">Direction</th>
                    <th className="table-th">Path</th>
                    <th className="table-th">Schedule</th>
                    <th className="table-th">Last run</th>
                    <th className="table-th"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map(j => (
                    <tr key={j.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="table-td">
                        <div className="text-gray-800 font-medium">{j.connectorName}</div>
                        <div className="text-[10px] text-gray-400">{j.systemType.toUpperCase()}</div>
                      </td>
                      <td className="table-td text-gray-600">{j.entity}</td>
                      <td className="table-td"><Badge variant="neutral">{j.direction}</Badge></td>
                      <td className="table-td font-mono text-xs text-gray-500 max-w-[160px] truncate">{j.path || '/'}</td>
                      <td className="table-td">
                        <Badge variant={j.enabled ? 'success' : 'neutral'}>{j.enabled ? 'Hourly' : 'Manual only'}</Badge>
                      </td>
                      <td className="table-td">
                        {j.lastRunAt ? (
                          <>
                            <Badge variant={RUN_STATUS[j.lastStatus] || 'neutral'}>{j.lastStatus}</Badge>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {fmtDateTime(j.lastRunAt)} · {fmtInt(j.lastRecords)} records
                            </div>
                          </>
                        ) : <span className="text-xs text-gray-400">Never run</span>}
                      </td>
                      <td className="table-td text-right whitespace-nowrap">
                        {manage && (
                          <>
                            <Button size="sm" variant="secondary" icon={Play} loading={busy === `run-${j.id}`} onClick={() => runJob(j)}>Run</Button>
                            <Button size="sm" variant="ghost" icon={Trash2} className="!text-danger-600 hover:!bg-danger-50 ml-1"
                              loading={busy === `deljob-${j.id}`} onClick={() => deleteJob(j)} />
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          )}
        </Panel>
      )}

      {tab === 'logs' && (
        <Panel title="Run history" subtitle="The last 25 sync runs, manual and scheduled">
          {data.recentRuns.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No syncs have run yet.</p>
          ) : (
            <ScrollX>
              <table className="w-full text-sm border-collapse min-w-[760px]">
                <thead>
                  <tr>
                    <th className="table-th">Started</th>
                    <th className="table-th">Connector</th>
                    <th className="table-th">Entity</th>
                    <th className="table-th">Trigger</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Read</th>
                    <th className="table-th text-right">Written</th>
                    <th className="table-th text-right">Failed</th>
                    <th className="table-th text-right">Took</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRuns.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="table-td text-gray-500 whitespace-nowrap">{fmtDateTime(r.startedAt)}</td>
                      <td className="table-td text-gray-700">{r.connectorCode}</td>
                      <td className="table-td text-gray-600">{r.entity}</td>
                      <td className="table-td text-gray-500 text-xs">{r.triggerSource}</td>
                      <td className="table-td">
                        <Badge variant={RUN_STATUS[r.status] || 'neutral'}>{r.status}</Badge>
                        {r.error && <div className="text-[10px] text-danger-600 mt-0.5 max-w-[220px] truncate" title={r.error}>{r.error}</div>}
                      </td>
                      <td className="table-td text-right tabular-nums">{fmtInt(r.recordsRead)}</td>
                      <td className="table-td text-right tabular-nums font-semibold">{fmtInt(r.recordsWritten)}</td>
                      <td className="table-td text-right tabular-nums">
                        {r.recordsFailed > 0 ? <span className="text-danger-600">{fmtInt(r.recordsFailed)}</span> : '0'}
                      </td>
                      <td className="table-td text-right text-gray-400 text-xs">{r.durationMs != null ? `${r.durationMs}ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollX>
          )}
        </Panel>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? 'Edit connector' : 'Add connector'} size="xl">
          <ConnectorForm initial={editing} onSubmit={saveConnector} onCancel={() => setEditing(null)} saving={saving} />
        </Modal>
      )}

      {addingJob && (
        <Modal open onClose={() => setAddingJob(false)} title="Add sync job" size="lg">
          <JobForm
            connectors={data.connectors}
            entities={data.entities}
            onSubmit={createJob}
            onCancel={() => setAddingJob(false)}
            saving={saving}
          />
        </Modal>
      )}
    </PageContainer>
  )
}
