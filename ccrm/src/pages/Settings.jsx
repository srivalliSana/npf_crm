import React, { useState } from 'react'
import { useCcrm } from '../context/CcrmContext'
import {
  Settings as SettingsIcon, Bell, Shield, Globe, Palette,
  Database, Link, Mail, MessageSquare, Phone, Save, ChevronRight,
  User, Building, Key, Eye, EyeOff, CheckCircle
} from 'lucide-react'

const SECTIONS = [
  { id: 'profile',       label: 'Profile Settings',      icon: User       },
  { id: 'organization',  label: 'Organization',           icon: Building   },
  { id: 'notifications', label: 'Notifications',          icon: Bell       },
  { id: 'security',      label: 'Security & Access',      icon: Shield     },
  { id: 'integrations',  label: 'Integrations',           icon: Link       },
]

const INTEGRATIONS = [
  { name: 'Facebook Ads',    status: 'Connected',    icon: '📘', desc: 'Lead generation from Facebook campaigns' },
  { name: 'Google Ads',      status: 'Connected',    icon: '🔍', desc: 'Lead capture from Google search ads' },
  { name: 'LinkedIn',        status: 'Disconnected', icon: '💼', desc: 'Professional network lead generation' },
  { name: 'WhatsApp Business',status:'Connected',    icon: '💬', desc: 'Automated WhatsApp communication' },
  { name: 'Razorpay',        status: 'Connected',    icon: '💳', desc: 'Online payment gateway' },
  { name: 'PayU',            status: 'Disconnected', icon: '💰', desc: 'Alternative payment gateway' },
  { name: 'Ameyo (Telephony)',status:'Connected',    icon: '📞', desc: 'Cloud telephony & call recording' },
  { name: 'Gmail',           status: 'Connected',    icon: '📧', desc: 'Email communication' },
]

export default function Settings() {
  const { currentUser, updateUser, showToast } = useCcrm()
  const [activeSection, setActiveSection] = useState('profile')
  const [saved, setSaved] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const initialName = currentUser?.name || 'User'
  const first = initialName.split(' ')[0] || ''
  const last = initialName.split(' ').slice(1).join(' ') || ''
  
  const [profileForm, setProfileForm] = useState({
    firstName: first,
    lastName: last,
    email: currentUser?.email || '',
    phone: currentUser?.phone || '+91 9876543210',
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
        phone: profileForm.phone,
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
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors focus:outline-none ${activeSection === s.id ? 'bg-primary-50 text-primary-600 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
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
              <h2 className="font-semibold text-gray-800 mb-4">Third-Party Integrations</h2>
              <div className="grid grid-cols-1 gap-3">
                {INTEGRATIONS.map(intg => (
                  <div key={intg.name} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{intg.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{intg.name}</p>
                        <p className="text-xs text-gray-500">{intg.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`badge ${intg.status === 'Connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {intg.status}
                      </span>
                      <button onClick={() => showToast(`${intg.name} webhook simulation triggered.`, 'info')} className={`text-xs px-3 py-1 rounded-lg border transition-colors focus:outline-none ${intg.status === 'Connected' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-primary-200 text-primary-600 hover:bg-primary-50'}`}>
                        {intg.status === 'Connected' ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
