import React, { useState } from 'react'
import { CreditCard, Mail, Loader } from 'lucide-react'
import { Modal } from './ui'

export default function PaymentMethodModal({ isOpen, onClose, app, onConfirm }) {
  const [method, setMethod] = useState(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (!method) {
      setError('Please select a payment method')
      return
    }

    if (method === 'online') {
      // Send email with application form link
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
            customMessage: 'Please fill your admission details to proceed with the application.'
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
      // Offline payment - no email needed
      onConfirm(method, null)
      onClose()
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className="p-6 max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Method</h2>
        <p className="text-gray-600 mb-6">How would {app?.name} like to pay?</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-6">
          {/* Online Payment */}
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
              <CreditCard size={24} className={method === 'online' ? 'text-indigo-600' : 'text-gray-600'} />
              <div>
                <p className="font-semibold text-gray-900">Online Payment</p>
                <p className="text-sm text-gray-600">Pay via Razorpay or card</p>
              </div>
            </div>
          </button>

          {/* Offline Payment */}
          <button
            onClick={() => {
              setMethod('offline')
              setError('')
            }}
            className={`w-full p-4 rounded-lg border-2 text-left transition ${
              method === 'offline'
                ? 'border-green-600 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <CreditCard size={24} className={method === 'offline' ? 'text-green-600' : 'text-gray-600'} />
              <div>
                <p className="font-semibold text-gray-900">Offline Payment</p>
                <p className="text-sm text-gray-600">Bank transfer or cheque</p>
              </div>
            </div>
          </button>
        </div>

        {method === 'online' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900 flex items-center gap-2">
              <Mail size={16} />
              Email with application form link will be sent
            </p>
          </div>
        )}

        {method === 'offline' && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-900">
              Student details will be saved for offline payment tracking
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
            {sendingEmail ? 'Sending...' : 'Confirm'}
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
