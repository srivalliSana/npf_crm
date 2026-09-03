import React, { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, AlertCircle, Search } from 'lucide-react'
import PageContainer from '../components/PageContainer'
import { Card } from '../components/ui'

export default function FinanceVerification() {
  const [verifications, setVerifications] = useState([])
  const [selectedVerif, setSelectedVerif] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    appFeeVerified: false,
    bookingFeeVerified: false,
    fullCourseFeeVerified: false,
    status: 'Pending'
  })

  useEffect(() => {
    fetchVerifications()
  }, [])

  const fetchVerifications = async () => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/finance-verifications', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setVerifications(await res.json())
    } catch (e) {
      console.error('Failed to fetch finance verifications:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectVerif = (verif) => {
    setSelectedVerif(verif)
    setFormData({
      appFeeVerified: verif.application_fee_verified,
      bookingFeeVerified: verif.booking_fee_verified,
      fullCourseFeeVerified: verif.full_course_fee_verified,
      status: verif.status
    })
    setShowModal(true)
  }

  const handleSaveVerification = async () => {
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/finance-verifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          app_id: selectedVerif.app_id,
          appFeeVerified: formData.appFeeVerified,
          bookingFeeVerified: formData.bookingFeeVerified,
          fullCourseFeeVerified: formData.fullCourseFeeVerified,
          status: formData.status
        })
      })

      if (res.ok) {
        alert('Finance verification saved successfully')
        setShowModal(false)
        fetchVerifications()
      } else {
        alert('Failed to save verification')
      }
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  const filteredVerifs = verifications.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.app_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusColor = (status) => {
    switch (status) {
      case 'Verified': return 'bg-green-100 text-green-800'
      case 'Rejected': return 'bg-red-100 text-red-800'
      default: return 'bg-yellow-100 text-yellow-800'
    }
  }

  const getPendingCount = () => verifications.filter(v => v.status === 'Pending').length

  if (loading) return <PageContainer><p>Loading...</p></PageContainer>

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Finance Verification</h1>
        <p className="text-gray-600 mt-2">Verify application fees, booking fees, and full course fees</p>
        <div className="mt-4 inline-block px-4 py-2 bg-blue-100 text-blue-800 rounded-lg font-semibold">
          {getPendingCount()} Pending Verifications
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-4 p-4 bg-gray-50 rounded-lg">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or application ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>

        {filteredVerifs.length === 0 ? (
          <p className="text-center py-12 text-gray-500">No verifications to display</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Applicant</th>
                  <th className="text-center px-4 py-3 font-semibold">App Fee</th>
                  <th className="text-center px-4 py-3 font-semibold">Booking Fee</th>
                  <th className="text-center px-4 py-3 font-semibold">Course Fee</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-center px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredVerifs.map(verif => (
                  <tr key={verif.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{verif.name}</div>
                      <div className="text-xs text-gray-500">{verif.app_no}</div>
                    </td>
                    <td className="text-center px-4 py-3">
                      {verif.application_fee_verified ? (
                        <CheckCircle2 size={18} className="text-green-600 mx-auto" />
                      ) : (
                        <XCircle size={18} className="text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="text-center px-4 py-3">
                      {verif.booking_fee_verified ? (
                        <CheckCircle2 size={18} className="text-green-600 mx-auto" />
                      ) : (
                        <XCircle size={18} className="text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="text-center px-4 py-3">
                      {verif.full_course_fee_verified ? (
                        <CheckCircle2 size={18} className="text-green-600 mx-auto" />
                      ) : (
                        <XCircle size={18} className="text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(verif.status)}`}>
                        {verif.status}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <button
                        onClick={() => handleSelectVerif(verif)}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal */}
      {showModal && selectedVerif && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedVerif.name}</h2>
                <p className="text-sm text-gray-600">{selectedVerif.app_no}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Fee Verification Checklist</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.appFeeVerified}
                      onChange={(e) => setFormData(p => ({ ...p, appFeeVerified: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Application Fee Verified</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.bookingFeeVerified}
                      onChange={(e) => setFormData(p => ({ ...p, bookingFeeVerified: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Booking Fee Verified</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.fullCourseFeeVerified}
                      onChange={(e) => setFormData(p => ({ ...p, fullCourseFeeVerified: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Full Course Fee Verified</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Verification Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(p => ({ ...p, status: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Pending">Pending</option>
                  <option value="Verified">Verified</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVerification}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Verification
              </button>
            </div>
          </Card>
        </div>
      )}
    </PageContainer>
  )
}
