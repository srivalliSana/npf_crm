import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, AlertCircle, CheckCircle2, Clock, FileText, DollarSign, Award, Loader } from 'lucide-react'

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [app, setApp] = useState(null)
  const [paying, setPaying] = useState(null)

  useEffect(() => {
    fetchApplicationData()
  }, [])

  const fetchApplicationData = async () => {
    try {
      const token = localStorage.getItem('student_token')
      if (!token) {
        navigate('/student-login')
        return
      }

      const res = await fetch('/api/student-portal', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!res.ok) {
        if (res.status === 401) navigate('/student-login')
        throw new Error('Failed to fetch application data')
      }

      const data = await res.json()
      setApp(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePayFee = async (feeType) => {
    if (!app) return

    setPaying(feeType)
    const token = localStorage.getItem('student_token')

    try {
      let amount = 0
      if (feeType === 'application') amount = app.application_fee_amount
      else if (feeType === 'registration') amount = app.registration_fee_amount
      else if (feeType === 'tuition') amount = app.tuition_fee_amount

      if (amount <= 0) {
        alert('Fee amount not configured')
        return
      }

      // In production, integrate with Razorpay or payment gateway
      // For now, show confirmation
      const confirmed = confirm(`Pay ₹${amount} for ${feeType} fee?`)
      if (!confirmed) return

      // Call payment endpoint
      const res = await fetch(`/api/applications/${app.id}/pay-fee`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          feeType,
          amount,
          transactionId: `TXN${Date.now()}`
        })
      })

      if (res.ok) {
        alert(`✅ ${feeType} fee paid successfully!`)
        fetchApplicationData()
      } else {
        const data = await res.json()
        alert(`❌ Error: ${data.error}`)
      }
    } catch (err) {
      alert(`Payment failed: ${err.message}`)
    } finally {
      setPaying(null)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('student_token')
    localStorage.removeItem('student_app_id')
    localStorage.removeItem('student_name')
    navigate('/student-login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="text-center">
          <Loader size={48} className="animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-700">Loading your application...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-lg">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  if (!app) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📚 Student Portal</h1>
            <p className="text-sm text-gray-600">Welcome, {app.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Application Info */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={24} className="text-blue-600" />
            Your Application
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="font-semibold text-gray-900">{app.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-semibold text-gray-900">{app.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Mobile</p>
              <p className="font-semibold text-gray-900">{app.mobile}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Application #</p>
              <p className="font-semibold text-gray-900">{app.app_no}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Course</p>
              <p className="font-semibold text-gray-900">{app.course}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Campus</p>
              <p className="font-semibold text-gray-900">{app.campus}</p>
            </div>
          </div>
        </div>

        {/* Admission Number */}
        {app.admission_number && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 p-6 mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Award size={24} className="text-green-600" />
              Your Admission Number
            </h3>
            <p className="text-4xl font-bold text-green-600">{app.admission_number}</p>
            {app.admission_number_generated_at && (
              <p className="text-sm text-gray-600 mt-2">
                Generated on {new Date(app.admission_number_generated_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Fee Payment Section */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <DollarSign size={24} className="text-purple-600" />
            Fee Payment Status
          </h2>

          <div className="space-y-4">
            {/* Application Fee */}
            <div className="border rounded-lg p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Application Fee</h3>
                  <p className="text-sm text-gray-600">Pay to submit your application</p>
                </div>
                {app.application_fee_paid ? (
                  <CheckCircle2 size={24} className="text-green-600" />
                ) : (
                  <Clock size={24} className="text-yellow-600" />
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900">₹{app.application_fee_amount}</p>
                  <p className="text-xs text-gray-500">
                    {app.application_fee_paid
                      ? `Paid on ${new Date(app.application_fee_paid_at).toLocaleDateString()}`
                      : 'Not paid'}
                  </p>
                </div>
                {!app.application_fee_paid && (
                  <button
                    onClick={() => handlePayFee('application')}
                    disabled={paying === 'application'}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {paying === 'application' ? <Loader size={16} className="animate-spin" /> : '💳'}
                    {paying === 'application' ? 'Processing...' : 'Pay Now'}
                  </button>
                )}
              </div>
            </div>

            {/* Registration Fee */}
            <div className={`border rounded-lg p-4 hover:shadow-md transition ${!app.application_fee_paid ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Registration Fee</h3>
                  <p className="text-sm text-gray-600">
                    {!app.application_fee_paid
                      ? '(Pay application fee first)'
                      : 'Lock in your admission'}
                  </p>
                </div>
                {app.registration_fee_paid ? (
                  <CheckCircle2 size={24} className="text-green-600" />
                ) : (
                  <Clock size={24} className="text-yellow-600" />
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900">₹{app.registration_fee_amount}</p>
                  <p className="text-xs text-gray-500">
                    {app.registration_fee_paid
                      ? `Paid on ${new Date(app.registration_fee_paid_at).toLocaleDateString()}`
                      : 'Not paid'}
                  </p>
                </div>
                {!app.registration_fee_paid && app.application_fee_paid && (
                  <button
                    onClick={() => handlePayFee('registration')}
                    disabled={paying === 'registration'}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {paying === 'registration' ? <Loader size={16} className="animate-spin" /> : '💳'}
                    {paying === 'registration' ? 'Processing...' : 'Pay Now'}
                  </button>
                )}
              </div>
            </div>

            {/* Tuition Fee */}
            <div className={`border rounded-lg p-4 hover:shadow-md transition ${!app.registration_fee_paid ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Tuition Fee</h3>
                  <p className="text-sm text-gray-600">
                    {!app.registration_fee_paid
                      ? '(Pay registration fee first)'
                      : 'Complete your enrollment'}
                  </p>
                </div>
                {app.tuition_fee_paid ? (
                  <CheckCircle2 size={24} className="text-green-600" />
                ) : (
                  <Clock size={24} className="text-yellow-600" />
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900">₹{app.tuition_fee_amount}</p>
                  <p className="text-xs text-gray-500">
                    {app.tuition_fee_paid
                      ? `Paid on ${new Date(app.tuition_fee_paid_at).toLocaleDateString()}`
                      : 'Not paid'}
                  </p>
                </div>
                {!app.tuition_fee_paid && app.registration_fee_paid && (
                  <button
                    onClick={() => handlePayFee('tuition')}
                    disabled={paying === 'tuition'}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {paying === 'tuition' ? <Loader size={16} className="animate-spin" /> : '💳'}
                    {paying === 'tuition' ? 'Processing...' : 'Pay Now'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-8">
            <h3 className="font-semibold text-gray-900 mb-3">Overall Progress</h3>
            <div className="flex gap-3">
              {[
                { label: 'App Fee', paid: app.application_fee_paid },
                { label: 'Reg Fee', paid: app.registration_fee_paid },
                { label: 'Tuition', paid: app.tuition_fee_paid }
              ].map((item, idx) => (
                <div key={idx} className="flex-1">
                  <div className={`h-3 rounded-full ${item.paid ? 'bg-green-500' : 'bg-gray-300'} transition`}></div>
                  <p className="text-xs text-gray-600 mt-1 text-center">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary */}
        {app.application_fee_paid && app.registration_fee_paid && app.tuition_fee_paid && (
          <div className="mt-8 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200 p-6 text-center">
            <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-green-900 mb-2">🎉 Admission Complete!</h3>
            <p className="text-green-800">
              All fees paid. Your admission number is <strong>{app.admission_number}</strong>
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
