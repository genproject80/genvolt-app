import React, { useState } from 'react';
import Modal from '../common/Modal';
import { userService } from '../../services/userService';
import LoadingSpinner from '../common/LoadingSpinner';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';

const ResetPasswordModal = ({ isOpen, onClose, user, onSuccess }) => {
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (formData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm the password';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      await userService.resetUserPassword(user.user_id, formData.newPassword);

      // Clear form
      setFormData({
        newPassword: '',
        confirmPassword: ''
      });
      setErrors({});

      // Call success callback and close modal
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to reset password:', error);

      // Extract error message from server response
      let errorMessage = 'Failed to reset password';

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      newPassword: '',
      confirmPassword: ''
    });
    setErrors({});
    onClose();
  };

  if (!user) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Reset Password - ${user.first_name} ${user.last_name}`}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
            <ExclamationCircleIcon className="w-5 h-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{errors.submit}</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-700">
            You are resetting the password for: <span className="font-medium">{user.email}</span>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Password *
          </label>
          <input
            type="password"
            name="newPassword"
            value={formData.newPassword}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.newPassword ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
            placeholder="Enter new password"
          />
          {errors.newPassword && (
            <p className="text-sm text-red-600 mt-1">{errors.newPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password *
          </label>
          <input
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
            placeholder="Confirm new password"
          />
          {errors.confirmPassword && (
            <p className="text-sm text-red-600 mt-1">{errors.confirmPassword}</p>
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            disabled={loading}
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Update Password
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ResetPasswordModal;
