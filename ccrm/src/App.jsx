import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
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
import DripWorkflows from './pages/DripWorkflows'
import CommunicationsReport from './pages/CommunicationsReport'
import Help from './pages/Help'
import TransferApprovals from './pages/TransferApprovals'
import PublicInquiry from './pages/PublicInquiry'
import StudentPortal from './pages/StudentPortal'
import Analytics from './pages/Analytics'
import IntegrationHealth from './pages/IntegrationHealth'
import ServerHealth from './pages/ServerHealth'
import SecurityAccess from './pages/SecurityAccess'
import UserProfile from './pages/UserProfile'

// ── Auth layout guard — checks auth, wraps with Layout ───────────────────────
function AuthGuard() {
  const { currentUser, handleLogout } = useCcrm()
  if (!currentUser) return <Navigate to="/login" replace />
  return <Layout onLogout={handleLogout} user={currentUser} />
}

// ── Role guard — used inside AuthGuard for admin-only routes ─────────────────
function RoleGuard({ roles }) {
  const { currentUser } = useCcrm()
  if (!currentUser) return <Navigate to="/login" replace />
  if (roles && !roles.includes(currentUser.role)) return <Navigate to="/leads" replace />
  return <Outlet />
}

export default function App() {
  const { currentUser } = useCcrm()

  return (
    <BrowserRouter>
      <Routes>
        {/* All routes nested under the root path */}
        <Route path="/">

          {/* ── index route: ONLY matches exact "/" → Public landing page ──
              Using <Route index> is the React Router v6 way to match the root
              exclusively without interfering with any other nested routes.    */}
          <Route index element={<PublicInquiry />} />

          {/* ── Other public pages (no auth) ── */}
          <Route path="apply"          element={<PublicInquiry />} />
          <Route path="student-portal" element={<StudentPortal />} />
          <Route path="student"        element={<StudentPortal />} />

          {/* ── Login — redirect inside if already authenticated ── */}
          <Route
            path="login"
            element={currentUser ? <Navigate to="/leads" replace /> : <Login />}
          />

          {/* ── Protected app routes — AuthGuard checks auth, renders Layout ── */}
          <Route element={<AuthGuard />}>
            <Route path="leads"            element={<LeadManager />} />
            <Route path="leads/:id"        element={<ApplicationDetails />} />
            <Route path="applications"     element={<ApplicationManager />} />
            <Route path="applications/:id" element={<ApplicationDetails />} />
            <Route path="dashboard"        element={<Dashboard />} />
            <Route path="reports"          element={<Reports />} />
            <Route path="productivity"     element={<ProductivityReport />} />
            <Route element={<RoleGuard roles={['Admin','Manager']} />}>
              <Route path="analytics"      element={<Analytics />} />
            </Route>
            <Route element={<RoleGuard roles={['Admin']} />}>
              <Route path="integration-health" element={<IntegrationHealth />} />
              <Route path="server-health"      element={<ServerHealth />} />
              <Route path="security"           element={<SecurityAccess />} />
            </Route>
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
            <Route path="drip-workflows"     element={<DripWorkflows />} />
            <Route path="comms-report"       element={<CommunicationsReport />} />
            <Route path="help"               element={<Help />} />
            <Route path="profile"            element={<UserProfile />} />
            <Route element={<RoleGuard roles={['Admin','Manager']} />}>
              <Route path="transfer-approvals" element={<TransferApprovals />} />
            </Route>

            {/* Admin-only */}
            <Route element={<RoleGuard roles={['Admin']} />}>
              <Route path="users" element={<UserManagement currentUser={currentUser} />} />
            </Route>
          </Route>

          {/* ── Catch-all → back to landing page ── */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Route>
      </Routes>
    </BrowserRouter>
  )
}
