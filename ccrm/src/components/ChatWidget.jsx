import React, { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, ChevronDown } from 'lucide-react'

// ── Knowledge base ──────────────────────────────────────────────────────────
const KB = [
  {
    patterns: ['fee', 'fees', 'cost', 'tuition', 'payment', 'price', 'how much'],
    answer: `**Fee Structure (Approx.)**\n• B.Tech: ₹85,000 – ₹1,10,000/year\n• MBA: ₹1,00,000 – ₹1,20,000/year\n• BCA/BBA: ₹60,000 – ₹75,000/year\n• B.Sc Agriculture: ₹70,000/year\n\nMerit scholarships available up to 50% waiver. Want me to connect you with an admissions counselor for exact figures?`
  },
  {
    patterns: ['scholarship', 'merit', 'discount', 'waiver', 'financial aid'],
    answer: `**CUTM Scholarships 2026**\n• Merit Scholarship: up to 100% tuition waiver (board toppers)\n• Sports Excellence: ₹50,000 grant\n• Rural Talent Scholarship: ₹25,000\n• Management Quota: special fee concession\n\nEligibility is assessed at admission. Apply early for maximum benefit!`
  },
  {
    patterns: ['course', 'program', 'btech', 'b.tech', 'mba', 'bca', 'mca', 'agriculture', 'pharmacy', 'nursing'],
    answer: `**Programs at CUTM**\n🔬 Engineering: B.Tech CSE, CSE (AI/ML), Cyber Security, ECE, Civil, Mechanical\n💼 Management: MBA, MBA (Finance/HR/Marketing)\n💻 IT: BCA, MCA\n🌾 Agriculture: B.Sc & M.Sc Agriculture (Genetics)\n🏥 Health: Pharmacy, Nursing\n📊 Commerce: B.Com, BBA\n\nWhich program are you interested in?`
  },
  {
    patterns: ['campus', 'location', 'where', 'bhubaneswar', 'odisha', 'andhra', 'vizianagaram', 'balasore', 'paralakhemundi'],
    answer: `**CUTM has 4 campuses:**\n🏛️ **Bhubaneswar, Odisha** – Main campus, 100+ acres\n🌿 **Paralakhemundi, Odisha** – Eco campus, Agriculture focus\n🚀 **Balasore, Odisha** – Near DRDO research corridor\n🏫 **Vizianagaram, Andhra Pradesh** – Strong industry linkages\n\nWhich campus interests you?`
  },
  {
    patterns: ['hostel', 'accommodation', 'stay', 'room', 'housing'],
    answer: `**Hostel Facilities**\n✅ Separate boys & girls hostels on all campuses\n✅ 24/7 security & CCTV surveillance\n✅ Mess with veg & non-veg options\n✅ Wi-Fi, laundry, recreation rooms\n✅ Medical facility on campus\n\nHostel fee: approx. ₹60,000–₹80,000/year (including meals). Want to know more?`
  },
  {
    patterns: ['placement', 'job', 'company', 'salary', 'recruit', 'hire', 'career'],
    answer: `**Placement Highlights**\n📊 95%+ placement record\n🏢 500+ recruiting companies including TCS, Infosys, Wipro, Amazon, Cognizant\n💰 Highest package: ₹45 LPA (2024)\n📈 Average package: ₹4.8 LPA\n🌍 International placement opportunities\n\nOur placement cell actively trains students year-round!`
  },
  {
    patterns: ['eligibility', 'qualify', 'minimum', 'marks', '12th', 'criteria', 'cutoff'],
    answer: `**Eligibility Criteria**\n• B.Tech: 10+2 with PCM, minimum 45% (40% for reserved categories)\n• MBA: Any graduation 50%+ (CUEE/CMAT/CAT/MAT accepted)\n• BCA: 10+2 any stream, minimum 45%\n• B.Sc Agriculture: 10+2 with Biology/Maths, 45%+\n\nCUEE entrance exam is conducted by CUTM. Walk-in admissions also available!`
  },
  {
    patterns: ['apply', 'application', 'register', 'admission', 'enroll', 'how to'],
    answer: `**How to Apply**\n1️⃣ Fill this inquiry form (you're already here! ✅)\n2️⃣ Our counselor will call you within 24 hours\n3️⃣ Appear for CUEE entrance test (optional for some programs)\n4️⃣ Submit documents & pay registration fee\n5️⃣ Get admission confirmation letter\n\nOr apply directly at **cutm.ac.in/apply** 🎓`
  },
  {
    patterns: ['naac', 'accredited', 'rank', 'recognition', 'approved', 'aicte', 'ugc'],
    answer: `**Accreditation & Rankings**\n🏆 NAAC A+ Accredited\n✅ Approved by AICTE, UGC, PCI\n📊 Ranked in NIRF top institutions\n🌐 200+ international university tie-ups\n📜 NBA accredited programs\n\nCUTM is among Odisha's top private universities!`
  },
  {
    patterns: ['contact', 'phone', 'call', 'email', 'reach', 'speak', 'talk', 'number'],
    answer: `**Contact Admissions**\n📞 **+91 674 2559441**\n📧 **admissions@cutm.ac.in**\n🕐 Mon–Sat, 9 AM – 6 PM\n\nOr share your mobile number here and we'll call you back within 2 hours! 😊`
  },
  {
    patterns: ['cuee', 'entrance', 'exam', 'test', 'date', '2026'],
    answer: `**CUEE 2026 Details**\n📅 Registration open until June 2026\n📝 Online/offline exam available\n📊 Sections: Mathematics, Reasoning, English\n⏱️ Duration: 2 hours\n✅ No negative marking\n\nMany programs offer direct admission based on 10+2/graduation marks too!`
  },
]

const QUICK_REPLIES = ['Fee structure', 'Available courses', 'Placements', 'How to apply', 'Hostel info']

function getBotResponse(input) {
  const lower = input.toLowerCase()
  for (const entry of KB) {
    if (entry.patterns.some(p => lower.includes(p))) return entry.answer
  }
  // Capture lead intent
  if (/hi|hello|hey|helo|namaste/.test(lower)) {
    return `Hello! 👋 I'm the CUTM Admissions Assistant.\n\nI can help you with:\n• Course information\n• Fee structure\n• Scholarships\n• Campus details\n• How to apply\n\nWhat would you like to know?`
  }
  if (/thank|thanks|ok|okay|got it|understood/.test(lower)) {
    return `You're welcome! 😊 Is there anything else I can help you with? Or would you like a counselor to call you for personalized guidance?`
  }
  return `I'd love to help with that! For the most accurate answer, our admissions counselors are available:\n📞 **+91 674 2559441**\n📧 **admissions@cutm.ac.in**\n\nOr fill in the inquiry form above and we'll get back to you within 24 hours! 🎓`
}

function formatMessage(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

export default function ChatWidget() {
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState([
    { from: 'bot', text: `Hi! 👋 I'm your CUTM Admissions Assistant.\n\nAsk me anything about courses, fees, scholarships, placements, or how to apply!` }
  ])
  const [input, setInput]     = useState('')
  const [typing, setTyping]   = useState(false)
  const [unread, setUnread]   = useState(1)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [open, messages])

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg) return
    setInput('')
    setMessages(prev => [...prev, { from: 'user', text: msg }])
    setTyping(true)
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400))
    const reply = getBotResponse(msg)
    setMessages(prev => [...prev, { from: 'bot', text: reply }])
    setTyping(false)
    if (!open) setUnread(n => n + 1)
  }

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="Chat with admissions"
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
          style={{ maxHeight: '70vh' }}>
          {/* Header */}
          <div className="bg-primary-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle size={16} className="text-white" />
              </div>
              <div>
                <div className="text-white text-sm font-semibold leading-tight">CUTM Admissions</div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  <span className="text-primary-200 text-[10px]">Online · typically replies instantly</span>
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
              <ChevronDown size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  m.from === 'user'
                    ? 'bg-primary-600 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm'
                }`}
                  dangerouslySetInnerHTML={{ __html: formatMessage(m.text) }}
                />
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 shadow-sm px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick replies */}
          {messages.length < 3 && (
            <div className="px-3 py-2 border-t border-gray-100 flex gap-1.5 overflow-x-auto scrollbar-hide flex-shrink-0">
              {QUICK_REPLIES.map(q => (
                <button key={q} onClick={() => send(q)}
                  className="text-[11px] whitespace-nowrap bg-primary-50 hover:bg-primary-100 text-primary-700 border border-primary-200 rounded-full px-2.5 py-1 transition-colors flex-shrink-0">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-100 flex items-center gap-2 bg-white flex-shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask about admission, fees, courses…"
              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
            <button onClick={() => send()}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:bg-gray-200 text-white flex items-center justify-center transition-colors flex-shrink-0">
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
