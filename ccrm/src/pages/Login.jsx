import React, { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { Eye, EyeOff, GraduationCap, AlertCircle, ShieldCheck } from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

// ── Env config ────────────────────────────────────────────────────────────────
const ALLOWED_DOMAINS  = (import.meta.env.VITE_ALLOWED_DOMAINS || 'cutm.ac.in,cutmap.ac.in')
                           .split(',').map(d => d.trim().toLowerCase())
const MIN_PASSWORD_LEN = Number(import.meta.env.VITE_MIN_PASSWORD_LENGTH) || 6
const SUPPORT_EMAIL    = import.meta.env.VITE_SUPPORT_EMAIL || 'it-support@cutm.ac.in'
const APP_NAME         = import.meta.env.VITE_APP_NAME || 'CCRM'
const ORG_NAME         = import.meta.env.VITE_ORG_NAME || 'Centurion University of Technology and Management'

const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const isGoogleConfigured = rawClientId && rawClientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE'

function getEmailDomain(email) {
  return email.split('@')[1]?.toLowerCase() || ''
}

export default function Login() {
  const { handleLogin, setCurrentUser, users, showToast } = useCcrm()
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]               = useState('')

  const typedDomain = getEmailDomain(email)
  const domainValid = !typedDomain || ALLOWED_DOMAINS.includes(typedDomain)

  // ── Email/password login ───────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault()
    if (!email || !password) { setError('Please enter your email and password.'); return }
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return }
    const domain = getEmailDomain(email)
    if (!ALLOWED_DOMAINS.includes(domain)) {
      setError(`Access restricted. Only ${ALLOWED_DOMAINS.join(' or ')} email addresses are allowed.`)
      return
    }
    setError('')
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const res = handleLogin(email, password)
      if (!res.success) {
        setError(res.error)
      }
    }, 900)
  }

  // ── Google OAuth login ─────────────────────────────────────────────────────
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true)
      setError('')
      try {
        // Fetch user profile from Google
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        })
        const profile = await res.json()
        const userEmail = profile.email || ''
        const domain    = getEmailDomain(userEmail)

        if (!ALLOWED_DOMAINS.includes(domain)) {
          setError(
            `Access restricted. Only ${ALLOWED_DOMAINS.join(' or ')} Google accounts are allowed. ` +
            `You signed in with ${userEmail}.`
          )
          setGoogleLoading(false)
          return
        }

        const found = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase())
        if (found && found.status !== 'Active') {
          setError('Your account is inactive. Contact IT support.')
          setGoogleLoading(false)
          return
        }

        const gUser = {
          name:    profile.name || found?.name || userEmail.split('@')[0],
          email:   userEmail,
          picture: profile.picture || null,
          role:    found?.role || 'Counselor',
          team:    found?.team || 'Sales',
          status:  'Active'
        }
        setCurrentUser(gUser)
        showToast(`Welcome back, ${gUser.name}!`, 'success')
      } catch {
        setError('Google sign-in failed. Please try again.')
      } finally {
        setGoogleLoading(false)
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed.')
      setGoogleLoading(false)
    },
  })

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700 flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-white/5 rounded-full"></div>
          <div className="absolute top-1/3 -right-16 w-64 h-64 bg-white/5 rounded-full"></div>
          <div className="absolute -bottom-10 left-1/4 w-96 h-96 bg-white/5 rounded-full"></div>
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px'
          }}></div>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-primary-500 font-extrabold text-2xl leading-none">C</span>
          </div>
          <div>
            <div className="text-white font-extrabold text-2xl tracking-tight">CCRM</div>
            <div className="text-primary-200 text-xs font-medium">Centurion University</div>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center py-12">
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 bg-white/15 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
              <GraduationCap size={14} />
              Trusted by 50,000+ students
            </span>
          </div>
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Manage admissions,<br />leads, and applications<br />
            <span className="text-accent-400">seamlessly.</span>
          </h1>
          <p className="text-primary-200 text-base leading-relaxed max-w-sm">
            CCRM empowers Centurion University's admissions team with intelligent lead tracking,
            automated follow-ups, and real-time analytics.
          </p>

          <div className="mt-8 p-4 bg-white/10 rounded-xl border border-white/20">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={16} className="text-green-300" />
              <span className="text-white text-sm font-semibold">Restricted Access</span>
            </div>
            <p className="text-primary-200 text-xs leading-relaxed">
              Sign in is limited to official <strong className="text-white">{ALLOWED_DOMAINS.join(' / ')}</strong> accounts only.
              Google login is also restricted to these domains.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { value: '12K+', label: 'Active Leads' },
              { value: '98%',  label: 'Conversion Rate' },
              { value: '4.9★', label: 'User Rating' },
            ].map(stat => (
              <div key={stat.label} className="bg-white/10 rounded-xl p-4 border border-white/15">
                <div className="text-white font-extrabold text-xl">{stat.value}</div>
                <div className="text-primary-200 text-xs mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            {['F','T','L','I'].map(s => (
              <button key={s} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors border border-white/20">
                <span className="text-white text-xs font-bold">{s}</span>
              </button>
            ))}
          </div>
          <p className="text-primary-300 text-xs">© {new Date().getFullYear()} {ORG_NAME}</p>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-extrabold text-xl">C</span>
            </div>
            <span className="text-primary-500 font-extrabold text-xl">CCRM</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your CCRM dashboard</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg flex gap-2 mb-4">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p>{error}</p>
                {error.includes('restricted') && (
                  <p className="text-xs mt-1 text-red-500">
                    Contact IT support:{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* SSO Buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Google – functional */}
            {isGoogleConfigured ? (
              <button
                onClick={() => { setError(''); googleLogin() }}
                disabled={googleLoading}
                className="flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {googleLoading ? (
                  <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                Google
              </button>
            ) : (
              <button
                disabled
                className="flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 px-4 text-sm font-medium text-gray-400 cursor-not-allowed opacity-60"
                title="Google login not configured in environment"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#9ca3af" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#9ca3af" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#9ca3af" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#9ca3af" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
            )}

            {/* Microsoft – placeholder */}
            <button
              disabled
              className="flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 px-4 text-sm font-medium text-gray-400 cursor-not-allowed opacity-60"
              title="Microsoft SSO coming soon"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#00A4EF">
                <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
              </svg>
              Microsoft
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="text-xs text-gray-400 font-medium">or continue with email</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Official Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder={`you@${ALLOWED_DOMAINS[0]}`}
                className={`input-field ${typedDomain && !domainValid ? 'border-red-400 focus:ring-red-400' : ''}`}
                autoComplete="email"
              />
              {typedDomain && !domainValid && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle size={11} />
                  Only <strong>{ALLOWED_DOMAINS.join(', ')}</strong> domains are allowed
                </p>
              )}
              {typedDomain && domainValid && (
                <p className="text-xs text-green-600 mt-1">✓ Valid domain</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="input-field pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-400" />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
              <button type="button" className="text-sm text-primary-500 hover:text-primary-600 font-medium">
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white font-semibold py-2.5 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              <button className="hover:text-gray-600 transition-colors">Privacy Policy</button>
              <span className="mx-2">|</span>
              <button className="hover:text-gray-600 transition-colors">Terms of Use</button>
            </p>
            <p className="text-xs text-gray-400 mt-2">© {new Date().getFullYear()} {ORG_NAME}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
