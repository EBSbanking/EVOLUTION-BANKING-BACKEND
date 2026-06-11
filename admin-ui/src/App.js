import { Admin, Resource } from 'react-admin';
import simpleRestProvider from 'ra-data-simple-rest';
import { authProvider } from './authProvider';
import MyLoginPage from './MyLoginPage';
import { DataSourceList } from './pages/DataSources/DataSourceList';
import DataSourceCreate from './pages/DataSources/DataSourceCreate';
import { DataSourceEdit } from './pages/DataSources/DataSourceEdit';
import { PluginsList } from './pages/Plugins/PluginsList';
import { EnvEditor } from './pages/Environment/EnvEditor';
import { AuditLog } from './pages/ChangeCenter/AuditLog';

// ✅ Absolute URL to backend API (port 3002)
const API_BASE_URL = 'http://localhost:3002/api/admin';

const baseDataProvider = simpleRestProvider(API_BASE_URL);
const dataProvider = {
  ...baseDataProvider,
  getList: (resource, params) => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return baseDataProvider.getList(resource, { ...params, headers });
  },
  getOne: (resource, params) => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return baseDataProvider.getOne(resource, { ...params, headers });
  },
  create: (resource, params) => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return baseDataProvider.create(resource, { ...params, headers });
  },
  update: (resource, params) => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return baseDataProvider.update(resource, { ...params, headers });
  },
  delete: (resource, params) => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return baseDataProvider.delete(resource, { ...params, headers });
  },
  getMany: (resource, params) => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return baseDataProvider.getMany(resource, { ...params, headers });
  },
  getManyReference: (resource, params) => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return baseDataProvider.getManyReference(resource, { ...params, headers });
  },
};

function App() {
  return (
    <Admin
      dataProvider={dataProvider}
      authProvider={authProvider}
      loginPage={MyLoginPage}
      title="Evolution Backend Console"
    >
      <Resource name="datasources" list={DataSourceList} create={DataSourceCreate} edit={DataSourceEdit} />
      <Resource name="plugins" list={PluginsList} />
      <Resource name="env" list={EnvEditor} />
      <Resource name="audit" list={AuditLog} />
    </Admin>
  );
}

export default App;