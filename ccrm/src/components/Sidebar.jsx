import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, CheckSquare, Megaphone,
  BarChart2, Settings, LogOut, CreditCard,
  HelpCircle, Calendar, Shield, FileCheck, Puzzle,
  Trophy, Mail, Globe, ExternalLink, Zap, Radio,
  PieChart, Activity, Plug, Server, ShieldCheck, ChevronDown, ScrollText, PhoneCall, Layers, MessageCircle, Building2, GraduationCap,
  CheckCircle, DollarSign, Gauge, Network, X, Tag
} from 'lucide-react'
import { APP_VERSION } from '../version'
import { useCcrm } from '../context/CcrmContext'
import { usePermissions } from '../hooks/usePermissions'

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
  { icon: CheckCircle,     label: 'Doc Verification', to: '/document-verification', roles: ['Admin'] },
  { icon: DollarSign,      label: 'Finance Verify',   to: '/finance-verification',  roles: ['Admin'] },
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
  { icon: Plug,            label: 'Integration Health', to: '/integration-health', roles: ['Admin'] },
  { icon: Server,          label: 'Server Health', to: '/server-health',    roles: ['Admin'] },
  { icon: ShieldCheck,     label: 'Security & Access', to: '/security',      roles: ['Admin'], permission: 'security.view' },
  { icon: ScrollText,      label: 'Compliance',    to: '/compliance',       roles: ['Admin'], permission: 'compliance.view' },
  { icon: Building2,       label: 'Organization',  to: '/org-settings',     roles: ['Admin'] },
  { icon: Settings,        label: 'Settings',      to: '/settings',         roles: null },
  { icon: HelpCircle,      label: 'Help',          to: '/help',             roles: null },
]

export default function Sidebar({ onLogout, user, expanded = true, isMobile = false, open = true, onClose }) {
  const navigate = useNavigate()
  const { tenantConfig } = useCcrm()
  const userRole = user?.role || 'Counselor'
  const isSuper = !!user?.isSuperAdmin   // Super Admin bypasses entity gating, sees all
  const [openSubmenu, setOpenSubmenu] = useState(null)
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

  // Entity access (admin-granted): which lead sets this user can see
  const userEntities = String(user?.entities || MAIN_CODES[0] || '').split(',').map(s => s.trim()).filter(Boolean)
  const hasGT   = userEntities.some(e => GT_CODES.includes(e))
  const hasMain = userEntities.some(e => MAIN_CODES.includes(e))

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

  // On mobile the sidebar is a full-width-ish overlay that slides in, rather
  // than a permanently reserved column — the page below it keeps the whole
  // viewport. On desktop it stays exactly as before.
  const shell = isMobile
    ? `w-64 z-50 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`
    : `z-50 transition-[width] duration-200 ${expanded ? 'w-56' : 'w-16'}`

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-100 shadow-soft flex flex-col ${shell}`}
      aria-hidden={isMobile && !open}
    >
      {/* Logo */}
      <div
        className="w-full flex items-center gap-3 px-4 h-16 cursor-pointer border-b border-gray-100 overflow-hidden flex-shrink-0"
        onClick={() => navigate('/dashboard')}
      >
        <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center shadow-soft flex-shrink-0 overflow-hidden">
          {brand.logoUrl
            ? <img src={brand.logoUrl} alt="logo" className="w-full h-full object-contain" />
            : <span className="text-white font-extrabold text-xl leading-none">{brand.logoText || 'C'}</span>}
        </div>
        <div className={`overflow-hidden transition-opacity duration-200 flex-1 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-gray-900 font-extrabold text-sm leading-tight whitespace-nowrap">{brand.shortName || 'CCRM'}</div>
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
        {visibleItems.map((item) => {
          const { icon: Icon, label, to, submenu } = item

          // Regular nav item (no submenu)
          if (!submenu) {
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `sidebar-icon${isActive ? ' active' : ''}`
                }
                title={!expanded ? label : undefined}
              >
                <Icon size={18} strokeWidth={1.8} className="flex-shrink-0" />
                <span className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
                  {label}
                </span>
              </NavLink>
            )
          }

          // Submenu item
          const isOpen = openSubmenu === label
          return (
            <div key={label} className="flex flex-col">
              <button
                onClick={() => setOpenSubmenu(isOpen ? null : label)}
                className="flex items-center gap-3 px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors rounded-lg mx-2 mb-1 w-[calc(100%-1rem)]"
              >
                <Icon size={18} strokeWidth={1.8} className="flex-shrink-0" />
                <span className="text-[13px] font-medium whitespace-nowrap flex-1 text-left">
                  {label}
                </span>
                <ChevronDown
                  size={14}
                  className={`transition-transform text-gray-400 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && (
                <div className="bg-gray-50 rounded-lg mx-2 mb-2 overflow-hidden py-1">
                  {submenu.map(({ label: subLabel, to: subTo }) => (
                    <NavLink
                      key={subTo}
                      to={subTo}
                      className={({ isActive }) =>
                        `block px-4 py-2 ml-6 mr-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors ${
                          isActive ? 'bg-primary-50 text-primary-700 font-semibold' : ''
                        }`
                      }
                    >
                      {subLabel}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}

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
