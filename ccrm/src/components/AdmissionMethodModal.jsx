import React, { useState } from 'react'
import { FileText, Mail, Loader } from 'lucide-react'
import { Modal } from './ui'

export default function AdmissionMethodModal({ isOpen, onClose, app, onConfirm }) {
  const [method, setMethod] = useState(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (!method) {
      setError('Please select a method')
      return
    }

    if (method === 'online') {
      // Send email with admission details form link
      setSendingEmail(true)
      setError('')

      try {
        const token = localStorage.getItem('ccrm_token')
        const res = await fetch('/api/send-template-email', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            app_id: app.id,
            template_type: 'admission_details',
            amount: 0,
            customMessage: 'Please fill your admission details to complete your application.'
          })
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'Failed to send email')
          setSendingEmail(false)
          return
        }

        onConfirm(method, data.token)
        onClose()
      } catch (err) {
        setError(err.message)
        setSendingEmail(false)
      }
    } else {
      // Manual entry - counselor fills the form
      onConfirm(method, null)
      onClose()
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className="p-6 max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Fill Admission Details</h2>
        <p className="text-gray-600 mb-6">How should {app?.name} fill their admission details?</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-6">
          {/* Manual Entry */}
          <button
            onClick={() => {
              setMethod('manual')
              setError('')
            }}
            className={`w-full p-4 rounded-lg border-2 text-left transition ${
              method === 'manual'
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileText size={24} className={method === 'manual' ? 'text-blue-600' : 'text-gray-600'} />
              <div>
                <p className="font-semibold text-gray-900">Manual Entry</p>
                <p className="text-sm text-gray-600">You fill the details in the form</p>
              </div>
            </div>
          </button>

          {/* Online Form Link */}
          <button
            onClick={() => {
              setMethod('online')
              setError('')
            }}
            className={`w-full p-4 rounded-lg border-2 text-left transition ${
              method === 'online'
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-gray-200 hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Mail size={24} className={method === 'online' ? 'text-indigo-600' : 'text-gray-600'} />
              <div>
                <p className="font-semibold text-gray-900">Online Form</p>
                <p className="text-sm text-gray-600">Student fills via email link</p>
              </div>
            </div>
          </button>
        </div>

        {method === 'manual' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              You'll open the form to enter student's personal and academic details.
            </p>
          </div>
        )}

        {method === 'online' && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p className="text-sm text-indigo-900 flex items-center gap-2">
              <Mail size={16} />
              Secure email with form link will be sent to the student
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={!method || sendingEmail}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            {sendingEmail ? <Loader size={16} className="animate-spin" /> : '✓'}
            {sendingEmail ? 'Sending...' : 'Proceed'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
