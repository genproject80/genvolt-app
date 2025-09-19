import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { 
  XMarkIcon, 
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import { useRole } from '../../context/RoleContext';

const DeleteRoleModal = ({ isOpen, onClose, role = null, onSuccess }) => {
  const { deleteRole, getRoleUsers, loading } = useRole();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [error, setError] = useState(null);

  const isSystemRole = role && ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER'].includes(role.role_name);
  const canDelete = !isSystemRole && userCount === 0;
  const expectedConfirmationText = `DELETE ${role?.role_name || ''}`;

  // Load user count when modal opens
  useEffect(() => {
    if (isOpen && role) {
      loadUserCount();
    }
  }, [isOpen, role]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmationText('');
      setError(null);
      setUserCount(0);
    }
  }, [isOpen]);

  const loadUserCount = async () => {
    if (!role) return;

    setIsLoadingUsers(true);
    setError(null);
    try {
      const response = await getRoleUsers(role.role_id);
      setUserCount(response.users ? response.users.length : 0);
    } catch (error) {
      setError('Failed to check user assignments');
      console.error('Failed to load role users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!role || !canDelete || confirmationText !== expectedConfirmationText) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    
    try {
      await deleteRole(role.role_id);
      
      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
    } catch (error) {
      setError(error.message || 'Failed to delete role');
      console.error('Failed to delete role:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const getWarningMessage = () => {
    if (isSystemRole) {
      return {
        type: 'system',
        title: 'Cannot Delete System Role',
        message: 'This is a system role that is required for the application to function properly and cannot be deleted.'
      };
    }
    
    if (userCount > 0) {
      return {
        type: 'users',
        title: 'Role Has Assigned Users',
        message: `This role is currently assigned to ${userCount} user${userCount !== 1 ? 's' : ''}. You must reassign or remove these users before deleting the role.`
      };
    }

    return {
      type: 'confirmation',
      title: 'Confirm Role Deletion',
      message: 'This action cannot be undone. The role and all its permission assignments will be permanently removed.'
    };
  };

  const warningInfo = getWarningMessage();

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                      warningInfo.type === 'confirmation' ? 'bg-red-100' : 'bg-yellow-100'
                    }`}>
                      <ExclamationTriangleIcon className={`h-6 w-6 ${
                        warningInfo.type === 'confirmation' ? 'text-red-600' : 'text-yellow-600'
                      }`} />
                    </div>
                    <div className="ml-4">
                      <Dialog.Title as="h3" className="text-lg font-medium text-gray-900">
                        {warningInfo.title}
                      </Dialog.Title>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="text-gray-400 hover:text-gray-500 focus:outline-none"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Role Information */}
                {role && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <ShieldCheckIcon className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{role.role_name}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span className="flex items-center space-x-1">
                            <UsersIcon className="h-3 w-3" />
                            <span>
                              {isLoadingUsers ? 'Loading...' : `${userCount} user${userCount !== 1 ? 's' : ''}`}
                            </span>
                          </span>
                          <span>{role.permission_count} permissions</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning Message */}
                <div className={`mb-4 p-4 rounded-md ${
                  warningInfo.type === 'confirmation' ? 'bg-red-50' : 'bg-yellow-50'
                }`}>
                  <p className={`text-sm ${
                    warningInfo.type === 'confirmation' ? 'text-red-700' : 'text-yellow-700'
                  }`}>
                    {warningInfo.message}
                  </p>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="mb-4 p-4 rounded-md bg-red-50">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* Confirmation Input (only for deletable roles) */}
                {canDelete && (
                  <div className="mb-6">
                    <label htmlFor="confirmation" className="block text-sm font-medium text-gray-700 mb-2">
                      Type <code className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono">{expectedConfirmationText}</code> to confirm:
                    </label>
                    <input
                      id="confirmation"
                      type="text"
                      value={confirmationText}
                      onChange={(e) => setConfirmationText(e.target.value)}
                      disabled={isSubmitting}
                      placeholder={expectedConfirmationText}
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  
                  {canDelete && (
                    <button
                      onClick={handleConfirmDelete}
                      disabled={
                        isSubmitting || 
                        isLoadingUsers || 
                        confirmationText !== expectedConfirmationText
                      }
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Deleting...
                        </div>
                      ) : (
                        'Delete Role'
                      )}
                    </button>
                  )}
                </div>

                {/* Additional Info for Non-Deletable Roles */}
                {!canDelete && (
                  <div className="mt-4 text-center">
                    <p className="text-xs text-gray-500">
                      {isSystemRole 
                        ? 'System roles are protected and cannot be deleted.'
                        : 'Remove all user assignments to enable role deletion.'
                      }
                    </p>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default DeleteRoleModal;