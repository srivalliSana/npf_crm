import React, { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { X, Phone } from 'lucide-react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import IdleLogout from './IdleLogout'

export default function Layout({ onLogout, user }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [voiceHidden, setVoiceHidden] = useState(false)   // is the voice widget closed?

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

  // Hide/show the voice widget via a body class (see index.css)
  useEffect(() => {
    document.body.classList.toggle('cutm-voice-hidden', voiceHidden)
    return () => document.body.classList.remove('cutm-voice-hidden')
  }, [voiceHidden])

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar onLogout={onLogout} user={user} />
      <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onLogout={onLogout} user={user} />
      <main className="ml-56 pt-14 min-h-screen">
        <Outlet />
      </main>
      <IdleLogout />

      {/* Close / reopen control for the voice assistant widget */}
      {voiceHidden ? (
        <button
          onClick={() => setVoiceHidden(false)}
          title="Open voice assistant"
          className="fixed bottom-4 right-4 z-[10002] w-12 h-12 rounded-full bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center shadow-lg transition-colors"
        >
          <Phone size={20} />
        </button>
      ) : (
        <button
          onClick={() => setVoiceHidden(true)}
          title="Close voice assistant"
          style={{ bottom: 'calc(min(760px, 88vh) - 34px)' }}
          className="fixed right-4 z-[10002] w-7 h-7 rounded-full bg-gray-900/80 hover:bg-gray-900 text-white flex items-center justify-center shadow-lg transition-colors"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
