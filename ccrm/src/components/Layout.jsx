import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import IdleLogout from './IdleLogout'
import ImpersonationBanner from './ImpersonationBanner'

export default function Layout({ onLogout, user }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar onLogout={onLogout} user={user} expanded={sidebarOpen} />
      <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onLogout={onLogout} user={user} expanded={sidebarOpen} />
      <main className={`${sidebarOpen ? 'ml-56' : 'ml-16'} pt-14 pb-24 min-h-screen transition-[margin] duration-200`}>
        <Outlet />
      </main>
      <IdleLogout />
      <ImpersonationBanner />
    </div>
  )
}
