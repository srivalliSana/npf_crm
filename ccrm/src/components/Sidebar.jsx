import React, { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, CheckSquare, Megaphone,
  BarChart2, Settings, LogOut, CreditCard,
  HelpCircle, Calendar, Shield, FileCheck, Puzzle,
  Trophy, Mail, Globe, ExternalLink, Zap, Radio,
  PieChart, Activity, Plug, Server, ShieldCheck, ChevronDown, ScrollText, PhoneCall, Layers, MessageCircle, Building2, GraduationCap,
  CheckCircle, DollarSign, Gauge, Network, X, Tag, LifeBuoy, Workflow, ClipboardCheck
} from 'lucide-react'
import { APP_VERSION } from '../version'
import { useCcrm } from '../context/CcrmContext'
import { usePermissions } from '../hooks/usePermissions'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/Accordion'

const NAV_ITEMS = [
  { icon: Building2,       label: 'Tenants',            to: '/platform-tenants',       platformOnly: true },
  { icon: Tag,             label: 'Lead ID Formats',    to: '/lead-id-settings',       platformOnly: true },
  { icon: LayoutDashboard, label: 'Dashboard',          to: '/dashboard',              roles: null },
  { icon: GraduationCap,   label: 'Programs',           to: '/programs',               roles: ['Admin'] },
  { icon: Users,           label: 'Leads',              to: '/leads',                  roles: null },
  {
    icon: Users,
    label: 'Website Leads',
    roles: ['Admin'],
    submenu: [
      { label: 'Overview', to: '/websites-dashboard' },
      { label: 'FTL',    to: '/ftl-leads' },
      { label: 'GTIB',   to: '/gtib-leads' },
      { label: 'GTTECH', to: '/gttech-leads' },
      { label: 'ESSE',   to: '/esse-leads' }
    ]
  },
  { icon: FileText,        label: 'Applications',  to: '/applications',     roles: null },
  { icon: CheckCircle,     label: 'Doc Verification', to: '/document-verification', roles: ['Admin', 'Counselor'] },
  { icon: DollarSign,      label: 'Finance Verify',   to: '/finance-verification',  roles: ['Admin'] },
  { icon: LifeBuoy,        label: 'Grievances',       to: '/grievances',            roles: ['Admin', 'Counselor', 'Manager'] },
  { icon: CheckSquare,     label: 'Tasks',         to: '/tasks',            roles: null },
  { icon: Megaphone,       label: 'Campaigns',     to: '/campaigns',        roles: null },
  { icon: CreditCard,      label: 'Payments',      to: '/payments',         roles: null },
  { icon: Calendar,        label: 'Calendar',      to: '/calendar',         roles: null },
  { icon: FileCheck,       label: 'Documents',     to: '/documents',        roles: null },
  { icon: Gauge,           label: 'Command Centre', to: '/command-centre',  roles: ['Admin', 'Manager'], permission: 'commandcentre.view' },
  { icon: PieChart,        label: 'Analytics',     to: '/analytics',        roles: ['Admin', 'Manager'], permission: 'analytics.view' },
  { icon: Activity,        label: 'Productivity',  to: '/productivity',     roles: ['Admin', 'Manager'] },
  { icon: BarChart2,       label: 'Call Report',   to: '/call-activity',    roles: ['Admin', 'Manager'] },
  { icon: MessageCircle,   label: 'Social Comments', to: '/social-comments', roles: ['Admin', 'Manager'] },
  { icon: BarChart2,       label: 'Reports',       to: '/reports',          roles: ['Admin', 'Manager'] },
  { icon: ScrollText,      label: 'Upload Logs',   to: '/logs',             roles: ['Admin', 'Manager'] },
  { icon: Radio,           label: 'Comms',         to: '/comms-report',     roles: ['Admin'] },
  { icon: Trophy,          label: 'Leaderboard',   to: '/leaderboard',      roles: ['Admin', 'Manager'] },
  { icon: Mail,            label: 'Email Camps',   to: '/email-campaigns',  roles: ['Admin', 'Manager'] },
  { icon: Zap,             label: 'Drip Flows',    to: '/drip-workflows',   roles: ['Admin', 'Manager'] },
  { icon: Shield,          label: 'Users',         to: '/users',            roles: ['Admin'] },
  { icon: ExternalLink,    label: 'Transfers',     to: '/transfer-approvals', roles: ['Admin', 'Manager'] },
  { icon: Puzzle,          label: 'Integrations',  to: '/integrations',     roles: ['Admin'] },
  { icon: Network,         label: 'Integration Hub', to: '/integration-hub', roles: ['Admin'], permission: 'integrations.view' },
  { icon: Workflow,        label: 'Automation',    to: '/automation',       roles: ['Admin', 'Manager'], permission: 'automation.view' },
  { icon: ClipboardCheck,  label: 'AO Review',     to: '/ao-review',        roles: ['Admin', 'Admission Officer'], permission: 'documents.ao_review' },
  { icon: Plug,            label: 'Integration Health', to: '/integration-health', roles: ['Admin'] },
  { icon: Server,          label: 'Server Health', to: '/server-health',    roles: ['Admin'] },
  { icon: ShieldCheck,     label: 'Security & Access', to: '/security',      roles: ['Admin'], permission: 'security.view' },
  { icon: ScrollText,      label: 'Compliance',    to: '/compliance',       roles: ['Admin'], permission: 'compliance.view' },
  { icon: Building2,       label: 'Organization',  to: '/org-settings',     roles: ['Admin'] },
  { icon: Settings,        label: 'Settings',      to: '/settings',         roles: null },
  { icon: HelpCircle,      label: 'Help',          to: '/help',             roles: null },
]

// Sidebar groups (sentence-case labels). Order here is the display order.
const GROUPS = [
  { label: null,         items: ['Dashboard'] },
  { label: 'Admissions', items: ['Leads', 'Website Leads', 'Applications', 'Doc Verification', 'AO Review', 'Finance Verify', 'Transfers', 'Grievances'] },
  { label: 'Work',       items: ['Tasks', 'Calendar', 'Campaigns', 'Email Camps', 'Drip Flows', 'Automation', 'Documents', 'Payments'] },
  { label: 'Insight',    items: ['Command Centre', 'Analytics', 'Productivity', 'Call Report', 'Reports', 'Leaderboard', 'Social Comments', 'Comms', 'Upload Logs'] },
  { label: 'Admin',      items: ['Users', 'Programs', 'Integrations', 'Integration Hub', 'Integration Health', 'Server Health', 'Security & Access', 'Compliance', 'Organization', 'Tenants', 'Lead ID Formats'] },
  { label: 'Account',    items: ['Settings', 'Help'] },
]

// One icon per collapsible group (the group header in the accordion)
const GROUP_ICON = { Admissions: Users, Work: CheckSquare, Insight: PieChart, Admin: Shield, Account: Settings }

export default function Sidebar({ onLogout, user, isMobile = false, open = true, onClose }) {
  // Desktop: a slim icon rail that opens on hover or keyboard focus and closes when you leave (no toggle button).
  const [hovered, setHovered] = useState(false)
  const expanded = isMobile ? true : hovered
  const navigate = useNavigate()
  const { tenantConfig } = useCcrm()
  const userRole = user?.role || 'Counselor'
  const isSuper = !!user?.isSuperAdmin   // Super Admin bypasses entity gating, sees all
  const [openSubmenu, setOpenSubmenu] = useState(null)
  const { pathname } = useLocation()
  const [openGroups, setOpenGroups] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('ccrm_nav_open') || 'null'); if (Array.isArray(v)) return v } catch {}
    return ['Admissions']
  })
  useEffect(() => { try { localStorage.setItem('ccrm_nav_open', JSON.stringify(openGroups)) } catch {} }, [openGroups])
  // Items carrying a `permission` are shown only if the account actually holds
  // it, so the menu can't offer a page the API will refuse. Until the lookup
  // resolves (or if it failed) the older role check decides, so the menu never
  // flickers empty and an offline lookup can't hide the whole app.
  const { can, loading: permsLoading, failed: permsFailed } = usePermissions()
  const permissionAllows = (item) =>
    (!item.permission || permsLoading || permsFailed) ? true : can(item.permission)

  // Entity model from per-tenant config (falls back to Centurion's CUTM/GT layout)
  const cfgEntities = Array.isArray(tenantConfig?.entities) ? tenantConfig.entities : []
  const GT_CODES   = cfgEntities.length ? cfgEntities.filter(e => e.kind === 'gt').map(e => e.code)   : ['FTL', 'GTIB', 'GTTECH', 'ESSE']
  const MAIN_CODES = cfgEntities.length ? cfgEntities.filter(e => e.kind === 'main').map(e => e.code) : ['CUTM', 'CUTMAP']
  const gtLabel = (code) => cfgEntities.find(e => e.code === code)?.label || code
  const brand = tenantConfig?.branding || {}

  // Entity access (admin-granted): which lead sets this user can see.
  // Only tenants that actually opted into the entity model (a non-empty
  // `entities` config, e.g. Centurion's CUTM/CUTMAP/GT split) should gate on
  // it — a tenant that never configured any (CU EDU, Jagannath University)
  // falls back to Centurion's own CUTM/CUTMAP codes otherwise, and a
  // counselor there would need their `entities` field to coincidentally
  // contain "CUTM" — a code meaningless to their organization — just to see
  // their own Leads page.
  const usesEntityModel = cfgEntities.length > 0
  const userEntities = String(user?.entities || MAIN_CODES[0] || '').split(',').map(s => s.trim()).filter(Boolean)
  const hasGT   = userEntities.some(e => GT_CODES.includes(e))
  const hasMain = !usesEntityModel || userEntities.some(e => MAIN_CODES.includes(e))

  const isPlatformAdmin = !!user?.isPlatformAdmin
  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.platformOnly) return isPlatformAdmin         // Tenants page — platform admin only
    if (item.label === 'Website Leads' && GT_CODES.length === 0) return false  // tenant has no GT entities
    if (isSuper) return true                              // Super Admin sees everything
    if (item.label === 'Website Leads') return hasGT      // only if granted a GT entity
    if (item.label === 'Leads') return userRole === 'Admin' || hasMain  // Admins always see; others need main entity
    if (item.permission) return permissionAllows(item)    // permission wins over the role name
    return !item.roles || item.roles.includes(userRole)   // admin still sees admin-only items
  }).map(item => {
    // Build the GT submenu (Overview + one entry per granted GT entity)
    if (item.label === 'Website Leads' && item.submenu) {
      const codes = isSuper ? GT_CODES : GT_CODES.filter(c => userEntities.includes(c))
      return { ...item, submenu: [{ label: 'Overview', to: '/websites-dashboard' }, ...codes.map(c => ({ label: gtLabel(c), to: `/${c.toLowerCase()}-leads` }))] }
    }
    return item
  })

  // Order visible items by group; anything not listed falls into 'Admin' so a new page never vanishes.
  const groupOf = (label) => GROUPS.findIndex(g => g.items.includes(label))
  const ordered = [...visibleItems].sort((a, b) => {
    const ga = groupOf(a.label) < 0 ? 4 : groupOf(a.label)
    const gb = groupOf(b.label) < 0 ? 4 : groupOf(b.label)
    if (ga !== gb) return ga - gb
    const ia = GROUPS[ga].items.indexOf(a.label), ib = GROUPS[gb].items.indexOf(b.label)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })

  // Arriving on a page opens the group that holds it
  useEffect(() => {
    const holds = (it) => (it.to && (pathname === it.to || pathname.startsWith(it.to + '/'))) || (it.submenu || []).some(sm => pathname === sm.to || pathname.startsWith(sm.to + '/'))
    const hit = ordered.find(holds)
    if (!hit) return
    const gi = groupOf(hit.label) < 0 ? 4 : groupOf(hit.label)
    const label = GROUPS[gi]?.label
    if (label) setOpenGroups(o => (o.includes(label) ? o : [...o, label]))
  }, [pathname])

  // On mobile the sidebar is a full-width-ish overlay that slides in, rather
  // than a permanently reserved column — the page below it keeps the whole
  // viewport. On desktop it stays exactly as before.
  const shell = isMobile
    ? `w-64 z-50 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`
    : `z-50 overflow-hidden transition-[width,box-shadow] duration-200 ease-out ${hovered ? 'w-64 shadow-dropdown' : 'w-16'}`

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-canvas border-r border-gray-200/70 flex flex-col ${shell}`}
      aria-hidden={isMobile ? !open : undefined}
      onMouseEnter={isMobile ? undefined : () => setHovered(true)}
      onMouseLeave={isMobile ? undefined : () => setHovered(false)}
      onFocus={isMobile ? undefined : () => setHovered(true)}
      onBlur={isMobile ? undefined : (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false) }}
    >
      {/* Logo */}
      <div
        className="w-full flex items-center gap-3 px-4 h-14 cursor-pointer overflow-hidden flex-shrink-0"
        onClick={() => navigate('/dashboard')}
      >
        <div className="w-8 h-8 rounded-md bg-primary-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt="logo" className="w-full h-full object-contain" />
            : <span className="text-white font-bold text-lg leading-none">{brand.logoText || 'C'}</span>}
        </div>
        <div className={`overflow-hidden transition-opacity duration-200 flex-1 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-gray-900 font-bold text-sm leading-tight whitespace-nowrap">{brand.shortName || 'CCRM'}</div>
          <div className="text-gray-400 text-[10px] leading-tight whitespace-nowrap">{brand.tagline || 'Admissions'}</div>
        </div>
        {isMobile && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose?.() }}
            className="p-1.5 -mr-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col w-full mt-2 overflow-y-auto scrollbar-hide">
        {(() => {
          // group the visible items; the group that holds the current page is always open
          const grouped = GROUPS.map((g, gi) => ({
            ...g,
            items: ordered.filter(it => (groupOf(it.label) < 0 ? 4 : groupOf(it.label)) === gi),
          })).filter(g => g.items.length)
          const holdsPath = (it) => (it.to && (pathname === it.to || pathname.startsWith(it.to + '/'))) || (it.submenu || []).some(sm => pathname === sm.to || pathname.startsWith(sm.to + '/'))
          const activeGroup = grouped.find(g => g.label && g.items.some(holdsPath))?.label
          const isOpenGroup = (label) => openGroups.includes(label)

          const linkCls = (isActive) =>
            `block rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${isActive ? 'bg-gray-200/70 text-gray-900 font-medium' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'}`

          // Closed rail: icons only. The group that holds the current page is marked.
          if (!expanded) {
            return (
              <div className="flex flex-col items-center gap-1 px-2 mt-1">
                {grouped.filter(g => !g.label).flatMap(g => g.items).map(({ icon: Icon, label, to }) => (
                  <NavLink key={to} to={to} title={label} aria-label={label}
                    className={({ isActive }) => `w-10 h-10 flex items-center justify-center rounded-md transition-colors ${isActive ? 'bg-gray-200/70 text-gray-900' : 'text-gray-500 hover:bg-gray-200/60'}`}>
                    <Icon size={18} strokeWidth={1.8} />
                  </NavLink>
                ))}
                {grouped.filter(g => g.label).map(g => {
                  const GIcon = GROUP_ICON[g.label] || Layers
                  return (
                    <span key={g.label} title={g.label} aria-label={g.label}
                      className={`w-10 h-10 flex items-center justify-center rounded-md ${g.items.some(holdsPath) ? 'bg-gray-200/70 text-gray-900' : 'text-gray-500'}`}>
                      <GIcon size={18} strokeWidth={1.8} />
                    </span>
                  )
                })}
              </div>
            )
          }

          return (
            <>
              {/* Ungrouped items (Dashboard) stay as plain links */}
              {grouped.filter(g => !g.label).flatMap(g => g.items).map(({ icon: Icon, label, to }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `sidebar-icon${isActive ? ' active' : ''}`}>
                  <Icon size={18} strokeWidth={1.8} className="flex-shrink-0" />
                  <span className="text-[13px] font-medium whitespace-nowrap">{label}</span>
                </NavLink>
              ))}

              <Accordion multiple value={openGroups} onValueChange={setOpenGroups} className="px-2 mt-2 space-y-0.5">
                {grouped.filter(g => g.label).map(g => {
                  const GIcon = GROUP_ICON[g.label] || Layers
                  const hasActive = g.items.some(holdsPath)
                  return (
                    <AccordionItem key={g.label} value={g.label}>
                      <AccordionTrigger className={`rounded-md px-2.5 py-2 hover:bg-gray-200/60 ${hasActive && !isOpenGroup(g.label) ? 'bg-gray-200/50' : ''}`}>
                        <span className="flex items-center gap-2.5">
                          <GIcon size={16} strokeWidth={1.8} className="text-gray-500" />
                          <span className="text-[13px] font-medium text-gray-900">{g.label}</span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-1.5 pt-0.5">
                        <ul className="ml-[1.15rem] flex flex-col gap-0.5 border-l border-gray-300/70 pl-3">
                          {g.items.map(({ label, to, submenu }) => (
                            <li key={to || label}>
                              {!submenu ? (
                                <NavLink to={to} className={({ isActive }) => linkCls(isActive)}>{label}</NavLink>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setOpenSubmenu(openSubmenu === label ? null : label)}
                                    aria-expanded={openSubmenu === label || submenu.some(sm => pathname === sm.to)}
                                    className="w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 hover:bg-gray-200/50 transition-colors"
                                  >
                                    <span>{label}</span>
                                    <ChevronDown size={13} className={`text-gray-400 transition-transform ${(openSubmenu === label || submenu.some(sm => pathname === sm.to)) ? 'rotate-180' : ''}`} />
                                  </button>
                                  {(openSubmenu === label || submenu.some(sm => pathname === sm.to)) && (
                                    <ul className="ml-2.5 mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-gray-300/70 pl-2.5">
                                      {submenu.map(({ label: subLabel, to: subTo }) => (
                                        <li key={subTo}><NavLink to={subTo} className={({ isActive }) => linkCls(isActive)}>{subLabel}</NavLink></li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </>
          )
        })()}

        {/* Divider + Inquiry */}
        <div className="mx-4 h-px bg-gray-100 my-2" />
        <a
          href="/apply"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-icon"
          title={!expanded ? 'Public Inquiry Form' : undefined}
        >
          <Globe size={18} strokeWidth={1.8} className="flex-shrink-0" />
          <span className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
            Inquiry
          </span>
        </a>
      </nav>

      {/* Logout */}
      <button
        onClick={onLogout}
        className="sidebar-icon mb-2 mt-1 border-t border-gray-100 pt-3.5 !text-gray-500 hover:!text-danger-600 hover:!bg-danger-50 w-[calc(100%-1rem)]"
        title={!expanded ? 'Logout' : undefined}
      >
        <LogOut size={18} strokeWidth={1.8} className="flex-shrink-0" />
        <span className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
          Logout
        </span>
      </button>

      {/* App version — single source: src/version.js */}
      <div className="text-center text-[10px] text-gray-300 pb-2 select-none">
        v{APP_VERSION}
      </div>
    </aside>
  )
}
