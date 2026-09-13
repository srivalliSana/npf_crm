import React from 'react'

// ── Post-Admission Panel — email OTP → doc upload link → semester fee → ERP ──
// Extracted verbatim from ApplicationDetails.jsx (no behavior change) as
// part of the Campus One Neo restructure, so the layout change and this
// extraction are independently verifiable.
function PostAdmissionPanel({ application: app, currentUser, showToast, fetchAllData, generatePaymentLink }) {
  const [resending, setResending] = React.useState(false)
  const [unlocking, setUnlocking] = React.useState(false)
  const [genSemLink, setGenSemLink] = React.useState(false)
  const isAdminOrManager = ['Admin', 'Manager'].includes(currentUser?.role) || currentUser?.isSuperAdmin
  const authHeaders = () => {
    const token = localStorage.getItem('ccrm_token')
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }

  const resendOtp = async () => {
    setResending(true)
    try {
      const res = await fetch('/api/public/resend-email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appNo: app.appNo })
      })
      const d = await res.json()
      showToast(res.ok ? 'OTP resent to student\'s email' : (d.error || 'Failed to resend OTP'), res.ok ? 'success' : 'error')
    } catch { showToast('Network error.', 'error') }
    setResending(false)
  }

  const unlockSemesterFee = async () => {
    setUnlocking(true)
    try {
      const res = await fetch(`/api/applications/${app.id}/unlock-semester-fee`, { method: 'POST', headers: authHeaders() })
      const d = await res.json()
      if (res.ok) { showToast('Semester fee unlocked for the student.', 'success'); fetchAllData() }
      else showToast(d.error || 'Failed to unlock.', 'error')
    } catch { showToast('Network error.', 'error') }
    setUnlocking(false)
  }

  const generateSemesterFeeLink = async () => {
    setGenSemLink(true)
    try {
      const res = await fetch(`/api/applications/${app.id}/generate-semester-fee`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ amount: 45000 })
      })
      const payRec = await res.json()
      if (!res.ok) { showToast(payRec.error || 'Failed to create semester-fee payment.', 'error'); setGenSemLink(false); return }
      await generatePaymentLink(app.appNo, app.name, app.email, app.mobile, 45000, payRec.id)
      fetchAllData()
    } catch { showToast('Network error.', 'error') }
    setGenSemLink(false)
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
      <p className="text-xs text-gray-400 font-medium mb-1">Post-Admission</p>

      {/* Email verification */}
      {app.emailVerified ? (
        <div className="text-center text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 font-semibold">
          ✅ Email Verified
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex-1 text-center text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg py-1.5 font-semibold">
            ⏳ Awaiting Email OTP Verification
          </div>
          <button onClick={resendOtp} disabled={resending}
            className="text-xs px-2.5 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 whitespace-nowrap">
            {resending ? '...' : '↻ Resend'}
          </button>
        </div>
      )}

      {/* Semester fee */}
      {app.semesterFeeStatus === 'Locked' && (
        isAdminOrManager ? (
          <button onClick={unlockSemesterFee} disabled={unlocking || !app.emailVerified}
            title={!app.emailVerified ? 'Student must verify their email first' : 'Unlock once required documents are verified'}
            className="w-full text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 font-semibold py-1.5 rounded-lg">
            🔒 Unlock Semester Fee
          </button>
        ) : (
          <div className="text-center text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg py-1.5 font-semibold">
            🔒 Semester Fee Locked
          </div>
        )
      )}
      {app.semesterFeeStatus === 'Pending' && (
        <button onClick={generateSemesterFeeLink} disabled={genSemLink}
          className="w-full text-xs bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5">
          {genSemLink ? <span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" /> : '💰'}
          Generate Semester Fee Link
        </button>
      )}
      {app.semesterFeeStatus === 'Payment Done' && (
        <div className="text-center text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg py-1.5 font-semibold">
          🧾 Semester Fee — Pending Approval
        </div>
      )}
      {app.semesterFeeStatus === 'Paid' && (
        <div className="text-center text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 font-semibold">
          ✅ Semester Fee Paid
        </div>
      )}

      {/* ERP access */}
      {app.erpAccessGranted && (
        <div className="text-center text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg py-1.5 font-semibold">
          🎓 ERP Access Granted
        </div>
      )}
    </div>
  )
}
export default PostAdmissionPanel
