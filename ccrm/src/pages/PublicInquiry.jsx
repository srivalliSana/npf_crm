import React, { useState, useEffect } from 'react'
import ChatWidget from '../components/ChatWidget'
import ParallaxHero from '../components/ParallaxHero'
import {
  GraduationCap, CheckCircle, Phone, Mail, MapPin, BookOpen, Send, AlertCircle,
  ChevronRight, Award, Users, Building2, Briefcase, Globe, Menu, X,
  Trophy, Shield, Heart, Star, ArrowRight, Zap
} from 'lucide-react'

// ── Data ─────────────────────────────────────────────────────────────────────
const COURSES = [
  'B.Tech CSE', 'B.Tech CSE (AI/ML)', 'B.Tech CSE (Cyber Security)',
  'B.Tech ECE', 'B.Tech Civil', 'B.Tech Mechanical',
  'BCA', 'BBA', 'B.Com', 'B.Sc Agriculture',
  'MBA', 'MBA (Finance)', 'MBA (HR)', 'MBA (Marketing)',
  'M.Tech', 'MCA', 'M.Sc Agriculture',
  'Pharmacy', 'Nursing', 'Other'
]

const STATES = [
  'Andhra Pradesh', 'Odisha', 'Telangana', 'West Bengal', 'Jharkhand',
  'Chhattisgarh', 'Bihar', 'Maharashtra', 'Tamil Nadu', 'Karnataka',
  'Uttar Pradesh', 'Rajasthan', 'Gujarat', 'Delhi', 'Other'
]

const SOURCES = [
  'Google Search', 'Facebook', 'Instagram', 'Friend / Family Referral',
  'Education Fair', 'Walk-in', 'YouTube', 'WhatsApp', 'News / TV', 'Other'
]

const NAV_LINKS = [
  { label: 'Programs', href: '#programs' },
  { label: 'Campuses', href: '#campuses' },
  { label: 'Why CUTM', href: '#why' },
  { label: 'Apply', href: '#apply' },
]

const PROGRAMS = [
  { name: 'B.Tech CSE (AI/ML)', icon: '🤖', duration: '4 Yrs', tag: 'Trending', tagColor: 'bg-red-100 text-red-600', img: '/landing/images/Smart-City.jpg' },
  { name: 'MBA', icon: '💼', duration: '2 Yrs', tag: 'Popular', tagColor: 'bg-blue-100 text-blue-600', img: '/landing/images/MBA.jpg' },
  { name: 'B.Sc Agriculture', icon: '🌾', duration: '4 Yrs', tag: 'High Demand', tagColor: 'bg-green-100 text-green-700', img: '/landing/images/Agriculture-Science.jpg' },
  { name: 'B.Tech ECE', icon: '⚡', duration: '4 Yrs', tag: '', tagColor: '', img: '/landing/images/AR-VR-Lab.jpg' },
  { name: 'BCA', icon: '💻', duration: '3 Yrs', tag: '', tagColor: '', img: '/landing/images/Software-Technology.jpg' },
  { name: 'MCA', icon: '🖥️', duration: '2 Yrs', tag: '', tagColor: '', img: '/landing/images/Cyber-Security.jpg' },
  { name: 'B.Com', icon: '📊', duration: '3 Yrs', tag: '', tagColor: '', img: '/landing/images/BCOM.jpg' },
  { name: 'B.Tech Civil', icon: '🏗️', duration: '4 Yrs', tag: '', tagColor: '', img: '/landing/images/Diiploma-in-Civil-Engineering.jpg' },
]

const STATS = [
  { value: '10,000+', label: 'Students', icon: Users },
  { value: '100+', label: 'Programs', icon: BookOpen },
  { value: '4', label: 'Campuses', icon: Building2 },
  { value: '95%', label: 'Placements', icon: Briefcase },
]

const FEATURES = [
  { icon: Award, color: 'bg-purple-100 text-purple-600', title: 'NAAC A+ Accredited', desc: 'Nationally recognized for academic excellence, research quality, and student outcomes.' },
  { icon: Briefcase, color: 'bg-blue-100 text-blue-600', title: '95% Placement Record', desc: 'Alumni placed at TCS, Infosys, Wipro, Amazon, Google and 500+ top companies.' },
  { icon: Globe, color: 'bg-cyan-100 text-cyan-600', title: 'Global Exposure', desc: 'Student exchange programs with 50+ international universities across 20 countries.' },
  { icon: Trophy, color: 'bg-yellow-100 text-yellow-700', title: 'Award-Winning Research', desc: '200+ patents, cutting-edge labs, and industry-sponsored research projects.' },
  { icon: Shield, color: 'bg-green-100 text-green-600', title: 'Safe Smart Campus', desc: '24/7 security, modern hostels, medical facilities, and smart campus infrastructure.' },
  { icon: Heart, color: 'bg-red-100 text-red-600', title: 'Scholarships Available', desc: 'Merit-based and need-based scholarships. Financial aid for eligible students.' },
]

const CAMPUSES = [
  { name: 'Bhubaneswar', state: 'Odisha', emoji: '🏛️', desc: 'Main campus. 100+ acres. Engineering, Management, Agriculture, Sciences.', img: '/landing/images/camp1.jpg' },
  { name: 'Vizianagaram', state: 'Andhra Pradesh', emoji: '🏫', desc: 'Vibrant campus. Strong industry linkages in Andhra Pradesh region.', img: '/landing/images/camp2.jpg' },
  { name: 'Paralakhemundi', state: 'Odisha', emoji: '🌿', desc: 'Serene eco-campus. Known for Agriculture and Life Sciences.', img: '/landing/images/camp3.jpg' },
  { name: 'Balasore', state: 'Odisha', emoji: '🚀', desc: 'Growing tech campus. Close to DRDO research corridor.', img: '/landing/images/camp4.jpg' },
]


// Parallax: any element with data-speed (vertical) and/or data-x (horizontal) drifts against the scroll.
// Only transforms are changed, work is done once per frame, off-screen items are skipped, and it is
// switched off entirely for people who prefer reduced motion.
function useParallax(deps) {
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const els = Array.from(document.querySelectorAll('[data-speed], [data-x]'))
    if (!els.length) return
    let raf = 0
    const update = () => {
      raf = 0
      const vh = window.innerHeight
      const small = window.innerWidth < 768 ? 0.5 : 1
      for (const el of els) {
        const host = el.parentElement
        if (!host) continue
        const r = host.getBoundingClientRect()
        if (r.bottom < -200 || r.top > vh + 200) continue
        const d = (r.top + r.height / 2) - vh / 2          // distance of the host from the screen centre
        const y = -d * (parseFloat(el.dataset.speed || '0')) * small
        const x = -d * (parseFloat(el.dataset.x || '0')) * small
        el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [deps])
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PublicInquiry() {
  const [navOpen, setNavOpen]     = useState(false)
  const [scrolled, setScrolled]   = useState(false)
  const [form, setForm]           = useState({ name:'', email:'', mobile:'', state:'', city:'', course:'', source:'' })
  const [errors, setErrors]       = useState({})
  const [loading, setLoading]     = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [serverMsg, setServerMsg] = useState('')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useParallax(submitted)

  const validate = () => {
    const e = {}
    if (!form.name.trim() || form.name.trim().length < 2) e.name = 'Enter your full name.'
    if (!form.mobile || !/^[6-9]\d{9}$/.test(form.mobile.replace(/\D/g, ''))) e.mobile = 'Enter a valid 10-digit number.'
    if (!form.course) e.course = 'Please select a course.'
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email.'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setLoading(true)
    try {
      // Extract tenant slug from hostname (e.g., crm.cutm.ac.in → cutm)
      const hostname = window.location.hostname
      const parts = hostname.split('.')
      const tenantSlug = parts.length > 1 && parts[0] === 'crm' ? parts[1] : parts[0]

      const res = await fetch(`/api/public/inquiry/${encodeURIComponent(tenantSlug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: form.source || 'Website' })
      })
      const data = await res.json()
      setServerMsg(data.message || 'Thank you! Our team will contact you within 24 hours.')
      setSubmitted(true)
    } catch {
      setErrors({ submit: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const set = (field, val) => {
    setForm(prev => ({ ...prev, [field]: val }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
        <div className="bg-white rounded-lg border border-gray-200 p-10 max-w-md w-full text-center space-y-6">
          <CheckCircle size={44} className="text-gray-900 mx-auto" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Inquiry received</h2>
            <p className="text-gray-600 text-sm">{serverMsg || 'Our counselor will contact you within 24 hours.'}</p>
          </div>
          <div className="bg-gray-100 rounded-lg p-5 text-left space-y-3">
            <p className="text-sm font-semibold text-gray-700 mb-2">What happens next:</p>
            {[
              'Counselor calls you within 24 hours',
              'Receive course brochure via WhatsApp',
              'Schedule a campus visit or virtual tour',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-medium flex items-center justify-center flex-shrink-0">{i+1}</span>
                {step}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-gray-400">For urgent queries:</p>
            <a href="tel:+917065569969" className="flex items-center justify-center gap-2 text-primary-600 font-semibold hover:underline">
              <Phone size={15} /> +91 70655 69969
            </a>
          </div>
          <button
            onClick={() => { setSubmitted(false); setForm({ name:'', email:'', mobile:'', state:'', city:'', course:'', source:'' }) }}
            className="text-sm text-primary-600 underline hover:no-underline"
          >
            Submit another inquiry
          </button>
        </div>
      </div>
    )
  }

  // ── Field style helper ──────────────────────────────────────────────────────
  const fld = (err) =>
    `w-full border rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-primary-600 transition ${
      err ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
    }`

  // Embed mode (?embed=1) — render ONLY the form card, for the cutm16 landing iframe.
  const embed = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('embed') === '1'

  // The enquiry form card — shared by the full page and the embed view (form logic unchanged).
  const formCard = (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Form header */}
      <div className="bg-accent-500 px-7 py-5">
        <h3 className="text-primary-900 font-semibold text-xl">Apply for CUEE 2026</h3>
        <p className="text-primary-900/80 text-sm mt-1">Free counselling. No application fee.</p>
      </div>

      <div className="p-7">
        {errors.submit && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-4 py-3 mb-4 text-red-700 text-sm">
            <AlertCircle size={15}/> {errors.submit}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Enter your full name" className={fld(errors.name)} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mobile <span className="text-red-500">*</span></label>
              <input type="tel" value={form.mobile} onChange={e => set('mobile', e.target.value)}
                placeholder="10-digit number" maxLength={10} className={fld(errors.mobile)} />
              {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="your@email.com" className={fld(errors.email)} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Course Interested In <span className="text-red-500">*</span></label>
            <select value={form.course} onChange={e => set('course', e.target.value)} className={fld(errors.course)}>
              <option value="">-- Select Program --</option>
              {COURSES.map(c => <option key={c}>{c}</option>)}
            </select>
            {errors.course && <p className="text-red-500 text-xs mt-1">{errors.course}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">State</label>
              <select value={form.state} onChange={e => set('state', e.target.value)} className={fld(false)}>
                <option value="">-- State --</option>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">City</label>
              <input type="text" value={form.city} onChange={e => set('city', e.target.value)}
                placeholder="Your city" className={fld(false)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">How did you hear about us?</label>
            <select value={form.source} onChange={e => set('source', e.target.value)} className={fld(false)}>
              <option value="">-- Select Source --</option>
              {SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white font-semibold py-3.5 rounded-md flex items-center justify-center gap-2 transition shadow-lg shadow-primary-600/20 text-sm">
            {loading ? (
              <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg> Submitting...</>
            ) : <><Send size={16}/> Submit Inquiry</>}
          </button>
        </form>

        <p className="text-center text-[12px] text-gray-400 mt-4">
          Your information is kept confidential and is never used for spam.
        </p>
      </div>
    </div>
  )

  // Embed view: just the form on a light background (sits inside the cutm16 iframe).
  if (embed) {
    return (
      <div className="bg-gray-50 p-3 font-sans">
        {formCard}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white font-sans overflow-x-hidden">

      {/* ══════════════════════ NAVBAR ══════════════════════ */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <a href="#top" className="flex items-center" aria-label="Centurion University home">
              <img src="/logo.png" alt="Centurion University of Technology and Management" className="h-[68px] w-auto" />
            </a>
            <div className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map(link => (
                <a key={link.label} href={link.href} className="text-[16px] font-medium text-gray-700 hover:text-primary-500 transition-colors">{link.label}</a>
              ))}
            </div>
            <div className="hidden md:flex items-center gap-3">
              <a href="/login" className="text-[16px] font-medium px-4 py-2 text-gray-700 hover:text-primary-500 transition-colors">Login</a>
              <a href="#apply" className="text-[16px] font-semibold px-5 py-2.5 bg-primary-500 text-white hover:bg-primary-600 transition-colors">Apply now</a>
            </div>
            <button onClick={() => setNavOpen(!navOpen)} aria-label="Menu" className="md:hidden p-2 text-gray-700">
              {navOpen ? <X size={22}/> : <Menu size={22}/>}
            </button>
          </div>
        </div>
        {navOpen && (
          <div className="md:hidden bg-white border-t border-gray-200">
            <div className="px-5 py-4 space-y-1">
              {NAV_LINKS.map(link => (
                <a key={link.label} href={link.href} onClick={() => setNavOpen(false)} className="flex items-center gap-2 py-2.5 text-[16px] font-medium text-gray-700 hover:text-primary-500">
                  <ChevronRight size={14}/> {link.label}
                </a>
              ))}
              <div className="border-t border-gray-200 pt-3 mt-3 flex flex-col gap-2">
                <a href="/login" className="py-2.5 text-[16px] text-center font-medium text-gray-700">Login</a>
                <a href="#apply" onClick={() => setNavOpen(false)} className="py-3 bg-primary-500 text-white text-[16px] font-semibold text-center">Apply now</a>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ══════════════════════ HERO: layered parallax scene ══════════════════════ */}
      <ParallaxHero
        eyebrow="CUEE 2026 admissions are open"
        title="Study at Centurion University."
        text="NAAC A+ accredited, with more than 100 programmes across four campuses."
        primaryHref="#apply" primaryLabel="Apply now"
        secondaryHref="#programs" secondaryLabel="See programmes"
      />

      {/* ══════════════════════ STATS STRIP ══════════════════════ */}
      <div className="relative z-20 -mt-12 max-w-7xl mx-auto px-5 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 bg-white border border-gray-200 divide-x divide-y md:divide-y-0 divide-gray-200">
          {STATS.map(stat => (
            <div key={stat.label} className="px-6 py-7 flex items-center gap-4">
              <stat.icon size={30} className="text-accent-600 flex-shrink-0" strokeWidth={1.6}/>
              <div>
                <div className="text-[30px] font-semibold text-primary-900 tabular-nums leading-none whitespace-nowrap">{stat.value}</div>
                <div className="text-gray-600 text-sm mt-1.5">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════ APPLY ══════════════════════ */}
      <section id="apply" className="scroll-mt-20 bg-primary-500 pt-28 pb-20 lg:pt-36 lg:pb-28 -mt-12">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-start">
          <div className="lg:sticky lg:top-32">
            <h2 className="text-4xl md:text-5xl font-semibold text-white tracking-tight leading-[1.05] max-w-[14ch]">Start your application today.</h2>
            <p className="text-white/85 text-lg leading-relaxed mt-5 max-w-[30em]">Tell us a little about yourself. A counsellor will call you, answer your questions and guide you through the next steps. It's free.</p>
            <ul className="mt-10 space-y-4 text-white text-lg">
              {['Free counselling, no application fee', 'A counsellor calls you and answers your questions', 'Scholarships for merit and need'].map(t => (
                <li key={t} className="flex items-start gap-3"><CheckCircle size={22} className="text-accent-400 flex-shrink-0 mt-0.5"/>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <div data-speed="0.04">
              {formCard}
              <div className="mt-4">
                <a href="/student-portal" className="inline-flex items-center gap-1.5 text-white hover:underline text-sm">
                  Already applied? Check your application status <ArrowRight size={14}/>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ PROGRAMS ══════════════════════ */}
      <section id="programs" className="scroll-mt-20 py-28 lg:py-36 bg-gray-50">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-semibold text-primary-900 tracking-tight leading-[1.05]">Popular programmes</h2>
            <p className="text-gray-600 text-lg leading-relaxed mt-5">Undergraduate, postgraduate and research programmes across engineering, management, agriculture and the sciences.</p>
          </div>
          <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:pb-16">
            {PROGRAMS.map((prog, i) => (
              <div key={i} className="relative">
                <a href="#apply" data-speed={i % 2 === 0 ? '0.05' : '-0.05'}
                  className="group block bg-white border border-gray-200 hover:border-primary-500 transition-colors will-change-transform overflow-hidden">
                  <div className="aspect-[4/3] overflow-hidden bg-primary-100">
                    <img src={prog.img} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>{prog.duration}</span>
                      {prog.tag ? <span className="text-accent-700 font-semibold">{prog.tag}</span> : null}
                    </div>
                    <div className="font-semibold text-primary-900 text-xl leading-snug mt-2">{prog.name}</div>
                  </div>
                </a>
              </div>
            ))}
          </div>
          <a href="#apply" className="inline-flex items-center gap-2 text-primary-500 font-semibold text-base mt-10 hover:underline">
            Apply to any programme <ArrowRight size={16}/>
          </a>
        </div>
      </section>

      {/* ══════════════════════ TAGLINE BAND ══════════════════════ */}
      <div className="bg-accent-500 overflow-hidden py-8" aria-hidden="true">
        <div className="relative">
          <p data-x="-0.35" className="whitespace-nowrap text-[clamp(40px,7vw,104px)] font-semibold text-primary-900 tracking-tight leading-none will-change-transform pl-[10vw]">
            Shaping Lives… Empowering Communities… Shaping Lives… Empowering Communities…
          </p>
        </div>
      </div>

      {/* ══════════════════════ PHOTO BAND ══════════════════════ */}
      <section className="relative h-[360px] md:h-[460px] overflow-hidden bg-primary-900">
        <img data-speed="-0.12" src="/landing/images/cutm13.jpg" alt="Centurion University campus" loading="lazy" className="absolute inset-x-0 -top-[20%] w-full h-[140%] object-cover will-change-transform" />
        <div className="absolute inset-0 bg-primary-900/55" />
        <div className="relative h-full max-w-7xl mx-auto px-5 lg:px-8 flex items-end pb-12">
          <p className="text-white text-[clamp(28px,4vw,56px)] font-semibold tracking-tight leading-[1.05] max-w-[18ch]">A campus built around what happens after the degree.</p>
        </div>
      </section>

      {/* ══════════════════════ WHY CUTM ══════════════════════ */}
      <section id="why" className="scroll-mt-20 py-28 lg:py-36 bg-white">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 grid lg:grid-cols-[1fr_1.5fr] gap-14 lg:gap-24">
          <div className="lg:sticky lg:top-32 self-start">
            <h2 className="text-4xl md:text-5xl font-semibold text-primary-900 tracking-tight leading-[1.05]">Why students choose CUTM</h2>
            <p className="text-gray-600 text-lg leading-relaxed mt-5">From research to placement, a university built around what happens after the degree.</p>
            <a href="#apply" className="inline-flex items-center gap-2 bg-primary-500 text-white font-semibold text-base px-7 py-3.5 mt-8 hover:bg-primary-600 transition-colors">
              Apply now <ArrowRight size={16}/>
            </a>
          </div>
          <div className="divide-y divide-gray-200 border-y border-gray-200">
            {FEATURES.map((f, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr] gap-5 py-8">
                <f.icon size={26} className="text-primary-500 mt-1" strokeWidth={1.6}/>
                <div>
                  <h3 className="font-semibold text-primary-900 text-xl">{f.title}</h3>
                  <p className="text-gray-600 text-base leading-relaxed mt-2 max-w-xl">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ CAMPUSES ══════════════════════ */}
      <section id="campuses" className="scroll-mt-20 relative py-28 lg:py-36 bg-primary-900 overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-5 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-semibold text-white tracking-tight leading-[1.05]">Four campuses across Odisha and Andhra Pradesh</h2>
            <p className="text-white/75 text-lg mt-5">Study at the campus closest to the programme you want.</p>
          </div>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:pb-14">
            {CAMPUSES.map((campus, i) => (
              <div key={i} className="relative">
                <div data-speed={i % 2 === 0 ? '0.06' : '-0.06'} className="bg-white/10 border border-white/15 will-change-transform overflow-hidden">
                  <div className="aspect-[16/10] overflow-hidden"><img src={campus.img} alt={campus.name + ' campus'} loading="lazy" className="w-full h-full object-cover" /></div>
                  <div className="p-6 min-h-[190px]">
                    <h3 className="font-semibold text-white text-2xl">{campus.name}</h3>
                    <p className="text-accent-400 text-sm font-medium mt-1">{campus.state}</p>
                    <p className="text-white/80 text-base leading-relaxed mt-4">{campus.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ ACCREDITATION ══════════════════════ */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <p className="text-base text-gray-600 mb-6">Recognised and accredited by</p>
          <div className="flex flex-wrap gap-x-14 gap-y-4">
            {['NAAC A+', 'NBA', 'UGC', 'AICTE', 'ICAR', 'NIRF'].map(acc => (
              <span key={acc} className="text-3xl font-semibold text-primary-900 tracking-tight">{acc}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ FINAL CTA ══════════════════════ */}
      <section className="py-24 bg-accent-500">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 grid lg:grid-cols-[1.4fr_1fr] gap-12 items-end">
          <h2 className="text-5xl md:text-6xl font-semibold text-primary-900 tracking-tight leading-[1.02]">Ready to start? Applying is free.</h2>
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
            <a href="#apply" className="inline-flex items-center justify-center gap-2 bg-primary-900 hover:bg-primary-800 text-white font-semibold px-8 py-4 transition-colors text-base">
              Apply now <ArrowRight size={18}/>
            </a>
            <a href="tel:+917065569969" className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-primary-900 font-semibold px-8 py-4 transition-colors text-base">
              <Phone size={18}/> Call admissions
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════ FOOTER ══════════════════════ */}
      <footer className="bg-primary-900 text-white/70">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4">
                <span className="inline-flex bg-white rounded-md p-2">
                  <img
                    src="/logo.png"
                    alt="Centurion University"
                    className="h-28 w-auto"
                  />
                </span>
              </div>
              <p className="text-xs leading-relaxed text-white/60">
                Centurion University of Technology and Management.
              </p>
            </div>

            {/* Programs */}
            <div>
              <h4 className="text-white text-sm font-semibold mb-4">Programs</h4>
              <ul className="space-y-2 text-xs">
                {['B.Tech', 'MBA', 'B.Sc Agriculture', 'BCA / BBA', 'M.Tech', 'MCA'].map(p => (
                  <li key={p}><a href="#apply" className="hover:text-white transition">{p}</a></li>
                ))}
              </ul>
            </div>

            {/* Campuses */}
            <div>
              <h4 className="text-white text-sm font-semibold mb-4">Campuses</h4>
              <ul className="space-y-2 text-xs">
                {CAMPUSES.map(c => (
                  <li key={c.name}><a href="#campuses" className="hover:text-white transition">{c.name}, {c.state}</a></li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white text-sm font-semibold mb-4">Contact</h4>
              <ul className="space-y-3 text-xs">
                <li>
                  <a href="tel:+917065569969" className="flex items-center gap-2 hover:text-white transition">
                    <Phone size={13}/> +91 70655 69969
                  </a>
                </li>
                <li>
                  <a href="mailto:admissions@cutmap.ac.in" className="flex items-center gap-2 hover:text-white transition">
                    <Mail size={13}/> admissions@cutmap.ac.in
                  </a>
                </li>
                <li>
                  <span className="flex items-start gap-2">
                    <MapPin size={13} className="mt-0.5 flex-shrink-0"/>
                    <span className="leading-relaxed">
                      Tekkali Village, Nelimarla Mandal, Vizianagaram — Pin: 535003, Andhra Pradesh, India
                    </span>
                  </span>
                </li>
                <li>
                  <span className="flex items-start gap-2">
                    <MapPin size={13} className="mt-0.5 flex-shrink-0"/>
                    <span className="leading-relaxed">
                      Flat No: 501, Akruthi Vijayalakshmi Apartments, Gurudwara, Visakhapatnam — Pin: 530013, Andhra Pradesh, India
                    </span>
                  </span>
                </li>
                <li>
                  <a href="https://www.cutmap.ac.in" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition">
                    <Globe size={13}/> www.cutmap.ac.in
                  </a>
                </li>
                <li className="pt-2">
                  <a href="/login" className="text-accent-400 hover:text-accent-300 font-medium transition">
                    Staff Login →
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/50">
            <p>© {new Date().getFullYear()} Centurion University of Technology and Management. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-gray-400 transition">Privacy Policy</a>
              <a href="#" className="hover:text-gray-400 transition">Terms of Use</a>
              <a href="/student-portal" className="hover:text-gray-400 transition">Student Portal</a>
            </div>
          </div>
        </div>
      </footer>
      <ChatWidget />
    </div>
  )
}
