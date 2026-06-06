import React, { useState, useEffect } from 'react'
import { useCcrm } from '../context/CcrmContext'
import { Phone, Save, AlertCircle, CheckCircle } from 'lucide-react'

export default function IntegrationSettings() {
  const { currentUser, showToast } = useCcrm()
  const [easyGoConfig, setEasyGoConfig] = useState({
    email: '',
    passwordHash: '',
    did: ''
  })
  const [counselorExtension, setCounselorExtension] = useState('')
  const [configLoading, setConfigLoading] = useState(false)
  const [fetchingConfig, setFetchingConfig] = useState(true)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem('ccrm_auth_token')
      const res = await fetch('/api/integrations/messaging-provider/calling', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.configured) {
          setEasyGoConfig(prev => ({
            ...prev,
            email: data.email || '',
            did: data.did || ''
          }))
        }
      }
    } catch (e) {
      console.error('Failed to fetch config:', e)
    } finally {
      setFetchingConfig(false)
    }
  }

  const handleSaveConfig = async (e) => {
    e.preventDefault()
    if (!easyGoConfig.email || !easyGoConfig.passwordHash || !easyGoConfig.did) {
      return showToast('All fields are required.', 'error')
    }

    setConfigLoading(true)
    try {
      const token = localStorage.getItem('ccrm_auth_token')
      const res = await fetch('/api/integrations/messaging-provider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          provider: 'easygoivr',
          config: easyGoConfig
        })
      })

      if (res.ok) {
        showToast('EasyGoIVR configured and tested successfully!', 'success')
        // Clear password from form
        setEasyGoConfig(prev => ({ ...prev, passwordHash: '' }))
      } else {
        const err = await res.json()
        showToast(err.error || 'Configuration failed', 'error')
      }
    } catch (e) {
      showToast(e.message || 'Configuration failed', 'error')
    } finally {
      setConfigLoading(false)
    }
  }

  if (currentUser?.role !== 'Admin') {
    return (
      <div className="p-6 bg-red-50 rounded-xl border border-red-200 m-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="text-red-600" />
          <span className="text-red-800">Admin access required.</span>
        </div>
      </div>
    )
  }

  if (fetchingConfig) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Loading configuration...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <Phone className="text-primary-500" size={24} />
          <h2 className="text-2xl font-bold text-gray-900">EasyGoIVR Configuration</h2>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              EasyGoIVR Email (Username)
            </label>
            <input
              type="email"
              value={easyGoConfig.email}
              onChange={e => setEasyGoConfig(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="admin@truckmitr.com"
            />
            <p className="text-xs text-gray-500 mt-1">Account email from EasyGoIVR dashboard</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password Hash
            </label>
            <input
              type="password"
              value={easyGoConfig.passwordHash}
              onChange={e => setEasyGoConfig(prev => ({ ...prev, passwordHash: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Enter password hash"
            />
            <p className="text-xs text-gray-500 mt-1">Password from EasyGoIVR account</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              DID (Direct Inward Dial)
            </label>
            <input
              type="text"
              value={easyGoConfig.did}
              onChange={e => setEasyGoConfig(prev => ({ ...prev, did: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="8065573687"
            />
            <p className="text-xs text-gray-500 mt-1">The phone number shown to the recipient</p>
          </div>

          <button
            type="submit"
            disabled={configLoading}
            className="w-full bg-primary-600 text-white font-semibold py-2.5 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {configLoading ? 'Testing & Saving...' : 'Save & Test Configuration'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <CheckCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-blue-800">
              <p className="font-semibold">What happens after configuration?</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Click-to-call will be available in Lead Manager</li>
                <li>Call history will be tracked automatically</li>
                <li>Counselors can initiate calls directly from lead details</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
