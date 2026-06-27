import React, { useState, useEffect } from 'react'
import { Building2, Save, Globe } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function OrgSettings() {
  const { tenantConfig, fetchTenantConfig, showToast } = useCcrm()
  const [name, setName] = useState('')
  const [branding, setBranding] = useState({})
  const [domains, setDomains] = useState('')
  const [customDomain, setCustomDomain] = useState('')
  const [stages, setStages] = useState('')
  const [saving, setSaving] = useState(false)

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
