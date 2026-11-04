import React, { useState, useEffect } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import {
  Eye, EyeOff, AlertCircle, ShieldCheck, X, CheckCircle2, Mail,
  Lock, ArrowRight, Users, BarChart3, Zap
} from 'lucide-react'
import { useCcrm } from '../context/CcrmContext'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

// ── Env config (default/Centurion branding — used when no :tenantSlug is in the URL) ──
const ALLOWED_DOMAINS  = (import.meta.env.VITE_ALLOWED_DOMAINS || 'cutm.ac.in,cutmap.ac.in')
                           .split(',').map(d => d.trim().toLowerCase())
const MIN_PASSWORD_LEN = Number(import.meta.env.VITE_MIN_PASSWORD_LENGTH) || 6
const SUPPORT_EMAIL    = import.meta.env.VITE_SUPPORT_EMAIL || 'it-support@cutm.ac.in'
const ORG_NAME         = import.meta.env.VITE_ORG_NAME || 'Centurion University of Technology and Management'
const DEFAULT_LOGO_URL = '/logo.png'

const rawClientId      = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const isGoogleConfigured = rawClientId && rawClientId !== 'YOUR_GOOGLE_CLIENT_ID_HERE'

function getEmailDomain(email) {
  return email.split('@')[1]?.toLowerCase() || ''
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
  const { handleLogin, setCurrentUser, fetchAllData, users, showToast, tenantSlug } = useCcrm()

  // Per-tenant branding for /<tenantSlug>/login — fetched from the public tenant
  // config endpoint (no auth needed). Plain /login (no slug) keeps today's
  // hardcoded Centurion look untouched.
  const [tenantBranding, setTenantBranding] = useState(null)
  useEffect(() => {
    if (!tenantSlug) return
    fetch(`/api/tenant/public?slug=${encodeURIComponent(tenantSlug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTenantBranding(data) })
      .catch(() => {})
  }, [tenantSlug])

  const brand           = tenantBranding?.branding || {}
  const orgName         = tenantBranding?.name || ORG_NAME
  const logoUrl         = brand.logoUrl || (tenantSlug ? null : DEFAULT_LOGO_URL)
  const logoInitial     = (brand.logoText || brand.shortName || orgName || 'C').charAt(0).toUpperCase()
  const allowedDomains  = tenantBranding?.allowedDomains?.length ? tenantBranding.allowedDomains : ALLOWED_DOMAINS

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
        body: JSON.stringify({ email: fpEmail, tenantSlug })
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
        body: JSON.stringify({ email: fpEmail, otp: fpOtp, newPassword: fpNewPw, tenantSlug })
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

        // Domain authorization is enforced server-side: existing users are always allowed
        // (but rejected if they don't belong to this URL's tenant), and new users are
        // routed to the tenant whose allowed_domains match — scoped to this URL's tenant
        // when a slug is present, so a domain shared across tenants never resolves to
        // the wrong one.
        // Step 2: upsert user in DB + get back a proper JWT + full user record
        const authRes = await fetch('/api/auth/google', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            email:   userEmail,
            name:    profile.name   || userEmail.split('@')[0],
            picture: profile.picture || '',
            tenantSlug
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

      {/* ════════════ LEFT PANEL — one flat field, one statement ════════════ */}
      <div className="hidden lg:flex lg:w-[55%] flex-col bg-primary-500 text-white">
        <div className="flex flex-col h-full p-14">
          <div className="text-2xl font-medium tracking-tight">CCRM</div>

          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-[56px] xl:text-[72px] font-medium leading-[0.98] tracking-[-0.03em] max-w-[11ch]">
              Every enquiry, followed through.
            </h1>
            <p className="text-[18px] leading-relaxed text-white/80 max-w-md mt-8">
              Leads, documents, payments and seat confirmation for {orgName}, in one place for the admissions team.
            </p>
          </div>

          <p className="text-[15px] text-white/80 max-w-md leading-relaxed">
            Sign-in is limited to official <strong className="text-white font-medium">{allowedDomains.join(' / ')}</strong> accounts.
            Need access? Write to <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white underline">{SUPPORT_EMAIL}</a>.
          </p>
          <p className="text-sm text-white/60 mt-6">© {new Date().getFullYear()} {orgName}</p>
        </div>
      </div>

      {/* ════════════ RIGHT PANEL — Login form ════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white relative">
        {/* Logo: the supplied image, exactly as given, top right */}
        {logoUrl ? (
          <img src={logoUrl} alt={orgName} className="absolute top-6 right-6 h-36 w-auto" />
        ) : (
          <div className="absolute top-6 right-6 h-14 w-14 rounded-md bg-primary-500 flex items-center justify-center text-white font-bold text-2xl">
            {logoInitial}
          </div>
        )}

        <div className="relative w-full max-w-[420px]">
          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-[32px] font-medium text-gray-900 tracking-tight">Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1.5">Sign in to your admissions dashboard</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="bg-danger-50 border border-danger-200 rounded-xl px-4 py-3 flex gap-2.5 mb-5 text-sm text-danger-700">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-danger-500" />
              <div>
                <p>{error}</p>
                {error.includes('restricted') && (
                  <p className="text-xs mt-1 text-danger-500">
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
                className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 rounded-md py-3.5 text-sm font-semibold text-gray-700 transition-all shadow-sm hover:shadow-md disabled:opacity-60 group"
              >
                {googleLoading ? <Spinner size={5} color="gray-400" /> : <GoogleIcon />}
                <span className="transition-colors">
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
            Use your official <strong>{allowedDomains.join(' / ')}</strong> Google account to sign in.
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
              © {new Date().getFullYear()} {orgName}
            </p>
          </div>
        </div>
      </div>

      {/* ════════════ FORGOT PASSWORD MODAL ════════════ */}
      <Modal
        open={showForgot}
        onClose={closeForgot}
        title="Reset Password"
        subtitle="We'll send an OTP to your email"
        size="md"
      >
        {/* Step indicator */}
        {!fpSuccess && (
          <div className="flex items-center gap-2 -mt-2 mb-5">
            {['Enter Email', 'Verify & Reset'].map((label, i) => (
              <React.Fragment key={label}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    fpStep > i+1 ? 'bg-success-500 border-success-500 text-white' :
                    fpStep === i+1 ? 'bg-primary-600 border-primary-600 text-white' :
                    'bg-white border-gray-300 text-gray-400'
                  }`}>
                    {fpStep > i+1 ? '✓' : i+1}
                  </div>
                  <span className={`text-xs font-semibold ${fpStep === i+1 ? 'text-primary-600' : fpStep > i+1 ? 'text-success-600' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </div>
                {i === 0 && <div className="flex-1 h-0.5 bg-gray-200 mx-1" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {fpSuccess ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-success-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} className="text-success-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Password Reset!</h3>
              <p className="text-gray-500 text-sm mt-1">You can now log in with your new password.</p>
            </div>
            <Button onClick={closeForgot} className="px-8">Back to Login</Button>
          </div>

        ) : fpStep === 1 ? (
          <form onSubmit={handleForgotSubmitEmail} className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter your official email. We'll send a 6-digit OTP to reset your password.
            </p>
            {fpError && (
              <div className="bg-danger-50 border border-danger-200 text-danger-700 text-xs px-3 py-2.5 rounded-xl flex gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
                {fpError}
              </div>
            )}
            <Input
              label="Email Address"
              type="email"
              icon={Mail}
              value={fpEmail}
              onChange={e => setFpEmail(e.target.value)}
              placeholder={`you@${allowedDomains[0]}`}
              required autoFocus
            />
            <Button type="submit" loading={fpLoading} className="w-full">
              {fpLoading ? 'Sending OTP...' : 'Send OTP to Email'}
            </Button>
          </form>

        ) : (
          <form onSubmit={handleForgotResetPassword} className="space-y-4">
            <div className="bg-info-50 border border-info-200 text-info-700 text-xs px-3 py-2.5 rounded-xl">
              OTP sent to <strong>{fpEmail}</strong>. Check your inbox and spam folder.
            </div>
            {fpError && (
              <div className="bg-danger-50 border border-danger-200 text-danger-700 text-xs px-3 py-2.5 rounded-xl flex gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
                {fpError}
              </div>
            )}
            <Input
              label="Enter OTP"
              type="text"
              value={fpOtp}
              onChange={e => setFpOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
              placeholder="6-digit OTP"
              className="tracking-[0.4em] text-center font-bold text-lg"
              maxLength={6} required autoFocus
            />
            <div className="relative">
              <Input
                label="New Password"
                type={showFpPw ? 'text' : 'password'}
                icon={Lock}
                value={fpNewPw}
                onChange={e => setFpNewPw(e.target.value)}
                placeholder={`Min ${MIN_PASSWORD_LEN} characters`}
                className="pr-11"
                required
              />
              <button type="button" onClick={() => setShowFpPw(!showFpPw)}
                className="absolute right-3.5 top-1/2 translate-y-1 text-gray-400 hover:text-gray-600">
                {showFpPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            <Input
              label="Confirm New Password"
              type="password"
              value={fpConfirmPw}
              onChange={e => setFpConfirmPw(e.target.value)}
              placeholder="Re-enter new password"
              error={fpConfirmPw && fpNewPw !== fpConfirmPw ? 'Passwords do not match.' : ''}
              required
            />
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="secondary" onClick={() => { setFpStep(1); setFpError('') }} className="flex-1">
                ← Back
              </Button>
              <Button type="submit" loading={fpLoading} className="flex-1">
                {fpLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </div>
            <button type="button"
              onClick={() => { setFpStep(1); handleForgotSubmitEmail(null) }}
              className="w-full text-xs text-primary-500 hover:text-primary-700 text-center transition">
              Didn't receive OTP? Resend
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}
