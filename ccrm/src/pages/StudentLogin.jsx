import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { Mail, Lock, AlertCircle, Loader } from 'lucide-react'
import { getUrlTenantSlug } from '../tenantSlug'

const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const isGoogleConfigured = rawClientId && rawClientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export default function StudentLogin() {
  const navigate = useNavigate()
  const tenantSlug = getUrlTenantSlug()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const enterPortal = (data) => {
    localStorage.setItem('student_token', data.token)
    localStorage.setItem('student_app_id', data.application.id)
    localStorage.setItem('student_name', data.application.name)
    navigate('/student-dashboard')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantSlug })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      enterPortal(data)
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Google only confirms identity — the account itself must already exist
  // from the admissions process, so this can't create one the way staff
  // Google sign-in does.
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
        enterPortal(data)
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg mb-4">
            <span className="text-white text-2xl font-bold">📚</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Student Portal</h1>
          <p className="text-gray-600 mt-2">Pay fees and upload documents, whenever you're ready</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-900">Sign-in failed</p>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {isGoogleConfigured && (
            <>
              <button
                type="button"
                onClick={() => { setError(''); googleLogin() }}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {googleLoading ? <Loader size={18} className="animate-spin text-gray-400" /> : <GoogleIcon />}
                {googleLoading ? 'Signing in...' : 'Continue with Google'}
              </button>
              <div className="flex items-center gap-3 my-5">
                <div className="h-px bg-gray-200 flex-1" />
                <span className="text-xs text-gray-400 font-medium">OR</span>
                <div className="h-px bg-gray-200 flex-1" />
              </div>
            </>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError('') }}
                  placeholder="your@email.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader size={18} className="animate-spin" /> : '🔓'}
              {loading ? 'Logging in...' : 'Login to Portal'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="bg-indigo-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-indigo-900">
                <strong>📧 Don't have a password?</strong><br />
                Check your email for login credentials sent once your admission details are approved — or sign in with Google above using that same email address.
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Need help? Contact <a href="mailto:admissions@centurionuniversity.edu" className="text-indigo-600 font-semibold hover:underline">admissions@centurionuniversity.edu</a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>© 2026 Centurion University. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
