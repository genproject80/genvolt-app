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
import { SubscriptionProvider } from './context/SubscriptionContext';
import Login from './pages/Login/Login';
import Layout from './components/layout/Layout';
import DashboardHome from './pages/Dashboard/DashboardHome';
import DeviceDetailPage from './pages/Dashboard/DeviceDetailPage';
import P3DeviceDetailPage from './pages/Dashboard/P3DeviceDetailPage';
import Reports from './pages/Reports/Reports';
import AdminPanel from './pages/Admin/AdminPanel';
import UserManagement from './pages/Admin/UserManagement';
import ClientManagement from './pages/Admin/ClientManagement';
import RoleManagement from './pages/Admin/RoleManagement';
import DeviceManagement from './pages/Admin/DeviceManagement';
import SubscriptionManagement from './pages/Admin/SubscriptionManagement';
import BillingPage from './pages/Billing/BillingPage';
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
        path="/admin"
        element={
          <ProtectedRoute>
            <Layout>
              <AdminPanel />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <Layout>
              <UserManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/clients"
        element={
          <ProtectedRoute>
            <Layout>
              <ClientManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/roles"
        element={
          <ProtectedRoute>
            <Layout>
              <RoleManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/devices"
        element={
          <ProtectedRoute>
            <Layout>
              <DeviceManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/subscriptions"
        element={
          <ProtectedRoute>
            <Layout>
              <SubscriptionManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <Layout>
              <BillingPage />
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
              <SubscriptionProvider>
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
              </SubscriptionProvider>
            </UserProvider>
          </RoleProvider>
        </ClientProvider>
      </PermissionProvider>
    </AuthProvider>
  );
};

export default App;