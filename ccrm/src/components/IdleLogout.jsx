import { useEffect, useRef, useState } from 'react'
import { useCcrm } from '../context/CcrmContext'

// Auto-logout after IDLE_MS of inactivity (15 minutes by default)
// Shows a 30-second countdown warning so the user can click to extend
const IDLE_MS    = 15 * 60 * 1000   // 15 minutes
const WARNING_MS = 30 * 1000        // last 30s show warning + countdown

export default function IdleLogout() {
  const { currentUser, handleLogout, showToast } = useCcrm()
  const lastActiveRef = useRef(Date.now())
  const [warning, setWarning] = useState(null)   // seconds remaining

  useEffect(() => {
    if (!currentUser) return

    const reset = () => {
      lastActiveRef.current = Date.now()
      if (warning !== null) setWarning(null)
    }

    // Activity events that should reset the timer
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))

    const tick = setInterval(() => {
      const idle = Date.now() - lastActiveRef.current
      if (idle >= IDLE_MS) {
        clearInterval(tick)
        events.forEach(e => window.removeEventListener(e, reset))
        showToast?.('Logged out due to 15 minutes of inactivity', 'warning')
        handleLogout()
      } else if (idle >= IDLE_MS - WARNING_MS) {
        setWarning(Math.ceil((IDLE_MS - idle) / 1000))
      }
    }, 1000)

    return () => {
      clearInterval(tick)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [currentUser, handleLogout, showToast, warning])

  // Warning toast — clickable to extend
  if (!warning || !currentUser) return null
  return (
    <div className="fixed bottom-6 right-6 z-[100] bg-yellow-50 border border-yellow-300 rounded-xl shadow-2xl p-4 max-w-xs animate-pulse">
      <div className="flex items-start gap-3">
        <div className="text-2xl">⏰</div>
        <div className="flex-1">
          <p className="text-sm font-bold text-yellow-800">Inactive — logging out</p>
          <p className="text-xs text-yellow-700 mt-1">
            You'll be logged out in <strong className="text-base">{warning}s</strong>. Click anywhere to stay signed in.
          </p>
        </div>
      </div>
    </div>
  )
}
