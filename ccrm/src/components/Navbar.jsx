import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_VERSION, APP_RELEASED } from '../version'
import {
  Menu, Sparkles, Bell, Phone, Settings,
  HelpCircle, ChevronDown, X, LogOut,
} from 'lucide-react'
import MioAI from './MioAI'
import { useCcrm } from '../context/CcrmContext'

const ROLE_BADGE = {
  Admin:     'bg-red-100 text-red-700',
  Manager:   'bg-purple-100 text-purple-700',
  Counselor: 'bg-blue-100 text-blue-700',
  Finance:   'bg-green-100 text-green-700',
}

function initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function Navbar({ onToggleSidebar, onLogout, user }) {
  const navigate = useNavigate()
  const { notifications, markNotificationRead, markAllNotificationsRead } = useCcrm()
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
      <header className="fixed top-0 left-14 right-0 h-14 bg-white border-b border-gray-200 flex items-center px-4 z-30 shadow-sm">
        {/* Left */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-primary-500 font-extrabold text-lg tracking-tight">CCRM</span>
            <span className="text-gray-400 text-xs ml-1">| Centurion University</span>
            <span
              title={`Version ${APP_VERSION} · Released ${APP_RELEASED}`}
              className="ml-2 text-[10px] font-mono font-bold bg-primary-50 text-primary-600 border border-primary-100 px-1.5 py-0.5 rounded cursor-help"
            >
              v{APP_VERSION}
            </span>
          </div>
        </div>

        {/* Center – Ask CU AI */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={() => setShowMioAI(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-1.5 rounded-full transition-colors shadow-sm"
          >
            <Sparkles size={15} />
            Ask CU AI
          </button>
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-1">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false) }}
              className="relative p-2 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border border-white rounded-full flex items-center justify-center text-[7px] text-white font-extrabold"></span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
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
                      className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50/75 cursor-pointer flex justify-between gap-2 items-start transition-colors ${n.unread ? 'bg-blue-50/30 border-l-2 border-primary-500' : ''}`}
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

          <button className="p-2 rounded hover:bg-gray-100 text-gray-500 transition-colors">
            <Phone size={18} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="p-2 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
          <button className="p-2 rounded hover:bg-gray-100 text-gray-500 transition-colors">
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
              <div className="absolute right-0 top-11 w-60 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
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
                    onClick={() => { navigate('/settings'); setShowProfile(false); }}
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
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
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
