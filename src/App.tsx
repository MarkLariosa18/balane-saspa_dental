import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/login'
import SignupPage from './pages/signup'
import { ForgotPasswordPage, VerifyOtpPage, ResetPasswordPage } from './pages/password_change'
import ProfilePage from './pages/profile'
import AppointmentPage from './pages/appointment'
import AdminLayout from './pages/admin/layout'
import AdminDashboardPage from './pages/admin/dashboard'
import PendingRequestsPage from './pages/admin/pending_request'
import HistoryPage from './pages/admin/history'
import AppointmentGraphPage from './pages/admin/appointment'
import PatientsPage from './pages/admin/patients'
import ServicesPage from './pages/admin/services'
import AccountPage from './pages/admin/account'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"                element={<Navigate to="/login" replace />} />
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/signup"          element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-otp"      element={<VerifyOtpPage />} />
        <Route path="/reset-password"  element={<ResetPasswordPage />} />

        {/* Patient portal */}
        <Route path="/profile"         element={<ProfilePage />} />
        <Route path="/appointment"     element={<AppointmentPage />} />

        {/* Admin — all nested under AdminLayout */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index                 element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard"      element={<AdminDashboardPage />} />
          <Route path="pending"        element={<PendingRequestsPage />} />
          <Route path="history"        element={<HistoryPage />} />
          <Route path="graph"          element={<AppointmentGraphPage />} />
          <Route path="patients"       element={<PatientsPage />} />
          <Route path="services"       element={<ServicesPage />} />
          <Route path="account"        element={<AccountPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*"                element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}