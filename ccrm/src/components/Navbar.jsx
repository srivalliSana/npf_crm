import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { APP_VERSION, APP_RELEASED } from '../version'
import {
  Menu, Sparkles, Bell, Phone, Settings,
  HelpCircle, ChevronDown, ChevronRight, X, LogOut, Search,
} from 'lucide-react'
import MioAI from './MioAI'
import { useCcrm } from '../context/CcrmContext'

const ROLE_BADGE = {
  Admin:     'bg-danger-100 text-danger-700',
  Manager:   'bg-purple-100 text-purple-700',
  Counselor: 'bg-info-100 text-info-700',
  Finance:   'bg-success-100 text-success-700',
}

function initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// Best-effort breadcrumb from the current path — no per-route title config
// to maintain, just a readable default derived from the URL itself.
function useBreadcrumb() {
  const { pathname } = useLocation()
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return ['Dashboard']
  const looksLikeId = (s) => /^[0-9a-f-]+$/i.test(s) && /\d/.test(s)
  return segments.map((seg, i) => {
    if (i > 0 && looksLikeId(seg)) return 'Details'
    return seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  })
}

export default function Navbar({ onToggleSidebar, onLogout, user, expanded = true }) {
  const navigate = useNavigate()
  const { notifications, markNotificationRead, markAllNotificationsRead, tenantConfig } = useCcrm()
  const orgName = tenantConfig?.name || 'Centurion University of Technology and Management'
  const crumbs = useBreadcrumb()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile]             = useState(false)
  const [showMioAI, setShowMioAI]                 = useState(false)

  const unreadCount = notifications.filter(n => n.unread).length

  const handleMarkAllRead = () => markAllNotificationsRead()
  const handleToggleRead = (id) => markNotificationRead(id)

  const displayName = user?.name  || 'User'
  const displayEmail = user?.email || ''
  const displayRole  = user?.role  || 'Counselor'
  const roleBadge    = ROLE_BADGE[displayRole] || ROLE_BADGE.Counselor

  return (
    <>
      <header className={`fixed top-0 ${expanded ? 'left-56' : 'left-16'} right-0 h-14 bg-white/95 backdrop-blur-sm border-b border-gray-200 flex items-center px-4 gap-3 z-30 transition-[left] duration-200`}>
        {/* Left — sidebar toggle + breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0"
            title="Toggle sidebar"
          >
            <Menu size={19} />
          </button>
          <nav className="hidden sm:flex items-center gap-1.5 text-sm min-w-0" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5 min-w-0">
                {i > 0 && <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />}
                <span className={`truncate ${i === crumbs.length - 1 ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>
                  {c}
                </span>
              </span>
            ))}
            <span
              title={`Version ${APP_VERSION} · Released ${APP_RELEASED}`}
              className="ml-2 text-[10px] font-mono font-bold bg-primary-50 text-primary-600 border border-primary-100 px-1.5 py-0.5 rounded cursor-help flex-shrink-0"
            >
              v{APP_VERSION}
            </span>
          </nav>
        </div>

        {/* Center — global search */}
        <div className="flex-1 flex justify-center px-2 min-w-0">
          <div className="relative w-full max-w-sm hidden md:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${orgName.split(' ')[0]}...`}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent focus:bg-white transition"
            />
          </div>
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Ask CU AI — compact (≈50% smaller) */}
          <button
            onClick={() => setShowMioAI(true)}
            title="Ask CU AI"
            className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-medium px-2 py-1 rounded-full transition-colors shadow-soft"
          >
            <Sparkles size={12} />
            Ask CU AI
          </button>

          {/* Notifications — Admin only */}
          {displayRole === 'Admin' && (
          <div className="relative">
            <button
              onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false) }}
              className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-danger-500 border border-white rounded-full flex items-center justify-center text-[7px] text-white font-extrabold"></span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-dropdown border border-gray-200 z-50 animate-scale-up">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span className="font-semibold text-gray-800 text-sm">Notifications ({unreadCount} new)</span>
                  <button onClick={() => setShowNotifications(false)}>
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => handleToggleRead(n.id)}
                      className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50/75 cursor-pointer flex justify-between gap-2 items-start transition-colors ${n.unread ? 'bg-primary-50/40 border-l-2 border-primary-500' : ''}`}
                    >
                      <div>
                        <p className="text-sm text-gray-700 font-medium">{n.title || n.text}</p>
                        {n.title && n.text !== n.title && (
                          <p className="text-xs text-gray-500 mt-0.5">{n.text}</p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
                      </div>
                      {n.unread && <span className="w-1.5 h-1.5 bg-primary-500 rounded-full shrink-0 mt-1.5"></span>}
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <p className="text-center py-8 text-gray-400 text-xs font-medium">No notifications yet.</p>
                  )}
                </div>
                {unreadCount > 0 && (
                  <div className="px-4 py-2 text-center border-t border-gray-100 bg-gray-50/50">
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-primary-500 hover:underline font-semibold"
                    >
                      Mark all as read
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <Phone size={18} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <HelpCircle size={18} />
          </button>

          {/* User avatar */}
          <div className="relative ml-1">
            <button
              onClick={() => { setShowProfile(!showProfile); setShowNotifications(false) }}
              className="flex items-center gap-1.5 hover:bg-gray-100 rounded-lg px-2 py-1 transition-colors"
            >
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={displayName}
                  className="w-8 h-8 rounded-full object-cover border border-gray-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold">
                  {initials(displayName)}
                </div>
              )}
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            {showProfile && (
              <div className="absolute right-0 top-11 w-60 bg-white rounded-xl shadow-dropdown border border-gray-200 z-50 animate-scale-up">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    {user?.picture ? (
                      <img
                        src={user.picture}
                        alt={displayName}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {initials(displayName)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{displayName}</p>
                      <p className="text-xs text-gray-500 truncate">{displayEmail}</p>
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded font-medium ${roleBadge}`}>
                        {displayRole}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { navigate('/profile'); setShowProfile(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    My Profile
                  </button>
                  <button
                    onClick={() => { navigate('/settings'); setShowProfile(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Account Settings
                  </button>
                  <button
                    onClick={onLogout}
                    className="w-full text-left px-4 py-2 text-sm text-danger-600 hover:bg-danger-50 flex items-center gap-2"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      {showMioAI && <MioAI onClose={() => setShowMioAI(false)} />}
    </>
  )
}
