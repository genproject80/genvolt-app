import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  HomeIcon,
  ChartBarIcon,
  CogIcon,
  UsersIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { useDashboard } from '../../context/DashboardContext';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isDashboardRoute = location.pathname.startsWith('/dashboard');
  const [isDashboardMenuOpen, setIsDashboardMenuOpen] = useState(true);

  const { dashboards, activeDashboard, setActiveDashboard } = useDashboard();

  const handleDashboardClick = (dashboard) => {
    setActiveDashboard(dashboard);
    // Navigate to dashboard if not already there
    if (!location.pathname.startsWith('/dashboard')) {
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

          {/* Reports */}
          <NavLink
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
          </NavLink>

          {/* Admin */}
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive || isAdminRoute
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <CogIcon className="w-5 h-5 mr-3" />
            Admin
          </NavLink>

          {/* Users (submenu under Admin) - only show when on admin routes */}
          {isAdminRoute && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `flex items-center px-3 py-2 ml-6 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              <UsersIcon className="w-4 h-4 mr-2" />
              Users
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;