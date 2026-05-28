import React, { useState, useEffect } from 'react'
import ChatWidget from '../components/ChatWidget'
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
  { name: 'B.Tech CSE (AI/ML)', icon: '🤖', duration: '4 Yrs', tag: 'Trending', tagColor: 'bg-red-100 text-red-600' },
  { name: 'MBA', icon: '💼', duration: '2 Yrs', tag: 'Popular', tagColor: 'bg-blue-100 text-blue-600' },
  { name: 'B.Sc Agriculture', icon: '🌾', duration: '4 Yrs', tag: 'High Demand', tagColor: 'bg-green-100 text-green-700' },
  { name: 'B.Tech ECE', icon: '⚡', duration: '4 Yrs', tag: '', tagColor: '' },
  { name: 'BCA', icon: '💻', duration: '3 Yrs', tag: '', tagColor: '' },
  { name: 'MCA', icon: '🖥️', duration: '2 Yrs', tag: '', tagColor: '' },
  { name: 'B.Com', icon: '📊', duration: '3 Yrs', tag: '', tagColor: '' },
  { name: 'B.Tech Civil', icon: '🏗️', duration: '4 Yrs', tag: '', tagColor: '' },
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
  { name: 'Bhubaneswar', state: 'Odisha', emoji: '🏛️', desc: 'Main campus. 100+ acres. Engineering, Management, Agriculture, Sciences.' },
  { name: 'Vizianagaram', state: 'Andhra Pradesh', emoji: '🏫', desc: 'Vibrant campus. Strong industry linkages in Andhra Pradesh region.' },
  { name: 'Paralakhemundi', state: 'Odisha', emoji: '🌿', desc: 'Serene eco-campus. Known for Agriculture and Life Sciences.' },
  { name: 'Balasore', state: 'Odisha', emoji: '🚀', desc: 'Growing tech campus. Close to DRDO research corridor.' },
]

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
      const res = await fetch('/api/public/inquiry', {
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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 40%, #0d9488 100%)' }}>
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={42} className="text-green-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Inquiry Received! 🎉</h2>
            <p className="text-gray-600 text-sm">{serverMsg || 'Our counselor will contact you within 24 hours.'}</p>
          </div>
          <div className="bg-blue-50 rounded-2xl p-5 text-left space-y-3">
            <p className="text-sm font-semibold text-gray-700 mb-2">What happens next:</p>
            {[
              'Counselor calls you within 24 hours',
              'Receive course brochure via WhatsApp',
              'Schedule a campus visit or virtual tour',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                {step}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-gray-400">For urgent queries:</p>
            <a href="tel:+916742559441" className="flex items-center justify-center gap-2 text-primary-600 font-semibold hover:underline">
              <Phone size={15} /> +91 674 2559441
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
    `w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition ${
      err ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'
    }`

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ══════════════════════ NAVBAR ══════════════════════ */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/95 backdrop-blur-sm shadow-md' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <a href="#" className="flex items-center">
              <img
                src="https://cutmap.ac.in/wp-content/themes/centurion/images/logo.svg"
                alt="Centurion University of Technology and Management"
                className="h-10 w-auto transition-all duration-300"
                style={{ filter: scrolled ? 'none' : 'brightness(0) invert(1)' }}
              />
            </a>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-7">
              {NAV_LINKS.map(link => (
                <a key={link.label} href={link.href}
                  className={`text-sm font-medium transition-colors hover:text-primary-500 ${scrolled ? 'text-gray-700' : 'text-white/85 hover:text-white'}`}>
                  {link.label}
                </a>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="hidden md:flex items-center gap-3">
              <a href="/login"
                className={`text-sm font-medium px-4 py-2 rounded-lg transition ${scrolled ? 'text-gray-700 hover:bg-gray-100' : 'text-white/85 hover:text-white hover:bg-white/10'}`}>
                Login
              </a>
              <a href="#apply"
                className="text-sm font-bold px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-600/30 transition">
                Apply Now
              </a>
            </div>

            {/* Mobile hamburger */}
            <button onClick={() => setNavOpen(!navOpen)}
              className={`md:hidden p-2 rounded-lg transition ${scrolled ? 'text-gray-700' : 'text-white'}`}>
              {navOpen ? <X size={22}/> : <Menu size={22}/>}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {navOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-xl">
            <div className="px-5 py-4 space-y-1">
              {NAV_LINKS.map(link => (
                <a key={link.label} href={link.href} onClick={() => setNavOpen(false)}
                  className="flex items-center gap-2 py-2.5 text-sm font-medium text-gray-700 hover:text-primary-600">
                  <ChevronRight size={14}/> {link.label}
                </a>
              ))}
              <div className="border-t border-gray-100 pt-3 mt-3 flex flex-col gap-2">
                <a href="/login" className="py-2.5 text-sm text-center font-medium text-gray-600 hover:text-primary-600">Login</a>
                <a href="#apply" className="py-3 bg-primary-600 text-white text-sm font-bold text-center rounded-xl">Apply Now</a>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ══════════════════════ HERO ══════════════════════ */}
      <section className="relative min-h-screen flex items-center pt-16" style={{
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 20%, #0d9488 50%, #0369a1 75%, #1e40af 100%)'
      }}>
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
          backgroundSize: '44px 44px'
        }} />
        {/* Glows */}
        <div className="absolute top-1/4 right-1/4 w-72 h-72 rounded-full bg-teal-300/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 left-1/5 w-56 h-56 rounded-full bg-emerald-300/15 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-24 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            {/* Left — headline */}
            <div>
              <div className="inline-flex items-center gap-2 bg-yellow-400/15 border border-yellow-400/30 text-yellow-300 text-xs font-bold px-4 py-2 rounded-full mb-7">
                🎓 CUEE 2026 — Admissions Now Open
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] mb-6 tracking-tight">
                Shape Your<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-emerald-300">Future</span> with<br />
                World-Class Education
              </h1>
              <p className="text-blue-200 text-lg leading-relaxed mb-10 max-w-xl">
                Centurion University — NAAC A+ accredited, 100+ programs, and a 95% placement record.
                Your dream career starts here.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-5 mb-10">
                {STATS.map(stat => (
                  <div key={stat.label} className="text-center">
                    <div className="text-2xl lg:text-3xl font-extrabold text-white">{stat.value}</div>
                    <div className="text-blue-300 text-[11px] mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <a href="#apply"
                  className="inline-flex items-center gap-2 bg-white text-primary-800 font-bold text-sm px-7 py-3.5 rounded-xl hover:bg-blue-50 transition shadow-xl">
                  Apply Now <ArrowRight size={16}/>
                </a>
                <a href="#programs"
                  className="inline-flex items-center gap-2 border border-white/25 hover:border-white/50 text-white/80 hover:text-white font-medium text-sm px-7 py-3.5 rounded-xl transition">
                  Explore Programs
                </a>
              </div>

              <div className="mt-10 flex items-center gap-6">
                <div className="flex -space-x-2">
                  {['👦','👧','🧑','👩','🧒'].map((e,i) => (
                    <div key={i} className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 border-2 border-white/20 flex items-center justify-center text-sm">{e}</div>
                  ))}
                </div>
                <div className="text-blue-200 text-sm">
                  <strong className="text-white">2,400+</strong> students applied this month
                </div>
              </div>
            </div>

            {/* Right — Apply form */}
            <div id="apply">
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                {/* Form header */}
                <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-7 py-5">
                  <h3 className="text-white font-bold text-lg">Apply for CUEE 2026</h3>
                  <p className="text-primary-100 text-xs mt-1">Free counseling · No application fee · Quick process</p>
                </div>

                <div className="p-7">
                  {errors.submit && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-red-700 text-sm">
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
                      className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-primary-600/20 text-sm">
                      {loading ? (
                        <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg> Submitting...</>
                      ) : <><Send size={16}/> Submit Inquiry</>}
                    </button>
                  </form>

                  <p className="text-center text-[11px] text-gray-400 mt-4">
                    🔒 Your information is confidential and secure. No spam.
                  </p>
                </div>
              </div>

              {/* Student portal link */}
              <div className="mt-4 text-center">
                <a href="/student-portal" className="inline-flex items-center gap-1.5 text-blue-200 hover:text-white text-sm transition">
                  Already applied? Check your application status <ArrowRight size={14}/>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════ PROGRAMS ══════════════════════ */}
      <section id="programs" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-primary-600 bg-primary-50 px-4 py-2 rounded-full mb-4">
              <BookOpen size={13}/> OUR PROGRAMS
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">Popular Programs at CUTM</h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base">Choose from 100+ undergraduate, postgraduate, and research programs across engineering, management, agriculture, and sciences.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {PROGRAMS.map((prog, i) => (
              <a key={i} href="#apply"
                className="bg-white rounded-2xl p-5 border border-gray-100 hover:border-primary-200 hover:shadow-lg transition-all group cursor-pointer">
                <div className="text-3xl mb-3">{prog.icon}</div>
                <div className="font-bold text-gray-900 text-sm mb-1 group-hover:text-primary-600 transition">{prog.name}</div>
                <div className="text-xs text-gray-500 mb-3">{prog.duration}</div>
                {prog.tag && (
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${prog.tagColor}`}>
                    {prog.tag}
                  </span>
                )}
              </a>
            ))}
          </div>

          <div className="text-center mt-8">
            <a href="#apply" className="inline-flex items-center gap-2 text-primary-600 font-semibold text-sm hover:text-primary-700">
              View all 100+ programs <ArrowRight size={15}/>
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════ WHY CUTM ══════════════════════ */}
      <section id="why" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-purple-600 bg-purple-50 px-4 py-2 rounded-full mb-4">
              <Zap size={13}/> WHY CHOOSE CUTM
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">Excellence in Every Dimension</h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base">From research to placement, CUTM delivers a transformative education experience.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <div key={i} className="p-6 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all">
                <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-4`}>
                  <feature.icon size={22}/>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ CAMPUSES ══════════════════════ */}
      <section id="campuses" className="py-20 bg-gradient-to-br from-emerald-950 to-teal-900">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-4 py-2 rounded-full mb-4">
              <MapPin size={13}/> OUR CAMPUSES
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">4 Campuses Across India</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-base">Study at any of our world-class campuses in Odisha and Andhra Pradesh.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CAMPUSES.map((campus, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all">
                <div className="text-4xl mb-4">{campus.emoji}</div>
                <h3 className="font-bold text-white text-lg mb-1">{campus.name}</h3>
                <p className="text-cyan-400 text-xs font-medium mb-3">{campus.state}</p>
                <p className="text-slate-400 text-sm leading-relaxed">{campus.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ ACCREDITATION ══════════════════════ */}
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="text-center mb-8">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recognized & Accredited By</p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
            {['NAAC A+', 'NBA', 'UGC', 'AICTE', 'ICAR', 'NIRF'].map(acc => (
              <div key={acc} className="flex items-center justify-center">
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-6 py-3 text-sm font-bold text-gray-600">{acc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════ FINAL CTA ══════════════════════ */}
      <section className="py-20 bg-gradient-to-br from-teal-600 to-emerald-700">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-1 mb-4">
            {[1,2,3,4,5].map(s => <Star key={s} size={18} className="text-yellow-400 fill-yellow-400"/>)}
            <span className="text-white/80 text-sm ml-2">Rated 4.8/5 by students</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-5">
            Ready to Start Your Journey?
          </h2>
          <p className="text-primary-100 text-lg mb-8">
            Thousands of students have transformed their lives through CUTM. Be the next one.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#apply"
              className="inline-flex items-center justify-center gap-2 bg-white text-primary-700 font-bold px-8 py-4 rounded-xl hover:bg-blue-50 transition shadow-xl text-base">
              Apply Now — It's Free <ArrowRight size={18}/>
            </a>
            <a href="tel:+916742559441"
              className="inline-flex items-center justify-center gap-2 border-2 border-white/40 hover:border-white text-white font-semibold px-8 py-4 rounded-xl transition text-base">
              <Phone size={18}/> Call Admissions Helpline
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════ FOOTER ══════════════════════ */}
      <footer className="bg-gray-950 text-gray-400">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="mb-4">
                <img
                  src="https://cutmap.ac.in/wp-content/themes/centurion/images/logo.svg"
                  alt="Centurion University"
                  className="h-10 w-auto brightness-0 invert opacity-80"
                />
              </div>
              <p className="text-xs leading-relaxed text-gray-500">
                Centurion University of Technology and Management — Building careers, transforming lives since 2010.
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
                  <a href="tel:+916742559441" className="flex items-center gap-2 hover:text-white transition">
                    <Phone size={13}/> +91 674 2559441
                  </a>
                </li>
                <li>
                  <a href="mailto:admissions@cutm.ac.in" className="flex items-center gap-2 hover:text-white transition">
                    <Mail size={13}/> admissions@cutm.ac.in
                  </a>
                </li>
                <li>
                  <span className="flex items-start gap-2">
                    <MapPin size={13} className="mt-0.5 flex-shrink-0"/>
                    Bhubaneswar, Odisha — 752 050
                  </span>
                </li>
                <li className="pt-2">
                  <a href="/login" className="text-primary-400 hover:text-primary-300 font-medium transition">
                    Staff Login →
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
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
