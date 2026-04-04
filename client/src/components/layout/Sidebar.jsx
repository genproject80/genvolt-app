import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate, useMatch } from 'react-router-dom';
import {
  HomeIcon,
  CogIcon,
  UsersIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
  ComputerDesktopIcon,
  BeakerIcon,
  TableCellsIcon,
  CircleStackIcon,
  CreditCardIcon,
  ClipboardDocumentListIcon,
  RectangleGroupIcon,
  TagIcon,
  ServerStackIcon,
  ArchiveBoxIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import { useDashboard } from '../../context/DashboardContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatureFlags } from '../../context/FeatureFlagContext';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isDashboardRoute = location.pathname.startsWith('/dashboard');
  const isClientDeviceRoute = !!useMatch('/admin/clients/:clientId/devices');
  const [isDashboardMenuOpen, setIsDashboardMenuOpen] = useState(true);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(true);
  const [isDeviceTestingMenuOpen, setIsDeviceTestingMenuOpen] = useState(true);

  const { dashboards, activeDashboard, setActiveDashboard } = useDashboard();
  const { user } = useAuth();
  const { hasAnyPermission, canViewDeviceTesting, canManageDeviceTestingTables } = usePermissions();
  const { isPaymentsEnabled } = useFeatureFlags();

  const isAdmin = ['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(user?.role_name || user?.role);

  const handleDashboardClick = (dashboard) => {
    setActiveDashboard(dashboard);
    // Always navigate to the dashboard home when switching dashboards
    if (location.pathname !== '/dashboard') {
      navigate('/dashboard');
    }
  };

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg border-r border-gray-200">
      {/* Navigation Header */}
      <div className="flex items-center px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Navigation</h3>
      </div>

      {/* Navigation Menu */}
      <nav className="mt-6 px-3">
        <div className="space-y-1">
          {/* Dashboard - with submenu */}
          <div>
            <button
              onClick={() => setIsDashboardMenuOpen(!isDashboardMenuOpen)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isDashboardRoute
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center">
                <HomeIcon className="w-5 h-5 mr-3" />
                Dashboard
              </div>
              {isDashboardMenuOpen ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronRightIcon className="w-4 h-4" />
              )}
            </button>

            {/* Dashboard Submenu */}
            {isDashboardMenuOpen && dashboards.length > 0 && (
              <div className="mt-1 ml-6 space-y-1">
                {dashboards.map((dashboard) => (
                  <button
                    key={dashboard.id}
                    onClick={() => handleDashboardClick(dashboard)}
                    className={`w-full text-left flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeDashboard?.id === dashboard.id
                        ? 'bg-green-100 text-green-800'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="truncate">{dashboard.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reports - Hidden for now */}
          {/* <NavLink
            to="/reports"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <ChartBarIcon className="w-5 h-5 mr-3" />
            Reports
          </NavLink> */}

          {/* Billing - visible only when payments feature flag is enabled */}
          {isPaymentsEnabled && (
            <NavLink
              to="/billing"
              className={({ isActive }) =>
                `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`
              }
            >
              <CreditCardIcon className="w-5 h-5 mr-3" />
              Billing
            </NavLink>
          )}

          {/* Device Testing - with submenu */}
          {canViewDeviceTesting && (
            <div>
              <button
                onClick={() => setIsDeviceTestingMenuOpen(!isDeviceTestingMenuOpen)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  location.pathname.startsWith('/device-testing')
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center">
                  <BeakerIcon className="w-5 h-5 mr-3" />
                  Device Testing
                </div>
                {isDeviceTestingMenuOpen ? (
                  <ChevronDownIcon className="w-4 h-4" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4" />
                )}
              </button>

              {isDeviceTestingMenuOpen && (
                <div className="mt-1 ml-6 space-y-1">
                  <NavLink
                    to="/device-testing"
                    end
                    className={({ isActive }) =>
                      `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <CircleStackIcon className="w-4 h-4 mr-2" />
                    Data Tables
                  </NavLink>
                </div>
              )}
            </div>
          )}

          {/* Admin - with submenu - Hidden for CLIENT_USER role */}
          {user?.role !== 'CLIENT_USER' && (
            <div>
              <button
                onClick={() => setIsAdminMenuOpen(!isAdminMenuOpen)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isAdminRoute
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center">
                  <CogIcon className="w-5 h-5 mr-3" />
                  Admin
                </div>
                {isAdminMenuOpen ? (
                  <ChevronDownIcon className="w-4 h-4" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4" />
                )}
              </button>

              {/* Admin Submenu */}
              {isAdminMenuOpen && (
                <div className="mt-1 ml-6 space-y-1">
                  <NavLink
                    to="/admin/users"
                    className={({ isActive }) =>
                      `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <UsersIcon className="w-4 h-4 mr-2" />
                    User Management
                  </NavLink>

                  <NavLink
                    to="/admin/clients"
                    end
                    className={({ isActive }) =>
                      `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive || isClientDeviceRoute
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <BuildingOfficeIcon className="w-4 h-4 mr-2" />
                    Client Management
                  </NavLink>

                  {isClientDeviceRoute && (
                    <div className="ml-4 pl-2 border-l-2 border-primary-200">
                      <span className="flex items-center px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg">
                        <ServerStackIcon className="w-3.5 h-3.5 mr-1.5" />
                        Client Devices
                      </span>
                    </div>
                  )}

                  {hasAnyPermission(['Create Role', 'Edit Role']) && (
                    <NavLink
                      to="/admin/roles"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <ShieldCheckIcon className="w-4 h-4 mr-2" />
                      Role Management
                    </NavLink>
                  )}

                  <NavLink
                    to="/admin/devices"
                    className={({ isActive }) =>
                      `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <ComputerDesktopIcon className="w-4 h-4 mr-2" />
                    Device Management
                  </NavLink>

                  {isPaymentsEnabled && hasAnyPermission(['Manage Plans']) && (
                    <NavLink
                      to="/admin/plans"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`
                      }
                    >
                      <RectangleGroupIcon className="w-4 h-4 mr-2" />
                      Plans
                    </NavLink>
                  )}

                  {isPaymentsEnabled && hasAnyPermission(['Manage Discounts']) && (
                    <NavLink
                      to="/admin/discounts"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`
                      }
                    >
                      <TagIcon className="w-4 h-4 mr-2" />
                      Discounts
                    </NavLink>
                  )}

                  {isAdmin && (
                    <NavLink
                      to="/admin/inventory"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <ArchiveBoxIcon className="w-4 h-4 mr-2" />
                      Inventory
                    </NavLink>
                  )}

                  {isPaymentsEnabled && hasAnyPermission(['Manage Subscriptions']) && (
                    <NavLink
                      to="/admin/subscriptions"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <ClipboardDocumentListIcon className="w-4 h-4 mr-2" />
                      Subscriptions
                    </NavLink>
                  )}

                  {isAdmin && (
                    <NavLink
                      to="/admin/feature-flags"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <FlagIcon className="w-4 h-4 mr-2" />
                      Feature Flags
                    </NavLink>
                  )}

                  {canManageDeviceTestingTables && (
                    <NavLink
                      to="/admin/table-config"
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`
                      }
                    >
                      <TableCellsIcon className="w-4 h-4 mr-2" />
                      Table Configuration
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;