import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, CheckSquare, Megaphone,
  BarChart2, Settings, LogOut, CreditCard,
  HelpCircle, Calendar, Shield, FileCheck, Puzzle,
  Trophy, Mail, Globe, ExternalLink, Zap, Radio,
  PieChart, Activity, Plug, Server, ShieldCheck, ChevronDown, ScrollText, PhoneCall, Layers
} from 'lucide-react'
import { APP_VERSION } from '../version'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',          to: '/dashboard',              roles: null },
  { icon: Users,           label: 'Leads',              to: '/leads',                  roles: null },
  { icon: PhoneCall,       label: 'Call Outcomes',      to: '/call-outcomes',          roles: null },
  { icon: Layers,          label: 'Workbook Import',    to: '/workbook-import',        roles: ['Admin', 'Manager'] },
  { icon: Users,           label: 'Website Leads',      to: '/websites-dashboard',     roles: null },
  {
    icon: Users,
    label: 'GT Entities',
    roles: null,
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
  { icon: HelpCircle,      label: 'Queries',       to: '/queries',          roles: null },
  { icon: PieChart,        label: 'Analytics',     to: '/analytics',        roles: ['Admin', 'Manager'] },
  { icon: Activity,        label: 'Productivity',  to: '/productivity',     roles: ['Admin', 'Manager'] },
  { icon: BarChart2,       label: 'Call Report',   to: '/call-activity',    roles: ['Admin', 'Manager'] },
  { icon: BarChart2,       label: 'Reports',       to: '/reports',          roles: ['Admin', 'Manager'] },
  { icon: ScrollText,      label: 'Upload Logs',   to: '/logs',             roles: ['Admin', 'Manager'] },
  { icon: Radio,           label: 'Comms',         to: '/comms-report',     roles: ['Admin'] },
  { icon: Trophy,          label: 'Leaderboard',   to: '/leaderboard',      roles: ['Admin', 'Manager'] },
  { icon: Mail,            label: 'Email Camps',   to: '/email-campaigns',  roles: ['Admin', 'Manager'] },
  { icon: Zap,             label: 'Drip Flows',    to: '/drip-workflows',   roles: ['Admin', 'Manager'] },
  { icon: Shield,          label: 'Users',         to: '/users',            roles: ['Admin'] },
  { icon: ExternalLink,    label: 'Transfers',     to: '/transfer-approvals', roles: ['Admin', 'Manager'] },
  { icon: Puzzle,          label: 'Integrations',  to: '/integrations',     roles: ['Admin'] },
  { icon: Plug,            label: 'Integration Health', to: '/integration-health', roles: ['Admin'] },
  { icon: Server,          label: 'Server Health', to: '/server-health',    roles: ['Admin'] },
  { icon: ShieldCheck,     label: 'Security & Access', to: '/security',      roles: ['Admin'] },
  { icon: Settings,        label: 'Settings',      to: '/settings',         roles: null },
  { icon: HelpCircle,      label: 'Help',          to: '/help',             roles: null },
]

export default function Sidebar({ onLogout, user }) {
  const navigate = useNavigate()
  const userRole = user?.role || 'Counselor'
  const expanded = true
  const [openSubmenu, setOpenSubmenu] = useState(null)

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.roles || item.roles.includes(userRole)
  )

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-primary-500 flex flex-col z-50 shadow-lg w-56`}
    >
      {/* Logo */}
      <div
        className="w-full flex items-center gap-3 px-4 h-16 cursor-pointer border-b border-primary-600 overflow-hidden"
        onClick={() => navigate('/dashboard')}
      >
        <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow flex-shrink-0">
          <span className="text-primary-500 font-extrabold text-xl leading-none">C</span>
        </div>
        <div className={`overflow-hidden transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
          <div className="text-white font-extrabold text-sm leading-tight whitespace-nowrap">CCRM</div>
          <div className="text-primary-200 text-[10px] leading-tight whitespace-nowrap">Admissions</div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col w-full mt-1 overflow-y-auto scrollbar-hide">
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
                <Icon size={20} strokeWidth={1.8} className="flex-shrink-0" />
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
                className="flex items-center gap-3 px-4 py-2 text-white hover:bg-primary-600 transition-colors rounded-lg mx-2 mb-1"
              >
                <Icon size={20} strokeWidth={1.8} className="flex-shrink-0" />
                <span className="text-[13px] font-medium whitespace-nowrap flex-1 text-left">
                  {label}
                </span>
                <ChevronDown
                  size={16}
                  className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && (
                <div className="bg-primary-600 bg-opacity-50 rounded-lg mx-2 mb-2 overflow-hidden">
                  {submenu.map(({ label: subLabel, to: subTo }) => (
                    <NavLink
                      key={subTo}
                      to={subTo}
                      className={({ isActive }) =>
                        `block px-4 py-2 text-[13px] text-white hover:bg-primary-700 transition-colors ${
                          isActive ? 'bg-primary-700 font-medium' : ''
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
        <div className="mx-4 h-px bg-primary-400 my-1" />
        <a
          href="/apply"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-icon"
          title={!expanded ? 'Public Inquiry Form' : undefined}
        >
          <Globe size={20} strokeWidth={1.8} className="flex-shrink-0" />
          <span className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
            Inquiry
          </span>
        </a>
      </nav>

      {/* Logout */}
      <button
        onClick={onLogout}
        className="sidebar-icon mb-2 border-t border-primary-600 w-full"
        title={!expanded ? 'Logout' : undefined}
      >
        <LogOut size={20} strokeWidth={1.8} className="flex-shrink-0" />
        <span className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
          Logout
        </span>
      </button>

      {/* App version — single source: src/version.js */}
      <div className="text-center text-[10px] text-primary-300 pb-2 select-none">
        v{APP_VERSION}
      </div>
    </aside>
  )
}
