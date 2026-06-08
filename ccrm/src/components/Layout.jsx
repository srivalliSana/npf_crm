import React, { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { X, Phone } from 'lucide-react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import IdleLogout from './IdleLogout'

export default function Layout({ onLogout, user }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [voiceOpen, setVoiceOpen] = useState(true)   // CUTM voice (OmniDimension) widget visible?

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

  // Show/hide the voice widget via a body class (see index.css)
  useEffect(() => {
    document.body.classList.toggle('cutm-voice-hidden', !voiceOpen)
    return () => document.body.classList.remove('cutm-voice-hidden')
  }, [voiceOpen])

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar onLogout={onLogout} user={user} />
      <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} onLogout={onLogout} user={user} />
      <main className="ml-56 pt-14 min-h-screen">
        <Outlet />
      </main>
      <IdleLogout />

      {/* CUTM voice assistant toggle (bottom-left, so it never overlaps the widget) */}
      {voiceOpen ? (
        <button
          onClick={() => setVoiceOpen(false)}
          title="Hide CUTM voice assistant"
          className="fixed bottom-3 left-3 z-[60] flex items-center gap-1.5 rounded-full bg-gray-900/85 hover:bg-gray-900 text-white text-xs font-medium pl-3 pr-2 py-1.5 shadow-lg backdrop-blur transition-colors"
        >
          <Phone size={13} />
          <span>Voice</span>
          <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20">
            <X size={11} />
          </span>
        </button>
      ) : (
        <button
          onClick={() => setVoiceOpen(true)}
          title="Show CUTM voice assistant"
          className="fixed bottom-3 left-3 z-[60] flex items-center gap-1.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium px-3 py-1.5 shadow-lg transition-colors"
        >
          <Phone size={13} />
          <span>Voice Assistant</span>
        </button>
      )}
    </div>
  )
}
