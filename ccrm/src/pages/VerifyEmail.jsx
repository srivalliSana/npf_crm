import React, { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { GraduationCap, ShieldCheck, CheckCircle, AlertCircle, Mail } from 'lucide-react'

export default function VerifyEmail() {
  const params = useParams()
  const [search] = useSearchParams()
  const [appNo, setAppNo] = useState(params.appNo || search.get('appNo') || '')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!appNo.trim() || !otp.trim()) return setError('Enter your Admission Number and the OTP from your email.')
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/public/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appNo: appNo.trim(), otp: otp.trim() })
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Verification failed.')
      else setVerified(true)
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  const resend = async () => {
    if (!appNo.trim()) return setError('Enter your Admission Number first.')
    setError('')
    setResending(true)
    try {
      const res = await fetch('/api/public/resend-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appNo: appNo.trim() })
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Could not resend OTP.')
    } catch {
      setError('Network error. Please try again.')
    }
    setResending(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-primary-900">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold">CUTM Admissions</div>
            <div className="text-slate-400 text-xs">Verify your email to continue</div>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-12">
        {verified ? (
          <div className="bg-white rounded-2xl p-8 shadow-xl text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-emerald-500" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">Email Verified</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              You're all set. We've emailed you a secure link to upload your required documents —
              check your inbox (and spam folder) for a message titled "Upload your documents".
            </p>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={22} className="text-primary-300" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2 text-center">Verify Your Email</h1>
            <p className="text-slate-300 text-sm text-center mb-6">
              Enter the 6-digit OTP we emailed you after your payment was received.
            </p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Admission Number</label>
                <input
                  type="text" value={appNo} onChange={e => setAppNo(e.target.value)}
                  placeholder="e.g. CUEEAP261234"
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Email OTP</label>
                <input
                  type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code" maxLength={6}
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-slate-400 rounded-xl px-4 py-3 text-sm tracking-[0.4em] text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/40 text-red-200 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full bg-primary-500 hover:bg-primary-400 disabled:bg-primary-800 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition"
              >
                {loading ? <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : <ShieldCheck size={18} />}
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>

              <button
                type="button" onClick={resend} disabled={resending}
                className="w-full text-slate-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 py-1 disabled:opacity-50"
              >
                <Mail size={13} /> {resending ? 'Resending...' : "Didn't get the OTP? Resend"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
