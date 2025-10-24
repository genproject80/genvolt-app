import React, { useState } from 'react';
import {
  UsersIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';
import UserManagement from './UserManagement';
import RoleManagement from './RoleManagement';
import ClientManagement from './ClientManagement';
import DeviceManagement from './DeviceManagement';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('users');

  const tabs = [
    {
      id: 'users',
      name: 'User Management',
      icon: UsersIcon,
      component: UserManagement
    },
    {
      id: 'clients',
      name: 'Client Management',
      icon: BuildingOfficeIcon,
      component: ClientManagement
    },
    {
      id: 'roles',
      name: 'Role Management',
      icon: ShieldCheckIcon,
      component: RoleManagement
    },
    {
      id: 'devices',
      name: 'Device Management',
      icon: ComputerDesktopIcon,
      component: DeviceManagement
    }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || UserManagement;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Panel</h1>
        <p className="text-gray-600">
          System administration and configuration
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Admin Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => !tab.disabled && setActiveTab(tab.id)}
                  disabled={tab.disabled}
                  className={`flex items-center py-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : tab.disabled
                      ? 'border-transparent text-gray-300 cursor-not-allowed'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-2" />
                  {tab.name}
                  {tab.disabled && (
                    <span className="ml-2 text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded">
                      Coming Soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;