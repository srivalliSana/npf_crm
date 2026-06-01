import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCcrm } from '../context/CcrmContext'
import {
  HelpCircle, BookOpen, Users, FileText, CreditCard, Mail, Phone, MessageCircle,
  Settings, Shield, Search, ChevronRight, Send, Zap, ExternalLink
} from 'lucide-react'

const SECTIONS = [
  {
    id: 'gettingStarted', title: 'Getting Started', icon: BookOpen,
    items: [
      { q: 'How do I log in?',                a: 'Use your CUTM email and password at /login. Admins can reset your password from Users → Reset key icon.' },
      { q: 'What roles exist?',               a: 'Admin (full access), Manager (team supervision), Counselor (own leads), Finance (payments). System roles can\'t be deleted but you can add custom roles.' },
      { q: 'Why was I logged out?',           a: 'Auto-logout fires after 15 minutes of inactivity (mouse, keyboard, or scroll resets the timer). 30 seconds before, a warning shows — click anywhere to stay in.' },
    ]
  },
  {
    id: 'leads', title: 'Lead Manager', icon: Users,
    items: [
      { q: 'Where do leads come from?',       a: 'Facebook/Instagram/Google/LinkedIn Ads (via webhook), WhatsApp chatbot, the public Inquiry form, Excel bulk uploads, and counsellor manual entry.' },
      { q: 'How are leads assigned?',         a: 'Round-robin to active counsellors by default. Admins can pick a specific counsellor during bulk upload. Counsellors only see their own leads — Admin/Manager see all.' },
      { q: 'What do the stages mean?',        a: 'Untouched → Contacted → Follow Up → Interested → Process for Payment → Payment Success. "Not Interested" is a terminal state with a reason captured.' },
      { q: 'What is the lead score?',         a: 'AI-calculated 0–100 score: Source quality (30) + Course tier (25) + Profile completeness (25) + Stage (20). Bucketed: Hot 75+, Warm 50–74, Nurture 25–49, Cold <25.' },
      { q: 'How do I bulk upload?',           a: 'Click Bulk Upload → download the template → fill in (Name, Mobile, Source required; rest optional) → upload. Admin can choose round-robin OR assign all to one counsellor.' },
    ]
  },
  {
    id: 'applications', title: 'Applications', icon: FileText,
    items: [
      { q: 'When is an application created?',  a: 'Automatically when a lead is marked "Process for Payment". App ID format: CUEEAP26XXXX (general) or CUEESM26XXXX (social-media leads).' },
      { q: 'What is the Admission Details form?', a: ' The 18-field KYC form (Student/Parent info, address, 10th/12th academics, course). Required before generating payment link. Auto-fills the Provisional Letter PDF on payment.' },
      { q: 'How is the Provisional Letter generated?', a: 'Auto-fires when payment is recorded (UTR entered or approved). PDF emailed to student + parent CC. Manual "Send Provisional Letter" button also available in lead sidebar.' },
    ]
  },
  {
    id: 'payments', title: 'Payments', icon: CreditCard,
    items: [
      { q: 'How do I generate a payment link?', a: 'From the Application Manager row or Lead Profile sidebar → click Generate Link. Pick Online (Razorpay) or Offline (manual UTR). Send via WhatsApp or copy URL.' },
      { q: 'What\'s the offline flow?',        a: 'Student/counsellor enters the UTR/bank reference → status becomes "Payment Done". Finance/Admin then clicks Approve to mark as Paid.' },
      { q: 'Can I bulk-approve payments?',    a: 'Yes — Payments page → Bulk Approve (Finance/Admin). Download template, fill App ID + UTR per row, upload. All matching pending payments marked Paid.' },
    ]
  },
  {
    id: 'comms', title: 'Communications', icon: Mail,
    items: [
      { q: 'Email campaigns',        a: 'Email Campaigns page → create → pick a segment (All Leads / Hot / Interested / Process for Payment / Not Interested / etc.) → send. Each recipient logged with status + msmtp error if any.' },
      { q: 'WhatsApp bulk send',     a: 'Lead Manager → select rows → WhatsApp button. Choose template, edit, send. Uses configured WhatsApp Business API token.' },
      { q: 'RCS messaging',          a: 'Lead Manager → select rows → RCS button. Pick an approved template (from rcssms.in webhook or manually added in Integrations → RCS Templates) → send.' },
      { q: 'Drip workflows',         a: 'Drip Flows page — schedule multi-step automated nurturing (Day 0: WA, Day 2: SMS, Day 5: Email, etc.). 4 built-in sequences ready to enrol leads into.' },
    ]
  },
  {
    id: 'integrations', title: 'Integrations & Setup', icon: Settings,
    items: [
      { q: 'Setting up an integration', a: 'Integrations page (Admin only) → click any card → Edit Config → paste API keys → Save. Test Connection button verifies credentials live for SMTP.' },
      { q: 'What integrations exist?',  a: 'Meta (Facebook/Instagram) Ads, Google Ads, LinkedIn, WhatsApp Business, RCS (5 providers), SMS Gateway (7 providers), Razorpay, PayU, Ameyo/Exotel telephony, Gmail/SMTP, Google Sheets/Analytics.' },
      { q: 'Where do I see live health?', a: 'Dashboard → Integration Health widget (red/yellow/green per integration). Admin/Manager also see Server Health + Security & User Access widgets.' },
    ]
  },
  {
    id: 'security', title: 'Security & Users', icon: Shield,
    items: [
      { q: 'How do I add a user?',          a: 'Users page (Admin only) → Add User → fill role/team/password. Or Bulk Upload → download template → upload Excel.' },
      { q: 'Can I create custom roles?',    a: 'Yes — Users → Teams & Roles button → add custom roles (with description). System roles (Admin/Manager/Counselor/Finance) are locked but you can add as many custom roles as needed.' },
      { q: 'How to reset a password?',      a: 'Users page → click the Key icon next to any user → generates a friendly temp password (e.g. Sun#4827), emails it to them, shows once in modal with copy button.' },
      { q: 'Bulk activate / deactivate?',   a: 'Users page → tick checkboxes → bulk action bar appears at top with Activate / Deactivate buttons.' },
    ]
  },
]

export default function Help() {
  const { currentUser } = useCcrm()
  const navigate = useNavigate()
  const [openSection, setOpenSection] = useState('gettingStarted')
  const [search, setSearch] = useState('')

  const allItems = SECTIONS.flatMap(s => s.items.map(i => ({ ...i, section: s.title })))
  const filtered = search
    ? allItems.filter(i =>
        i.q.toLowerCase().includes(search.toLowerCase()) ||
        i.a.toLowerCase().includes(search.toLowerCase())
      )
    : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HelpCircle size={26} className="text-primary-500" /> Help & Documentation
          </h1>
          <p className="text-sm text-gray-500 mt-1">Quick answers, how-to guides, and shortcuts for {currentUser?.role || 'all users'}.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search help (e.g. 'reset password', 'bulk upload', 'lead score')"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
        />
      </div>

      {/* Search results */}
      {search && (
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-2">{filtered.length} result{filtered.length === 1 ? '' : 's'}</p>
          <div className="space-y-2">
            {filtered.map((item, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-800">{item.q}</p>
                  <span className="text-[10px] text-gray-400">{item.section}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">No matches — try a different keyword.</p>
            )}
          </div>
        </div>
      )}

      {!search && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Section index */}
          <div className="lg:col-span-1 space-y-1">
            {SECTIONS.map(s => {
              const Icon = s.icon
              const active = openSection === s.id
              return (
                <button key={s.id} onClick={() => setOpenSection(s.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${active ? 'bg-primary-500 text-white shadow' : 'bg-white border border-gray-200 text-gray-700 hover:border-primary-300'}`}>
                  <span className="flex items-center gap-2">
                    <Icon size={15} /> {s.title}
                  </span>
                  <ChevronRight size={13} className={active ? 'text-white' : 'text-gray-400'} />
                </button>
              )
            })}

            {/* Quick links */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mt-4">
              <p className="text-xs font-bold text-blue-700 uppercase mb-2">Quick Links</p>
              <div className="space-y-1">
                {[
                  { label: 'Dashboard',    to: '/dashboard',    icon: Zap        },
                  { label: 'Lead Manager', to: '/leads',        icon: Users      },
                  { label: 'Applications', to: '/applications', icon: FileText   },
                  { label: 'Payments',     to: '/payments',     icon: CreditCard },
                ].map(l => (
                  <button key={l.to} onClick={() => navigate(l.to)}
                    className="w-full flex items-center gap-2 text-xs text-blue-700 hover:text-blue-900 py-1 px-2 rounded hover:bg-blue-100">
                    <l.icon size={12} /> {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section content */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            {(() => {
              const sec = SECTIONS.find(s => s.id === openSection) || SECTIONS[0]
              const Icon = sec.icon
              return (
                <>
                  <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Icon size={20} className="text-primary-500" /> {sec.title}
                  </h2>
                  <div className="space-y-4">
                    {sec.items.map((item, i) => (
                      <div key={i} className="border-l-4 border-primary-300 pl-4 py-1">
                        <p className="text-sm font-semibold text-gray-800 mb-1">{item.q}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Contact support */}
      <div className="mt-8 bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-100 rounded-xl p-5">
        <h3 className="font-bold text-primary-800 mb-2 flex items-center gap-2"><Phone size={16}/> Need more help?</h3>
        <p className="text-sm text-gray-600 mb-3">
          For issues not covered here — bugs, integration setup, deployment, or feature requests — please contact your CCRM administrator.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="mailto:admin@cutmap.ac.in" className="flex items-center gap-1.5 px-3 py-2 bg-white border border-primary-200 rounded-lg text-primary-700 hover:bg-primary-50">
            <Mail size={14} /> admin@cutmap.ac.in
          </a>
          <a href="tel:+916742559441" className="flex items-center gap-1.5 px-3 py-2 bg-white border border-primary-200 rounded-lg text-primary-700 hover:bg-primary-50">
            <Phone size={14} /> +91 674 2559441
          </a>
          <a href="https://github.com/srivalliSana/npf_crm" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 px-3 py-2 bg-white border border-primary-200 rounded-lg text-primary-700 hover:bg-primary-50">
            <ExternalLink size={14} /> Source / Issues
          </a>
        </div>
      </div>
    </div>
  )
}
