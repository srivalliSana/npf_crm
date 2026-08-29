import React, { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Bot, User, AlertCircle } from 'lucide-react'

const SUGGESTIONS = [
  'Show me today\'s pending follow-ups',
  'How many leads were added this week?',
  'Which counselor has the highest conversion rate?',
  'List applications with payment pending',
  'Show top performing campaigns',
  'How many students enrolled this month?',
]

export default function MioAI({ onClose }) {
  const [messages, setMessages] = useState([
    { id: 1, role: 'bot', text: 'Hi! I\'m **CU AI**. I can answer real, live questions about your leads, applications, payments, and campaigns — ask me anything.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: msg }])
    setLoading(true)
    try {
      const token = localStorage.getItem('ccrm_token')
      const res = await fetch('/api/mio-ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question: msg })
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: res.ok ? 'bot' : 'error',
        text: res.ok ? data.answer : (data.error || 'Something went wrong.')
      }])
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'error', text: 'Network error — please try again.' }])
    }
    setLoading(false)
  }

  const renderText = (text) => {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  }

  return (
    <div className="fixed bottom-4 right-4 w-72 max-w-[88vw] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 flex flex-col" style={{ height: '420px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles size={14} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">CU AI</p>
            <p className="text-purple-200 text-[10px] leading-tight">CCRM Assistant</p>
          </div>
        </div>
        <button onClick={onClose} title="Close"
          className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user' ? 'bg-primary-500' : msg.role === 'error' ? 'bg-red-100' : 'bg-purple-100'
            }`}>
              {msg.role === 'user' ? <User size={14} className="text-white" />
                : msg.role === 'error' ? <AlertCircle size={14} className="text-red-500" />
                : <Bot size={14} className="text-purple-600" />}
            </div>
            <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
              msg.role === 'user' ? 'bg-primary-500 text-white'
                : msg.role === 'error' ? 'bg-red-50 text-red-700 border border-red-100'
                : 'bg-gray-100 text-gray-800'
            }`}
              dangerouslySetInnerHTML={{ __html: renderText(msg.text) }} />
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
              <Bot size={14} className="text-purple-600" />
            </div>
            <div className="bg-gray-100 px-3 py-2 rounded-xl">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      <div className="px-4 pb-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SUGGESTIONS.slice(0, 3).map(s => (
            <button key={s} onClick={() => sendMessage(s)} disabled={loading}
              className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-1 whitespace-nowrap hover:bg-purple-100 transition-colors flex-shrink-0 disabled:opacity-50">
              {s.length > 28 ? s.slice(0, 28) + '…' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Ask CU AI anything..."
            className="flex-1 text-sm border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          />
          <button onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 flex items-center justify-center transition-colors">
            <Send size={15} className={input.trim() ? 'text-white' : 'text-gray-400'} />
          </button>
        </div>
      </div>
    </div>
  )
}
