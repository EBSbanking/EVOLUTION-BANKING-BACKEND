// admin-ui/src/App.js - COMPLETE FIXED VERSION WITH TOKEN REFRESH AND HEALTH CHECK

import { Admin, Resource, fetchUtils, Layout } from 'react-admin';
import simpleRestProvider from 'ra-data-simple-rest';
import { authProvider } from './authProvider';
import MyLoginPage from './MyLoginPage';
import { DataSourceList } from './pages/DataSources/DataSourceList';
import DataSourceCreate from './pages/DataSources/DataSourceCreate';
import { DataSourceEdit } from './pages/DataSources/DataSourceEdit';
import { PluginsList } from './pages/Plugins/PluginsList';
import { AuditLog } from './pages/ChangeCenter/AuditLog';
import ServerStatus from './pages/Server/ServerStatus';
import SchedulerStatus from './pages/Scheduler/SchedulerStatus';
import UtilsStatus from './pages/Utils/UtilsStatus';
import TrafficMonitor from './pages/Traffic/TrafficMonitor';
import FrontendStatus from './pages/Frontend/FrontendStatus';
import ServerShow from './pages/Server/ServerShow';
import { ServerList } from './pages/Server/ServerList';
import { MiddlewareList, MiddlewareShow, MiddlewareEdit } from './pages/middlewares';
import { WebhookList, WebhookShow, WebhookEdit } from './pages/Webhooks';
import { EnvList, EnvEdit, EnvCreate } from './pages/Environment/EnvEditor';
import { ServicesList, ServicesCreate, ServicesEdit, ServicesShow } from './pages/Services';
import SchedulerStatusWrapper from './pages/Scheduler/SchedulerStatusWrapper';
import TrafficStats from './pages/TrafficStats/TrafficStats';
import UserMonitoring from './pages/UserMonitoring/UserMonitoring';

import { Box, Typography } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import SpeedIcon from '@mui/icons-material/Speed';
import PublicIcon from '@mui/icons-material/Public';
import DnsIcon from '@mui/icons-material/Dns';
import ExtensionIcon from '@mui/icons-material/Extension';
import WebhookIcon from '@mui/icons-material/Webhook';
import StorageIcon from '@mui/icons-material/Storage';
import BuildIcon from '@mui/icons-material/Build';
import SettingsIcon from '@mui/icons-material/Settings';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AssessmentIcon from '@mui/icons-material/Assessment';
import BarChartIcon from '@mui/icons-material/BarChart';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';

import { API_BASE_URL } from './config';

// ✅ IMPORT for HealthRoute
import HealthRoute from './routes/HealthRoute';

// Create theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

// =============================================
// ✅ TOKEN REFRESH HELPER
// =============================================
let refreshPromise = null;
let isRefreshing = false;

const refreshAuthToken = async () => {
  // If there's already a refresh in progress, return that promise
  if (refreshPromise) {
    return refreshPromise;
  }

  // Prevent multiple refresh attempts
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      const checkToken = setInterval(() => {
        const token = localStorage.getItem('token');
        if (token) {
          clearInterval(checkToken);
          resolve(token);
        }
        if (!isRefreshing) {
          clearInterval(checkToken);
          reject(new Error('Refresh cancelled'));
        }
      }, 100);
    });
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        console.warn('⚠️ No refresh token available');
        throw new Error('No refresh token available');
      }

      console.log('🔄 Refreshing auth token...');
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Refresh failed');
      }

      const data = await response.json();
      const newToken = data.token || data.accessToken || data.data?.token;
      
      if (newToken) {
        localStorage.setItem('token', newToken);
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        }
        console.log('✅ Token refreshed successfully');
        return newToken;
      }
      throw new Error('No token in refresh response');
    } catch (error) {
      console.error('❌ Token refresh failed:', error.message);
      // Clear tokens and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      // Redirect to login page
      window.location.href = '/login';
      throw error;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

// =============================================
// ✅ UPDATED HTTP CLIENT WITH AUTO-REFRESH
// =============================================
export const httpClient = async (url, options = {}) => {
  const getToken = () => localStorage.getItem('token');
  
  const makeRequest = async (retry = false) => {
    const token = getToken();
    const headers = new Headers(options.headers || {});
    
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    try {
      const response = await fetchUtils.fetchJson(url, { 
        ...options, 
        headers 
      });
      return response;
    } catch (error) {
      // Check if it's a 401 Unauthorized error
      if (error.status === 401 && !retry) {
        console.log('🔄 Token expired, attempting refresh...');
        try {
          const newToken = await refreshAuthToken();
          if (newToken) {
            // Retry the request with new token
            console.log('🔄 Retrying request with new token...');
            return makeRequest(true);
          }
        } catch (refreshError) {
          console.error('❌ Refresh failed, redirecting to login');
          // If refresh fails, throw the original error
          throw error;
        }
      }
      throw error;
    }
  };

  return makeRequest();
};

// =============================================
// ✅ API_BASE_URL already includes /admin
// =============================================
const baseDataProvider = simpleRestProvider(API_BASE_URL, httpClient);

// =============================================
// HELPER FUNCTIONS
// =============================================

const ensureId = (item, fallbackId = null) => {
  if (!item || typeof item !== 'object') {
    return { id: fallbackId || Date.now() };
  }

  if (item.id !== undefined && item.id !== null) {
    return item;
  }

  const idFields = [
    'role_id', 'BU_ROLE_ID', 'data_source_id', 'plugin_id', 
    'event_id', 'userId', 'user_id', 'webhook_name',
    '_id', 'ID', 'key', 'name', 'id'
  ];

  for (const field of idFields) {
    if (item[field] !== undefined && item[field] !== null) {
      return { ...item, id: item[field] };
    }
  }

  const keys = Object.keys(item);
  for (const key of keys) {
    if (key.toLowerCase().includes('id') && item[key] !== undefined && item[key] !== null) {
      return { ...item, id: item[key] };
    }
  }

  return { ...item, id: fallbackId || Date.now() + Math.random() };
};

const ensureIds = (data, fallbackId = null) => {
  if (!Array.isArray(data)) {
    if (typeof data === 'object' && data !== null) {
      const values = Object.values(data);
      if (values.length > 0 && typeof values[0] === 'object') {
        return ensureIds(values, fallbackId);
      }
      return ensureId(data, fallbackId);
    }
    return data;
  }
  return data.map((item, index) => ensureId(item, fallbackId || index + 1));
};

// =============================================
// DATA PROVIDER
// =============================================

const dataProvider = {
  ...baseDataProvider,

  getList: async (resource, params) => {
    try {
      // =============================================
      // ✅ FIXED: AUDIT LOGS - Special handling
      // =============================================
      if (resource === 'audit') {
        const { page, perPage } = params.pagination;
        const { field, order } = params.sort;
        const filter = params.filter || {};

        const url = `${API_BASE_URL}/audit?` + new URLSearchParams({
          range: JSON.stringify([(page - 1) * perPage, page * perPage - 1]),
          sort: JSON.stringify([field, order]),
          filter: JSON.stringify(filter),
        });

        const response = await httpClient(url, {
          method: 'GET',
        });

        // Get the data and ensure it's an array
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }

        // Get total from Content-Range header
        const contentRange = response.headers?.get('Content-Range') || '';
        const total = parseInt(contentRange.split('/').pop(), 10) || data.length;

        // Ensure each item has an id (use event_id as primary key)
        data = data.map((item, index) => ({
          ...item,
          id: item.event_id || item.id || index + 1
        }));

        console.log('📊 Audit data loaded:', { total, count: data.length });
        return { data, total };
      }

      // =============================================
      // SPECIAL HANDLING FOR USER MONITORING
      // =============================================
      if (resource === 'user-monitoring') {
        const response = await httpClient(`${API_BASE_URL}/users/active-sessions`, {
          method: 'GET',
        });
        
        let data = response.json?.data?.sessions || [];
        const summary = response.json?.data?.summary || {};
        
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        
        data = data.map((item, index) => ({
          ...item,
          id: item.id || item.session_id || index + 1
        }));
        
        const total = data.length;
        
        return { data, total, summary };
      }

      // =============================================
      // SPECIAL HANDLING FOR MIDDLEWARES
      // =============================================
      if (resource === 'middlewares') {
        const response = await httpClient(`${API_BASE_URL}/middlewares`, {
          method: 'GET',
        });
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        data = ensureIds(data);
        return { data, total: data.length };
      }

      // =============================================
      // SPECIAL HANDLING FOR ENVIRONMENT VARIABLES
      // =============================================
      if (resource === 'env') {
        const response = await httpClient(`${API_BASE_URL}/env`, {
          method: 'GET',
        });
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        data = ensureIds(data);
        return { data, total: data.length };
      }

      // =============================================
      // SPECIAL HANDLING FOR PLUGINS
      // =============================================
      if (resource === 'plugins') {
        const response = await httpClient(`${API_BASE_URL}/plugins`, {
          method: 'GET',
        });
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        data = ensureIds(data);
        console.log('📦 Raw plugins response:', data);
        return { data, total: data.length };
      }

      // =============================================
      // SPECIAL HANDLING FOR SERVERS
      // =============================================
      if (resource === 'servers') {
        const response = await httpClient(`${API_BASE_URL}/servers`, {
          method: 'GET',
        });
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        data = ensureIds(data);
        return { data, total: data.length };
      }

      // =============================================
      // SPECIAL HANDLING FOR WEBHOOK CONFIGS
      // =============================================
      if (resource === 'webhook_configs') {
        const response = await httpClient(`${API_BASE_URL}/webhook_configs`, {
          method: 'GET',
        });
        let data = response.json?.data || response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        data = ensureIds(data);
        return { data, total: data.length };
      }

      // =============================================
      // SPECIAL HANDLING FOR TRAFFIC STATS
      // =============================================
      if (resource === 'traffic-stats') {
        try {
          const response = await fetch(`${API_BASE_URL}/traffic/stats`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const result = await response.json();
          const data = result?.data || result || { totalRequests: 0, uniqueRoutes: 0, topRoutes: [] };
          return { 
            data: [ensureId(data, 'traffic-stats')], 
            total: 1 
          };
        } catch (error) {
          console.error('Error fetching traffic stats:', error.message);
          return { 
            data: [{ 
              id: 'traffic-stats', 
              totalRequests: 0, 
              uniqueRoutes: 0, 
              topRoutes: [], 
              error: error.message,
              redisConnected: false 
            }], 
            total: 1 
          };
        }
      }

      // =============================================
      // SPECIAL HANDLING FOR TRAFFIC STATUS
      // =============================================
      if (resource === 'traffic-status') {
        try {
          const response = await fetch(`${API_BASE_URL}/traffic/status`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const result = await response.json();
          const data = result || { redisConnected: false, redisStatus: 'Disconnected' };
          return { 
            data: [ensureId(data, 'redis-status')], 
            total: 1 
          };
        } catch (error) {
          return { 
            data: [{ 
              id: 'redis-status', 
              redisConnected: false, 
              redisStatus: 'Error', 
              error: error.message 
            }], 
            total: 1 
          };
        }
      }

      // =============================================
      // DEFAULT: Use baseDataProvider
      // =============================================
      const response = await baseDataProvider.getList(resource, params);
      console.log('📦 Raw response:', response);

      let data = [];
      let total = 0;

      if (response && Array.isArray(response.data)) {
        data = response.data;
        total = response.total || data.length;
      } else if (Array.isArray(response)) {
        data = response;
        total = data.length;
      } else if (response && response.data && typeof response.data === 'object') {
        const values = Object.values(response.data);
        if (values.length > 0) {
          data = values;
          total = response.total || values.length;
        }
      } else if (response && response.rows && Array.isArray(response.rows)) {
        data = response.rows;
        total = response.total || data.length;
      } else if (response && typeof response === 'object') {
        data = [response];
        total = 1;
      }

      data = ensureIds(data);
      console.log('📊 Final data array:', data);
      return { data, total };
    } catch (error) {
      console.error('❌ getList error:', error);
      return { data: [], total: 0 };
    }
  },

  // =============================================
  // GET ONE
  // =============================================
  getOne: async (resource, params) => {
    if (!params || params.id === undefined) {
      return { data: { id: null } };
    }

    try {
      // =============================================
      // ✅ FIXED: AUDIT LOGS - Special handling for getOne
      // =============================================
      if (resource === 'audit') {
        const response = await httpClient(`${API_BASE_URL}/audit/${params.id}`, {
          method: 'GET',
        });
        
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      }

      // =============================================
      // SPECIAL HANDLING FOR SERVICES
      // =============================================
      if (resource === 'services') {
        try {
          const response = await httpClient(`${API_BASE_URL}/services/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching service:', error);
          const listResponse = await httpClient(`${API_BASE_URL}/services`);
          const listData = listResponse.json || listResponse;
          if (Array.isArray(listData)) {
            const found = listData.find(item => item.id === params.id);
            if (found) {
              return { data: ensureId(found, params.id) };
            }
          }
          throw error;
        }
      }

      // =============================================
      // SPECIAL HANDLING FOR MIDDLEWARES
      // =============================================
      if (resource === 'middlewares') {
        try {
          const response = await httpClient(`${API_BASE_URL}/middlewares/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching middleware:', error);
          const listResponse = await httpClient(`${API_BASE_URL}/middlewares`);
          const listData = listResponse.json || listResponse;
          if (Array.isArray(listData)) {
            const found = listData.find(item => item.id === params.id);
            if (found) {
              return { data: ensureId(found, params.id) };
            }
          }
          throw error;
        }
      }

      // =============================================
      // SPECIAL HANDLING FOR ENVIRONMENT VARIABLES
      // =============================================
      if (resource === 'env') {
        try {
          const response = await httpClient(`${API_BASE_URL}/env/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching env var:', error);
          const listResponse = await httpClient(`${API_BASE_URL}/env`);
          const listData = listResponse.json || listResponse;
          if (Array.isArray(listData)) {
            const found = listData.find(item => item.id === params.id);
            if (found) {
              return { data: ensureId(found, params.id) };
            }
          }
          throw error;
        }
      }

      // =============================================
      // SPECIAL HANDLING FOR WEBHOOK CONFIGS
      // =============================================
      if (resource === 'webhook_configs') {
        try {
          const response = await httpClient(`${API_BASE_URL}/webhook_configs/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching webhook config:', error);
          throw error;
        }
      }

      // =============================================
      // SPECIAL HANDLING FOR DATA SOURCES
      // =============================================
      if (resource === 'datasources') {
        try {
          const response = await httpClient(`${API_BASE_URL}/datasources/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching data source:', error);
          throw error;
        }
      }

      // =============================================
      // SPECIAL HANDLING FOR PLUGINS
      // =============================================
      if (resource === 'plugins') {
        try {
          const response = await httpClient(`${API_BASE_URL}/plugins/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching plugin:', error);
          const listResponse = await httpClient(`${API_BASE_URL}/plugins`);
          const listData = listResponse.json || listResponse;
          if (Array.isArray(listData)) {
            const found = listData.find(item => item.id === params.id);
            if (found) {
              return { data: ensureId(found, params.id) };
            }
          }
          throw error;
        }
      }

      // =============================================
      // SPECIAL HANDLING FOR SERVERS
      // =============================================
      if (resource === 'servers') {
        try {
          const response = await httpClient(`${API_BASE_URL}/servers/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching server:', error);
          const listResponse = await httpClient(`${API_BASE_URL}/servers`);
          const listData = listResponse.json || listResponse;
          if (Array.isArray(listData)) {
            const found = listData.find(item => item.id === params.id);
            if (found) {
              return { data: ensureId(found, params.id) };
            }
          }
          throw error;
        }
      }

      // =============================================
      // SPECIAL HANDLING FOR TRAFFIC STATS
      // =============================================
      if (resource === 'traffic-stats') {
        try {
          const response = await fetch(`${API_BASE_URL}/traffic/stats`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const result = await response.json();
          let responseData = result?.data || result || { totalRequests: 0, uniqueRoutes: 0, topRoutes: [] };
          responseData = ensureId(responseData, params.id || 'traffic-stats');
          return { data: responseData };
        } catch (error) {
          return { data: { 
            id: params.id || 'traffic-stats', 
            totalRequests: 0, 
            uniqueRoutes: 0, 
            topRoutes: [], 
            error: error.message 
          } };
        }
      }

      // =============================================
      // DEFAULT: Use baseDataProvider
      // =============================================
      const response = await baseDataProvider.getOne(resource, params);
      
      if (response && response.data) {
        response.data = ensureId(response.data, params.id);
      }
      
      return response;
    } catch (error) {
      console.error('❌ getOne error for', resource, ':', error);
      return { data: { id: params.id } };
    }
  },

  // =============================================
  // GET MANY
  // =============================================
  getMany: async (resource, params) => {
    const { ids } = params;
    console.log(`📤 getMany: ${resource} with ids:`, ids);

    try {
      if (resource === 'env') {
        const response = await httpClient(`${API_BASE_URL}/env`, {
          method: 'GET',
        });
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        const filtered = data
          .filter(item => ids.includes(item.id) || ids.includes(item.key))
          .map(item => ensureId(item));
        return { data: filtered };
      }

      if (resource === 'webhook_configs') {
        const response = await httpClient(`${API_BASE_URL}/webhook_configs`, {
          method: 'GET',
        });
        let data = response.json?.data || response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        const filtered = data
          .filter(item => ids.includes(item.id))
          .map(item => ensureId(item));
        return { data: filtered };
      }

      const response = await baseDataProvider.getMany(resource, params);
      
      if (response && response.data) {
        response.data = ensureIds(response.data);
      }
      
      return response;
    } catch (error) {
      console.error(`❌ getMany error for ${resource}:`, error);
      return { data: ids.map(id => ({ id })) };
    }
  },

  // =============================================
  // CREATE
  // =============================================
  create: async (resource, params) => {
    // =============================================
    // SPECIAL HANDLING FOR PLUGINS (File Upload)
    // =============================================
    if (resource === 'plugins' && params.data?.file) {
      const formData = new FormData();
      const { file, ...rest } = params.data;
      
      for (let key in rest) {
        if (rest[key] !== undefined && rest[key] !== null) {
          formData.append(key, rest[key]);
        }
      }
      
      if (file.rawFile) {
        formData.append('plugin', file.rawFile);
      } else if (file instanceof File) {
        formData.append('plugin', file);
      } else {
        formData.append('plugin', file);
      }
      
      const response = await fetch(`${API_BASE_URL}/plugins/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });
      
      const result = await response.json();
      let responseData = result.data || result;
      responseData = ensureId(responseData);
      return { data: responseData };
    }

    // =============================================
    // SPECIAL HANDLING FOR SERVICES (File Upload)
    // =============================================
    if (resource === 'services' && params.data?.file) {
      const formData = new FormData();
      const { file, ...rest } = params.data;
      
      for (let key in rest) {
        if (rest[key] !== undefined && rest[key] !== null) {
          formData.append(key, rest[key]);
        }
      }
      
      if (file.rawFile) {
        formData.append('file', file.rawFile);
      } else if (file instanceof File) {
        formData.append('file', file);
      } else {
        formData.append('file', file);
      }
      
      const response = await httpClient(`${API_BASE_URL}/${resource}`, {
        method: 'POST',
        body: formData,
      });
      let result = response.json.data || response.json;
      result = ensureId(result);
      return { data: result };
    }
    
    // =============================================
    // SPECIAL HANDLING FOR ENVIRONMENT VARIABLES
    // =============================================
    if (resource === 'env') {
      try {
        const response = await httpClient(`${API_BASE_URL}/env`, {
          method: 'POST',
          body: JSON.stringify(params.data),
        });
        
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData);
        return { data: responseData };
      } catch (error) {
        console.error('Error creating env var:', error);
        return { data: ensureId({ ...params.data }, Date.now()) };
      }
    }

    // =============================================
    // SPECIAL HANDLING FOR WEBHOOK CONFIGS
    // =============================================
    if (resource === 'webhook_configs') {
      try {
        const response = await httpClient(`${API_BASE_URL}/webhook_configs`, {
          method: 'POST',
          body: JSON.stringify(params.data),
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData);
        return { data: responseData };
      } catch (error) {
        console.error('Error creating webhook config:', error);
        throw error;
      }
    }
    
    // =============================================
    // DEFAULT: Use baseDataProvider
    // =============================================
    const response = await baseDataProvider.create(resource, params);
    if (response && response.data) {
      response.data = ensureId(response.data);
    }
    return response;
  },

  // =============================================
  // UPDATE
  // =============================================
  update: async (resource, params) => {
    // =============================================
    // SPECIAL HANDLING FOR ENVIRONMENT VARIABLES
    // =============================================
    if (resource === 'env') {
      try {
        const response = await httpClient(`${API_BASE_URL}/env/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(params.data),
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      } catch (error) {
        console.error('Error updating env var:', error);
        throw error;
      }
    }
    
    // =============================================
    // SPECIAL HANDLING FOR MIDDLEWARES
    // =============================================
    if (resource === 'middlewares') {
      try {
        const response = await httpClient(`${API_BASE_URL}/middlewares/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(params.data),
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      } catch (error) {
        console.error('Error updating middleware:', error);
        throw error;
      }
    }

    // =============================================
    // SPECIAL HANDLING FOR WEBHOOK CONFIGS
    // =============================================
    if (resource === 'webhook_configs') {
      try {
        const response = await httpClient(`${API_BASE_URL}/webhook_configs/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(params.data),
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      } catch (error) {
        console.error('Error updating webhook config:', error);
        throw error;
      }
    }

    // =============================================
    // SPECIAL HANDLING FOR DATA SOURCES
    // =============================================
    if (resource === 'datasources') {
      try {
        const response = await httpClient(`${API_BASE_URL}/datasources/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(params.data),
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      } catch (error) {
        console.error('Error updating data source:', error);
        throw error;
      }
    }
    
    // =============================================
    // DEFAULT: Use baseDataProvider
    // =============================================
    try {
      const response = await baseDataProvider.update(resource, params);
      if (response && response.data) {
        response.data = ensureId(response.data, params.id);
      }
      return response;
    } catch (error) {
      console.error('update error:', error);
      throw error;
    }
  },

  // =============================================
  // DELETE
  // =============================================
  delete: async (resource, params) => {
    // =============================================
    // SPECIAL HANDLING FOR ENVIRONMENT VARIABLES
    // =============================================
    if (resource === 'env') {
      try {
        const response = await httpClient(`${API_BASE_URL}/env/${params.id}`, {
          method: 'DELETE',
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      } catch (error) {
        console.error('Error deleting env var:', error);
        throw error;
      }
    }
    
    // =============================================
    // SPECIAL HANDLING FOR MIDDLEWARES
    // =============================================
    if (resource === 'middlewares') {
      try {
        const response = await httpClient(`${API_BASE_URL}/middlewares/${params.id}`, {
          method: 'DELETE',
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      } catch (error) {
        console.error('Error deleting middleware:', error);
        throw error;
      }
    }

    // =============================================
    // SPECIAL HANDLING FOR WEBHOOK CONFIGS
    // =============================================
    if (resource === 'webhook_configs') {
      try {
        const response = await httpClient(`${API_BASE_URL}/webhook_configs/${params.id}`, {
          method: 'DELETE',
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      } catch (error) {
        console.error('Error deleting webhook config:', error);
        throw error;
      }
    }

    // =============================================
    // SPECIAL HANDLING FOR DATA SOURCES
    // =============================================
    if (resource === 'datasources') {
      try {
        const response = await httpClient(`${API_BASE_URL}/datasources/${params.id}`, {
          method: 'DELETE',
        });
        let responseData = response.json.data || response.json;
        responseData = ensureId(responseData, params.id);
        return { data: responseData };
      } catch (error) {
        console.error('Error deleting data source:', error);
        throw error;
      }
    }
    
    // =============================================
    // DEFAULT: Use baseDataProvider
    // =============================================
    try {
      const response = await baseDataProvider.delete(resource, params);
      if (response && response.data) {
        response.data = ensureId(response.data, params.id);
      }
      return response;
    } catch (error) {
      console.error('delete error:', error);
      throw error;
    }
  },

  // =============================================
  // DELETE MANY
  // =============================================
  deleteMany: async (resource, params) => {
    const { ids } = params;
    console.log(`📤 deleteMany: ${resource} with ids:`, ids);
    
    const results = [];
    for (const id of ids) {
      try {
        const result = await dataProvider.delete(resource, { id });
        results.push(result.data);
      } catch (error) {
        console.error(`Failed to delete ${id}:`, error);
      }
    }
    
    return { data: results };
  },
};

// =============================================
// CUSTOM LAYOUT
// =============================================
const MyLayout = (props) => (
  <>
    <Layout {...props} />
    <Box sx={{ 
      position: 'fixed', 
      bottom: 0, 
      left: 0, 
      right: 0, 
      textAlign: 'center', 
      py: 1, 
      bgcolor: 'background.paper', 
      borderTop: '1px solid', 
      borderColor: 'divider', 
      zIndex: 1300 
    }}>
      <Typography variant="caption" color="textSecondary" fontWeight="bold">
        Evolution Banking Backend Weblogic Console @warelogtech Limited 2024
      </Typography>
    </Box>
  </>
);

// =============================================
// APP
// =============================================
function App() {
  return (
    <Admin 
      dataProvider={dataProvider} 
      authProvider={authProvider} 
      loginPage={MyLoginPage} 
      layout={MyLayout} 
      title="Evolution Backend Console"
      theme={theme}
    >
      {/* ✅ Health Check Route - Added as a custom route */}
      <Resource 
        name="health" 
        list={HealthRoute} 
        options={{ label: 'Health Check' }} 
        icon={MonitorHeartIcon}
      />

      {/* Server & System Status */}
      <Resource 
        name="server-status" 
        list={ServerStatus} 
        options={{ label: 'Server Status' }} 
        icon={MonitorHeartIcon} 
      />
      <Resource 
        name="scheduler-status" 
        list={SchedulerStatus} 
        options={{ label: 'Scheduler Status' }} 
        icon={ScheduleIcon}
      />
      <Resource 
        name="utils-status" 
        list={UtilsStatus} 
        options={{ label: 'Utils Status' }} 
        icon={BuildIcon}
      />
      <Resource 
        name="traffic" 
        list={TrafficMonitor} 
        options={{ label: 'Traffic Monitor' }} 
        icon={SpeedIcon} 
      />
      <Resource 
        name="frontend-status" 
        list={FrontendStatus} 
        options={{ label: 'Frontend Status' }} 
        icon={PublicIcon} 
      />

      {/* Data & Configuration */}
      <Resource 
        name="datasources" 
        list={DataSourceList} 
        create={DataSourceCreate} 
        edit={DataSourceEdit} 
        icon={StorageIcon}
      />
      <Resource 
        name="plugins" 
        list={PluginsList} 
        options={{ label: 'Plugins' }} 
        icon={ExtensionIcon}
      />

      {/* Environment Variables */}
      <Resource 
        name="env" 
        list={EnvList} 
        edit={EnvEdit} 
        create={EnvCreate}
        options={{ label: 'Environment Variables' }}
        icon={SettingsIcon}
      />

      {/* Services */}
      <Resource 
        name="services" 
        list={ServicesList} 
        create={ServicesCreate} 
        edit={ServicesEdit} 
        show={ServicesShow}
        options={{ label: 'Services' }} 
        icon={BuildIcon}
      />

      {/* ✅ AUDIT & LOGS - Fixed */}
      <Resource 
        name="audit" 
        list={AuditLog} 
        options={{ label: 'Audit Log' }} 
        icon={AssessmentIcon}
      />

      {/* ✅ USER MONITORING - New */}
      <Resource 
        name="user-monitoring" 
        list={UserMonitoring} 
        options={{ label: 'User Monitoring' }} 
        icon={PeopleAltIcon}
      />

      {/* WebLogic Servers */}
      <Resource 
        name="servers" 
        list={ServerList} 
        show={ServerShow} 
        options={{ label: 'WebLogic Servers' }} 
        icon={DnsIcon} 
      />

      {/* Middlewares */}
      <Resource 
        name="middlewares" 
        list={MiddlewareList} 
        show={MiddlewareShow} 
        edit={MiddlewareEdit} 
        options={{ label: 'Middlewares' }} 
        icon={ExtensionIcon} 
      />

      {/* Webhook Configs */}
      <Resource 
        name="webhook_configs" 
        list={WebhookList} 
        show={WebhookShow} 
        edit={WebhookEdit} 
        options={{ label: 'Webhook Configs' }} 
        icon={WebhookIcon} 
      />

      {/* Scheduler Status Wrapper */}
      <Resource 
        name="scheduler-status" 
        list={SchedulerStatusWrapper} 
        options={{ label: 'Scheduler Status' }} 
        icon={ScheduleIcon}
      />

      {/* Traffic Stats */}
      <Resource 
        name="traffic-stats" 
        list={TrafficStats} 
        icon={BarChartIcon}
        options={{ label: 'Traffic Analytics' }}
      />
    </Admin>
  );
}

export default App;