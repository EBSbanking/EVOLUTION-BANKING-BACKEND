// admin-ui/src/authProvider.js
import { API_ROOT } from './config';

const LOGIN_URL = `${API_ROOT}/login/login`;

export const authProvider = {
  login: async ({ username, password }) => {
    // Validate input
    if (!username || !password) {
      console.error('❌ Missing username or password');
      return Promise.reject(new Error('Username and password are required'));
    }

    // ✅ Send both field names for compatibility
    const payload = { 
      username: username,
      user_name: username,
      password: password 
    };
    
    console.log('🚀 LOGIN request to:', LOGIN_URL);
    console.log('📤 Payload:', { 
      username: payload.username, 
      user_name: payload.user_name,
      password: '***' 
    });

    try {
      const response = await window.fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('📥 Response status:', response.status);

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError);
        throw new Error('Invalid server response');
      }

      console.log('📥 Response data:', data);

      // Check for error in response
      if (!response.ok) {
        const errorMsg = data.message || data.error || 'Login failed';
        console.error('❌ Server error:', errorMsg);
        throw new Error(errorMsg);
      }

      // Extract token
      let token = data.token || data.data?.token || data.accessToken || data.data?.accessToken;

      if (!token) {
        console.error('❌ No token in response:', data);
        throw new Error('No token received from server');
      }

      console.log('✅ Token received:', token.substring(0, 20) + '...');

      // Store token
      localStorage.setItem('token', token);
      
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      console.log('✅ Login successful');
      return Promise.resolve();

    } catch (error) {
      console.error('❌ Login error:', error.message);
      return Promise.reject(new Error(error.message || 'Login failed. Please try again.'));
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    console.log('🔓 Logged out');
    return Promise.resolve();
  },

  checkError: (error) => {
    if (error.status === 401 || error.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      console.warn('⚠️ Unauthorized – session cleared');
      return Promise.reject();
    }
    return Promise.resolve();
  },

  checkAuth: () => {
    const token = localStorage.getItem('token');
    if (token) {
      console.log('✅ Authenticated');
      return Promise.resolve();
    } else {
      console.warn('❌ Not authenticated');
      return Promise.reject();
    }
  },

  getPermissions: () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return Promise.resolve(user.permissions || []);
    } catch {
      return Promise.resolve([]);
    }
  },
};