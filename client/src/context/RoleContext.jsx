import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { roleService } from '../services/roleService';
import { permissionService } from '../services/permissionService';

// Initial state
const initialState = {
  roles: [],
  permissions: [],
  permissionCategories: {},
  currentRole: null,
  roleUsers: [],
  stats: null,
  loading: false,
  error: null,
  pagination: {
    currentPage: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  }
};

// Action types
const ROLE_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_ROLES: 'SET_ROLES',
  SET_PERMISSIONS: 'SET_PERMISSIONS',
  SET_PERMISSION_CATEGORIES: 'SET_PERMISSION_CATEGORIES',
  SET_CURRENT_ROLE: 'SET_CURRENT_ROLE',
  SET_ROLE_USERS: 'SET_ROLE_USERS',
  SET_STATS: 'SET_STATS',
  ADD_ROLE: 'ADD_ROLE',
  UPDATE_ROLE: 'UPDATE_ROLE',
  DELETE_ROLE: 'DELETE_ROLE',
  SET_PAGINATION: 'SET_PAGINATION'
};

// Reducer function
const roleReducer = (state, action) => {
  switch (action.type) {
    case ROLE_ACTIONS.SET_LOADING:
      return { ...state, loading: action.payload };
    
    case ROLE_ACTIONS.SET_ERROR:
      return { ...state, error: action.payload, loading: false };
    
    case ROLE_ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };
    
    case ROLE_ACTIONS.SET_ROLES:
      return { 
        ...state, 
        roles: action.payload, 
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.SET_PERMISSIONS:
      return { 
        ...state, 
        permissions: action.payload, 
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.SET_PERMISSION_CATEGORIES:
      return { 
        ...state, 
        permissionCategories: action.payload, 
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.SET_CURRENT_ROLE:
      return { 
        ...state, 
        currentRole: action.payload, 
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.SET_ROLE_USERS:
      return { 
        ...state, 
        roleUsers: action.payload, 
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.SET_STATS:
      return { 
        ...state, 
        stats: action.payload, 
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.ADD_ROLE:
      return { 
        ...state, 
        roles: [...state.roles, action.payload],
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.UPDATE_ROLE:
      return { 
        ...state, 
        roles: state.roles.map(role => 
          role.role_id === action.payload.role_id ? action.payload : role
        ),
        currentRole: state.currentRole?.role_id === action.payload.role_id 
          ? action.payload 
          : state.currentRole,
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.DELETE_ROLE:
      return { 
        ...state, 
        roles: state.roles.filter(role => role.role_id !== action.payload),
        currentRole: state.currentRole?.role_id === action.payload 
          ? null 
          : state.currentRole,
        loading: false, 
        error: null 
      };
    
    case ROLE_ACTIONS.SET_PAGINATION:
      return { 
        ...state, 
        pagination: { ...state.pagination, ...action.payload }
      };
    
    default:
      return state;
  }
};

// Create context
const RoleContext = createContext();

// Custom hook to use role context
export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};

// Provider component
export const RoleProvider = ({ children }) => {
  const [state, dispatch] = useReducer(roleReducer, initialState);

  // Helper function to handle errors
  const handleError = useCallback((error) => {
    const errorMessage = error?.message || 'An unexpected error occurred';
    dispatch({ type: ROLE_ACTIONS.SET_ERROR, payload: errorMessage });
    console.error('Role context error:', error);
  }, []);

  // Get all roles
  const getAllRoles = useCallback(async (params = {}) => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.getAllRoles(params);
      
      if (response.success) {
        dispatch({ type: ROLE_ACTIONS.SET_ROLES, payload: response.data.roles });
        dispatch({ 
          type: ROLE_ACTIONS.SET_PAGINATION, 
          payload: response.data.pagination 
        });
      } else {
        throw new Error(response.message || 'Failed to fetch roles');
      }
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  // Get role by ID
  const getRoleById = useCallback(async (roleId) => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.getRoleById(roleId);
      
      if (response.success) {
        dispatch({ type: ROLE_ACTIONS.SET_CURRENT_ROLE, payload: response.data });
      } else {
        throw new Error(response.message || 'Failed to fetch role');
      }
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  // Create role
  const createRole = useCallback(async (roleData) => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.createRole(roleData);
      
      if (response.success) {
        dispatch({ type: ROLE_ACTIONS.ADD_ROLE, payload: response.data });
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to create role');
      }
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [handleError]);

  // Update role
  const updateRole = useCallback(async (roleId, roleData) => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.updateRole(roleId, roleData);
      
      if (response.success) {
        dispatch({ type: ROLE_ACTIONS.UPDATE_ROLE, payload: response.data });
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to update role');
      }
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [handleError]);

  // Delete role
  const deleteRole = useCallback(async (roleId) => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.deleteRole(roleId);
      
      if (response.success) {
        dispatch({ type: ROLE_ACTIONS.DELETE_ROLE, payload: roleId });
        return true;
      } else {
        throw new Error(response.message || 'Failed to delete role');
      }
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [handleError]);

  // Get all permissions
  const getAllPermissions = useCallback(async () => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await permissionService.getAllPermissions();
      
      if (response.success) {
        dispatch({ 
          type: ROLE_ACTIONS.SET_PERMISSIONS, 
          payload: response.data.permissions 
        });
      } else {
        throw new Error(response.message || 'Failed to fetch permissions');
      }
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  // Get permissions by category
  const getPermissionsByCategory = useCallback(async () => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await permissionService.getPermissionsByCategory();
      
      if (response.success) {
        dispatch({ 
          type: ROLE_ACTIONS.SET_PERMISSION_CATEGORIES, 
          payload: response.data.categories 
        });
      } else {
        throw new Error(response.message || 'Failed to fetch permission categories');
      }
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  // Get role permissions
  const getRolePermissions = useCallback(async (roleId) => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.getRolePermissions(roleId);
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch role permissions');
      }
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [handleError]);

  // Update role permissions
  const updateRolePermissions = useCallback(async (roleId, permissionIds) => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.updateRolePermissions(roleId, permissionIds);
      
      if (response.success) {
        // Update the current role if it matches
        if (state.currentRole?.role_id === roleId) {
          const updatedRole = { ...state.currentRole, permissions: response.data.permissions };
          dispatch({ type: ROLE_ACTIONS.SET_CURRENT_ROLE, payload: updatedRole });
        }
        
        // Update the role in the roles list
        const updatedRoles = state.roles.map(role => {
          if (role.role_id === roleId) {
            return { ...role, permission_count: response.data.permissions.length };
          }
          return role;
        });
        dispatch({ type: ROLE_ACTIONS.SET_ROLES, payload: updatedRoles });
        
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to update role permissions');
      }
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [handleError, state.currentRole, state.roles]);

  // Get role users
  const getRoleUsers = useCallback(async (roleId) => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.getRoleUsers(roleId);
      
      if (response.success) {
        dispatch({ type: ROLE_ACTIONS.SET_ROLE_USERS, payload: response.data.users });
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch role users');
      }
    } catch (error) {
      handleError(error);
      throw error;
    }
  }, [handleError]);

  // Get role statistics
  const getRoleStats = useCallback(async () => {
    try {
      dispatch({ type: ROLE_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
      
      const response = await roleService.getRoleStats();
      
      if (response.success) {
        dispatch({ type: ROLE_ACTIONS.SET_STATS, payload: response.data });
      } else {
        throw new Error(response.message || 'Failed to fetch role statistics');
      }
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  // Check role name availability
  const checkRoleNameAvailability = useCallback(async (roleName, excludeId = null) => {
    try {
      const response = await roleService.checkRoleNameAvailability(roleName, excludeId);
      
      if (response.success) {
        return response.data.available;
      } else {
        throw new Error(response.message || 'Failed to check role name availability');
      }
    } catch (error) {
      console.error('Error checking role name availability:', error);
      return false; // Assume not available on error
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    dispatch({ type: ROLE_ACTIONS.CLEAR_ERROR });
  }, []);

  // Clear current role
  const clearCurrentRole = useCallback(() => {
    dispatch({ type: ROLE_ACTIONS.SET_CURRENT_ROLE, payload: null });
  }, []);

  // Context value
  const value = {
    // State
    roles: state.roles,
    permissions: state.permissions,
    permissionCategories: state.permissionCategories,
    currentRole: state.currentRole,
    roleUsers: state.roleUsers,
    stats: state.stats,
    loading: state.loading,
    error: state.error,
    pagination: state.pagination,
    
    // Actions
    getAllRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole,
    getAllPermissions,
    getPermissionsByCategory,
    getRolePermissions,
    updateRolePermissions,
    getRoleUsers,
    getRoleStats,
    checkRoleNameAvailability,
    clearError,
    clearCurrentRole
  };

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
};

export default RoleContext;