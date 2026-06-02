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
  const [counselors, setCounselors] = useState([])
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

      const cnsRes = await fetch('/api/counselors', { headers })
      if (cnsRes.ok) setCounselors(await cnsRes.json())

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
      const localUsersData = localUsers ? JSON.parse(localUsers) : USERS
      setUsers(localUsersData)

      // Derive counselors from local users + leads/apps/payments
      const localLeadsData = localLeads ? JSON.parse(localLeads) : LEADS
      const localAppsData  = localApps  ? JSON.parse(localApps)  : APPLICATIONS
      const parsedPayments = localPayments ? JSON.parse(localPayments) : PAYMENTS
      const derivedCounselors = localUsersData
        .filter(u => u.status === 'Active')
        .map(u => {
          const simplName = u.name.split(' ')[0]
          const cLeads = localLeadsData.filter(l => l.owner === u.name || l.owner?.startsWith(simplName))
          const untouched = cLeads.filter(l => l.stage === 'Untouched').length
          const cApps = localAppsData.filter(a => a.owner === u.name || a.owner?.startsWith(simplName))
          const payApproved = parsedPayments.filter(p => {
            if (p.status !== 'Approved' && p.status !== 'Payment Approved') return false
            const app = localAppsData.find(a => a.appNo === p.appNo)
            return app && (app.owner === u.name || app.owner?.startsWith(simplName))
          }).length
          return {
            name: u.name,
            email: u.email,
            leads: cLeads.length,
            apps: cApps.length,
            engaged: cLeads.length - untouched,
            untouched,
            payApproved,
            submitted: cApps.filter(a => a.stage === 'Application Submitted').length,
            enrolled: cApps.filter(a => a.stage === 'Enrolment' || a.stage === 'Enrolments').length,
          }
        })
      setCounselors(derivedCounselors)

      const localNotif = localStorage.getItem('ccrm_notifications')
      setNotifications(localNotif ? JSON.parse(localNotif) : [])
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // Poll notifications every 30 seconds when user is logged in
  const fetchNotifications = async () => {
    const token = localStorage.getItem('ccrm_token')
    if (!token) return
    try {
      const r = await fetch('/api/notifications', { headers: { 'Authorization': `Bearer ${token}` } })
      if (r.ok) setNotifications(await r.json())
    } catch {}
  }

  useEffect(() => {
    if (!currentUser) return
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [currentUser])

  // Safe localStorage write — never crash the app if quota is exceeded.
  // Large operational arrays (leads/applications/payments/etc.) are NOT cached
  // because they are always re-fetched from the API via fetchAllData() on load.
  // Caching 12k+ leads here was overflowing the ~5MB localStorage quota.
  const safeSetItem = (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      // QuotaExceededError — purge stale big caches so the app keeps working
      try {
        ['ccrm_leads','ccrm_applications','ccrm_payments','ccrm_queries',
         'ccrm_documents','ccrm_tasks','ccrm_events','ccrm_notifications',
         'ccrm_campaigns','ccrm_users'].forEach(k => localStorage.removeItem(k))
      } catch {}
    }
  }

  // Only persist lightweight, session-critical state to localStorage.
  // Everything else comes fresh from the API.
  useEffect(() => {
    if (currentUser) {
      safeSetItem('ccrm_current_user', JSON.stringify(currentUser))
    } else {
      localStorage.removeItem('ccrm_current_user')
    }
  }, [currentUser])

  const addNotification = (text) => {
    // Optimistically add to local state; server creates it via createNotification() on actions
    const nextId = Date.now()
    const newNotif = { id: nextId, text, title: text, time: 'Just now', unread: true }
    setNotifications(prev => [newNotif, ...prev])
  }

  const markNotificationRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n))
    try {
      const token = localStorage.getItem('ccrm_token')
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch {}
  }

  const markAllNotificationsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
    try {
      const token = localStorage.getItem('ccrm_token')
      await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch {}
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

  // Refresh counselor stats from API (called after lead/app changes)
  const refreshCounselors = async () => {
    try {
      const res = await fetch('/api/counselors')
      if (res.ok) setCounselors(await res.json())
    } catch {}
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
    refreshCounselors()
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
    refreshCounselors()
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

  const deleteApplication = async (id) => {
    try {
      await fetch(`/api/applications/${id}`, { method: 'DELETE' })
    } catch {}
    setApplications(prev => prev.filter(a => a.id !== id))
    showToast('Application deleted.', 'success')
  }

  const deleteDocument = async (id) => {
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    } catch {}
    setDocuments(prev => prev.filter(d => d.id !== id))
    showToast('Document deleted.', 'success')
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

  // ---- NEW FEATURE ACTIONS ----

  // Feature 1: Dedup check
  const checkDuplicate = async (mobile, email) => {
    try {
      const res = await fetch('/api/leads/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, email })
      })
      if (res.ok) return await res.json()
    } catch {}
    return { duplicates: [], hasDuplicate: false }
  }

  // Feature 2: Auto-assign
  const getNextAssignee = async () => {
    try {
      const res = await fetch('/api/leads/next-assignee')
      if (res.ok) {
        const data = await res.json()
        return data.assignee || 'Unassigned'
      }
    } catch {}
    return 'Unassigned'
  }

  // Feature 5: Bulk WhatsApp
  const sendBulkWhatsApp = async (leadIds, message, templateName) => {
    try {
      const res = await fetch('/api/leads/bulk-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, message, templateName, sentBy: currentUser?.name || 'Unknown' })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        showToast(`WhatsApp: ${data.sent} sent${data.failed ? `, ${data.failed} failed` : ''} of ${data.total}`, data.failed ? 'warning' : 'success')
        return data
      }
      // Not configured or failed — show the real reason
      showToast(data.error || 'WhatsApp send failed', 'error')
      return data
    } catch (e) {
      showToast('WhatsApp bulk send failed.', 'error')
    }
    return { sent: 0, total: leadIds.length }
  }

  const sendBulkSMS = async (leadIds, message) => {
    try {
      const res = await fetch('/api/leads/bulk-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, message })
      })
      if (res.ok) {
        const data = await res.json()
        showToast(`SMS via ${data.provider || 'gateway'}: ${data.sent} of ${data.total} sent.`, 'success')
        return data
      }
    } catch {}
    showToast('SMS bulk send failed.', 'error')
    return { sent: 0, total: leadIds.length }
  }

  // Send RCS (rich card / text) via configured provider
  const sendBulkRCS = async (leadIds, message, opts = {}) => {
    try {
      const res = await fetch('/api/leads/bulk-rcs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, message, templateId: opts.templateId, rcsType: opts.rcsType })
      })
      if (res.ok) {
        const data = await res.json()
        showToast(`RCS via ${data.provider || 'gateway'}: ${data.sent} of ${data.total} sent.`, 'success')
        return data
      }
      const err = await res.json().catch(() => ({}))
      showToast(err.error || 'RCS bulk send failed.', 'error')
    } catch {
      showToast('RCS network error.', 'error')
    }
    return { sent: 0, total: leadIds.length }
  }

  // Approved RCS templates — fetched from local DB (populated via webhook or manual add)
  const [rcsTemplates, setRcsTemplates] = useState([])
  const fetchRcsTemplates = async () => {
    try {
      const res = await fetch('/api/rcs/templates')
      if (res.ok) {
        const data = await res.json()
        setRcsTemplates(Array.isArray(data) ? data : [])
        return data
      }
    } catch {}
    return []
  }

  // Feature 6: Drip sequences
  const [dripSequences, setDripSequences] = useState([])
  const enrollDrip = async (lead) => {
    try {
      const res = await fetch('/api/drip/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, leadName: lead.name, leadEmail: lead.email, leadMobile: lead.mobile })
      })
      if (res.ok) {
        const data = await res.json()
        setDripSequences(prev => [data, ...prev.filter(d => d.lead_id !== lead.id)])
        showToast(`${lead.name} enrolled in drip sequence.`, 'success')
        return data
      }
    } catch {}
    showToast('Failed to enroll in drip sequence.', 'error')
  }

  // Feature 11: Payment link
  const generatePaymentLink = async (appNo, name, email, mobile, amount) => {
    try {
      const integCfg = JSON.parse(localStorage.getItem('ccrm_integrations') || '{}')?.razorpay || {}
      const res = await fetch('/api/payments/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appNo, name, email, mobile, amount, razorpayConfig: integCfg })
      })
      if (res.ok) {
        const data = await res.json()
        showToast(`Payment link generated for ${appNo}`, 'success')
        return data
      }
    } catch {}
    showToast('Failed to generate payment link.', 'error')
    return null
  }

  // Feature 16: Call logs
  const [callLogs, setCallLogs] = useState([])
  const logCall = async (callData) => {
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(callData)
      })
      if (res.ok) {
        const added = await res.json()
        setCallLogs(prev => [added, ...prev])
        showToast(`Call logged: ${callData.outcome || 'Called'} — ${callData.leadName}`, 'info')
        if (callData.outcome && callData.outcome !== 'No Answer') {
          setLeads(prev => prev.map(l => l.name === callData.leadName && l.stage === 'Untouched' ? { ...l, stage: 'Contacted', stageColor: 'blue' } : l))
        }
        return added
      }
    } catch {}
    showToast('Failed to log call.', 'error')
    return null
  }

  // Feature 17: Campus filter
  const [activeCampus, setActiveCampus] = useState('All')

  // Feature 18: Targets
  const [targets, setTargets] = useState([])
  const saveTarget = async (targetData) => {
    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetData)
      })
      if (res.ok) {
        const saved = await res.json()
        setTargets(prev => {
          const idx = prev.findIndex(t => t.month === saved.month && t.year === saved.year && t.campus === saved.campus)
          if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
          return [saved, ...prev]
        })
        showToast('Admission target saved.', 'success')
        return saved
      }
    } catch {}
    showToast('Failed to save target.', 'error')
    return null
  }

  // Feature 20: Email campaigns
  const [emailCampaigns, setEmailCampaigns] = useState([])
  const addEmailCampaign = async (campData) => {
    try {
      const res = await fetch('/api/email-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campData)
      })
      if (res.ok) {
        const added = await res.json()
        setEmailCampaigns(prev => [added, ...prev])
        showToast(`Email campaign "${campData.name}" created.`, 'success')
        return added
      }
    } catch {}
    showToast('Failed to create email campaign.', 'error')
    return null
  }
  const sendEmailCampaign = async (id) => {
    try {
      const res = await fetch(`/api/email-campaigns/${id}/send`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setEmailCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'Sent', sentCount: data.sent } : c))
        return data  // toast handled in EmailCampaigns.jsx to show sent/failed breakdown
      }
    } catch {}
    showToast('Failed to send campaign.', 'error')
    return null
  }
  const deleteEmailCampaign = async (id) => {
    try {
      await fetch(`/api/email-campaigns/${id}`, { method: 'DELETE' })
      setEmailCampaigns(prev => prev.filter(c => c.id !== id))
      showToast('Campaign deleted.', 'info')
    } catch {}
  }

  // ---- END NEW FEATURE ACTIONS ----

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
      fetchAllData, refreshCounselors,
      applications, setApplications, addApplication, updateApplication, deleteApplication,
      counselors, setCounselors,
      campaigns, setCampaigns, addCampaign, toggleCampaignStatus,
      tasks, setTasks, addTask, toggleTaskComplete,
      payments, setPayments, addPayment, updatePaymentStatus,
      queries, setQueries, addQuery, updateQueryStatus, addQueryReply,
      documents, setDocuments, updateDocStatus, uploadDocument, deleteDocument,
      events, setEvents, addEvent,
      users, setUsers, addUser, updateUser, deleteUser,
      currentUser, setCurrentUser, handleLogin, handleLogout,
      toasts, showToast, removeToast,
      notifications, setNotifications, addNotification, markNotificationRead, markAllNotificationsRead, fetchNotifications,
      // New features
      checkDuplicate, getNextAssignee,
      sendBulkWhatsApp, sendBulkSMS, sendBulkRCS,
      rcsTemplates, fetchRcsTemplates,
      dripSequences, setDripSequences, enrollDrip,
      generatePaymentLink,
      callLogs, setCallLogs, logCall,
      activeCampus, setActiveCampus,
      targets, setTargets, saveTarget,
      emailCampaigns, setEmailCampaigns, addEmailCampaign, sendEmailCampaign, deleteEmailCampaign,
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
