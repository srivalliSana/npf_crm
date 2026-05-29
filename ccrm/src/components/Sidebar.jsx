import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, CheckSquare, Megaphone,
  BarChart2, Settings, LogOut, CreditCard,
  HelpCircle, Calendar, Shield, FileCheck, Puzzle,
  Trophy, Mail, Globe, ExternalLink, Zap, Radio
} from 'lucide-react'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',     to: '/dashboard',        roles: null },
  { icon: Users,           label: 'Leads',         to: '/leads',            roles: null },
  { icon: FileText,        label: 'Applications',  to: '/applications',     roles: null },
  { icon: CheckSquare,     label: 'Tasks',         to: '/tasks',            roles: null },
  { icon: Megaphone,       label: 'Campaigns',     to: '/campaigns',        roles: null },
  { icon: CreditCard,      label: 'Payments',      to: '/payments',         roles: null },
  { icon: Calendar,        label: 'Calendar',      to: '/calendar',         roles: null },
  { icon: FileCheck,       label: 'Documents',     to: '/documents',        roles: null },
  { icon: HelpCircle,      label: 'Queries',       to: '/queries',          roles: null },
  { icon: BarChart2,       label: 'Reports',       to: '/reports',          roles: ['Admin', 'Manager'] },
  { icon: Radio,           label: 'Comms',         to: '/comms-report',     roles: ['Admin'] },
  { icon: Trophy,          label: 'Leaderboard',   to: '/leaderboard',      roles: ['Admin', 'Manager'] },
  { icon: Mail,            label: 'Email Camps',   to: '/email-campaigns',  roles: ['Admin', 'Manager'] },
  { icon: Zap,             label: 'Drip Flows',    to: '/drip-workflows',   roles: ['Admin', 'Manager'] },
  { icon: Shield,          label: 'Users',         to: '/users',            roles: ['Admin'] },
  { icon: Puzzle,          label: 'Integrations',  to: '/integrations',     roles: ['Admin'] },
  { icon: Settings,        label: 'Settings',      to: '/settings',         roles: null },
]

export default function Sidebar({ onLogout, user }) {
  const navigate = useNavigate()
  const userRole = user?.role || 'Counselor'
  const [expanded, setExpanded] = useState(false)

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.roles || item.roles.includes(userRole)
  )

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`fixed left-0 top-0 h-screen bg-primary-500 flex flex-col z-50 shadow-lg transition-all duration-200 ease-out ${expanded ? 'w-56' : 'w-20'}`}
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
        {visibleItems.map(({ icon: Icon, label, to }) => (
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
        ))}

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
    </aside>
  )
}
