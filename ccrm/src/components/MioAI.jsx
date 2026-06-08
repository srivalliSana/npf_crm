import React, { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Bot, User } from 'lucide-react'

const SUGGESTIONS = [
  'Show me today\'s pending follow-ups',
  'How many leads were added this week?',
  'Which counselor has the highest conversion rate?',
  'List applications with payment pending',
  'Show top performing campaigns',
  'How many students enrolled this month?',
]

const BOT_RESPONSES = {
  'follow': 'You have **8 pending follow-ups** today. Top priority: Ravi Kumar Sharma (Call), Sneha Reddy (WhatsApp), Kiran Babu Rao (Email).',
  'leads': 'This week **142 new leads** were added. Top sources: Google Ads (52), Facebook Ads (38), Referral (28).',
  'conversion': '**Kavitha Rao** has the highest conversion rate at 18.2%, followed by Anita Sharma at 15.8%.',
  'payment': 'There are **6 applications** with payment pending totaling ₹1,75,000. Oldest pending: Korumalli Vandana (3 days).',
  'campaign': 'Top campaign: **Google Search – B.Tech** with 2,100 leads and 156 conversions (ROI: 142%).',
  'enrolled': '**128 students** enrolled this month, up 22% from last month. B.Tech CSE leads with 34 enrollments.',
  'default': 'I can help you with lead insights, application status, payment tracking, campaign performance, and team productivity. What would you like to know?',
}

function getBotResponse(msg) {
  const lower = msg.toLowerCase()
  if (lower.includes('follow')) return BOT_RESPONSES.follow
  if (lower.includes('lead') && lower.includes('week')) return BOT_RESPONSES.leads
  if (lower.includes('conversion')) return BOT_RESPONSES.conversion
  if (lower.includes('payment')) return BOT_RESPONSES.payment
  if (lower.includes('campaign')) return BOT_RESPONSES.campaign
  if (lower.includes('enroll')) return BOT_RESPONSES.enrolled
  return BOT_RESPONSES.default
}

export default function MioAI({ onClose }) {
  const [messages, setMessages] = useState([
    { id: 1, role: 'bot', text: 'Hi! I\'m **CU AI**, your intelligent CCRM assistant. I can help you with lead insights, application tracking, payment status, and much more. What would you like to know?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = (text) => {
    const msg = text || input.trim()
    if (!msg) return
    setInput('')
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: msg }])
    setLoading(true)
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'bot', text: getBotResponse(msg) }])
      setLoading(false)
    }, 800)
  }

  const renderText = (text) => {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 flex flex-col" style={{ height: '520px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">CU AI</p>
            <p className="text-purple-200 text-xs">CCRM Intelligence Assistant</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'bot' ? 'bg-purple-100' : 'bg-primary-500'}`}>
              {msg.role === 'bot' ? <Bot size={14} className="text-purple-600" /> : <User size={14} className="text-white" />}
            </div>
            <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${msg.role === 'bot' ? 'bg-gray-100 text-gray-800' : 'bg-primary-500 text-white'}`}
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
            <button key={s} onClick={() => sendMessage(s)}
              className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-1 whitespace-nowrap hover:bg-purple-100 transition-colors flex-shrink-0">
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
