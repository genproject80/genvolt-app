import React, { createContext, useContext, useState, useCallback } from 'react';
import { userService } from '../services/userService.js';

const UserContext = createContext({});

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [users, setUsers] = useState([]);
  const [userStats, setUserStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getAllUsers = useCallback(async (options = {}) => {
    try {
      console.log('👥 UserContext: Fetching users with options:', options);
      setLoading(true);
      setError(null);

      const response = await userService.getAllUsers(options);

      if (response.success) {
        console.log('👥 UserContext: Users fetched successfully:', response.data.data?.length, 'users');
        setUsers(response.data.data || []);
        setPagination(response.data.pagination || {});
        return response;
      } else {
        throw new Error(response.message || 'Failed to fetch users');
      }
    } catch (err) {
      setError(err.message);
      console.error('👥 UserContext: Failed to fetch users:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getUserById = useCallback(async (userId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await userService.getUserById(userId);

      if (response.success) {
        return response.data.user;
      } else {
        throw new Error(response.message || 'Failed to fetch user');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch user:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(async (userData) => {
    try {
      setLoading(true);
      setError(null);

      const response = await userService.createUser(userData);

      if (response.success) {
        // Add the new user to the existing list instead of refetching
        setUsers(prevUsers => [response.data.user, ...prevUsers]);
        return response.data.user;
      } else {
        throw new Error(response.message || 'Failed to create user');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to create user';
      setError(errorMessage);
      console.error('Failed to create user:', err);

      // Create a new error with the server message to ensure it's properly propagated
      const errorToThrow = new Error(errorMessage);
      errorToThrow.response = err.response;
      throw errorToThrow;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback(async (userId, userData) => {
    try {
      setLoading(true);
      setError(null);

      const response = await userService.updateUser(userId, userData);

      if (response.success) {
        // Update users list with updated user
        setUsers(prevUsers =>
          prevUsers.map(user =>
            user.user_id === userId ? { ...user, ...response.data.user } : user
          )
        );
        return response.data.user;
      } else {
        throw new Error(response.message || 'Failed to update user');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update user';
      setError(errorMessage);
      console.error('Failed to update user:', err);

      // Create a new error with the server message to ensure it's properly propagated
      const errorToThrow = new Error(errorMessage);
      errorToThrow.response = err.response;
      throw errorToThrow;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteUser = useCallback(async (userId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await userService.deleteUser(userId);

      if (response.success) {
        // Remove user from list or mark as inactive
        setUsers(prevUsers =>
          prevUsers.filter(user => user.user_id !== userId)
        );
        return response;
      } else {
        throw new Error(response.message || 'Failed to delete user');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to delete user:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUserStatus = useCallback(async (userId, isActive) => {
    try {
      setLoading(true);
      setError(null);

      const response = await userService.updateUserStatus(userId, isActive);

      if (response.success) {
        // Update user status in list
        setUsers(prevUsers =>
          prevUsers.map(user =>
            user.user_id === userId ? { ...user, is_active: isActive } : user
          )
        );
        return response.data.user;
      } else {
        throw new Error(response.message || 'Failed to update user status');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to update user status:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const resetUserPassword = useCallback(async (userId, newPassword) => {
    try {
      setLoading(true);
      setError(null);

      const response = await userService.resetUserPassword(userId, newPassword);

      if (response.success) {
        return response;
      } else {
        throw new Error(response.message || 'Failed to reset password');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to reset password:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getUserStats = useCallback(async () => {
    try {
      console.log('📊 UserContext: Fetching user statistics...');
      setError(null);

      const response = await userService.getUserStats();

      if (response.success) {
        console.log('📊 UserContext: User statistics fetched successfully');
        setUserStats(response.data);
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch user statistics');
      }
    } catch (err) {
      setError(err.message);
      console.error('📊 UserContext: Failed to fetch user statistics:', err);
      throw err;
    }
  }, []);

  const value = {
    // State
    users,
    userStats,
    loading,
    error,
    pagination,

    // Actions
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    updateUserStatus,
    resetUserPassword,
    getUserStats,
    clearError
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export default UserContext;