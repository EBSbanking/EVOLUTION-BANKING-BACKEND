// admin-ui/src/App.js

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

import { Box, Typography } from '@mui/material';
import { ThemeProvider, createTheme, StyledEngineProvider } from '@mui/material/styles';
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

import { API_BASE_URL } from './config';

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

export const httpClient = (url, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetchUtils.fetchJson(url, { ...options, headers });
};

const baseDataProvider = simpleRestProvider(API_BASE_URL, httpClient);

// =============================================
// HELPER FUNCTIONS TO ENSURE ID EXISTS
// =============================================

/**
 * Ensures an item has an 'id' property
 * Checks for common ID field names and adds 'id' if missing
 */
const ensureId = (item, fallbackId = null) => {
  // If item is null/undefined, return empty object with id
  if (!item || typeof item !== 'object') {
    return { id: fallbackId || Date.now() };
  }

  // If item already has an id, return it
  if (item.id !== undefined && item.id !== null) {
    return item;
  }

  // Check for common ID field names
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

  // Check if any key contains 'id' (case insensitive)
  const keys = Object.keys(item);
  for (const key of keys) {
    if (key.toLowerCase().includes('id') && item[key] !== undefined && item[key] !== null) {
      return { ...item, id: item[key] };
    }
  }

  // If no ID found, use fallback
  return { ...item, id: fallbackId || Date.now() + Math.random() };
};

/**
 * Ensures all items in an array have an 'id' property
 */
const ensureIds = (data, fallbackId = null) => {
  if (!Array.isArray(data)) {
    // If it's an object with numeric keys, convert to array
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

  // ===========================================
  // GET LIST
  // ===========================================
  getList: async (resource, params) => {
    try {
      // Handle special resources
      if (resource === 'middlewares') {
        const response = await httpClient(`${API_BASE_URL}/middlewares`, {
          method: 'GET',
        });
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        // Ensure all items have IDs
        data = ensureIds(data);
        console.log('📦 Raw middlewares response:', data);
        return { data, total: data.length };
      }

      if (resource === 'env') {
        const response = await httpClient(`${API_BASE_URL}/env`, {
          method: 'GET',
        });
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        // Ensure all items have IDs
        data = ensureIds(data);
        console.log('📦 Raw env response:', data);
        return { data, total: data.length };
      }

      // For webhook_configs, ensure IDs
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

      // Default getList
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

      // Ensure all items have IDs
      data = ensureIds(data);

      console.log('📊 Final data array:', data);
      console.log(`✅ getList for "${resource}" returning:`, { data, total });
      return { data, total };
    } catch (error) {
      console.error('❌ getList error:', error);
      return { data: [], total: 0 };
    }
  },

  // ===========================================
  // GET ONE - FIXED
  // ===========================================
  getOne: async (resource, params) => {
    if (!params || params.id === undefined) {
      return { data: { id: null } };
    }

    try {
      // Handle special resources
      if (resource === 'services') {
        try {
          const response = await httpClient(`${API_BASE_URL}/services/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          
          // Ensure the response has an ID
          responseData = ensureId(responseData, params.id);
          
          console.log(`✅ getOne for "${resource}" returning:`, responseData);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching service:', error);
          // Fallback: try to get from list
          const listResponse = await httpClient(`${API_BASE_URL}/services`);
          const listData = listResponse.json || listResponse;
          if (Array.isArray(listData)) {
            const found = listData.find(item => item.id == params.id);
            if (found) {
              return { data: ensureId(found, params.id) };
            }
          }
          throw error;
        }
      }

      if (resource === 'middlewares') {
        try {
          const response = await httpClient(`${API_BASE_URL}/middlewares/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          
          console.log(`✅ getOne for "${resource}" returning:`, responseData);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching middleware:', error);
          const listResponse = await httpClient(`${API_BASE_URL}/middlewares`);
          const listData = listResponse.json || listResponse;
          if (Array.isArray(listData)) {
            const found = listData.find(item => item.id == params.id);
            if (found) {
              return { data: ensureId(found, params.id) };
            }
          }
          throw error;
        }
      }

      if (resource === 'env') {
        try {
          const response = await httpClient(`${API_BASE_URL}/env/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          
          console.log(`✅ getOne for "${resource}" returning:`, responseData);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching env var:', error);
          const listResponse = await httpClient(`${API_BASE_URL}/env`);
          const listData = listResponse.json || listResponse;
          if (Array.isArray(listData)) {
            const found = listData.find(item => item.id == params.id);
            if (found) {
              return { data: ensureId(found, params.id) };
            }
          }
          throw error;
        }
      }

      // For webhook_configs
      if (resource === 'webhook_configs') {
        try {
          const response = await httpClient(`${API_BASE_URL}/webhook_configs/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          
          console.log(`✅ getOne for "${resource}" returning:`, responseData);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching webhook config:', error);
          throw error;
        }
      }

      // For datasources
      if (resource === 'datasources') {
        try {
          const response = await httpClient(`${API_BASE_URL}/datasources/${params.id}`, {
            method: 'GET',
          });
          
          let responseData = response.json.data || response.json;
          responseData = ensureId(responseData, params.id);
          
          console.log(`✅ getOne for "${resource}" returning:`, responseData);
          return { data: responseData };
        } catch (error) {
          console.error('Error fetching data source:', error);
          throw error;
        }
      }

      // Default getOne
      const response = await baseDataProvider.getOne(resource, params);
      
      // Ensure the response has an ID
      if (response && response.data) {
        response.data = ensureId(response.data, params.id);
      }
      
      console.log(`✅ getOne for "${resource}" returning:`, response);
      return response;
    } catch (error) {
      console.error('❌ getOne error for', resource, ':', error);
      // Return a fallback object with the requested ID
      return { data: { id: params.id } };
    }
  },

  // ===========================================
  // GET MANY - FIXED
  // ===========================================
  getMany: async (resource, params) => {
    const { ids } = params;
    console.log(`📤 getMany: ${resource} with ids:`, ids);

    try {
      // Special handling for env
      if (resource === 'env') {
        const response = await httpClient(`${API_BASE_URL}/env`, {
          method: 'GET',
        });
        let data = response.json || [];
        if (!Array.isArray(data)) {
          data = Object.values(data);
        }
        // Filter by ids and ensure IDs
        const filtered = data
          .filter(item => ids.includes(item.id) || ids.includes(item.key))
          .map(item => ensureId(item));
        return { data: filtered };
      }

      // Special handling for webhook_configs
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

      // Default getMany
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

  // ===========================================
  // CREATE
  // ===========================================
  create: async (resource, params) => {
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
        // Return a fallback with the data
        return { data: ensureId({ ...params.data }, Date.now()) };
      }
    }

    // For webhook_configs
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
    
    const response = await baseDataProvider.create(resource, params);
    if (response && response.data) {
      response.data = ensureId(response.data);
    }
    return response;
  },

  // ===========================================
  // UPDATE
  // ===========================================
  update: async (resource, params) => {
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

    // For webhook_configs
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

    // For datasources
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

  // ===========================================
  // DELETE
  // ===========================================
  delete: async (resource, params) => {
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

    // For webhook_configs
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

    // For datasources
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

  // ===========================================
  // DELETE MANY
  // ===========================================
  deleteMany: async (resource, params) => {
    const { ids } = params;
    console.log(`📤 deleteMany: ${resource} with ids:`, ids);
    
    // Sequential deletion
    const results = [];
    for (const id of ids) {
      try {
        const result = await dataProvider.delete(resource, { id });
        results.push(result.data);
      } catch (error) {
        console.error(`Failed to delete ${id}:`, error);
        // Continue with other deletions
      }
    }
    
    return { data: results };
  },
};

// Custom Layout with footer
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

      {/* Environment Variables - Updated with full CRUD */}
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

      {/* Audit & Logs */}
      <Resource 
        name="audit" 
        list={AuditLog} 
        options={{ label: 'Audit Log' }} 
        icon={AssessmentIcon}
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
      <Resource 
        name="scheduler-status" 
        list={SchedulerStatusWrapper} 
        options={{ label: 'Scheduler Status' }} 
        icon={ScheduleIcon}
      />
    </Admin>
  );
}

export default App;