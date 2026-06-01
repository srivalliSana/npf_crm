import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

export default function Layout({ onLogout, user }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar onLogout={onLogout} user={user} />
      <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onLogout={onLogout} user={user} />
      <main className="ml-20 pt-14 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
