import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCcrm } from '../context/CcrmContext'
import {
  Settings as SettingsIcon, Bell, Shield, Globe, Palette,
  Database, Link, Mail, MessageSquare, Phone, Save, ChevronRight,
  User, Building, Key, Eye, EyeOff, CheckCircle, ExternalLink,
  Share2, Search, Linkedin, MessageCircle, CreditCard, Wallet,
  PhoneCall, BarChart2, AlertTriangle, Trash2
} from 'lucide-react'

const SECTIONS = [
  { id: 'profile',       label: 'Profile Settings',      icon: User       },
  { id: 'organization',  label: 'Organization',           icon: Building   },
  { id: 'notifications', label: 'Notifications',          icon: Bell       },
  { id: 'security',      label: 'Security & Access',      icon: Shield     },
  { id: 'integrations',  label: 'Integrations',           icon: Link       },
  { id: 'backup',        label: 'Backup & Restore',       icon: Database,   adminOnly: true },
  { id: 'production',    label: 'Production Reset',       icon: AlertTriangle, adminOnly: true },
]

// Maps integration id → keys that indicate "connected" when any is non-empty
const INTEG_STATUS_KEYS = {
  meta:            ['meta_page_access_token'],
  googleads:       ['googleads_developer_token', 'googleads_customer_id'],
  linkedin:        ['linkedin_access_token'],
  whatsapp:        ['whatsapp_access_token'],
  razorpay:        ['razorpay_key_id'],
  payu:            ['payu_merchant_key'],
  ameyo:           ['ameyo_api_url'],
  smtp:            ['smtp_host', 'smtp_user'],
}

const INTEG_META = [
  { id: 'meta',      name: 'Facebook Ads',       Icon: Share2,       color: 'text-blue-600',   bg: 'bg-blue-50',   desc: 'Lead generation from Facebook campaigns' },
  { id: 'googleads', name: 'Google Ads',          Icon: Search,       color: 'text-red-500',    bg: 'bg-red-50',    desc: 'Lead capture from Google search ads' },
  { id: 'linkedin',  name: 'LinkedIn',            Icon: Linkedin,     color: 'text-sky-600',    bg: 'bg-sky-50',    desc: 'Professional network lead generation' },
  { id: 'whatsapp',  name: 'WhatsApp Business',   Icon: MessageCircle,color: 'text-green-600',  bg: 'bg-green-50',  desc: 'Automated WhatsApp communication' },
  { id: 'razorpay',  name: 'Razorpay',            Icon: CreditCard,   color: 'text-indigo-600', bg: 'bg-indigo-50', desc: 'Online payment gateway' },
  { id: 'payu',      name: 'PayU',                Icon: Wallet,       color: 'text-teal-600',   bg: 'bg-teal-50',   desc: 'Alternative payment gateway' },
  { id: 'ameyo',     name: 'Ameyo (Telephony)',   Icon: PhoneCall,    color: 'text-violet-600', bg: 'bg-violet-50', desc: 'Cloud telephony & call recording' },
  { id: 'smtp',      name: 'Gmail / SMTP Email',  Icon: Mail,         color: 'text-purple-600', bg: 'bg-purple-50', desc: 'Email communication & alerts' },
]

export default function Settings() {
  const { currentUser, updateUser, showToast } = useCcrm()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('profile')
  const [saved, setSaved] = useState(false)
  const [showPass, setShowPass] = useState(false)

  // Live integration connection statuses from backend
  const [integSettings, setIntegSettings] = useState({})

  // Production Reset state
  const [prodPhrase, setProdPhrase]     = useState('')
  const [prodLoading, setProdLoading]   = useState(false)
  const [prodResult, setProdResult]     = useState(null)
  const [prodChecks, setProdChecks]     = useState({ data: false, settings: false, irreversible: false })

  const allChecked = prodChecks.data && prodChecks.settings && prodChecks.irreversible
  const phraseOk   = prodPhrase === 'RESET FOR PRODUCTION'

  const handleProductionReset = async () => {
    if (!allChecked || !phraseOk) return
    setProdLoading(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/admin/reset-production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ confirmPhrase: prodPhrase })
      })
      const data = await res.json()
      if (res.ok) {
        setProdResult(data)
        showToast('Production reset complete. All operational data wiped.', 'success')
      } else {
        showToast(data.error || 'Reset failed.', 'error')
      }
    } catch {
      showToast('Network error. Try again or use the SQL script.', 'error')
    }
    setProdLoading(false)
  }
  useEffect(() => {
    if (activeSection === 'integrations') {
      fetch('/api/integration-settings')
        .then(r => r.json())
        .then(data => setIntegSettings(data))
        .catch(() => {})
    }
  }, [activeSection])

  const initialName = currentUser?.name || 'User'
  const first = initialName.split(' ')[0] || ''
  const last = initialName.split(' ').slice(1).join(' ') || ''
  
  const [profileForm, setProfileForm] = useState({
    firstName: first,
    lastName: last,
    email: currentUser?.email || '',
    phone: currentUser?.mobile_number || '',
    designation: currentUser?.role === 'Admin' ? 'Admissions Head' : 'Counselor Officer',
    department: currentUser?.team || 'Admissions'
  })

  // Password change states
  const [secForm, setSecForm] = useState({
    currentPass: '',
    newPass: '',
    confirmPass: ''
  })

  const handleSave = () => {
    if (!currentUser) { showToast('Not logged in.', 'error'); return }
    if (activeSection === 'profile') {
      const mergedName = `${profileForm.firstName} ${profileForm.lastName}`.trim()
      updateUser(currentUser.id, {
        name: mergedName,
        mobile_number: profileForm.phone,
        team: profileForm.department
      })
      showToast('Profile settings saved successfully.', 'success')
    } else if (activeSection === 'security') {
      if (secForm.newPass && secForm.newPass === secForm.confirmPass) {
        updateUser(currentUser.id, {
          password: secForm.newPass
        })
        showToast('Password updated successfully.', 'success')
        setSecForm({ currentPass: '', newPass: '', confirmPass: '' })
      } else if (secForm.newPass) {
        showToast('Confirm password does not match.', 'error')
        return
      } else {
        showToast('Security settings configured.', 'success')
      }
    } else {
      showToast('Settings saved successfully.', 'success')
    }
    
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handlePhotoUpload = (e) => {
    if (!currentUser) return
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file.', 'error')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64String = event.target.result
      updateUser(currentUser.id, {
        picture: base64String
      })
      showToast('Profile photo updated successfully!', 'success')
    }
    reader.readAsDataURL(file)
  }

  const triggerPhotoInput = () => {
    document.getElementById('profilePhotoInput').click()
  }

  const initials = currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'VK'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure CCRM for Centurion University</p>
        </div>
        <button onClick={handleSave}
          className={`flex items-center gap-1.5 text-sm rounded-lg px-4 py-1.5 transition-colors focus:outline-none ${saved ? 'bg-green-500 text-white' : 'bg-primary-500 hover:bg-primary-600 text-white'}`}>
          {saved ? <><CheckCircle size={14} /> Saved!</> : <><Save size={14} /> Save Changes</>}
        </button>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Sidebar nav */}
        <div className="w-full lg:w-56 bg-white rounded-xl border border-gray-200 shadow-sm p-2 h-fit">
          {SECTIONS.filter(s => !s.adminOnly || currentUser?.role === 'Admin').map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors focus:outline-none ${
                activeSection === s.id
                  ? (s.id === 'production' ? 'bg-red-50 text-red-700 font-bold' : 'bg-primary-50 text-primary-600 font-bold')
                  : (s.id === 'production' ? 'text-red-500 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-50')
              }`}>
              <s.icon size={16} />
              {s.label}
              {activeSection === s.id && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-bold text-gray-800 text-base mb-4">Profile Settings</h2>
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                  {currentUser?.picture ? (
                    <img src={currentUser.picture} className="w-16 h-16 rounded-full object-cover shadow" alt="Avatar" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center text-white text-xl font-bold select-none shadow">
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-gray-800 text-base">{currentUser?.name}</p>
                    <p className="text-xs text-gray-500 font-semibold">{currentUser?.role} · Centurion University</p>
                    <button onClick={triggerPhotoInput} className="text-xs text-primary-500 hover:underline mt-1 focus:outline-none font-semibold">Change Photo</button>
                    <input
                      id="profilePhotoInput"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">First Name</label>
                  <input
                    type="text"
                    value={profileForm.firstName}
                    onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Last Name</label>
                  <input
                    type="text"
                    value={profileForm.lastName}
                    onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Registered Email Address</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    className="input-field text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Mobile Contact Phone</label>
                  <input
                    type="text"
                    value={profileForm.phone}
                    onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Role Designation</label>
                  <input
                    type="text"
                    value={profileForm.designation}
                    className="input-field text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Admissions Department</label>
                  <input
                    type="text"
                    value={profileForm.department}
                    onChange={e => setProfileForm(p => ({ ...p, department: e.target.value }))}
                    className="input-field text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === 'organization' && (
            <div>
              <h2 className="font-semibold text-gray-800 mb-4">Organization Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Organization Name', value: 'Centurion University of Technology and Management' },
                  { label: 'Short Name', value: 'CUTM' },
                  { label: 'Website', value: 'https://cutm.ac.in' },
                  { label: 'Primary Email', value: 'admissions@cutm.ac.in' },
                  { label: 'Phone', value: '+91 6742-290-000' },
                  { label: 'Address', value: 'Paralakhemundi, Odisha 761211' },
                  { label: 'Timezone', value: 'Asia/Kolkata (IST)' },
                  { label: 'Academic Year', value: '2026-27' },
                ].map(f => (
                  <div key={f.label} className={f.label === 'Organization Name' || f.label === 'Address' ? 'col-span-2' : ''}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                    <input type="text" defaultValue={f.value} className="input-field text-sm" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div>
              <h2 className="font-semibold text-gray-800 mb-4">Notification Preferences</h2>
              <div className="space-y-4">
                {[
                  { label: 'New Lead Assigned', desc: 'Get notified when a new lead is assigned to you', email: true, sms: true, push: true },
                  { label: 'Application Submitted', desc: 'When a student submits an application', email: true, sms: false, push: true },
                  { label: 'Payment Received', desc: 'When a payment is approved', email: true, sms: true, push: true },
                  { label: 'Follow-up Reminder', desc: 'Reminders for scheduled follow-ups', email: false, sms: true, push: true },
                  { label: 'Document Uploaded', desc: 'When a student uploads a document', email: true, sms: false, push: false },
                  { label: 'Query Raised', desc: 'When a student raises a new query', email: true, sms: false, push: true },
                ].map(n => (
                  <div key={n.label} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{n.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{n.desc}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {[['Email', n.email], ['SMS', n.sms], ['Push', n.push]].map(([ch, val]) => (
                        <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" defaultChecked={val} className="w-3.5 h-3.5 rounded text-primary-500" />
                          <span className="text-xs text-gray-600">{ch}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div>
              <h2 className="font-semibold text-gray-800 mb-4">Security &amp; Access Control</h2>
              <div className="space-y-4">
                <div className="p-4 border border-gray-200 rounded-xl">
                  <h3 className="font-medium text-gray-800 text-sm mb-3">Change Password</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
                      <div className="relative">
                        <input
                          type={showPass ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={secForm.newPass}
                          onChange={e => setSecForm(p => ({ ...p, newPass: e.target.value }))}
                          className="input-field text-sm pr-10"
                        />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 focus:outline-none">
                          {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Confirm New Password</label>
                      <div className="relative">
                        <input
                          type={showPass ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={secForm.confirmPass}
                          onChange={e => setSecForm(p => ({ ...p, confirmPass: e.target.value }))}
                          className="input-field text-sm pr-10"
                        />
                        <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 focus:outline-none">
                          {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4 border border-gray-200 rounded-xl">
                  <h3 className="font-medium text-gray-800 text-sm mb-3">Two-Factor Authentication</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Enable 2FA for enhanced security</p>
                      <p className="text-xs text-gray-400 mt-0.5">Uses authenticator app or SMS OTP</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'integrations' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Third-Party Integrations</h2>
                <button
                  onClick={() => navigate('/integrations')}
                  className="flex items-center gap-1.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg px-3 py-1.5 transition-colors"
                >
                  <ExternalLink size={12} /> Manage All
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {INTEG_META.map(({ id, name, Icon, color, bg, desc }) => {
                  const keys = INTEG_STATUS_KEYS[id] || []
                  const connected = keys.some(k => integSettings[k]?.trim())
                  return (
                    <div key={id} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon size={17} className={color} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{name}</p>
                          <p className="text-xs text-gray-500">{desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className={`badge text-[11px] font-semibold ${connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {connected ? 'Connected' : 'Not configured'}
                        </span>
                        <button
                          onClick={() => navigate('/integrations')}
                          className="text-xs text-primary-600 border border-primary-200 rounded-lg px-3 py-1 hover:bg-primary-50 transition-colors"
                        >
                          {connected ? 'Edit' : 'Configure'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">
                API keys and credentials are managed in the{' '}
                <button onClick={() => navigate('/integrations')} className="text-primary-500 hover:underline">Integrations page</button>.
              </p>
            </div>
          )}

          {/* ── PRODUCTION RESET (Admin only) ──────────────────────────────── */}
          {activeSection === 'backup' && currentUser?.role === 'Admin' && <BackupSection showToast={showToast} />}

          {activeSection === 'production' && currentUser?.role === 'Admin' && (
            <div className="bg-white border-2 border-red-200 rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={24} className="text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-red-700">Reset for Production</h2>
                  <p className="text-xs text-gray-500">Wipe all test data and start with a clean database. Users and integrations are preserved.</p>
                </div>
              </div>

              {/* What will be wiped vs kept */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                <div className="border border-red-200 bg-red-50/50 rounded-xl p-3">
                  <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1">
                    <Trash2 size={12} /> Will be DELETED
                  </p>
                  <ul className="text-xs text-red-600 space-y-0.5 leading-relaxed">
                    <li>• All Leads</li>
                    <li>• All Applications + Payments</li>
                    <li>• Email Campaigns + Logs</li>
                    <li>• WhatsApp / SMS / Call Logs</li>
                    <li>• Documents · Queries · Tasks</li>
                    <li>• Drip Sequences · Notifications</li>
                    <li>• Application ID counter (resets to 1)</li>
                  </ul>
                </div>
                <div className="border border-green-200 bg-green-50/50 rounded-xl p-3">
                  <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1">
                    <CheckCircle size={12} /> Will be KEPT
                  </p>
                  <ul className="text-xs text-green-600 space-y-0.5 leading-relaxed">
                    <li>• <strong>All Users</strong> (admins, counsellors)</li>
                    <li>• Integration credentials (SMTP, SMS, WhatsApp, Razorpay…)</li>
                    <li>• Admission Targets (KPI config)</li>
                    <li>• Round-robin counsellor list (counts reset to 0)</li>
                  </ul>
                </div>
              </div>

              {!prodResult ? (
                <>
                  {/* 3 checkboxes */}
                  <div className="space-y-2 mb-4">
                    {[
                      { k: 'data',         label: 'I understand all leads, applications and payment history will be permanently deleted' },
                      { k: 'settings',     label: 'I confirm users and integration settings will remain intact' },
                      { k: 'irreversible', label: 'I understand this action is irreversible — there is no undo' },
                    ].map(c => (
                      <label key={c.k} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={prodChecks[c.k]}
                          onChange={e => setProdChecks(p => ({ ...p, [c.k]: e.target.checked }))}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-300" />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Confirmation phrase */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Type <code className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">RESET FOR PRODUCTION</code> to confirm
                    </label>
                    <input
                      type="text"
                      value={prodPhrase}
                      onChange={e => setProdPhrase(e.target.value)}
                      placeholder="Type the exact phrase"
                      className={`w-full px-3 py-2 text-sm font-mono rounded-lg border-2 focus:outline-none ${phraseOk ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-300 focus:border-red-400'}`}
                    />
                  </div>

                  <button
                    onClick={handleProductionReset}
                    disabled={!allChecked || !phraseOk || prodLoading}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    {prodLoading
                      ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Wiping data...</>
                      : <><Trash2 size={16} /> Reset Now — Delete All Operational Data</>}
                  </button>
                </>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-green-700 mb-2 flex items-center gap-1.5">
                    <CheckCircle size={16} /> Reset Complete!
                  </p>
                  {prodResult.wiped && (
                    <div className="bg-white border border-green-100 rounded-lg p-3 text-xs mb-3">
                      <p className="font-semibold text-gray-600 mb-1">Records deleted:</p>
                      <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-gray-600">
                        {Object.entries(prodResult.wiped).map(([t, n]) => (
                          <div key={t}>{t}: <strong>{n}</strong></div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => { setProdResult(null); setProdPhrase(''); setProdChecks({ data: false, settings: false, irreversible: false }) }}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Reset form
                  </button>
                </div>
              )}

              {/* Alt method */}
              <details className="mt-5 border-t border-gray-100 pt-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  Alternative: run from the server terminal
                </summary>
                <div className="mt-2 bg-gray-900 text-green-300 text-xs font-mono p-3 rounded-lg overflow-x-auto">
                  sudo -u postgres psql ccrm_db -f /var/www/ccrm/server/reset_for_production.sql
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Backup Section — manual trigger + last-run status ────────────────────────
function BackupSection({ showToast }) {
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [output, setOutput]   = useState('')

  const runBackup = async () => {
    if (!confirm('Run a full backup now?\n\nThis will:\n• Dump the PostgreSQL database\n• Archive the code\n• Email summary to admin\n\nContinue?')) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/backup-now', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true })
        setOutput(data.output || '')
        showToast('✓ Backup completed successfully', 'success')
      } else {
        setResult({ ok: false, error: data.error || 'Backup failed' })
        showToast(data.error || 'Backup failed', 'error')
      }
    } catch (e) {
      setResult({ ok: false, error: e.message })
      showToast('Network error — is /usr/local/bin/ccrm-backup.sh installed on the server?', 'error')
    }
    setRunning(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <Database size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-base">Backup & Restore</h2>
          <p className="text-xs text-gray-500 mt-0.5">Database + code backup with email summary</p>
        </div>
      </div>

      {/* Schedule info */}
      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-bold text-blue-800 mb-2">📅 Scheduled Backups</h3>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• <strong>Daily at 2:00 AM</strong> (via cron — once installed)</li>
          <li>• <strong>Database:</strong> Full PostgreSQL dump, compressed (.sql.gz)</li>
          <li>• <strong>Code:</strong> Full /var/www/ccrm archive (excluding node_modules)</li>
          <li>• <strong>Retention:</strong> 14 days (older backups auto-deleted)</li>
          <li>• <strong>Location:</strong> /var/backups/ccrm/ on the server</li>
          <li>• <strong>Email summary:</strong> sent to <code className="bg-blue-100 px-1 rounded">admin@cutmap.ac.in</code></li>
        </ul>
      </div>

      {/* Manual trigger */}
      <div className="border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Run Backup Now</p>
            <p className="text-xs text-gray-500 mt-0.5">Manually trigger a backup outside the daily schedule</p>
          </div>
          <button
            onClick={runBackup}
            disabled={running}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {running ? (
              <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Backing up...</>
            ) : (
              <><Database size={14} /> Run Backup Now</>
            )}
          </button>
        </div>

        {result?.ok && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
              <CheckCircle size={14} /> Backup completed
            </p>
            {output && (
              <pre className="text-[10px] text-green-700 mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono bg-white p-2 rounded border border-green-100">
                {output}
              </pre>
            )}
          </div>
        )}
        {result && !result.ok && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-red-800">✗ {result.error}</p>
          </div>
        )}
      </div>

      {/* Setup steps */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-yellow-800 mb-2">⚙️ One-time setup (on the server)</h3>
        <pre className="text-[11px] font-mono bg-white text-yellow-900 p-3 rounded border border-yellow-100 overflow-x-auto whitespace-pre">
{`# 1. Copy backup script
sudo cp /opt/npf_crm/server/backup.sh /usr/local/bin/ccrm-backup.sh
sudo chmod +x /usr/local/bin/ccrm-backup.sh

# 2. Schedule daily at 2 AM via cron
sudo crontab -e
# Add:
0 2 * * * /usr/local/bin/ccrm-backup.sh >> /var/log/ccrm-backup.log 2>&1

# 3. Test manually (run as root)
sudo /usr/local/bin/ccrm-backup.sh`}
        </pre>
      </div>
    </div>
  )
}
