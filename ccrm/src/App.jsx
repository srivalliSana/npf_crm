import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useCcrm } from './context/CcrmContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import LeadManager from './pages/LeadManager'
import ApplicationManager from './pages/ApplicationManager'
import ApplicationDetails from './pages/ApplicationDetails'
import Dashboard from './pages/Dashboard'
import ProductivityReport from './pages/ProductivityReport'
import Campaigns from './pages/Campaigns'
import Tasks from './pages/Tasks'
import Payments from './pages/Payments'
import QueryManagement from './pages/QueryManagement'
import Documents from './pages/Documents'
import CalendarPro from './pages/CalendarPro'
import UserManagement from './pages/UserManagement'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Integrations from './pages/Integrations'
import Leaderboard from './pages/Leaderboard'
import EmailCampaigns from './pages/EmailCampaigns'
// Public pages (no auth required)
import PublicInquiry from './pages/PublicInquiry'
import StudentPortal from './pages/StudentPortal'

// ── Role-gated route: renders children only if user has required role ─────────
function RequireRole({ user, roles, children }) {
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/leads" replace />
  return children
}

export default function App() {
  const { currentUser, handleLogout } = useCcrm()
  const isAuthenticated = !!currentUser

  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages — no auth needed */}
        <Route path="/apply" element={<PublicInquiry />} />
        <Route path="/student-portal" element={<StudentPortal />} />
        <Route path="/student" element={<StudentPortal />} />

        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/leads" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            isAuthenticated
              ? <Layout onLogout={handleLogout} user={currentUser} />
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<Navigate to="/leads" replace />} />
          <Route path="leads"            element={<LeadManager />} />
          <Route path="leads/:id"        element={<ApplicationDetails />} />
          <Route path="applications"     element={<ApplicationManager />} />
          <Route path="applications/:id" element={<ApplicationDetails />} />
          <Route path="dashboard"        element={<Dashboard />} />
          <Route path="reports"          element={<Reports />} />
          <Route path="productivity"     element={<ProductivityReport />} />
          <Route path="campaigns"        element={<Campaigns />} />
          <Route path="tasks"            element={<Tasks />} />
          <Route path="payments"         element={<Payments />} />
          <Route path="queries"          element={<QueryManagement />} />
          <Route path="documents"        element={<Documents />} />
          <Route path="calendar"         element={<CalendarPro />} />
          <Route path="settings"         element={<Settings />} />
          <Route path="integrations"     element={<Integrations />} />
          <Route path="leaderboard"      element={<Leaderboard />} />
          <Route path="email-campaigns"  element={<EmailCampaigns />} />
          {/* Admin-only routes */}
          <Route
            path="users"
            element={
              <RequireRole user={currentUser} roles={['Admin']}>
                <UserManagement currentUser={currentUser} />
              </RequireRole>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
