import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

const Header = () => {
  const { user, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  return (
    <header className="fixed top-0 left-64 right-0 z-40 bg-white shadow-sm border-b border-gray-200">
      <div className="px-6 py-4">
        <div className="flex justify-between items-center">
          {/* Branding */}
          <div className="flex items-center">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-primary-500 rounded-xl mr-3">
              <span className="text-white font-bold text-sm">IoT</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Device Monitor
              </h1>
            </div>
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
              
              {/* User Info */}
              <div className="text-left">
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
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                <div className="px-4 py-2 border-b border-gray-100">
                  <div className="text-sm font-medium text-gray-900">{user?.name || 'Admin Demo'}</div>
                  <div className="text-sm text-gray-500">{user?.email || 'admin@demo.com'}</div>
                </div>
                
                <button
                  onClick={handleLogout}
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
          className="fixed inset-0 z-10"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </header>
  );
};

export default Header;