import { fetchUtils } from 'react-admin';

const LOGIN_URL = 'http://localhost:3002/api/login/login';

export const authProvider = {
  login: async ({ username, password }) => {
    // ✅ Send both fields to satisfy middleware and main login function
    const payload = {
      user_name: username,           // for the main login controller
      login_identifier: username,   // for the middleware that logs LOGIN ATTEMPT
      password: password
    };
    console.log('🚀 Sending payload to', LOGIN_URL, payload);

    const request = new Request(LOGIN_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    try {
      const response = await fetchUtils.fetchJson(request);
      const { token } = response.json;
      if (!token) throw new Error('No token received');
      localStorage.setItem('token', token);
      return Promise.resolve();
    } catch (error) {
      console.error('Login failed:', error);
      return Promise.reject(new Error('Invalid credentials or server error'));
    }
  },
  logout: () => {
    localStorage.removeItem('token');
    return Promise.resolve();
  },
  checkError: (error) => {
    if (error.status === 401 || error.status === 403) {
      localStorage.removeItem('token');
      return Promise.reject();
    }
    return Promise.resolve();
  },
  checkAuth: () => localStorage.getItem('token') ? Promise.resolve() : Promise.reject(),
  getPermissions: () => Promise.resolve(),
};