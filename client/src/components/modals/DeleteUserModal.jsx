import React, { useState } from 'react';
import Modal from '../common/Modal';
import { useUser } from '../../context/UserContext';
import { IconAlertTriangle } from '@tabler/icons-react';
import LoadingSpinner from '../common/LoadingSpinner';

const DeleteUserModal = ({ isOpen, onClose, user, onSuccess }) => {
  const { deleteUser, loading } = useUser();
  const [error, setError] = useState('');

  const handleDelete = async () => {
    try {
      setError('');
      await deleteUser(user.user_id);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to delete user:', error);
      setError(error.message || 'Failed to delete user');
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  if (!user) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Delete User"
      size="md"
    >
      <div className="space-y-4">
        {/* Warning Icon and Message */}
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <IconAlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h4 className="text-lg font-medium text-gray-900">
              Are you sure you want to delete this user?
            </h4>
            <p className="text-sm text-gray-600 mt-1">
              This action cannot be undone. The user will be permanently removed from the system.
            </p>
          </div>
        </div>

        {/* User Details */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h5 className="font-medium text-gray-900 mb-2">User Details:</h5>
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium">Name:</span> {user.first_name} {user.last_name}</p>
            <p><span className="font-medium">Email:</span> {user.email}</p>
            <p><span className="font-medium">Username:</span> @{user.user_name}</p>
            <p><span className="font-medium">Role:</span> {user.role_name}</p>
            {user.client_name && (
              <p><span className="font-medium">Client:</span> {user.client_name}</p>
            )}
            <p><span className="font-medium">Status:</span> {user.is_active ? 'Active' : 'Inactive'}</p>
            <p><span className="font-medium">Created:</span> {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Warning Notes */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <h6 className="text-sm font-medium text-yellow-800 mb-1">Important Notes:</h6>
          <ul className="text-xs text-yellow-700 space-y-1">
            <li>• All user data will be permanently deleted</li>
            <li>• The user will lose access to all systems immediately</li>
            <li>• Any data associated with this user may become orphaned</li>
            <li>• Consider deactivating the user instead of deleting if you want to preserve data</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            disabled={loading}
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Delete User
          </button>
        </div>

        {/* Confirmation Text */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Type the user's email address to confirm deletion (coming soon)
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteUserModal;