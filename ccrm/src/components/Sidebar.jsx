import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, CheckSquare, Megaphone,
  BarChart2, Settings, LogOut, CreditCard,
  HelpCircle, Calendar, Shield, FileCheck, Puzzle,
  Trophy, Mail, Globe, ExternalLink, Zap, Radio,
  PieChart, Activity, Plug, Server, ShieldCheck, ChevronDown, ScrollText, PhoneCall, Layers, MessageCircle, Building2
} from 'lucide-react'
import { APP_VERSION } from '../version'
import { useCcrm } from '../context/CcrmContext'

const NAV_ITEMS = [
  { icon: Building2,       label: 'Tenants',            to: '/platform-tenants',       platformOnly: true },
  { icon: LayoutDashboard, label: 'Dashboard',          to: '/dashboard',              roles: null },
  { icon: Users,           label: 'Leads',              to: '/leads',                  roles: null },
  { icon: Users,           label: 'Website Leads',      to: '/websites-dashboard',     roles: ['Admin'] },
  {
    icon: Users,
    label: 'GT Entities',
    roles: ['Admin'],
    submenu: [
      { label: 'FTL',    to: '/ftl-leads' },
      { label: 'GTIB',   to: '/gtib-leads' },
      { label: 'GTTECH', to: '/gttech-leads' },
      { label: 'ESSE',   to: '/esse-leads' }
    ]
  },
  { icon: FileText,        label: 'Applications',  to: '/applications',     roles: null },
  { icon: CheckSquare,     label: 'Tasks',         to: '/tasks',            roles: null },
  { icon: Megaphone,       label: 'Campaigns',     to: '/campaigns',        roles: null },
  { icon: CreditCard,      label: 'Payments',      to: '/payments',         roles: null },
  { icon: Calendar,        label: 'Calendar',      to: '/calendar',         roles: null },
  { icon: FileCheck,       label: 'Documents',     to: '/documents',        roles: null },
  { icon: PieChart,        label: 'Analytics',     to: '/analytics',        roles: ['Admin', 'Manager'] },
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
  { icon: Server,          label: 'Server Health', to: '/server-health',    roles: ['Admin'] },
  { icon: ShieldCheck,     label: 'Security & Access', to: '/security',      roles: ['Admin'] },
  { icon: Building2,       label: 'Organization',  to: '/org-settings',     roles: ['Admin'] },
  { icon: Settings,        label: 'Settings',      to: '/settings',         roles: null },
  { icon: HelpCircle,      label: 'Help',          to: '/help',             roles: null },
]

export default function Sidebar({ onLogout, user, expanded = true }) {
  const navigate = useNavigate()
  const { tenantConfig } = useCcrm()
  const userRole = user?.role || 'Counselor'
  const isSuper = !!user?.isSuperAdmin   // Super Admin bypasses entity gating, sees all
  const [openSubmenu, setOpenSubmenu] = useState(null)

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
    if (item.label === 'GT Entities' && GT_CODES.length === 0) return false  // tenant has no GT entities
    if (isSuper) return true                              // Super Admin sees everything
    if (item.label === 'GT Entities') return hasGT        // only if granted a GT entity
    if (item.label === 'Leads')       return hasMain      // only if granted a main entity
    return !item.roles || item.roles.includes(userRole)   // admin still sees admin-only items
  }).map(item => {
    // Build the GT submenu from the tenant's GT entities, filtered to those granted
    if (item.label === 'GT Entities' && item.submenu) {
      const codes = isSuper ? GT_CODES : GT_CODES.filter(c => userEntities.includes(c))
      return { ...item, submenu: codes.map(c => ({ label: gtLabel(c), to: `/${c.toLowerCase()}-leads` })) }
    }
    return item
  })

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 flex flex-col z-50 transition-[width] duration-200 ${expanded ? 'w-56' : 'w-16'}`}
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
        <div className={`overflow-hidden transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-gray-900 font-extrabold text-sm leading-tight whitespace-nowrap">{brand.shortName || 'CCRM'}</div>
          <div className="text-gray-400 text-[10px] leading-tight whitespace-nowrap">{brand.tagline || 'Admissions'}</div>
        </div>
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
