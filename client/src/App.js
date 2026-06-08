import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import PatientDashboard from './pages/patient/PatientDashboard';
import DriverDashboard from './pages/driver/DriverDashboard';
import HospitalDashboard from './pages/hospital/HospitalDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading, getDashboardRoute } = useAuth();
  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role))
    return <Navigate to={getDashboardRoute(user?.role)} replace />;
  return children;
};

const AppRoutes = () => {
  const { user, isAuthenticated, getDashboardRoute, loading } = useAuth();
  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={isAuthenticated ? <Navigate to={getDashboardRoute(user?.role)} replace /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to={getDashboardRoute(user?.role)} replace /> : <Register />} />

      {/* Patient — all sub-paths go to same dashboard, tab handled internally */}
      <Route path="/patient/*" element={
        <ProtectedRoute allowedRoles={['patient']}>
          <PatientDashboard />
        </ProtectedRoute>
      } />

      {/* Driver */}
      <Route path="/driver/*" element={
        <ProtectedRoute allowedRoles={['driver']}>
          <DriverDashboard />
        </ProtectedRoute>
      } />

      {/* Hospital admin */}
      <Route path="/hospital/*" element={
        <ProtectedRoute allowedRoles={['hospital_admin']}>
          <HospitalDashboard />
        </ProtectedRoute>
      } />

      {/* Super admin */}
      <Route path="/admin/*" element={
        <ProtectedRoute allowedRoles={['super_admin']}>
          <AdminDashboard />
        </ProtectedRoute>
      } />

      {/* Default */}
      <Route path="/" element={
        <Navigate to={isAuthenticated ? getDashboardRoute(user?.role) : '/login'} replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}