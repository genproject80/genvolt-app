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
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useDashboard } from '../../context/DashboardContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatureFlags } from '../../context/FeatureFlagContext';

const SidebarNav = ({ onNavigate }) => {
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
    if (location.pathname !== '/dashboard') {
      navigate('/dashboard');
    }
    onNavigate?.();
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`;

  const subNavLinkClass = ({ isActive }) =>
    `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
    }`;

  return (
    <>
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

          {/* Billing */}
          {isPaymentsEnabled && (
            <NavLink to="/billing" className={navLinkClass} onClick={() => onNavigate?.()}>
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
                    className={subNavLinkClass}
                    onClick={() => onNavigate?.()}
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

              {isAdminMenuOpen && (
                <div className="mt-1 ml-6 space-y-1">
                  <NavLink to="/admin/users" className={subNavLinkClass} onClick={() => onNavigate?.()}>
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
                    onClick={() => onNavigate?.()}
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
                    <NavLink to="/admin/roles" className={subNavLinkClass} onClick={() => onNavigate?.()}>
                      <ShieldCheckIcon className="w-4 h-4 mr-2" />
                      Role Management
                    </NavLink>
                  )}

                  <NavLink to="/admin/devices" className={subNavLinkClass} onClick={() => onNavigate?.()}>
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
                      onClick={() => onNavigate?.()}
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
                      onClick={() => onNavigate?.()}
                    >
                      <TagIcon className="w-4 h-4 mr-2" />
                      Discounts
                    </NavLink>
                  )}

                  {isAdmin && (
                    <NavLink to="/admin/inventory" className={subNavLinkClass} onClick={() => onNavigate?.()}>
                      <ArchiveBoxIcon className="w-4 h-4 mr-2" />
                      Inventory
                    </NavLink>
                  )}

                  {isPaymentsEnabled && hasAnyPermission(['Manage Subscriptions']) && (
                    <NavLink to="/admin/subscriptions" className={subNavLinkClass} onClick={() => onNavigate?.()}>
                      <ClipboardDocumentListIcon className="w-4 h-4 mr-2" />
                      Subscriptions
                    </NavLink>
                  )}

                  {isAdmin && (
                    <NavLink to="/admin/feature-flags" className={subNavLinkClass} onClick={() => onNavigate?.()}>
                      <FlagIcon className="w-4 h-4 mr-2" />
                      Feature Flags
                    </NavLink>
                  )}

                  {canManageDeviceTestingTables && (
                    <NavLink to="/admin/table-config" className={subNavLinkClass} onClick={() => onNavigate?.()}>
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
    </>
  );
};

const Sidebar = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-900/60"
            onClick={onClose}
          />
        )}

        {/* Slide-in panel */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Close button */}
          <div className="absolute top-3 right-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Close navigation"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="h-full overflow-y-auto">
            <SidebarNav onNavigate={onClose} />
          </div>
        </div>
      </div>

      {/* Desktop sidebar — always visible */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-1 overflow-y-auto border-r border-gray-200 bg-white shadow-lg">
          <SidebarNav onNavigate={() => {}} />
        </div>
      </div>
    </>
  );
};

export default Sidebar;
