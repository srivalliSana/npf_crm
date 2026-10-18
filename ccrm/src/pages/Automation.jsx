import React, { useState } from 'react'
import {
  Workflow, Zap, Clock, AlertTriangle, RefreshCw, Play, XCircle, CheckCircle2,
  Route, Power, FlaskConical, ListChecks, Mail, Bell, GraduationCap, Server,
} from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { Tabs, Badge, Button, StatCard } from '../components/ui'
import { Panel, Loading, ErrorState, useAsync, ScrollX } from '../components/ModuleKit'
import { apiGet, apiPost, apiPut, fmtInt, fmtDateTime } from '../lib/api'
import { usePermissions } from '../hooks/usePermissions'

// Automation — the zero-touch layer: event rules, reminder queue, SLA
// escalations and the per-application journey. Everything on this page is a
// record of something the engine actually did (or, in dry-run, would have).

const MODE = {
  live:    { variant: 'success', label: 'Live',    hint: 'Rules send real emails, create tasks and sync to ERP/LMS.' },
  dry_run: { variant: 'warning', label: 'Dry run', hint: 'Rules evaluate and log what they would do. Nothing is sent.' },
  off:     { variant: 'danger',  label: 'Off',     hint: 'Events are recorded but no rule or reminder runs.' },
}
const RUN_VARIANT = { success: 'success', dry_run: 'warning', failed: 'danger', skipped: 'neutral' }
const JOB_VARIANT = { pending: 'info', done: 'success', skipped: 'neutral', failed: 'danger', cancelled: 'neutral', running: 'info' }

const ACTION_LABEL = {
  send_email: 'Email', send_sms: 'SMS', notify: 'In-app alert', create_task: 'Task',
  schedule_sequence: 'Schedule reminders', cancel_sequence: 'Cancel reminders',
  sync_campusone: 'Sync to ERP', provision_lms: 'Provision LMS', reassign: 'Reassign', retry_erp: 'Retry ERP', retry_lms: 'Retry LMS',
  mark_lapsed: 'Mark seat lapsed',
}
const describeAction = (a) => {
  const base = ACTION_LABEL[a.type] || a.type
  if (a.sequence) return `${base}: ${a.sequence}`
  if (a.to) return `${base} → ${a.to}`
  return base
}

function Toggle({ on, onChange, disabled, label }) {
  return (
    <button
      type="button" disabled={disabled} onClick={() => onChange(!on)} title={label}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-primary-500' : 'bg-gray-300'} ${disabled ? 'opacity-50' : ''}`}
    >
      <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transform transition-transform ${on ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Flash({ msg }) {
  if (!msg) return null
  const cls = msg.tone === 'success' ? 'bg-success-50 text-success-700' : msg.tone === 'warning' ? 'bg-warning-50 text-warning-700' : 'bg-danger-50 text-danger-700'
  return <div className={`mb-4 text-xs rounded-lg px-3 py-2.5 ${cls}`}>{msg.text}</div>
}

function RulesTab({ data, manage, onChange, flash }) {
  const [busy, setBusy] = useState('')
  const update = async (rule, patch) => {
    setBusy(rule.id)
    try { await apiPut(`/api/automation/rules/${rule.id}`, patch); onChange() }
    catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }
  const byEvent = data.rules.reduce((m, r) => { (m[r.event_type] ||= []).push(r); return m }, {})

  return (
    <div className="space-y-4">
      <Panel title="Trigger → action rules" subtitle="Each rule fires when its event happens. Turn a rule off to stop it, or put it in dry run to rehearse it while the rest stay live.">
        <div className="space-y-5">
          {Object.entries(byEvent).map(([event, rules]) => (
            <div key={event}>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={13} className="text-primary-500" />
                <code className="text-xs font-mono text-gray-700">{event}</code>
              </div>
              <div className="space-y-2">
                {rules.map(r => (
                  <div key={r.id} className={`border rounded-xl p-3.5 flex items-start gap-3 flex-wrap ${r.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-sm font-semibold ${r.enabled ? 'text-gray-900' : 'text-gray-400'}`}>{r.name}</h4>
                        {Object.keys(r.conditions || {}).length > 0 && (
                          <Badge variant="neutral">when {Object.entries(r.conditions).map(([k, v]) => `${k} = ${v}`).join(', ')}</Badge>
                        )}
                        {r.dry_run && <Badge variant="warning">Dry run</Badge>}
                      </div>
                      {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(r.actions || []).map((a, i) => <Badge key={i} variant="info">{describeAction(a)}</Badge>)}
                      </div>
                    </div>
                    {manage && (
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <label className="flex items-center gap-1.5"><FlaskConical size={12} />Dry run
                          <Toggle on={r.dry_run} disabled={busy === r.id} onChange={(v) => update(r, { dryRun: v })} />
                        </label>
                        <label className="flex items-center gap-1.5"><Power size={12} />Enabled
                          <Toggle on={r.enabled} disabled={busy === r.id} onChange={(v) => update(r, { enabled: v })} />
                        </label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Reminder sequences" subtitle="Scheduled by rules above. Every step re-checks before sending and skips itself once the student has done the step.">
        <ScrollX>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Sequence</th><th className="py-2 pr-3">Purpose</th><th className="py-2 pr-3">Attached to</th><th className="py-2 pr-3">Goes to</th><th className="py-2">Steps</th>
            </tr></thead>
            <tbody>
              {data.sequences.map(s => (
                <tr key={s.code} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-mono text-xs">{s.code}</td>
                  <td className="py-2 pr-3">{s.label}</td>
                  <td className="py-2 pr-3 capitalize">{s.entity}</td>
                  <td className="py-2 pr-3 capitalize">{s.audience}</td>
                  <td className="py-2">{s.steps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      </Panel>
    </div>
  )
}

function QueueTab({ manage, flash }) {
  const [status, setStatus] = useState('pending')
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/automation/jobs', { status }), [status])
  const [busy, setBusy] = useState('')

  const act = async (job, verb) => {
    setBusy(job.id)
    try {
      const r = await apiPost(`/api/automation/jobs/${job.id}/${verb}`)
      flash(r.status === 'failed' ? 'danger' : 'success', verb === 'cancel' ? 'Reminder cancelled.' : `Ran now → ${r.status}: ${r.result || ''}`)
      reload()
    } catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }

  return (
    <Panel
      title="Reminder queue"
      subtitle="Postgres-backed scheduler, ticks every minute."
      action={
        <div className="flex gap-1">
          {['pending', 'done', 'skipped', 'failed', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-2.5 py-1 text-xs rounded-lg capitalize ${status === s ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</button>
          ))}
        </div>
      }
    >
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No {status} reminders.</p>
      ) : (
        <ScrollX>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">{status === 'pending' ? 'Runs at' : 'Executed'}</th><th className="py-2 pr-3">Sequence</th><th className="py-2 pr-3">For</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Result</th>{manage && status === 'pending' && <th />}
            </tr></thead>
            <tbody>
              {data.map(j => (
                <tr key={j.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs">{fmtDateTime(status === 'pending' ? j.run_at : j.executed_at)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{j.payload?.sequence} · step {Number(j.payload?.step) + 1}</td>
                  <td className="py-2 pr-3"><span className="text-gray-900">{j.entity_label || `#${j.entity_id}`}</span>{j.entity_name && j.entity_name !== j.entity_label && <span className="text-gray-400"> · {j.entity_name}</span>}</td>
                  <td className="py-2 pr-3"><Badge variant={JOB_VARIANT[j.status] || 'neutral'}>{j.status}</Badge></td>
                  <td className="py-2 pr-3 text-xs text-gray-500 max-w-xs truncate" title={j.result}>{j.result}</td>
                  {manage && status === 'pending' && (
                    <td className="py-2 whitespace-nowrap">
                      <Button size="sm" variant="secondary" icon={Play} loading={busy === j.id} onClick={() => act(j, 'run-now')}>Run now</Button>{' '}
                      <Button size="sm" variant="secondary" icon={XCircle} loading={busy === j.id} onClick={() => act(j, 'cancel')}>Cancel</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
    </Panel>
  )
}

function EscalationsTab({ data, manage, onChange, flash }) {
  const [status, setStatus] = useState('open')
  const list = useAsync(() => apiGet('/api/automation/escalations', { status }), [status])
  const [busy, setBusy] = useState('')

  const updateRule = async (r, patch) => {
    setBusy(`rule-${r.id}`)
    try { await apiPut(`/api/automation/escalation-rules/${r.id}`, patch); onChange() }
    catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }
  const resolve = async (e) => {
    setBusy(e.id)
    try { await apiPost(`/api/automation/escalations/${e.id}/resolve`); list.reload(); onChange() }
    catch (err) { flash('danger', err.message) } finally { setBusy('') }
  }
  const sweep = async () => {
    setBusy('sweep')
    try { const r = await apiPost('/api/automation/sweep'); flash('success', `Sweep complete — ${r.openEscalations} open escalation(s).`); list.reload(); onChange() }
    catch (e) { flash('danger', e.message) } finally { setBusy('') }
  }

  return (
    <div className="space-y-4">
      <Panel title="SLA rules" subtitle="Checked every 30 minutes. Each breach is escalated once and auto-resolves when the condition clears."
        action={manage && <Button size="sm" variant="secondary" icon={RefreshCw} loading={busy === 'sweep'} onClick={sweep}>Run sweep now</Button>}>
        <div className="space-y-2">
          {data.escalationRules.map(r => (
            <div key={r.id} className={`border rounded-xl p-3.5 flex items-center gap-3 flex-wrap ${r.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className={`text-sm font-semibold ${r.enabled ? 'text-gray-900' : 'text-gray-400'}`}>{r.name}</h4>
                  <Badge variant="neutral">{r.entity_type}</Badge>
                  {r.hours > 0 && <Badge variant="info">{r.hours >= 24 ? `${r.hours / 24} day${r.hours / 24 === 1 ? '' : 's'}` : `${r.hours}h`}</Badge>}
                </div>
                {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">{(r.actions || []).map((a, i) => <Badge key={i} variant="info">{describeAction(a)}</Badge>)}</div>
              </div>
              {manage && (
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {r.hours > 0 && (
                    <label className="flex items-center gap-1.5">SLA (hours)
                      <input type="number" min="1" className="input-field w-20 py-1 text-xs" defaultValue={r.hours}
                        onBlur={(e) => { const h = Number(e.target.value); if (h > 0 && h !== r.hours) updateRule(r, { hours: h }) }} />
                    </label>
                  )}
                  <Toggle on={r.enabled} disabled={busy === `rule-${r.id}`} onChange={(v) => updateRule(r, { enabled: v })} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`${status === 'open' ? 'Open' : 'Resolved'} escalations`}
        action={<div className="flex gap-1">{['open', 'resolved'].map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1 text-xs rounded-lg capitalize ${status === s ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</button>
        ))}</div>}>
        {list.loading ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">{status === 'open' ? 'Nothing has breached its SLA.' : 'No resolved escalations yet.'}</p>
        ) : (
          <ScrollX>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-3">Raised</th><th className="py-2 pr-3">Rule</th><th className="py-2 pr-3">Entity</th><th className="py-2 pr-3">Owner</th><th className="py-2 pr-3">Notified</th>{status === 'open' && manage && <th />}
              </tr></thead>
              <tbody>
                {list.data.map(e => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">{fmtDateTime(e.created_at)}</td>
                    <td className="py-2 pr-3">{e.rule_name || e.rule_code}{e.detail && <div className="text-[11px] text-danger-600 max-w-xs truncate" title={e.detail}>{e.detail}</div>}</td>
                    <td className="py-2 pr-3"><Badge variant="neutral">{e.entity_type}</Badge> {e.entity_label}</td>
                    <td className="py-2 pr-3 text-xs">{e.owner || '—'}</td>
                    <td className="py-2 pr-3 text-xs text-gray-500 max-w-xs truncate" title={e.notified_to}>{e.notified_to || '—'}</td>
                    {status === 'open' && manage && <td className="py-2"><Button size="sm" variant="secondary" icon={CheckCircle2} loading={busy === e.id} onClick={() => resolve(e)}>Resolve</Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Panel>
    </div>
  )
}

function JourneyTab({ data, manage, flash }) {
  const [appId, setAppId] = useState('')
  const [journey, setJourney] = useState(null)
  const [busy, setBusy] = useState(false)
  const j = data.journey

  const lookup = async (e) => {
    e?.preventDefault()
    if (!appId) return
    setBusy(true)
    try { setJourney(await apiGet(`/api/automation/journey/${encodeURIComponent(appId.trim())}`)) }
    catch (err) { flash('danger', err.message); setJourney(null) } finally { setBusy(false) }
  }
  const provision = async () => {
    setBusy(true)
    try { const r = await apiPost(`/api/automation/journey/${journey.id}/provision-lms`); flash(r.success ? 'success' : 'danger', r.detail); lookup() }
    catch (err) { flash('danger', err.message) } finally { setBusy(false) }
  }

  const stage = (label, n, tone) => (
    <div className="flex-1 min-w-[120px] text-center">
      <div className={`text-2xl font-extrabold ${tone}`}>{fmtInt(n)}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Panel title="Pipeline — where every application stands" subtitle="Counts across all applications. Failed ERP/LMS syncs are retried by the escalation sweep.">
        <div className="flex items-stretch gap-2 flex-wrap">
          {stage('Applications', j.total, 'text-gray-900')}
          {stage('Fee paid', j.fee_paid, 'text-info-700')}
          {stage('Tuition paid', j.tuition_paid, 'text-info-700')}
          {stage('In ERP', j.erp_synced, 'text-success-700')}
          {stage('In LMS', j.lms_provisioned, 'text-success-700')}
          {stage('ERP failed', j.erp_failed, j.erp_failed ? 'text-danger-600' : 'text-gray-300')}
          {stage('LMS failed', j.lms_failed, j.lms_failed ? 'text-danger-600' : 'text-gray-300')}
        </div>
      </Panel>

      <Panel title="Inspect one application">
        <form onSubmit={lookup} className="flex gap-2 mb-4">
          <input className="input-field max-w-xs" placeholder="Application number or id" value={appId} onChange={e => setAppId(e.target.value)} />
          <Button loading={busy} icon={Route} onClick={lookup}>Show journey</Button>
        </form>
        {journey && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">{journey.appNo} — {journey.name}</h4>
              <ol className="space-y-1.5">
                {journey.steps.map(s => (
                  <li key={s.key} className="flex items-start gap-2 text-sm">
                    {s.done ? <CheckCircle2 size={16} className="text-success-600 mt-0.5 flex-shrink-0" /> : <Clock size={16} className="text-gray-300 mt-0.5 flex-shrink-0" />}
                    <div className="min-w-0">
                      <span className={s.done ? 'text-gray-900' : 'text-gray-500'}>{s.label}</span>
                      {s.value && <span className="text-xs text-gray-400 ml-1 font-mono">{s.value}</span>}
                      {s.at && <span className="text-[11px] text-gray-400 ml-1">· {fmtDateTime(s.at)}</span>}
                      {!s.done && s.error && <div className="text-[11px] text-danger-600">{s.error}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-gray-500 mt-3">Next step: <strong>{journey.nextStep}</strong></p>
              {manage && journey.steps.find(s => s.key === 'erp')?.done && !journey.steps.find(s => s.key === 'lms')?.done && (
                <Button size="sm" className="mt-2" icon={GraduationCap} loading={busy} onClick={provision}>Provision LMS now</Button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <h5 className="text-xs font-semibold text-gray-700 mb-1">Pending reminders ({journey.pendingReminders.length})</h5>
                {journey.pendingReminders.length === 0 ? <p className="text-xs text-gray-400">None.</p> : journey.pendingReminders.map(r => (
                  <div key={r.id} className="text-xs text-gray-600"><span className="font-mono">{r.sequence}</span> step {r.step} · {fmtDateTime(r.run_at)}</div>
                ))}
              </div>
              <div>
                <h5 className="text-xs font-semibold text-gray-700 mb-1">Automation history</h5>
                {journey.runs.length === 0 ? <p className="text-xs text-gray-400">Nothing has run for this application yet.</p> : journey.runs.map((r, i) => (
                  <div key={i} className="text-xs text-gray-600 flex gap-1.5 items-baseline">
                    <Badge variant={RUN_VARIANT[r.status] || 'neutral'}>{r.status}</Badge>
                    <span className="font-mono">{r.action_type}</span>
                    <span className="text-gray-400 truncate" title={r.detail}>{r.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}

function ActivityTab({ data }) {
  return (
    <div className="space-y-4">
      <Panel title="Recent actions" subtitle="Everything the engine did (or would have done, in dry run). Last 100.">
        {data.recentRuns.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No actions yet — they appear as soon as a lead or application event fires.</p> : (
          <ScrollX>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-3">When</th><th className="py-2 pr-3">Rule</th><th className="py-2 pr-3">Action</th><th className="py-2 pr-3">Entity</th><th className="py-2 pr-3">Status</th><th className="py-2">Detail</th>
              </tr></thead>
              <tbody>
                {data.recentRuns.map(r => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.rule_code || '—'}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.action_type}</td>
                    <td className="py-2 pr-3 text-xs">{r.entity_type} #{r.entity_id}</td>
                    <td className="py-2 pr-3"><Badge variant={RUN_VARIANT[r.status] || 'neutral'}>{r.status}</Badge></td>
                    <td className="py-2 text-xs text-gray-500 max-w-md truncate" title={r.detail}>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Panel>
      <Panel title="Recent events" subtitle="Journey events received, and how many rules matched each.">
        {data.recentEvents.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">No events yet.</p> : (
          <ScrollX>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-3">When</th><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Entity</th><th className="py-2 pr-3">Rules matched</th><th className="py-2">Payload</th>
              </tr></thead>
              <tbody>
                {data.recentEvents.map(e => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">{fmtDateTime(e.created_at)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{e.event_type}</td>
                    <td className="py-2 pr-3 text-xs">{e.entity_type} #{e.entity_id}</td>
                    <td className="py-2 pr-3">{e.rules_matched}</td>
                    <td className="py-2 text-[11px] text-gray-400 font-mono max-w-md truncate" title={JSON.stringify(e.payload)}>{JSON.stringify(e.payload)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
      </Panel>
    </div>
  )
}

export default function Automation() {
  const { can } = usePermissions()
  const [tab, setTab] = useState('rules')
  const { data, loading, error, reload } = useAsync(() => apiGet('/api/automation/overview'), [])
  const [msg, setMsg] = useState(null)
  const [switching, setSwitching] = useState(false)

  if (loading) return <PageContainer title="Automation"><Loading label="Loading automation…" /></PageContainer>
  if (error) return <PageContainer title="Automation"><ErrorState error={error} onRetry={reload} /></PageContainer>

  const manage = can('automation.manage')
  const flash = (tone, text) => setMsg({ tone, text })
  const mode = MODE[data.mode] || MODE.live

  const setMode = async (m) => {
    if (m === data.mode) return
    if (m === 'off' && !confirm('Turn automation off? Reminders will pause and no rule will run until it is switched back on.')) return
    setSwitching(true)
    try { await apiPut('/api/automation/mode', { mode: m }); reload(); flash('success', `Automation is now ${MODE[m].label.toLowerCase()}.`) }
    catch (e) { flash('danger', e.message) } finally { setSwitching(false) }
  }

  const TABS = [
    { id: 'rules',       label: `Rules (${data.rules.filter(r => r.enabled).length}/${data.rules.length})`, icon: Zap },
    { id: 'queue',       label: `Reminders (${data.queue.pending})`,       icon: Clock },
    { id: 'escalations', label: `Escalations (${data.openEscalations})`,   icon: AlertTriangle },
    { id: 'journey',     label: 'Journey',                                 icon: Route },
    { id: 'activity',    label: 'Activity',                                icon: ListChecks },
  ]

  return (
    <PageContainer
      title="Automation"
      description="Zero-touch admissions — triggers, reminder sequences, SLA escalations and the CRM → ERP → LMS hand-off"
      action={
        <div className="flex items-center gap-2">
          {manage && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {Object.entries(MODE).map(([k, m]) => (
                <button key={k} disabled={switching} onClick={() => setMode(k)} title={m.hint}
                  className={`px-3 py-1.5 font-medium ${data.mode === k ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{m.label}</button>
              ))}
            </div>
          )}
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={reload}>Refresh</Button>
        </div>
      }
    >
      <div className={`mb-4 flex items-center gap-2 text-xs rounded-xl px-3.5 py-2.5 ${data.mode === 'live' ? 'bg-success-50 text-success-700' : data.mode === 'dry_run' ? 'bg-warning-50 text-warning-700' : 'bg-danger-50 text-danger-700'}`}>
        <Workflow size={14} /><strong>Mode: {mode.label}.</strong> {mode.hint}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard icon={Zap} label="Actions (24h)" value={fmtInt(data.runs24h.success + data.runs24h.dryRun)} tone="primary" />
        <StatCard icon={Mail} label="Reminders queued" value={fmtInt(data.queue.pending)} tone="info" />
        <StatCard icon={Bell} label="Open escalations" value={fmtInt(data.openEscalations)} tone={data.openEscalations ? 'warning' : 'success'} />
        <StatCard icon={Server} label="In ERP" value={fmtInt(data.journey.erp_synced)} tone="success" />
        <StatCard icon={GraduationCap} label="In LMS" value={fmtInt(data.journey.lms_provisioned)} tone="success" />
      </div>

      {data.runs24h.failed > 0 && (
        <div className="mb-4 flex items-center gap-2 text-xs rounded-xl px-3.5 py-2.5 bg-danger-50 text-danger-700">
          <AlertTriangle size={14} /> {data.runs24h.failed} action(s) failed in the last 24h — see the Activity tab.
        </div>
      )}

      <Flash msg={msg} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-5" />

      {tab === 'rules'       && <RulesTab data={data} manage={manage} onChange={reload} flash={flash} />}
      {tab === 'queue'       && <QueueTab manage={manage} flash={flash} />}
      {tab === 'escalations' && <EscalationsTab data={data} manage={manage} onChange={reload} flash={flash} />}
      {tab === 'journey'     && <JourneyTab data={data} manage={manage} flash={flash} />}
      {tab === 'activity'    && <ActivityTab data={data} />}
    </PageContainer>
  )
}
