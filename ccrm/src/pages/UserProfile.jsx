import React, { useState, useEffect } from 'react'
import { Phone, Mail, User, Save, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function UserProfile() {
  const { currentUser, showToast } = useCcrm()
  const [profile, setProfile] = useState(null)
  const [mobileNumber, setMobileNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [currentUser])

  const loadProfile = async () => {
    if (!currentUser?.id) return
    try {
      const token = localStorage.getItem('ccrm_token')
      const headers = { 'Authorization': `Bearer ${token}` }
      const res = await fetch(`/api/users/${currentUser.id}/profile`, { headers })
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        setMobileNumber(data.mobile_number || '')
      }
    } catch (err) {
      console.error('Failed to load profile:', err)
      showToast('Failed to load profile', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!mobileNumber.trim()) {
      return showToast('Mobile number is required', 'error')
    }
    setSaving(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      const res = await fetch(`/api/users/${currentUser.id}/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ mobile_number: mobileNumber })
      })
      if (res.ok) {
        await loadProfile()
        showToast('Profile updated successfully', 'success')
      } else {
        const err = await res.json()
        showToast(err.error || 'Failed to update profile', 'error')
      }
    } catch (err) {
      console.error('Failed to save profile:', err)
      showToast('Failed to save profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-gray-500">Loading profile...</p>
      </div>
    )
  }

  const isCounselor = currentUser?.role === 'Counselor'

  return (
    <div className="p-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">My Profile</h1>
        <p className="text-gray-500 mb-6">Manage your account settings and contact information</p>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* Basic Info */}
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Account Information</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Name</label>
                <div className="mt-1 p-3 bg-gray-50 rounded-lg flex items-center gap-2">
                  <User size={18} className="text-gray-400" />
                  <span className="text-gray-900">{profile?.name}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Email</label>
                <div className="mt-1 p-3 bg-gray-50 rounded-lg flex items-center gap-2">
                  <Mail size={18} className="text-gray-400" />
                  <span className="text-gray-900">{profile?.email}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Role</label>
                <div className="mt-1">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    currentUser?.role === 'Admin' ? 'bg-red-100 text-red-700' :
                    currentUser?.role === 'Manager' ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {currentUser?.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Number (Required for Counselors) */}
          <div className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <Phone size={18} className={isCounselor ? 'text-orange-500' : 'text-gray-400'} />
              <div>
                <h3 className="font-semibold text-gray-800">Mobile Number</h3>
                {isCounselor && (
                  <p className="text-xs text-orange-600 mt-1">
                    Required for WhatsApp and calling functionality
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder={isCounselor ? "+91 XXXXXXXXXX (required)" : "+91 XXXXXXXXXX"}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-transparent"
              />
              <p className="text-xs text-gray-500">
                Format: +91 followed by 10 digits (e.g., +91 98765 43210)
              </p>

              {!mobileNumber && isCounselor && (
                <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <AlertCircle size={16} className="text-orange-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-orange-700">
                    Update your mobile number to enable calling features for your assigned leads.
                  </p>
                </div>
              )}

              {mobileNumber && (
                <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-700">
                    Your mobile number is ready for WhatsApp and calling.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
