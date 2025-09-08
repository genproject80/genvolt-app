import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const Dashboard = () => {
  const { user, logout, getTokenInfo } = useAuth();
  const [tokenInfo, setTokenInfo] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    // Get token information for display
    const info = getTokenInfo();
    setTokenInfo(info);
  }, [getTokenInfo]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-primary-500 rounded-lg mr-3">
                <span className="text-white font-bold text-sm">IoT</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                IoT Dashboard
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <span className="text-gray-600">Welcome, </span>
                <span className="font-medium text-gray-900">{user?.name}</span>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingOut ? 'Logging out...' : 'Logout'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Dashboard
          </h2>
          <div className="prose">
            <p className="text-gray-600">
              Welcome to your IoT Dashboard! You have successfully logged in.
            </p>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {/* User Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">User Information:</h3>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li><strong>Name:</strong> {user?.name}</li>
                  <li><strong>Email:</strong> {user?.email}</li>
                  <li><strong>Role:</strong> {user?.role}</li>
                  <li><strong>ID:</strong> {user?.id}</li>
                </ul>
              </div>

              {/* JWT Token Information */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">JWT Token Information:</h3>
                {tokenInfo ? (
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>
                      <strong>Status:</strong> 
                      <span className={`ml-1 ${tokenInfo.isValid ? 'text-green-600' : 'text-red-600'}`}>
                        {tokenInfo.isValid ? '✓ Valid' : '✗ Invalid/Expired'}
                      </span>
                    </li>
                    <li><strong>Type:</strong> {tokenInfo.tokenType}</li>
                    <li>
                      <strong>Expires:</strong> 
                      <span className={tokenInfo.needsRefresh ? 'text-orange-600' : 'text-gray-600'}>
                        {tokenInfo.expiresAt ? new Date(tokenInfo.expiresAt).toLocaleString() : 'N/A'}
                        {tokenInfo.needsRefresh && ' (⚠ Needs Refresh)'}
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No token information available</p>
                )}
              </div>
            </div>

            {/* JWT Security Features */}
            <div className="mt-6 bg-green-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">🔒 Security Features:</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>✓ JWT tokens with RS256 encryption</li>
                <li>✓ Password hashing using bcrypt (12 rounds)</li>
                <li>✓ Automatic token refresh before expiration</li>
                <li>✓ Secure token storage with HttpOnly cookies (simulated)</li>
                <li>✓ Token validation on every request</li>
                <li>✓ Automatic logout on token expiration</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;