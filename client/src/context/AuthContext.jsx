import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/authService';
import { JWTUtils } from '../utils/jwtBrowser';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check for existing token on app load
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { accessToken, isAuthenticated: storedAuth } = JWTUtils.getStoredTokens();

        if (storedAuth && accessToken) {
          // Check if token is still valid
          if (!JWTUtils.isTokenExpired(accessToken)) {
            // Validate token and get user data
            const userData = await authService.validateToken(accessToken);
            setUser(userData);
            setIsAuthenticated(true);
          } else {
            // Try to refresh the token
            try {
              const newTokens = await authService.refreshAccessToken();
              if (newTokens?.accessToken) {
                const userData = await authService.validateToken(newTokens.accessToken);
                setUser(userData);
                setIsAuthenticated(true);
              } else {
                throw new Error('Token refresh failed');
              }
            } catch (refreshError) {
              console.warn('🔐 AuthContext: Token refresh failed:', refreshError);
              JWTUtils.clearTokens();
            }
          }
        } else {
        }
      } catch (error) {
        console.error('🔐 AuthContext: Auth initialization error:', error);
        JWTUtils.clearTokens();
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email, password, rememberMe = false) => {
    try {
      setLoading(true);
      const response = await authService.login(email, password, rememberMe);
      
      const { user: userData } = response;
      
      // Update state (tokens are already stored by authService)
      setUser(userData);
      setIsAuthenticated(true);
      
      return response;
    } catch (error) {
      console.error('Login error:', error);
      // Clear tokens on login failure
      JWTUtils.clearTokens();
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    console.log('🚪 AuthContext: Logout function called');
    try {
      // Call API to invalidate token on server
      console.log('🚪 AuthContext: Calling authService.logout()...');
      await authService.logout();
      console.log('🚪 AuthContext: authService.logout() completed');

      // Clear state
      console.log('🚪 AuthContext: Clearing authentication state...');
      setUser(null);
      setIsAuthenticated(false);

      // Redirect to login page
      console.log('🚪 AuthContext: Redirecting to /login...');
      window.location.href = '/login';

      return { success: true };
    } catch (error) {
      console.error('🚪 AuthContext: Logout error:', error);
      // Even if server logout fails, clear local state
      console.log('🚪 AuthContext: Error occurred, clearing state anyway...');
      setUser(null);
      setIsAuthenticated(false);

      // Redirect to login page
      console.log('🚪 AuthContext: Redirecting to /login after error...');
      window.location.href = '/login';

      return { success: true };
    }
  };

  const register = async (userData) => {
    try {
      setLoading(true);
      const response = await authService.register(userData);
      
      const { user: newUser } = response;
      
      // Update state (tokens are already stored by authService)
      setUser(newUser);
      setIsAuthenticated(true);
      
      return response;
    } catch (error) {
      console.error('Registration error:', error);
      // Clear tokens on registration failure
      JWTUtils.clearTokens();
      setUser(null);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (updatedUserData) => {
    setUser(prevUser => ({
      ...prevUser,
      ...updatedUserData
    }));
  };

  // Additional utility methods
  const refreshToken = async () => {
    try {
      const newTokens = await authService.refreshAccessToken();
      return newTokens;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // If refresh fails, logout user
      await logout();
      throw error;
    }
  };

  const getCurrentUser = () => {
    return authService.getCurrentUser();
  };

  const getTokenInfo = () => {
    return authService.getTokenInfo();
  };

  const checkAuthStatus = () => {
    return authService.isAuthenticated();
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    logout,
    register,
    updateUser,
    refreshToken,
    getCurrentUser,
    getTokenInfo,
    checkAuthStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;