import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  LEADS,
  APPLICATIONS,
  COUNSELORS,
  CAMPAIGNS,
  TASKS,
  PAYMENTS,
  QUERIES,
  DOCUMENTS,
  EVENTS,
  USERS
} from '../data/mockData'

const CcrmContext = createContext()

export function useCcrm() {
  const context = useContext(CcrmContext)
  if (!context) {
    throw new Error('useCcrm must be used within a CcrmProvider')
  }
  return context
}

export function CcrmProvider({ children }) {
  // Helper to load initial state from local storage or fallback to mock data
  const loadState = (key, fallback) => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? JSON.parse(saved) : fallback
    } catch (e) {
      console.error(`Failed to load state for ${key}`, e)
      return fallback
    }
  }

  // Define states
  const [leads, setLeads] = useState(() => loadState('ccrm_leads', LEADS))
  const [applications, setApplications] = useState(() => loadState('ccrm_applications', APPLICATIONS))
  const [counselors, setCounselors] = useState(() => loadState('ccrm_counselors', COUNSELORS))
  const [campaigns, setCampaigns] = useState(() => loadState('ccrm_campaigns', CAMPAIGNS))
  const [tasks, setTasks] = useState(() => loadState('ccrm_tasks', TASKS))
  const [payments, setPayments] = useState(() => loadState('ccrm_payments', PAYMENTS))
  const [queries, setQueries] = useState(() => loadState('ccrm_queries', QUERIES))
  const [documents, setDocuments] = useState(() => loadState('ccrm_documents', DOCUMENTS))
  const [events, setEvents] = useState(() => loadState('ccrm_events', EVENTS))
  const [users, setUsers] = useState(() => loadState('ccrm_users', USERS))
  const [currentUser, setCurrentUser] = useState(() => loadState('ccrm_current_user', null))
  const [notifications, setNotifications] = useState(() => loadState('ccrm_notifications', [
    { id: 1, text: 'New lead assigned: Ravi Kumar',          time: '2 min ago',  unread: true  },
    { id: 2, text: 'Application submitted by Priya Sharma',  time: '15 min ago', unread: true  },
    { id: 3, text: 'Follow-up reminder: Arjun Patel',        time: '1 hr ago',   unread: false },
    { id: 4, text: 'Payment approved: Sneha Reddy',          time: '3 hrs ago',  unread: false },
  ]))

  // Toast system state
  const [toasts, setToasts] = useState([])

  // Expose toast trigger helper
  const showToast = (message, type = 'success') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const addNotification = (text) => {
    const nextId = notifications.length > 0 ? Math.max(...notifications.map(n => n.id)) + 1 : 1
    const newNotif = {
      id: nextId,
      text,
      time: 'Just now',
      unread: true
    }
    setNotifications(prev => [newNotif, ...prev])
  }

  // Sync to local storage when state changes
  useEffect(() => {
    localStorage.setItem('ccrm_leads', JSON.stringify(leads))
  }, [leads])

  useEffect(() => {
    localStorage.setItem('ccrm_applications', JSON.stringify(applications))
  }, [applications])

  useEffect(() => {
    localStorage.setItem('ccrm_counselors', JSON.stringify(counselors))
  }, [counselors])

  useEffect(() => {
    localStorage.setItem('ccrm_campaigns', JSON.stringify(campaigns))
  }, [campaigns])

  useEffect(() => {
    localStorage.setItem('ccrm_tasks', JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    localStorage.setItem('ccrm_payments', JSON.stringify(payments))
  }, [payments])

  useEffect(() => {
    localStorage.setItem('ccrm_queries', JSON.stringify(queries))
  }, [queries])

  useEffect(() => {
    localStorage.setItem('ccrm_documents', JSON.stringify(documents))
  }, [documents])

  useEffect(() => {
    localStorage.setItem('ccrm_events', JSON.stringify(events))
  }, [events])

  useEffect(() => {
    localStorage.setItem('ccrm_users', JSON.stringify(users))
  }, [users])

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('ccrm_current_user', JSON.stringify(currentUser))
    } else {
      localStorage.removeItem('ccrm_current_user')
    }
  }, [currentUser])

  useEffect(() => {
    localStorage.setItem('ccrm_notifications', JSON.stringify(notifications))
  }, [notifications])

  // --- ACTIONS ---

  // User Actions
  const handleLogin = (email, password) => {
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
    if (!user) return { success: false, error: 'Invalid email or password.' }
    if (user.status !== 'Active') return { success: false, error: 'This user account is inactive. Please contact support.' }
    
    const updatedUser = {
      ...user,
      lastLogin: new Date().toLocaleString('en-IN', { hour12: true })
    }
    
    // Update active users lists
    setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u))
    setCurrentUser(updatedUser)
    showToast(`Welcome back, ${user.name}!`, 'success')
    return { success: true, user: updatedUser }
  }

  const handleLogout = () => {
    setCurrentUser(null)
    showToast('Logged out successfully.', 'info')
  }

  const addUser = (userData) => {
    const nextId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1
    const newUser = {
      ...userData,
      id: nextId,
      lastLogin: '—'
    }
    setUsers(prev => [...prev, newUser])
    showToast(`User ${userData.name} created successfully.`, 'success')
  }

  const updateUser = (id, data) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u))
    // If updating current user's details
    if (currentUser && currentUser.id === id) {
      setCurrentUser(prev => ({ ...prev, ...data }))
    }
    showToast('User updated successfully.', 'success')
  }

  const deleteUser = (id) => {
    setUsers(prev => prev.filter(u => u.id !== id))
    showToast('User deleted successfully.', 'success')
  }

  // Lead Actions
  const addLead = (leadData) => {
    const nextId = leads.length > 0 ? Math.max(...leads.map(l => l.id)) + 1 : 1
    const newLead = {
      ...leadData,
      id: nextId,
      regDate: new Date().toLocaleString('en-IN', { hour12: true }),
      score: leadData.score || 0,
      stageColor: leadData.stageColor || 'red',
      stage: leadData.stage || 'Untouched'
    }
    setLeads(prev => [newLead, ...prev])
    showToast(`Lead for ${leadData.name} registered.`, 'success')
    addNotification(`New lead assigned: ${leadData.name} (${leadData.course || 'B.Tech CSE'})`)
    return newLead
  }

  const updateLead = (id, data) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...data } : l))
    showToast('Lead details updated.', 'success')
  }

  const deleteLead = (id) => {
    setLeads(prev => prev.filter(l => l.id !== id))
    showToast('Lead deleted successfully.', 'success')
  }

  // Application Actions
  const addApplication = (appData) => {
    const nextId = applications.length > 0 ? Math.max(...applications.map(a => a.id)) + 1 : 1
    const newApp = {
      ...appData,
      id: nextId,
      appNo: appData.appNo || `CUEE2026${Math.floor(1000 + Math.random() * 9000)}`,
      formStatus: appData.formStatus || 'Incomplete',
      payStatus: appData.payStatus || 'Payment Pending',
      payMethod: appData.payMethod || '',
      stage: appData.stage || 'Application Started'
    }
    setApplications(prev => [newApp, ...prev])
    
    // Auto-create initial payments record if needed
    const paymentExists = payments.some(p => p.appNo === newApp.appNo)
    if (!paymentExists) {
      const nextPayId = payments.length > 0 ? Math.max(...payments.map(p => p.id)) + 1 : 1
      const newPayment = {
        id: nextPayId,
        name: newApp.name,
        appNo: newApp.appNo,
        amount: 25000, // standard form fee
        method: newApp.payMethod,
        status: newApp.payStatus === 'Approved' ? 'Approved' : (newApp.payStatus === 'Payment Approved' ? 'Approved' : 'Pending'),
        date: newApp.payStatus === 'Approved' ? new Date().toLocaleDateString('en-IN') : '',
        txnId: newApp.payStatus === 'Approved' ? `TXN${Math.floor(100000 + Math.random() * 900000)}` : ''
      }
      setPayments(prev => [newPayment, ...prev])
    }

    showToast(`Application ${newApp.appNo} submitted.`, 'success')
    addNotification(`Application submitted: ${newApp.name} (${newApp.appNo})`)
    return newApp
  }

  const updateApplication = (id, data) => {
    setApplications(prev => prev.map(a => a.id === id ? { ...a, ...data } : a))
    
    // Sync to payments if application status changes
    if (data.payStatus) {
      const app = applications.find(a => a.id === id)
      if (app) {
        setPayments(prev => prev.map(p => {
          if (p.appNo === app.appNo) {
            const isApproved = data.payStatus === 'Approved' || data.payStatus === 'Payment Approved'
            return {
              ...p,
              status: isApproved ? 'Approved' : (data.payStatus === 'Failed' ? 'Failed' : 'Pending'),
              date: isApproved ? new Date().toLocaleDateString('en-IN') : p.date,
              txnId: isApproved && !p.txnId ? `TXN${Math.floor(100000 + Math.random() * 900000)}` : p.txnId
            }
          }
          return p
        }))
      }
    }

    showToast('Application updated.', 'success')
  }

  // Task Actions
  const addTask = (taskData) => {
    const nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1
    const newTask = {
      ...taskData,
      id: nextId,
      status: taskData.status || 'Pending'
    }
    setTasks(prev => [...prev, newTask])
    
    // Auto-schedule an event in the calendar as well!
    const nextEventId = events.length > 0 ? Math.max(...events.map(e => e.id)) + 1 : 1
    const eventDate = taskData.due ? taskData.due.split(' ')[0].split('/').reverse().join('-') : new Date().toISOString().split('T')[0] // 'DD/MM/YYYY' -> 'YYYY-MM-DD'
    const eventTime = taskData.due ? taskData.due.split(' ')[1] + ' ' + taskData.due.split(' ')[2] : '10:00 AM'
    const newEvent = {
      id: nextEventId,
      title: taskData.title,
      date: eventDate,
      time: eventTime,
      type: taskData.type || 'Task',
      venue: 'Online / Call',
      participants: 1
    }
    setEvents(prev => [...prev, newEvent])

    showToast('Task added and synced with calendar.', 'success')
    addNotification(`Task scheduled: ${taskData.title} (Due: ${taskData.due || 'Soon'})`)
    return newTask
  }

  const toggleTaskComplete = (id) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const nextStatus = t.status === 'Completed' ? 'Pending' : 'Completed'
        showToast(nextStatus === 'Completed' ? 'Task marked as completed!' : 'Task active again.', 'info')
        return { ...t, status: nextStatus }
      }
      return t
    }))
  }

  // Query/Tickets Actions
  const addQuery = (queryData) => {
    const nextId = queries.length > 0 ? Math.max(...queries.map(q => q.id)) + 1 : 1
    const newQuery = {
      ...queryData,
      id: nextId,
      status: 'Open',
      created: new Date().toLocaleDateString('en-IN')
    }
    setQueries(prev => [newQuery, ...prev])
    showToast('Support ticket raised.', 'success')
    return newQuery
  }

  const updateQueryStatus = (id, status) => {
    setQueries(prev => prev.map(q => q.id === id ? { ...q, status } : q))
    showToast(`Ticket status changed to ${status}.`, 'info')
  }

  const addQueryReply = (id, replyText) => {
    // Queries in our model don't have replies nested, but we can update its status to "In Progress" or log a toast.
    // In a fully working system, we can store reply logs in localStorage as well.
    // Let's mark it as In Progress or Resolved
    setQueries(prev => prev.map(q => {
      if (q.id === id) {
        return { ...q, status: 'In Progress' }
      }
      return q
    }))
    showToast('Reply submitted to student.', 'success')
  }

  // Document Verification Actions
  const updateDocStatus = (id, status) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, status } : d))
    showToast(`Document status marked as ${status}.`, 'info')
  }

  const uploadDocument = (docData) => {
    const nextId = documents.length > 0 ? Math.max(...documents.map(d => d.id)) + 1 : 1
    const newDoc = {
      ...docData,
      id: nextId,
      status: 'Pending',
      uploadDate: new Date().toLocaleDateString('en-IN')
    }
    setDocuments(prev => [newDoc, ...prev])
    showToast('Document uploaded successfully.', 'success')
    return newDoc
  }

  // Payment Actions
  const addPayment = (payData) => {
    const nextId = payments.length > 0 ? Math.max(...payments.map(p => p.id)) + 1 : 1
    const newPay = {
      ...payData,
      id: nextId,
      date: payData.date || new Date().toLocaleDateString('en-IN')
    }
    setPayments(prev => [newPay, ...prev])
    showToast('Payment link generated.', 'success')
    return newPay
  }

  const updatePaymentStatus = (id, status) => {
    setPayments(prev => prev.map(p => {
      if (p.id === id) {
        const isApproved = status === 'Approved'
        return {
          ...p,
          status,
          date: isApproved ? new Date().toLocaleDateString('en-IN') : p.date,
          txnId: isApproved && !p.txnId ? `TXN${Math.floor(100000 + Math.random() * 900000)}` : p.txnId
        }
      }
      return p
    }))
    showToast(`Payment status updated to ${status}.`, 'info')
  }

  // Campaign Actions
  const addCampaign = (campData) => {
    const nextId = campaigns.length > 0 ? Math.max(...campaigns.map(c => c.id)) + 1 : 1
    const newCamp = {
      ...campData,
      id: nextId,
      spent: 0,
      leads: 0,
      conversions: 0,
      startDate: new Date().toLocaleDateString('en-IN')
    }
    setCampaigns(prev => [newCamp, ...prev])
    showToast(`Campaign "${campData.name}" created.`, 'success')
    return newCamp
  }

  const toggleCampaignStatus = (id) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id === id) {
        const nextStatus = c.status === 'Active' ? 'Paused' : 'Active'
        showToast(`Campaign ${nextStatus === 'Active' ? 'Resumed' : 'Paused'}.`, 'info')
        return { ...c, status: nextStatus }
      }
      return c
    }))
  }

  // Event/Calendar Actions
  const addEvent = (eventData) => {
    const nextId = events.length > 0 ? Math.max(...events.map(e => e.id)) + 1 : 1
    const newEvent = {
      ...eventData,
      id: nextId,
      participants: eventData.participants || 1
    }
    setEvents(prev => [...prev, newEvent])
    showToast(`Scheduled event: ${eventData.title}`, 'success')
    return newEvent
  }

  return (
    <CcrmContext.Provider value={{
      leads, setLeads, addLead, updateLead, deleteLead,
      applications, setApplications, addApplication, updateApplication,
      counselors, setCounselors,
      campaigns, setCampaigns, addCampaign, toggleCampaignStatus,
      tasks, setTasks, addTask, toggleTaskComplete,
      payments, setPayments, addPayment, updatePaymentStatus,
      queries, setQueries, addQuery, updateQueryStatus, addQueryReply,
      documents, setDocuments, updateDocStatus, uploadDocument,
      events, setEvents, addEvent,
      users, setUsers, addUser, updateUser, deleteUser,
      currentUser, setCurrentUser, handleLogin, handleLogout,
      toasts, showToast, removeToast,
      notifications, setNotifications, addNotification
    }}>
      {children}

      {/* Floating Toast Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(toast => {
          const bgMap = {
            success: 'bg-green-50 border-green-200 text-green-800 shadow-green-100',
            error: 'bg-red-50 border-red-200 text-red-800 shadow-red-100',
            info: 'bg-blue-50 border-blue-200 text-blue-800 shadow-blue-100',
            warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 shadow-yellow-100'
          }
          const iconColorMap = {
            success: 'text-green-500',
            error: 'text-red-500',
            info: 'text-blue-500',
            warning: 'text-yellow-500'
          }
          
          return (
            <div
              key={toast.id}
              className={`p-4 rounded-xl border flex items-center justify-between pointer-events-auto shadow-lg animate-slide-in transition-all duration-300 ${bgMap[toast.type] || bgMap.success}`}
              role="alert"
            >
              <div className="flex items-center gap-3">
                <span className={`text-base font-extrabold ${iconColorMap[toast.type] || iconColorMap.success}`}>
                  {toast.type === 'success' && '✓'}
                  {toast.type === 'error' && '✗'}
                  {toast.type === 'info' && 'ℹ'}
                  {toast.type === 'warning' && '⚠'}
                </span>
                <p className="text-sm font-medium">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors ml-3 focus:outline-none"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </CcrmContext.Provider>
  )
}
