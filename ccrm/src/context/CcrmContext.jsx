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
  // Define states
  const [leads, setLeads] = useState([])
  const [applications, setApplications] = useState([])
  const [counselors, setCounselors] = useState(COUNSELORS)
  const [campaigns, setCampaigns] = useState([])
  const [tasks, setTasks] = useState([])
  const [payments, setPayments] = useState([])
  const [queries, setQueries] = useState([])
  const [documents, setDocuments] = useState([])
  const [events, setEvents] = useState([])
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('ccrm_current_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [notifications, setNotifications] = useState([])

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

  // Unified API Loader with offline LocalStorage fallback
  const fetchAllData = async () => {
    const token = localStorage.getItem('ccrm_token')
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {}

    try {
      const leadsRes = await fetch('/api/leads', { headers })
      if (leadsRes.ok) setLeads(await leadsRes.json())
      else throw new Error('Backend server is offline.')

      const appsRes = await fetch('/api/applications', { headers })
      if (appsRes.ok) setApplications(await appsRes.json())

      const campRes = await fetch('/api/campaigns', { headers })
      if (campRes.ok) setCampaigns(await campRes.json())

      const tasksRes = await fetch('/api/tasks', { headers })
      if (tasksRes.ok) setTasks(await tasksRes.json())

      const payRes = await fetch('/api/payments', { headers })
      if (payRes.ok) setPayments(await payRes.json())

      const qRes = await fetch('/api/queries', { headers })
      if (qRes.ok) setQueries(await qRes.json())

      const docRes = await fetch('/api/documents', { headers })
      if (docRes.ok) setDocuments(await docRes.json())

      const evRes = await fetch('/api/events', { headers })
      if (evRes.ok) setEvents(await evRes.json())

      const uRes = await fetch('/api/users', { headers })
      if (uRes.ok) setUsers(await uRes.json())

      const notifRes = await fetch('/api/notifications', { headers })
      if (notifRes.ok) setNotifications(await notifRes.json())
      
    } catch (e) {
      console.warn('Backend API server offline. Gracefully falling back to client-side localStorage state.', e)
      
      const localLeads = localStorage.getItem('ccrm_leads')
      setLeads(localLeads ? JSON.parse(localLeads) : LEADS)

      const localApps = localStorage.getItem('ccrm_applications')
      setApplications(localApps ? JSON.parse(localApps) : APPLICATIONS)

      const localCamps = localStorage.getItem('ccrm_campaigns')
      setCampaigns(localCamps ? JSON.parse(localCamps) : CAMPAIGNS)

      const localTasks = localStorage.getItem('ccrm_tasks')
      setTasks(localTasks ? JSON.parse(localTasks) : TASKS)

      const localPayments = localStorage.getItem('ccrm_payments')
      setPayments(localPayments ? JSON.parse(localPayments) : PAYMENTS)

      const localQueries = localStorage.getItem('ccrm_queries')
      setQueries(localQueries ? JSON.parse(localQueries) : QUERIES)

      const localDocs = localStorage.getItem('ccrm_documents')
      setDocuments(localDocs ? JSON.parse(localDocs) : DOCUMENTS)

      const localEvents = localStorage.getItem('ccrm_events')
      setEvents(localEvents ? JSON.parse(localEvents) : EVENTS)

      const localUsers = localStorage.getItem('ccrm_users')
      setUsers(localUsers ? JSON.parse(localUsers) : USERS)

      const localNotif = localStorage.getItem('ccrm_notifications')
      setNotifications(localNotif ? JSON.parse(localNotif) : [])
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // Sync to local storage as fallback cache
  useEffect(() => {
    if (leads.length > 0) localStorage.setItem('ccrm_leads', JSON.stringify(leads))
  }, [leads])

  useEffect(() => {
    if (applications.length > 0) localStorage.setItem('ccrm_applications', JSON.stringify(applications))
  }, [applications])

  useEffect(() => {
    if (campaigns.length > 0) localStorage.setItem('ccrm_campaigns', JSON.stringify(campaigns))
  }, [campaigns])

  useEffect(() => {
    if (tasks.length > 0) localStorage.setItem('ccrm_tasks', JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    if (payments.length > 0) localStorage.setItem('ccrm_payments', JSON.stringify(payments))
  }, [payments])

  useEffect(() => {
    if (queries.length > 0) localStorage.setItem('ccrm_queries', JSON.stringify(queries))
  }, [queries])

  useEffect(() => {
    if (documents.length > 0) localStorage.setItem('ccrm_documents', JSON.stringify(documents))
  }, [documents])

  useEffect(() => {
    if (events.length > 0) localStorage.setItem('ccrm_events', JSON.stringify(events))
  }, [events])

  useEffect(() => {
    if (users.length > 0) localStorage.setItem('ccrm_users', JSON.stringify(users))
  }, [users])

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('ccrm_current_user', JSON.stringify(currentUser))
    } else {
      localStorage.removeItem('ccrm_current_user')
    }
  }, [currentUser])

  useEffect(() => {
    if (notifications.length > 0) localStorage.setItem('ccrm_notifications', JSON.stringify(notifications))
  }, [notifications])

  const addNotification = async (text) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (res.ok) {
        const notifs = await fetch('/api/notifications')
        if (notifs.ok) {
          setNotifications(await notifs.json())
          return
        }
      }
    } catch {}

    const nextId = notifications.length > 0 ? Math.max(...notifications.map(n => n.id)) + 1 : 1
    const newNotif = {
      id: nextId,
      text,
      time: 'Just now',
      unread: true
    }
    setNotifications(prev => [newNotif, ...prev])
  }

  // --- ACTIONS ---

  // User Actions
  const handleLogin = async (email, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (res.ok) {
        const data = await res.json()
        localStorage.setItem('ccrm_token', data.token)
        setCurrentUser(data.user)
        showToast(`Welcome back, ${data.user.name}!`, 'success')
        fetchAllData()
        return { success: true, user: data.user }
      } else {
        const err = await res.json()
        return { success: false, error: err.error || 'Invalid email or password.' }
      }
    } catch {
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
      if (!user) return { success: false, error: 'Invalid email or password.' }
      if (user.status !== 'Active') return { success: false, error: 'This user account is inactive.' }
      
      const updatedUser = {
        ...user,
        lastLogin: new Date().toLocaleString('en-IN', { hour12: true })
      }
      setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u))
      setCurrentUser(updatedUser)
      showToast(`Welcome back, ${user.name}!`, 'success')
      return { success: true, user: updatedUser }
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('ccrm_token')
    setCurrentUser(null)
    showToast('Logged out successfully.', 'info')
  }

  const addUser = async (userData) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
      if (res.ok) {
        const newUser = await res.json()
        setUsers(prev => [newUser, ...prev])
        showToast(`User ${userData.name} created successfully.`, 'success')
        return
      }
    } catch {}

    const nextId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1
    const newUser = {
      ...userData,
      id: nextId,
      lastLogin: '—'
    }
    setUsers(prev => [...prev, newUser])
    showToast(`User ${userData.name} created successfully.`, 'success')
  }

  const updateUser = async (id, data) => {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        const updated = await res.json()
        setUsers(prev => prev.map(u => u.id === id ? updated : u))
        if (currentUser && currentUser.id === id) {
          setCurrentUser(updated)
        }
        showToast('User updated successfully.', 'success')
        return
      }
    } catch {}

    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u))
    if (currentUser && currentUser.id === id) {
      setCurrentUser(prev => ({ ...prev, ...data }))
    }
    showToast('User updated successfully.', 'success')
  }

  const deleteUser = async (id) => {
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== id))
        showToast('User deleted successfully.', 'success')
        return
      }
    } catch {}

    setUsers(prev => prev.filter(u => u.id !== id))
    showToast('User deleted successfully.', 'success')
  }

  // Lead Actions
  const addLead = async (leadData) => {
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      })
      if (res.ok) {
        const added = await res.json()
        setLeads(prev => [added, ...prev])
        showToast(`Lead for ${leadData.name} registered.`, 'success')
        return added
      }
    } catch {}

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

  const updateLead = async (id, data) => {
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        const updated = await res.json()
        setLeads(prev => prev.map(l => l.id === id ? updated : l))
        showToast('Lead details updated.', 'success')
        return
      }
    } catch {}

    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...data } : l))
    showToast('Lead details updated.', 'success')
  }

  const deleteLead = async (id) => {
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setLeads(prev => prev.filter(l => l.id !== id))
        showToast('Lead deleted successfully.', 'success')
        return
      }
    } catch {}

    setLeads(prev => prev.filter(l => l.id !== id))
    showToast('Lead deleted successfully.', 'success')
  }

  // Application Actions
  const addApplication = async (appData) => {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appData)
      })
      if (res.ok) {
        const added = await res.json()
        setApplications(prev => [added, ...prev])
        showToast(`Application ${added.appNo} submitted.`, 'success')
        
        const pays = await fetch('/api/payments')
        if (pays.ok) setPayments(await pays.json())

        return added
      }
    } catch {}

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
        amount: 25000,
        method: newApp.payMethod,
        status: newApp.payStatus === 'Approved' ? 'Approved' : 'Pending',
        date: newApp.payStatus === 'Approved' ? new Date().toLocaleDateString('en-IN') : '',
        txnId: newApp.payStatus === 'Approved' ? `TXN${Math.floor(100000 + Math.random() * 900000)}` : ''
      }
      setPayments(prev => [newPayment, ...prev])
    }

    showToast(`Application ${newApp.appNo} submitted.`, 'success')
    addNotification(`Application submitted: ${newApp.name} (${newApp.appNo})`)
    return newApp
  }

  const updateApplication = async (id, data) => {
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        const updated = await res.json()
        setApplications(prev => prev.map(a => a.id === id ? updated : a))
        showToast('Application updated.', 'success')

        const pays = await fetch('/api/payments')
        if (pays.ok) setPayments(await pays.json())

        return
      }
    } catch {}

    setApplications(prev => prev.map(a => a.id === id ? { ...a, ...data } : a))
    
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
  const addTask = async (taskData) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      })
      if (res.ok) {
        const added = await res.json()
        setTasks(prev => [...prev, added])
        showToast('Task added and synced with calendar.', 'success')

        const evs = await fetch('/api/events')
        if (evs.ok) setEvents(await evs.json())

        return added
      }
    } catch {}

    const nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1
    const newTask = {
      ...taskData,
      id: nextId,
      status: taskData.status || 'Pending'
    }
    setTasks(prev => [...prev, newTask])
    
    const nextEventId = events.length > 0 ? Math.max(...events.map(e => e.id)) + 1 : 1
    const eventDate = taskData.due ? taskData.due.split(' ')[0].split('/').reverse().join('-') : new Date().toISOString().split('T')[0]
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

  const toggleTaskComplete = async (id) => {
    const t = tasks.find(item => item.id === id)
    if (!t) return
    const nextStatus = t.status === 'Completed' ? 'Pending' : 'Completed'
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
      if (res.ok) {
        setTasks(prev => prev.map(item => item.id === id ? { ...item, status: nextStatus } : item))
        showToast(nextStatus === 'Completed' ? 'Task marked as completed!' : 'Task active again.', 'info')
        return
      }
    } catch {}

    setTasks(prev => prev.map(item => {
      if (item.id === id) {
        showToast(nextStatus === 'Completed' ? 'Task marked as completed!' : 'Task active again.', 'info')
        return { ...item, status: nextStatus }
      }
      return item
    }))
  }

  // Query/Tickets Actions
  const addQuery = async (queryData) => {
    try {
      const res = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryData)
      })
      if (res.ok) {
        const added = await res.json()
        setQueries(prev => [added, ...prev])
        showToast('Support ticket raised.', 'success')
        return added
      }
    } catch {}

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

  const updateQueryStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/queries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (res.ok) {
        setQueries(prev => prev.map(q => q.id === id ? { ...q, status } : q))
        showToast(`Ticket status changed to ${status}.`, 'info')
        return
      }
    } catch {}

    setQueries(prev => prev.map(q => q.id === id ? { ...q, status } : q))
    showToast(`Ticket status changed to ${status}.`, 'info')
  }

  const addQueryReply = async (id, replyText) => {
    try {
      const res = await fetch(`/api/queries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'In Progress' })
      })
      if (res.ok) {
        setQueries(prev => prev.map(q => q.id === id ? { ...q, status: 'In Progress' } : q))
        showToast('Reply submitted to student.', 'success')
        return
      }
    } catch {}

    setQueries(prev => prev.map(q => q.id === id ? { ...q, status: 'In Progress' } : q))
    showToast('Reply submitted to student.', 'success')
  }

  // Document Verification Actions
  const updateDocStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (res.ok) {
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, status } : d))
        showToast(`Document status marked as ${status}.`, 'info')
        return
      }
    } catch {}

    setDocuments(prev => prev.map(d => d.id === id ? { ...d, status } : d))
    showToast(`Document status marked as ${status}.`, 'info')
  }

  const uploadDocument = async (docData) => {
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData)
      })
      if (res.ok) {
        const added = await res.json()
        setDocuments(prev => [added, ...prev])
        showToast('Document uploaded successfully.', 'success')
        return added
      }
    } catch {}

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
  const addPayment = async (payData) => {
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payData)
      })
      if (res.ok) {
        const added = await res.json()
        setPayments(prev => [added, ...prev])
        showToast('Payment link generated.', 'success')
        return added
      }
    } catch {}

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

  const updatePaymentStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (res.ok) {
        const updated = await res.json()
        setPayments(prev => prev.map(p => p.id === id ? updated : p))
        showToast(`Payment status updated to ${status}.`, 'info')
        return
      }
    } catch {}

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
  const addCampaign = async (campData) => {
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campData)
      })
      if (res.ok) {
        const added = await res.json()
        setCampaigns(prev => [added, ...prev])
        showToast(`Campaign "${campData.name}" created.`, 'success')
        return added
      }
    } catch {}

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

  const toggleCampaignStatus = async (id) => {
    const c = campaigns.find(item => item.id === id)
    if (!c) return
    const nextStatus = c.status === 'Active' ? 'Paused' : 'Active'
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
      if (res.ok) {
        setCampaigns(prev => prev.map(item => item.id === id ? { ...item, status: nextStatus } : item))
        showToast(`Campaign ${nextStatus === 'Active' ? 'Resumed' : 'Paused'}.`, 'info')
        return
      }
    } catch {}

    setCampaigns(prev => prev.map(item => {
      if (item.id === id) {
        showToast(`Campaign ${nextStatus === 'Active' ? 'Resumed' : 'Paused'}.`, 'info')
        return { ...item, status: nextStatus }
      }
      return item
    }))
  }

  // Event/Calendar Actions
  const addEvent = async (eventData) => {
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      })
      if (res.ok) {
        const added = await res.json()
        setEvents(prev => [...prev, added])
        showToast(`Scheduled event: ${eventData.title}`, 'success')
        return added
      }
    } catch {}

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
      fetchAllData,
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
