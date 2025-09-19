import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { 
  XMarkIcon, 
  UsersIcon, 
  MagnifyingGlassIcon,
  UserIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { useRole } from '../../context/RoleContext';

const RoleUsersModal = ({ isOpen, onClose, role = null }) => {
  const { getRoleUsers, loading } = useRole();
  
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load users when modal opens
  useEffect(() => {
    if (isOpen && role) {
      loadRoleUsers();
    }
  }, [isOpen, role]);

  const loadRoleUsers = async () => {
    if (!role) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await getRoleUsers(role.role_id);
      setUsers(response.users || []);
    } catch (error) {
      setError(error.message || 'Failed to load users');
      console.error('Failed to load role users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredUsers = () => {
    if (!searchTerm) return users;
    
    return users.filter(user => 
      user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const getStatusBadge = (isActive) => {
    if (isActive) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Active
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Inactive
        </span>
      );
    }
  };

  const filteredUsers = getFilteredUsers();

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-lg bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <UsersIcon className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div className="ml-4">
                      <Dialog.Title as="h3" className="text-lg font-medium text-gray-900">
                        Users with Role: {role?.role_name}
                      </Dialog.Title>
                      <p className="text-sm text-gray-500">
                        {users.length} user{users.length !== 1 ? 's' : ''} assigned to this role
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500 focus:outline-none"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="p-6">
                  {/* Search */}
                  <div className="mb-6">
                    <div className="relative max-w-md">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* Error Display */}
                  {error && (
                    <div className="mb-4 rounded-md bg-red-50 p-4">
                      <div className="text-sm text-red-700">{error}</div>
                    </div>
                  )}

                  {/* Loading State */}
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    </div>
                  ) : (
                    /* Users List */
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {filteredUsers.length === 0 ? (
                        <div className="text-center py-8">
                          <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
                          <h3 className="mt-2 text-sm font-medium text-gray-900">
                            {searchTerm ? 'No users found' : 'No users assigned'}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {searchTerm 
                              ? 'Try adjusting your search criteria'
                              : 'No users are currently assigned to this role.'
                            }
                          </p>
                        </div>
                      ) : (
                        filteredUsers.map((user) => (
                          <div
                            key={user.user_id}
                            className="bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors duration-150"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start space-x-3">
                                {/* Avatar */}
                                <div className="flex-shrink-0">
                                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                    <UserIcon className="h-6 w-6 text-gray-500" />
                                  </div>
                                </div>
                                
                                {/* User Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-2">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {user.first_name} {user.last_name}
                                    </p>
                                    {getStatusBadge(user.is_active)}
                                  </div>
                                  
                                  <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                                    <div className="flex items-center space-x-1">
                                      <UserIcon className="h-4 w-4" />
                                      <span>{user.user_name}</span>
                                    </div>
                                    
                                    <div className="flex items-center space-x-1">
                                      <EnvelopeIcon className="h-4 w-4" />
                                      <span className="truncate">{user.email}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                                    <div className="flex items-center space-x-1">
                                      <BuildingOfficeIcon className="h-4 w-4" />
                                      <span>{user.client_name}</span>
                                    </div>
                                    
                                    <div className="flex items-center space-x-1">
                                      <CalendarIcon className="h-4 w-4" />
                                      <span>Created {formatDate(user.created_at)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <div className="text-sm text-gray-500">
                    {searchTerm && filteredUsers.length !== users.length ? (
                      <>Showing {filteredUsers.length} of {users.length} users</>
                    ) : (
                      <>{users.length} user{users.length !== 1 ? 's' : ''} total</>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default RoleUsersModal;