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
import { FeatureFlagProvider, useFeatureFlags } from './context/FeatureFlagContext';
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
import TableConfigManagement from './pages/Admin/TableConfigManagement';
import DeviceTesting from './pages/DeviceTesting/DeviceTesting';
import SubscriptionManagement from './pages/Admin/SubscriptionManagement';
import PlanManagement from './pages/Admin/PlanManagement';
import DiscountManagement from './pages/Admin/DiscountManagement';
import TopicPatternConfig from './pages/Admin/TopicPatternConfig';
import ClientDeviceDashboard from './pages/Admin/ClientDeviceDashboard';
import InventoryManagement from './pages/Admin/InventoryManagement';
import FeatureFlagManagement from './pages/Admin/FeatureFlagManagement';
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

// Admin-only Route — restricts access to SUPER_ADMIN and SYSTEM_ADMIN
const AdminOnlyRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = ['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(user?.role_name || user?.role);
  return isAdmin ? children : <Navigate to="/dashboard" replace />;
};

// Billing Route — redirects to dashboard when payments feature flag is disabled
const BillingRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const { isPaymentsEnabled, loading: flagsLoading } = useFeatureFlags();

  if (loading || flagsLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return isPaymentsEnabled ? children : <Navigate to="/dashboard" replace />;
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
        path="/admin/clients/:clientId/devices"
        element={
          <ProtectedRoute>
            <Layout>
              <ClientDeviceDashboard />
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
        path="/admin/table-config"
        element={
          <ProtectedRoute>
            <Layout>
              <TableConfigManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/device-testing"
        element={
          <ProtectedRoute>
            <Layout>
              <DeviceTesting />
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
        path="/admin/plans"
        element={
          <ProtectedRoute>
            <Layout>
              <PlanManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/discounts"
        element={
          <ProtectedRoute>
            <Layout>
              <DiscountManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/topic-config"
        element={
          <ProtectedRoute>
            <Layout>
              <TopicPatternConfig />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/inventory"
        element={
          <AdminOnlyRoute>
            <Layout>
              <InventoryManagement />
            </Layout>
          </AdminOnlyRoute>
        }
      />

      <Route
        path="/billing"
        element={
          <BillingRoute>
            <Layout>
              <BillingPage />
            </Layout>
          </BillingRoute>
        }
      />

      <Route
        path="/admin/feature-flags"
        element={
          <AdminOnlyRoute>
            <Layout>
              <FeatureFlagManagement />
            </Layout>
          </AdminOnlyRoute>
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
      <FeatureFlagProvider>
        <PermissionProvider>
          <ClientProvider>
            <RoleProvider>
              <UserProvider>
                <SubscriptionProvider>
                  <DeviceProvider>
                    <DashboardProvider>
                      <DeviceDetailProvider>
                        <P3DeviceDetailProvider>
                          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      </FeatureFlagProvider>
    </AuthProvider>
  );
};

export default App;