import React, { useState, useEffect } from 'react'
import { Phone, PhoneOff, History, AlertCircle } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

export default function ClickToCall({ lead, counselorExtension }) {
  const { initiateCall, getCallHistory, showToast, currentUser } = useCcrm()
  const [callHistory, setCallHistory] = useState([])
  const [calling, setCalling] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadCallHistory = async () => {
    if (!lead?.id) return
    setLoadingHistory(true)
    const history = await getCallHistory(lead.id)
    setCallHistory(history || [])
    setLoadingHistory(false)
  }

  const handleClickToCall = async () => {
    if (!lead?.mobile) {
      return showToast('No phone number for this lead', 'error')
    }
    if (!counselorExtension) {
      return showToast('Please set your extension in Profile Settings', 'error')
    }

    setCalling(true)
    const result = await initiateCall(lead.id, lead.mobile, counselorExtension)
    setCalling(false)

    if (result?.success) {
      showToast(`Call initiated to ${lead.mobile}`, 'success')
      // Reload history after a few seconds
      setTimeout(loadCallHistory, 3000)
    }
  }

  return (
    <div className="space-y-3">
      {/* Click-to-Call Button */}
      <button
        onClick={handleClickToCall}
        disabled={calling || !lead?.mobile}
        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
      >
        <Phone size={18} />
        {calling ? 'Initiating call...' : 'Click to Call'}
      </button>

      {/* Call History Toggle */}
      <button
        onClick={() => {
          setShowHistory(!showHistory)
          if (!showHistory) loadCallHistory()
        }}
        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition"
      >
        <History size={16} />
        {showHistory ? 'Hide Call History' : 'View Call History'}
      </button>

      {/* Call History List */}
      {showHistory && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          {loadingHistory ? (
            <p className="text-gray-500 text-sm">Loading call history...</p>
          ) : callHistory.length === 0 ? (
            <p className="text-gray-500 text-sm">No calls yet</p>
          ) : (
            <div className="space-y-3">
              {callHistory.map((call) => (
                <div key={call.id} className="bg-white p-3 rounded border border-gray-200 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-900">{call.phone_number}</p>
                      <p className="text-xs text-gray-500">
                        From: {call.caller_extension} | By: {call.initiated_by}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      call.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : call.status === 'initiated'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {call.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    {call.call_duration ? `Duration: ${call.call_duration}s` : 'In progress'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(call.initiated_at).toLocaleString('en-IN')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Note for non-configured accounts */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-3">
        <AlertCircle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-800">
          Ensure EasyGoIVR is configured in Integration Settings and your extension is set in your Profile.
        </p>
      </div>
    </div>
  )
}
