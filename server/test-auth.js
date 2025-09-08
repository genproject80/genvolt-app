import fetch from 'node-fetch';

/**
 * Test script for backend authentication API
 * This script tests all authentication endpoints to ensure they work correctly
 */

const BASE_URL = 'http://localhost:5000';
const API_BASE = `${BASE_URL}/api`;

// Test data
const testUser = {
  client_id: 1,
  first_name: 'Test',
  last_name: 'User',
  email: 'test@example.com',
  ph_no: '+1234567890',
  password: 'TestPass123!',
  user_name: 'testuser',
  role_id: 2
};

const testLogin = {
  email: 'test@example.com',
  password: 'TestPass123!',
  remember_me: false
};

let authToken = '';
let refreshTokenValue = '';

/**
 * Helper function to make API requests
 */
async function apiRequest(endpoint, method = 'GET', data = null, token = null) {
  const url = `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = await response.json();

    // Extract cookies if present
    const cookies = response.headers.get('set-cookie');
    if (cookies && cookies.includes('refreshToken=')) {
      const match = cookies.match(/refreshToken=([^;]+)/);
      if (match) {
        refreshTokenValue = match[1];
      }
    }

    return {
      status: response.status,
      data: responseData,
      headers: response.headers
    };
  } catch (error) {
    console.error(`❌ API Request failed for ${endpoint}:`, error.message);
    return null;
  }
}

/**
 * Test server health
 */
async function testHealth() {
  console.log('\n🔍 Testing server health...');
  
  const response = await apiRequest('/health');
  
  if (response && response.status === 200) {
    console.log('✅ Server is healthy');
    console.log(`   Status: ${response.data.status}`);
    console.log(`   Environment: ${response.data.environment}`);
    return true;
  } else {
    console.log('❌ Server health check failed');
    return false;
  }
}

/**
 * Test user registration
 */
async function testRegister() {
  console.log('\n🔍 Testing user registration...');
  
  const response = await apiRequest('/auth/register', 'POST', testUser);
  
  if (response && response.status === 201) {
    console.log('✅ User registration successful');
    console.log(`   User ID: ${response.data.data.user.user_id}`);
    console.log(`   Email: ${response.data.data.user.email}`);
    console.log(`   Access Token: ${response.data.data.accessToken ? 'Present' : 'Missing'}`);
    
    // Store access token for future requests
    authToken = response.data.data.accessToken;
    
    return true;
  } else {
    console.log('❌ User registration failed');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test duplicate user registration (should fail)
 */
async function testDuplicateRegister() {
  console.log('\n🔍 Testing duplicate user registration (should fail)...');
  
  const response = await apiRequest('/auth/register', 'POST', testUser);
  
  if (response && response.status === 409) {
    console.log('✅ Duplicate registration correctly rejected');
    console.log(`   Message: ${response.data.message}`);
    return true;
  } else {
    console.log('❌ Duplicate registration should have been rejected');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test user login
 */
async function testLogin() {
  console.log('\n🔍 Testing user login...');
  
  const response = await apiRequest('/auth/login', 'POST', testLogin);
  
  if (response && response.status === 200) {
    console.log('✅ User login successful');
    console.log(`   User ID: ${response.data.data.user.user_id}`);
    console.log(`   Email: ${response.data.data.user.email}`);
    console.log(`   Access Token: ${response.data.data.accessToken ? 'Present' : 'Missing'}`);
    console.log(`   Refresh Token Cookie: ${refreshTokenValue ? 'Present' : 'Missing'}`);
    
    // Update access token
    authToken = response.data.data.accessToken;
    
    return true;
  } else {
    console.log('❌ User login failed');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test invalid login
 */
async function testInvalidLogin() {
  console.log('\n🔍 Testing invalid login (should fail)...');
  
  const invalidLogin = {
    email: 'test@example.com',
    password: 'WrongPassword123!',
    remember_me: false
  };
  
  const response = await apiRequest('/auth/login', 'POST', invalidLogin);
  
  if (response && response.status === 401) {
    console.log('✅ Invalid login correctly rejected');
    console.log(`   Message: ${response.data.message}`);
    return true;
  } else {
    console.log('❌ Invalid login should have been rejected');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test getting current user profile
 */
async function testGetMe() {
  console.log('\n🔍 Testing get current user profile...');
  
  const response = await apiRequest('/auth/me', 'GET', null, authToken);
  
  if (response && response.status === 200) {
    console.log('✅ Get current user profile successful');
    console.log(`   User ID: ${response.data.data.user.user_id}`);
    console.log(`   Email: ${response.data.data.user.email}`);
    console.log(`   Permissions: ${response.data.data.user.permissions ? response.data.data.user.permissions.length : 0} permissions`);
    return true;
  } else {
    console.log('❌ Get current user profile failed');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test token validation
 */
async function testValidateToken() {
  console.log('\n🔍 Testing token validation...');
  
  const response = await apiRequest('/auth/validate', 'GET', null, authToken);
  
  if (response && response.status === 200) {
    console.log('✅ Token validation successful');
    console.log(`   Token Type: ${response.data.data.token.type}`);
    console.log(`   Expires At: ${response.data.data.token.expiresAt}`);
    return true;
  } else {
    console.log('❌ Token validation failed');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test token refresh
 */
async function testRefreshToken() {
  console.log('\n🔍 Testing token refresh...');
  
  // Test with refresh token in body
  const refreshData = { refreshToken: refreshTokenValue };
  const response = await apiRequest('/auth/refresh', 'POST', refreshData);
  
  if (response && response.status === 200) {
    console.log('✅ Token refresh successful');
    console.log(`   New Access Token: ${response.data.data.accessToken ? 'Present' : 'Missing'}`);
    
    // Update access token
    authToken = response.data.data.accessToken;
    
    return true;
  } else {
    console.log('❌ Token refresh failed');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test updating user profile
 */
async function testUpdateProfile() {
  console.log('\n🔍 Testing profile update...');
  
  const updateData = {
    first_name: 'Updated',
    last_name: 'User',
    ph_no: '+0987654321'
  };
  
  const response = await apiRequest('/auth/me', 'PUT', updateData, authToken);
  
  if (response && response.status === 200) {
    console.log('✅ Profile update successful');
    console.log(`   Updated Name: ${response.data.data.user.first_name} ${response.data.data.user.last_name}`);
    console.log(`   Updated Phone: ${response.data.data.user.ph_no}`);
    return true;
  } else {
    console.log('❌ Profile update failed');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test password change
 */
async function testChangePassword() {
  console.log('\n🔍 Testing password change...');
  
  const passwordData = {
    currentPassword: 'TestPass123!',
    newPassword: 'NewTestPass123!'
  };
  
  const response = await apiRequest('/auth/change-password', 'PUT', passwordData, authToken);
  
  if (response && response.status === 200) {
    console.log('✅ Password change successful');
    
    // Update test login password for future tests
    testLogin.password = 'NewTestPass123!';
    
    return true;
  } else {
    console.log('❌ Password change failed');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test accessing protected route without token
 */
async function testUnauthorizedAccess() {
  console.log('\n🔍 Testing unauthorized access (should fail)...');
  
  const response = await apiRequest('/auth/me', 'GET');
  
  if (response && response.status === 401) {
    console.log('✅ Unauthorized access correctly blocked');
    console.log(`   Message: ${response.data.message}`);
    return true;
  } else {
    console.log('❌ Unauthorized access should have been blocked');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test user logout
 */
async function testLogout() {
  console.log('\n🔍 Testing user logout...');
  
  const response = await apiRequest('/auth/logout', 'POST', {}, authToken);
  
  if (response && response.status === 200) {
    console.log('✅ User logout successful');
    console.log(`   Message: ${response.data.message}`);
    
    // Clear auth token
    authToken = '';
    refreshTokenValue = '';
    
    return true;
  } else {
    console.log('❌ User logout failed');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Test using token after logout (should fail)
 */
async function testLoggedOutTokenAccess() {
  console.log('\n🔍 Testing token access after logout (should fail)...');
  
  const response = await apiRequest('/auth/me', 'GET', null, authToken);
  
  if (response && response.status === 401) {
    console.log('✅ Logged out token correctly rejected');
    console.log(`   Message: ${response.data.message}`);
    return true;
  } else {
    console.log('❌ Logged out token should have been rejected');
    if (response) {
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.data.message || response.data.error}`);
    }
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🚀 Starting Backend Authentication Tests\n');
  console.log(`Server URL: ${BASE_URL}`);
  console.log(`API Base: ${API_BASE}`);
  
  const tests = [
    { name: 'Server Health', fn: testHealth },
    { name: 'User Registration', fn: testRegister },
    { name: 'Duplicate Registration', fn: testDuplicateRegister },
    { name: 'User Login', fn: testLogin },
    { name: 'Invalid Login', fn: testInvalidLogin },
    { name: 'Get Current User', fn: testGetMe },
    { name: 'Token Validation', fn: testValidateToken },
    { name: 'Token Refresh', fn: testRefreshToken },
    { name: 'Profile Update', fn: testUpdateProfile },
    { name: 'Password Change', fn: testChangePassword },
    { name: 'Unauthorized Access', fn: testUnauthorizedAccess },
    { name: 'User Logout', fn: testLogout },
    { name: 'Logged Out Token Access', fn: testLoggedOutTokenAccess }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} threw an error:`, error.message);
      failed++;
    }
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📋 Total: ${tests.length}`);
  console.log(`📈 Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('🎉 All tests passed! Authentication system is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please check the backend server and database connection.');
  }

  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});