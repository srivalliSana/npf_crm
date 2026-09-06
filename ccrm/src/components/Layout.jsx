import React, { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import IdleLogout from './IdleLogout'
import ImpersonationBanner from './ImpersonationBanner'

// Item 28 — responsive shell.
//
// The layout used to hard-code `ml-56` against a fixed sidebar, which put the
// first ~224px of every page off-screen on a phone. Below `lg` the sidebar
// becomes an overlay drawer instead, so the content always gets the full width.
const MOBILE_QUERY = '(max-width: 1023px)'

export default function Layout({ onLogout, user }) {
  // Start from the real viewport rather than defaulting to desktop, so the
  // drawer isn't briefly rendered open on a phone during first paint.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  )
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
  const { pathname } = useLocation()

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => {
      setIsMobile(e.matches)
      // Collapse when entering mobile, restore when leaving it — otherwise a
      // rotation leaves the drawer covering the page, or the desktop sidebar
      // hidden with no obvious way back.
      setSidebarOpen(!e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // On mobile the drawer covers the content, so navigating must close it.
  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [pathname, isMobile])

  // Don't let the page behind the drawer scroll while it's open.
  useEffect(() => {
    if (!isMobile) return
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isMobile, sidebarOpen])

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        onLogout={onLogout}
        user={user}
        expanded={isMobile ? true : sidebarOpen}
        isMobile={isMobile}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Scrim — mobile only; tapping it dismisses the drawer. */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Navbar
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onLogout={onLogout}
        user={user}
        expanded={sidebarOpen}
        isMobile={isMobile}
      />

      <main
        className={`pt-14 pb-24 min-h-screen transition-[margin] duration-200 ${
          isMobile ? 'ml-0' : sidebarOpen ? 'ml-56' : 'ml-16'
        }`}
      >
        <Outlet />
      </main>

      <IdleLogout />
      <ImpersonationBanner />
    </div>
  )
}
