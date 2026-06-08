import React, { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import IdleLogout from './IdleLogout'

export default function Layout({ onLogout, user }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // OmniDimension calling widget — load once for the whole logged-in app
  useEffect(() => {
    if (document.getElementById('omnidimension-web-widget')) return
    const script = document.createElement('script')
    script.id = 'omnidimension-web-widget'
    script.async = true
    script.src = 'https://omnidim.io/web_widget.js?secret_key=9cc0223a77f58d411fec87e6403c138c'
    document.body.appendChild(script)
    return () => {
      document.getElementById('omnidimension-web-widget')?.remove()
    }
  }, [])

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar onLogout={onLogout} user={user} />
      <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onLogout={onLogout} user={user} />
      <main className="ml-56 pt-14 min-h-screen">
        <Outlet />
      </main>
      <IdleLogout />
    </div>
  )
}
