import React, { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import {
  Eye, EyeOff, AlertCircle, ShieldCheck, X, CheckCircle2, Mail,
  Lock, ArrowRight, Users, BarChart3, Zap
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'

// ── Env config ─────────────────────────────────────────────────────────────────
const ALLOWED_DOMAINS  = (import.meta.env.VITE_ALLOWED_DOMAINS || 'cutm.ac.in,cutmap.ac.in')
                           .split(',').map(d => d.trim().toLowerCase())
const MIN_PASSWORD_LEN = Number(import.meta.env.VITE_MIN_PASSWORD_LENGTH) || 6
const SUPPORT_EMAIL    = import.meta.env.VITE_SUPPORT_EMAIL || 'it-support@cutm.ac.in'
const ORG_NAME         = import.meta.env.VITE_ORG_NAME || 'Centurion University of Technology and Management'

const rawClientId      = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const isGoogleConfigured = rawClientId && rawClientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE'

function getEmailDomain(email) {
  return email.split('@')[1]?.toLowerCase() || ''
}

// ── Floating feature pill ──────────────────────────────────────────────────────
function FeaturePill({ icon: Icon, label, className = '' }) {
  return (
    <div className={`flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-white text-xs font-medium ${className}`}>
      <Icon size={13} className="text-blue-200" /> {label}
    </div>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner({ size = 4, color = 'white' }) {
  return (
    <svg className={`animate-spin h-${size} w-${size} text-${color}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

// ── Google SVG ─────────────────────────────────────────────────────────────────
function GoogleIcon({ greyed = false }) {
  const c = (hex) => greyed ? '#9ca3af' : hex
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill={c('#4285F4')} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill={c('#34A853')} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill={c('#FBBC05')} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill={c('#EA4335')} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
export default function Login() {
  const { handleLogin, setCurrentUser, fetchAllData, users, showToast } = useCcrm()

  // Login state
  const [email, setEmail]                 = useState('')
  const [password, setPassword]           = useState('')
  const [showPassword, setShowPassword]   = useState(false)
  const [loading, setLoading]             = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]                 = useState('')

  // Forgot password state
  const [showForgot, setShowForgot]       = useState(false)
  const [fpStep, setFpStep]               = useState(1)
  const [fpEmail, setFpEmail]             = useState('')
  const [fpOtp, setFpOtp]                 = useState('')
  const [fpNewPw, setFpNewPw]             = useState('')
  const [fpConfirmPw, setFpConfirmPw]     = useState('')
  const [fpLoading, setFpLoading]         = useState(false)
  const [fpError, setFpError]             = useState('')
  const [fpSuccess, setFpSuccess]         = useState(false)
  const [showFpPw, setShowFpPw]           = useState(false)

  const typedDomain = getEmailDomain(email)
  const domainValid = !typedDomain || ALLOWED_DOMAINS.includes(typedDomain)

  // ── Forgot password handlers ───────────────────────────────────────────────
  const handleForgotSubmitEmail = async (e) => {
    e?.preventDefault()
    setFpError('')
    if (!fpEmail || !fpEmail.includes('@')) { setFpError('Enter a valid email address.'); return }
    setFpLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail })
      })
      const data = await res.json()
      if (!res.ok) setFpError(data.error || 'Failed to send OTP.')
      else setFpStep(2)
    } catch {
      setFpStep(2)
    } finally {
      setFpLoading(false)
    }
  }

  const handleForgotResetPassword = async (e) => {
    e.preventDefault()
    setFpError('')
    if (!fpOtp.trim())                        { setFpError('Enter the OTP sent to your email.'); return }
    if (fpNewPw.length < MIN_PASSWORD_LEN)    { setFpError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`); return }
    if (fpNewPw !== fpConfirmPw)              { setFpError('Passwords do not match.'); return }
    setFpLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail, otp: fpOtp, newPassword: fpNewPw })
      })
      const data = await res.json()
      if (!res.ok) setFpError(data.error || 'Failed to reset password.')
      else setFpSuccess(true)
    } catch {
      setFpError('Unable to connect. Please try again.')
    } finally {
      setFpLoading(false)
    }
  }

  const closeForgot = () => {
    setShowForgot(false)
    setFpStep(1); setFpEmail(''); setFpOtp(''); setFpNewPw(''); setFpConfirmPw('')
    setFpError(''); setFpLoading(false); setFpSuccess(false)
  }

  // ── Email/password submit ──────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password)              { setError('Please enter your email and password.'); return }
    if (!email.includes('@'))             { setError('Please enter a valid email address.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await handleLogin(email, password)
      if (res && !res.success) setError(res.error || 'Invalid email or password.')
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true)
      setError('')
      try {
        // Step 1: fetch Google profile
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        })
        const profile   = await profileRes.json()
        const userEmail = profile.email || ''

        // Domain authorization is enforced server-side: existing users are always allowed,
        // and new users are routed to the tenant whose allowed_domains match (else rejected).
        // Step 2: upsert user in DB + get back a proper JWT + full user record
        const authRes = await fetch('/api/auth/google', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            email:   userEmail,
            name:    profile.name   || userEmail.split('@')[0],
            picture: profile.picture || ''
          })
        })
        const data = await authRes.json()
        if (!authRes.ok) {
          setError(data.error || 'Google sign-in failed.')
          setGoogleLoading(false); return
        }

        // Step 3: store token + set user (same as regular login)
        localStorage.setItem('ccrm_token', data.token)
        setCurrentUser(data.user)
        fetchAllData()
        showToast(`Welcome, ${data.user.name}!`, 'success')
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">

      {/* ════════════ LEFT PANEL — Brand showcase ════════════ */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0b1929 0%, #0f2a4a 40%, #0a3a6e 75%, #0f4c81 100%)' }}>

        {/* Dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
          backgroundSize: '36px 36px'
        }} />

        {/* Glow orbs */}
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 right-0 w-64 h-64 rounded-full bg-cyan-400/15 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <img
              src="https://cutmap.ac.in/wp-content/themes/centurion/images/logo.svg"
              alt="Centurion University"
              className="h-10 w-auto brightness-0 invert"
            />
            <div className="h-8 w-px bg-white/20" />
            <div>
              <div className="text-white font-extrabold text-base tracking-tight">CCRM</div>
              <div className="text-blue-300 text-[11px]">Admissions Portal</div>
            </div>
          </div>

          {/* Main headline */}
          <div className="flex-1 flex flex-col justify-center mt-16">
            <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold px-3 py-1.5 rounded-full w-fit mb-8">
              <Zap size={12}/> AI-Powered Admissions Platform
            </div>

            <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-[1.1] mb-6 tracking-tight">
              Manage Admissions<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-300">Smarter</span> &<br />
              Faster.
            </h1>

            <p className="text-blue-200 text-base leading-relaxed max-w-sm mb-10">
              CCRM gives your admissions team intelligent lead tracking, automated follow-ups,
              and real-time analytics — all in one place.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mb-10">
              <FeaturePill icon={Users} label="Lead Management" />
              <FeaturePill icon={BarChart3} label="Live Analytics" />
              <FeaturePill icon={Zap} label="Auto Follow-ups" />
              <FeaturePill icon={ShieldCheck} label="Secure & Compliant" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: '12K+', label: 'Leads Tracked' },
                { value: '98%',  label: 'Uptime' },
                { value: '4.9★', label: 'Staff Rating' },
              ].map(stat => (
                <div key={stat.label} className="bg-white/8 border border-white/12 rounded-2xl p-4 text-center">
                  <div className="text-white font-extrabold text-xl">{stat.value}</div>
                  <div className="text-blue-300 text-xs mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Domain restriction note */}
          <div className="bg-white/8 border border-white/15 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck size={15} className="text-green-300" />
              <span className="text-white text-xs font-semibold">Restricted Access</span>
            </div>
            <p className="text-blue-300 text-xs leading-relaxed">
              Login is limited to official <strong className="text-white">{ALLOWED_DOMAINS.join(' / ')}</strong> accounts.
              Contact <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-200 underline">{SUPPORT_EMAIL}</a> for access.
            </p>
          </div>

          <p className="text-blue-500 text-xs mt-6">© {new Date().getFullYear()} {ORG_NAME}</p>
        </div>
      </div>

      {/* ════════════ RIGHT PANEL — Login form ════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50 relative">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)',
          backgroundSize: '28px 28px'
        }} />

        <div className="relative w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img
              src="https://cutmap.ac.in/wp-content/themes/centurion/images/logo.svg"
              alt="Centurion University"
              className="h-9 w-auto"
            />
            <div className="h-7 w-px bg-gray-200" />
            <div className="text-gray-700 font-bold text-base">CCRM Portal</div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1.5">Sign in to your admissions dashboard</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-2.5 mb-5 text-sm text-red-700">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
              <div>
                <p>{error}</p>
                {error.includes('restricted') && (
                  <p className="text-xs mt-1 text-red-500">
                    Need access? Email{' '}
                    <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-medium">{SUPPORT_EMAIL}</a>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Google SSO — primary CTA */}
          <div className="mb-6">
            {isGoogleConfigured ? (
              <button
                onClick={() => { setError(''); googleLogin() }}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:border-primary-300 hover:bg-primary-50/30 rounded-xl py-3.5 text-sm font-semibold text-gray-700 transition-all shadow-sm hover:shadow-md disabled:opacity-60 group"
              >
                {googleLoading ? <Spinner size={5} color="gray-400" /> : <GoogleIcon />}
                <span className="group-hover:text-primary-700 transition-colors">
                  {googleLoading ? 'Signing in...' : 'Continue with Google'}
                </span>
              </button>
            ) : (
              <button disabled
                className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 rounded-xl py-3.5 text-sm font-semibold text-gray-400 cursor-not-allowed opacity-60"
                title="Google login not configured">
                <GoogleIcon greyed />
                Continue with Google
              </button>
            )}
          </div>

          {/* Email/password login removed — sign-in is via Google only */}
          <p className="text-center text-xs text-gray-400 mt-2">
            Use your official <strong>{ALLOWED_DOMAINS.join(' / ')}</strong> Google account to sign in.
          </p>

          {/* Footer links */}
          <div className="mt-10 pt-6 border-t border-gray-200 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <button className="hover:text-gray-600 transition-colors">Privacy Policy</button>
              <span className="text-gray-200">|</span>
              <button className="hover:text-gray-600 transition-colors">Terms of Use</button>
              <span className="text-gray-200">|</span>
              <a href="/apply" className="hover:text-primary-500 transition-colors">Public Inquiry Form</a>
            </div>
            <p className="text-[11px] text-gray-400">
              © {new Date().getFullYear()} {ORG_NAME}
            </p>
          </div>
        </div>
      </div>

      {/* ════════════ FORGOT PASSWORD MODAL ════════════ */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center">
                  <Mail size={16} className="text-primary-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Reset Password</h2>
                  <p className="text-xs text-gray-500">We'll send an OTP to your email</p>
                </div>
              </div>
              <button onClick={closeForgot} className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition">
                <X size={18}/>
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
              {['Enter Email', 'Verify & Reset'].map((label, i) => (
                <React.Fragment key={label}>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                      fpStep > i+1 ? 'bg-green-500 border-green-500 text-white' :
                      fpStep === i+1 ? 'bg-primary-600 border-primary-600 text-white' :
                      'bg-white border-gray-300 text-gray-400'
                    }`}>
                      {fpStep > i+1 ? '✓' : i+1}
                    </div>
                    <span className={`text-xs font-semibold ${fpStep === i+1 ? 'text-primary-600' : fpStep > i+1 ? 'text-green-600' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </div>
                  {i === 0 && <div className="flex-1 h-0.5 bg-gray-200 mx-1" />}
                </React.Fragment>
              ))}
            </div>

            <div className="p-6">
              {fpSuccess ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={36} className="text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">Password Reset!</h3>
                    <p className="text-gray-500 text-sm mt-1">You can now log in with your new password.</p>
                  </div>
                  <button onClick={closeForgot}
                    className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-2.5 rounded-xl transition text-sm">
                    Back to Login
                  </button>
                </div>

              ) : fpStep === 1 ? (
                <form onSubmit={handleForgotSubmitEmail} className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Enter your official email. We'll send a 6-digit OTP to reset your password.
                  </p>
                  {fpError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-xl flex gap-2">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
                      {fpError}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={fpEmail}
                        onChange={e => setFpEmail(e.target.value)}
                        placeholder={`you@${ALLOWED_DOMAINS[0]}`}
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                        required autoFocus
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={fpLoading}
                    className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm">
                    {fpLoading ? <><Spinner size={4}/> Sending OTP...</> : 'Send OTP to Email'}
                  </button>
                </form>

              ) : (
                <form onSubmit={handleForgotResetPassword} className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2.5 rounded-xl">
                    OTP sent to <strong>{fpEmail}</strong>. Check your inbox and spam folder.
                  </div>
                  {fpError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-xl flex gap-2">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
                      {fpError}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Enter OTP</label>
                    <input
                      type="text"
                      value={fpOtp}
                      onChange={e => setFpOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                      placeholder="6-digit OTP"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm tracking-[0.4em] text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                      maxLength={6} required autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">New Password</label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                      <input
                        type={showFpPw ? 'text' : 'password'}
                        value={fpNewPw}
                        onChange={e => setFpNewPw(e.target.value)}
                        placeholder={`Min ${MIN_PASSWORD_LEN} characters`}
                        className="w-full pl-10 pr-11 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition"
                        required
                      />
                      <button type="button" onClick={() => setShowFpPw(!showFpPw)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showFpPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Confirm New Password</label>
                    <input
                      type="password"
                      value={fpConfirmPw}
                      onChange={e => setFpConfirmPw(e.target.value)}
                      placeholder="Re-enter new password"
                      className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition ${
                        fpConfirmPw && fpNewPw !== fpConfirmPw ? 'border-red-400 bg-red-50' : 'border-gray-200'
                      }`}
                      required
                    />
                    {fpConfirmPw && fpNewPw !== fpConfirmPw && (
                      <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
                    )}
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => { setFpStep(1); setFpError('') }}
                      className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-xl transition text-sm">
                      ← Back
                    </button>
                    <button type="submit" disabled={fpLoading}
                      className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 text-sm">
                      {fpLoading ? <><Spinner size={4}/> Resetting...</> : 'Reset Password'}
                    </button>
                  </div>
                  <button type="button"
                    onClick={() => { setFpStep(1); handleForgotSubmitEmail(null) }}
                    className="w-full text-xs text-primary-500 hover:text-primary-700 text-center transition">
                    Didn't receive OTP? Resend
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
