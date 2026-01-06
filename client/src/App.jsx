import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClientProvider } from './context/ClientContext';
import { RoleProvider } from './context/RoleContext';
import { PermissionProvider } from './context/PermissionContext';
import { UserProvider } from './context/UserContext';
import { DashboardProvider } from './context/DashboardContext';
import { DeviceDetailProvider } from './context/DeviceDetailContext';
import { P3DeviceDetailProvider } from './context/P3DeviceDetailContext';
import { DeviceProvider } from './context/DeviceContext';
import Login from './pages/Login/Login';
import Layout from './components/layout/Layout';
import DashboardHome from './pages/Dashboard/DashboardHome';
import DeviceDetailPage from './pages/Dashboard/DeviceDetailPage';
import P3DeviceDetailPage from './pages/Dashboard/P3DeviceDetailPage';
import Reports from './pages/Reports/Reports';
import AdminPanel from './pages/Admin/AdminPanel';
import LoadingSpinner from './components/common/LoadingSpinner';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Public Route Component (redirects to dashboard if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } 
      />
      
      {/* Protected Routes - All wrapped in Layout */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardHome />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/device/:entryId"
        element={
          <ProtectedRoute>
            <Layout>
              <DeviceDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/p3-device/:entryId"
        element={
          <ProtectedRoute>
            <Layout>
              <P3DeviceDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports" 
        element={
          <ProtectedRoute>
            <Layout>
              <Reports />
            </Layout>
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/admin/*" 
        element={
          <ProtectedRoute>
            <Layout>
              <AdminPanel />
            </Layout>
          </ProtectedRoute>
        } 
      />
      
      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* 404 fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <PermissionProvider>
        <ClientProvider>
          <RoleProvider>
            <UserProvider>
              <DeviceProvider>
                <DashboardProvider>
                  <DeviceDetailProvider>
                    <P3DeviceDetailProvider>
                      <Router>
                        <div className="App">
                          <AppRoutes />
                        </div>
                      </Router>
                    </P3DeviceDetailProvider>
                  </DeviceDetailProvider>
                </DashboardProvider>
              </DeviceProvider>
            </UserProvider>
          </RoleProvider>
        </ClientProvider>
      </PermissionProvider>
    </AuthProvider>
  );
};

export default App;