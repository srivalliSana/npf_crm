import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { AlertCircle, Loader } from 'lucide-react'
import { getUrlTenantSlug } from '../tenantSlug'

const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const isGoogleConfigured = rawClientId && rawClientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE'

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

// Google sign-in only — there's no password to set, reset, forget or leak
// for a student identity. Signing in just proves the visitor owns the same
// email address their application is under.
export default function StudentLogin() {
  const navigate = useNavigate()
  const tenantSlug = getUrlTenantSlug()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true)
      setError('')
      try {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        })
        const profile = await profileRes.json()
        const res = await fetch('/api/student-login/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: profile.email || '', tenantSlug })
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Google sign-in failed.'); return }

        localStorage.setItem('student_token', data.token)
        localStorage.setItem('student_app_id', data.application.id)
        localStorage.setItem('student_name', data.application.name)
        navigate('/student-dashboard')
      } catch {
        setError('Google sign-in failed. Please try again.')
      } finally {
        setGoogleLoading(false)
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed.')
      setGoogleLoading(false)
    }
  })

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-500 rounded-2xl mb-4 shadow-card">
            <span className="text-white text-lg font-extrabold tracking-tight">CU</span>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Student Portal</h1>
          <p className="text-gray-500 mt-2">Pay fees and upload documents, whenever you're ready</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-8">
          {error && (
            <div className="mb-6 p-4 bg-danger-50 border border-danger-100 rounded-xl flex gap-3">
              <AlertCircle size={20} className="text-danger-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-danger-700">Sign-in failed</p>
                <p className="text-sm text-danger-700">{error}</p>
              </div>
            </div>
          )}

          {isGoogleConfigured ? (
            <button
              type="button"
              onClick={() => { setError(''); googleLogin() }}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 shadow-soft"
            >
              {googleLoading ? <Loader size={18} className="animate-spin text-gray-400" /> : <GoogleIcon />}
              {googleLoading ? 'Signing in...' : 'Continue with Google'}
            </button>
          ) : (
            <p className="text-sm text-warning-700 bg-warning-50 border border-warning-100 rounded-xl p-4 text-center">
              Google sign-in isn't configured yet. Please contact admissions.
            </p>
          )}

          <div className="mt-8 pt-6 border-t border-gray-100">
            <div className="bg-primary-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-primary-700">
                Sign in with the same Google account / email address your application is under — no password needed.
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">
                Need help? Contact <a href="mailto:admissions@centurionuniversity.edu" className="text-primary-600 font-semibold hover:underline">admissions@centurionuniversity.edu</a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-400">
          <p>© 2026 Centurion University. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
