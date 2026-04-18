import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ChevronDownIcon, Bars3Icon } from '@heroicons/react/24/outline';

const Header = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
    } finally {
      setIsLoggingOut(false);
    }
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white shadow-sm border-b border-gray-200 lg:left-64">
      <div className="px-4 py-4 sm:px-6">
        <div className="flex justify-between items-center">
          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden mr-3 p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            onClick={onMenuClick}
            aria-label="Open navigation"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          {/* Branding */}
          <div className="flex items-center min-w-0">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-primary-500 rounded-xl mr-3 shrink-0">
              <span className="text-white font-bold text-sm">IoT</span>
            </div>
            <h1 className="hidden sm:block text-xl font-semibold text-gray-900 truncate">
              Device Monitor
            </h1>
          </div>
          
          {/* User Profile */}
          <div className="relative">
            <button
              onClick={toggleDropdown}
              className="flex items-center space-x-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-lg p-2"
            >
              {/* User Avatar */}
              <div className="inline-flex items-center justify-center w-8 h-8 bg-primary-500 rounded-full">
                <span className="text-white font-medium text-sm">
                  {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'AD'}
                </span>
              </div>
              
              {/* User Info — hidden on mobile to prevent overflow */}
              <div className="hidden sm:block text-left">
                <div className="text-sm font-medium text-gray-900">
                  {user?.name || 'Admin Demo'}
                </div>
                <div className="text-xs text-gray-500">
                  {user?.role || 'Admin'}
                </div>
              </div>

              <ChevronDownIcon
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  isDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <div className="text-sm font-medium text-gray-900">{user?.name || 'Admin Demo'}</div>
                  <div className="text-sm text-gray-500">{user?.email || 'admin@demo.com'}</div>
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDropdownOpen(false); // Close dropdown first
                    handleLogout();
                  }}
                  disabled={isLoggingOut}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isLoggingOut ? 'Logging out...' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsDropdownOpen(false);
          }}
        />
      )}
    </header>
  );
};

export default Header;