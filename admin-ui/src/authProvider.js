// admin-ui/src/authProvider.js
import { API_ROOT } from './config';   // 👈 import the root API URL from config

const LOGIN_URL = `${API_ROOT}/login/login`;  // 👈 note: /login/login (not /admin)

export const authProvider = {
  login: async ({ username, password }) => {
    const payload = { username, password };
    console.log('🚀🚀🚀 LOGIN request to:', LOGIN_URL, 'payload:', payload);

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
        throw new Error('Invalid server response');
      }

      console.log('📥 Full response data:', data);

      // ---- TOKEN EXTRACTION ----
      let token = null;
      if (data.token) {
        token = data.token;
      } else if (data.data && data.data.token) {
        token = data.data.token;
      } else if (data.accessToken) {
        token = data.accessToken;
      } else if (data.data && data.data.accessToken) {
        token = data.data.accessToken;
      }

      console.log('🔑 Extracted token:', token ? token.substring(0, 20) + '...' : 'null');

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Login failed');
      }

      if (!token) {
        throw new Error('No token received in response');
      }

      localStorage.setItem('token', token);
      console.log('✅ Token stored successfully');
      return Promise.resolve();

    } catch (error) {
      console.error('❌ Login failed:', error.message);
      return Promise.reject(new Error(error.message || 'Invalid credentials or server error'));
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    console.log('🔓 Logged out, token removed');
    return Promise.resolve();
  },

  checkError: (error) => {
    if (error.status === 401 || error.status === 403) {
      localStorage.removeItem('token');
      console.warn('⚠️ Unauthorized – token cleared');
      return Promise.reject();
    }
    return Promise.resolve();
  },

  checkAuth: () => {
    const token = localStorage.getItem('token');
    if (token) {
      console.log('✅ Authenticated – token exists');
      return Promise.resolve();
    } else {
      console.warn('❌ No token – not authenticated');
      return Promise.reject();
    }
  },

  getPermissions: () => Promise.resolve(),
};