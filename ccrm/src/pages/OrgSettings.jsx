import React, { useState, useEffect } from 'react'
import { Building2, Save, Globe, Users, Zap } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function OrgSettings() {
  const { tenantConfig, fetchTenantConfig, showToast, currentUser } = useCcrm()
  const [name, setName] = useState('')
  const [branding, setBranding] = useState({})
  const [domains, setDomains] = useState('')
  const [customDomain, setCustomDomain] = useState('')
  const [stages, setStages] = useState('')
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    if (!tenantConfig) return
    setName(tenantConfig.name || '')
    setBranding(tenantConfig.branding || {})
    setDomains((tenantConfig.allowedDomains || []).join(', '))
    setCustomDomain(tenantConfig.customDomain || '')
    setStages((tenantConfig.stages || []).join(', '))
  }, [tenantConfig])

  const save = async () => {
    setSaving(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/tenant/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name,
          branding,
          allowedDomains: domains.split(',').map(s => s.trim()).filter(Boolean),
          customDomain: customDomain.trim() || null,
          stages: stages.split(',').map(s => s.trim()).filter(Boolean),
        })
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Save failed') }
      await fetchTenantConfig()
      showToast('Organization settings saved.', 'success')
    } catch (e) { showToast(e.message || 'Save failed.', 'error') }
    finally { setSaving(false) }
  }

  const B = (k, v) => setBranding(b => ({ ...b, [k]: v }))

  const handleAutoAssign = async (type) => {
    setAssigning(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/bulk-assign-unassigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          includeRegular: type === 'all' || type === 'regular',
          includeGT: type === 'all' || type === 'gt'
        })
      })
      const data = await res.json()
      if (res.ok) {
        const total = Object.values(data.results).reduce((sum, r) => sum + r.assigned, 0)
        showToast(`Auto-assigned ${total} unassigned leads.`, 'success')
      } else {
        showToast(data.error || 'Auto-assign failed.', 'error')
      }
    } catch (e) {
      showToast(e.message || 'Auto-assign failed.', 'error')
    } finally {
      setAssigning(false)
    }
  }

  const isAdmin = ['Admin', 'Manager'].includes(currentUser?.role)

  // Get entity names from tenant config
  const entities = Array.isArray(tenantConfig?.entities) && tenantConfig.entities.length > 0
    ? tenantConfig.entities
    : [
        { code: 'CUTM', label: 'CUTM' },
        { code: 'CUTMAP', label: 'CUTMAP' },
        { code: 'GTIB', label: 'GTIB' },
        { code: 'FTL', label: 'FTL' },
        { code: 'GTTECH', label: 'GTTECH' },
        { code: 'ESSE', label: 'ESSE' }
      ]

  // Separate regular and GT entities
  const regularEntities = entities.filter(e => ['CUTM', 'CUTMAP'].includes(e.code)).map(e => e.label || e.code).join(', ')
  const gtEntities = entities.filter(e => ['GTIB', 'FTL', 'GTTECH', 'ESSE'].includes(e.code)).map(e => e.label || e.code).join(', ')
  const allEntityLabels = entities.map(e => e.label || e.code).join(', ')

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-1">
        <Building2 size={20} className="text-primary-500" /> Organization Settings
      </h1>
      <p className="text-sm text-gray-500 mb-6">Branding and login control for your organization.</p>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <Field label="Organization name" value={name} onChange={setName} placeholder="Acme University" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="App title (browser tab)" value={branding.appTitle || ''} onChange={v => B('appTitle', v)} placeholder="Acme CRM" />
          <Field label="Sidebar name" value={branding.shortName || ''} onChange={v => B('shortName', v)} placeholder="ACME" />
          <Field label="Logo letter" value={branding.logoText || ''} onChange={v => B('logoText', v)} placeholder="A" />
          <Field label="Tagline" value={branding.tagline || ''} onChange={v => B('tagline', v)} placeholder="Admissions" />
          <Field label="Logo image URL (optional)" value={branding.logoUrl || ''} onChange={v => B('logoUrl', v)} placeholder="https://…/logo.png" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4 mt-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
            <Globe size={12} /> Custom domain (optional)
          </label>
          <input value={customDomain} onChange={e => setCustomDomain(e.target.value)} placeholder="crm.acme.edu"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <p className="text-[11px] text-gray-400 mt-1">
            Your organization's domain. Users visiting this domain will automatically access your tenant. Point your DNS A record to the app server.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
            <Globe size={12} /> Allowed login domains
          </label>
          <input value={domains} onChange={e => setDomains(e.target.value)} placeholder="acme.edu, acme.org"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <p className="text-[11px] text-gray-400 mt-1">
            Only Google sign-ins from these email domains can self-register into your org. Comma-separated. Existing users always keep access.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Lead stages (pipeline)</label>
          <input value={stages} onChange={e => setStages(e.target.value)} placeholder="New, Contacted, Interested, Converted"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          <p className="text-[11px] text-gray-400 mt-1">Comma-separated, in funnel order.</p>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mt-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Users size={16} className="text-primary-600" /> Lead Assignment
          </h2>
          <div className="space-y-3">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-gray-800 mb-2">Regular Leads ({regularEntities || 'Regular'})</p>
              <p className="text-sm text-gray-600 mb-3">
                Auto-assign all unassigned regular leads to active counselors using round-robin.
              </p>
              <button onClick={() => handleAutoAssign('regular')} disabled={assigning}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                <Zap size={14} /> {assigning ? 'Auto-assigning…' : 'Auto-assign Regular Leads'}
              </button>
            </div>

            {gtEntities && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm font-medium text-gray-800 mb-2">GT Entity Leads ({gtEntities})</p>
                <p className="text-sm text-gray-600 mb-3">
                  Auto-assign all unassigned GT entity leads to active counselors using round-robin.
                </p>
                <button onClick={() => handleAutoAssign('gt')} disabled={assigning}
                  className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  <Zap size={14} /> {assigning ? 'Auto-assigning…' : 'Auto-assign GT Leads'}
                </button>
              </div>
            )}

            {gtEntities && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-gray-800 mb-2">All Leads ({allEntityLabels})</p>
                <p className="text-sm text-gray-600 mb-3">
                  Auto-assign all unassigned leads (regular + GT) to active counselors.
                </p>
                <button onClick={() => handleAutoAssign('all')} disabled={assigning}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  <Zap size={14} /> {assigning ? 'Auto-assigning…' : 'Auto-assign All Leads'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <button onClick={save} disabled={saving}
        className="mt-5 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-5 py-2 text-sm disabled:opacity-50">
        <Save size={15} /> {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400" />
    </div>
  )
}
