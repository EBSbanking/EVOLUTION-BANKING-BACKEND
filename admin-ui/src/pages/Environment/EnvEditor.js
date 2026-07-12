// admin-ui/src/pages/Environment/EnvEditor.jsx
import React, { useState } from 'react';
import {
  List,
  Datagrid,
  TextField,
  EditButton,
  Edit,
  SimpleForm,
  TextInput,
  Create,
  DeleteButton,
  useNotify,
  useRedirect,
  useListContext,
  Button,
  TopToolbar,
  Filter,
  SelectInput,
  useDataProvider,
} from 'react-admin';
import {
  Box,
  Typography,
  Alert,
  Chip,
  Stack,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Warning as WarningIcon,
  FileDownload as FileDownloadIcon,
} from '@mui/icons-material';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

// Category definitions
const CATEGORIES = [
  { id: 'server', name: 'Server Configuration' },
  { id: 'database', name: 'Database' },
  { id: 'security', name: 'Security & Authentication' },
  { id: 'api', name: 'API & Services' },
  { id: 'email', name: 'Email & SMS' },
  { id: 'cache', name: 'Cache & Queue' },
  { id: 'storage', name: 'Storage & Files' },
  { id: 'webhook', name: 'Webhooks' },
  { id: 'aml', name: 'AML & Compliance' },
  { id: 'nip', name: 'NIP Configuration' },
  { id: 'monitoring', name: 'Monitoring & Logging' },
  { id: 'other', name: 'Other' },
];

// Helper to determine category based on key
const getCategory = (key) => {
  if (!key) return 'other';
  
  const upperKey = key.toUpperCase();
  
  if (upperKey.includes('SERVER') || upperKey.includes('CLUSTER') || upperKey.includes('NODE') || 
      upperKey.includes('PORT') || upperKey.includes('HOST') || upperKey.includes('WORKER')) {
    return 'server';
  }
  if (upperKey.includes('DB_') || upperKey.includes('DATABASE') || upperKey.includes('MYSQL') || 
      upperKey.includes('POOL') || upperKey.includes('SYNC')) {
    return 'database';
  }
  if (upperKey.includes('SECRET') || upperKey.includes('KEY') || upperKey.includes('PASSWORD') || 
      upperKey.includes('TOKEN') || upperKey.includes('ENCRYPTION') || upperKey.includes('JWT') ||
      upperKey.includes('LICENSE') || upperKey.includes('API_KEY')) {
    return 'security';
  }
  if (upperKey.includes('API_') || upperKey.includes('URL') || upperKey.includes('ENDPOINT') ||
      upperKey.includes('VERSION') || upperKey.includes('PREFIX') || upperKey.includes('SWAGGER')) {
    return 'api';
  }
  if (upperKey.includes('EMAIL') || upperKey.includes('SMTP') || upperKey.includes('SMS') ||
      upperKey.includes('TERMII') || upperKey.includes('TWILIO')) {
    return 'email';
  }
  if (upperKey.includes('REDIS') || upperKey.includes('CACHE') || upperKey.includes('QUEUE') ||
      upperKey.includes('SESSION_STORE')) {
    return 'cache';
  }
  if (upperKey.includes('STORAGE') || upperKey.includes('UPLOAD') || upperKey.includes('FILE')) {
    return 'storage';
  }
  if (upperKey.includes('WEBHOOK')) {
    return 'webhook';
  }
  if (upperKey.includes('AML') || upperKey.includes('COMPLIANCE') || upperKey.includes('KYC') ||
      upperKey.includes('RISK') || upperKey.includes('SANCTION') || upperKey.includes('PEP')) {
    return 'aml';
  }
  if (upperKey.includes('NIP_') || upperKey.includes('INSTITUTION')) {
    return 'nip';
  }
  if (upperKey.includes('LOG') || upperKey.includes('MONITOR') || upperKey.includes('METRIC') ||
      upperKey.includes('HEALTH') || upperKey.includes('TRACE')) {
    return 'monitoring';
  }
  
  return 'other';
};

// Custom Filter Component
const EnvFilter = (props) => (
  <Filter {...props}>
    <TextInput 
      source="q" 
      label="Search" 
      placeholder="Search by key or value..." 
      alwaysOn 
    />
    <SelectInput 
      source="category" 
      label="Category" 
      choices={CATEGORIES}
      alwaysOn
    />
  </Filter>
);

// Custom Toolbar for List
const EnvListActions = () => {
  const { refetch } = useListContext();
  const [reloading, setReloading] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [importing, setImporting] = useState(false);
  const notify = useNotify();

  const handleReload = async () => {
    setReloading(true);
    try {
      await httpClient(`${API_BASE_URL}/env/reload`, { method: 'POST' });
      notify('Environment variables reloaded successfully', { type: 'success' });
      refetch();
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setReloading(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const response = await httpClient(`${API_BASE_URL}/env/import`, { method: 'POST' });
      const data = response.json?.data || response.json || response;
      const message = data.message || 'Environment variables imported successfully from .env file';
      notify(message, { type: 'success' });
      refetch();
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const handleToggleSensitive = () => {
    setShowSensitive(!showSensitive);
  };

  return (
    <TopToolbar>
      <Button
        label="Add Variable"
        startIcon={<AddIcon />}
        component="a"
        href="#/env/create"
      />
      <Button
        label="Import from .env"
        startIcon={importing ? <CircularProgress size={20} /> : <FileDownloadIcon />}
        onClick={handleImport}
        disabled={importing}
      />
      <Button
        label="Reload Env"
        startIcon={reloading ? <CircularProgress size={20} /> : <RefreshIcon />}
        onClick={handleReload}
        disabled={reloading}
      />
      <Button
        label={showSensitive ? "Hide Sensitive" : "Show Sensitive"}
        startIcon={showSensitive ? <VisibilityOffIcon /> : <VisibilityIcon />}
        onClick={handleToggleSensitive}
        color={showSensitive ? "warning" : "primary"}
      />
    </TopToolbar>
  );
};

// Custom List Component
export const EnvList = (props) => {
  const [showSensitive, setShowSensitive] = useState(false);

  return (
    <List 
      {...props} 
      actions={<EnvListActions />}
      sort={{ field: 'key', order: 'ASC' }}
      perPage={100}
      filters={<EnvFilter />}
    >
      <Datagrid 
        rowClick="edit"
        bulkActionButtons={false}
        sx={{
          '& .variable-row': {
            '&:hover': {
              backgroundColor: '#e8f5e9',
            },
          },
        }}
      >
        <TextField 
          source="key" 
          label="Key" 
          sortable={true}
        />
        <TextField 
          source="value" 
          label="Value"
          render={(record) => {
            if (!record) return '-';
            const isSensitive = record.key && (
              record.key.includes('SECRET') || 
              record.key.includes('KEY') || 
              record.key.includes('PASSWORD') ||
              record.key.includes('TOKEN') ||
              record.key.includes('ENCRYPTION') ||
              record.key.includes('API_KEY')
            );
            
            if (isSensitive && !showSensitive) {
              return '••••••••';
            }
            return record.value || '-';
          }}
        />
        <TextField 
          source="description" 
          label="Description"
          render={(record) => record?.description || '-'}
        />
        <TextField 
          source="category" 
          label="Category"
          render={(record) => {
            if (!record) return '-';
            const category = getCategory(record.key);
            const categoryInfo = CATEGORIES.find(c => c.id === category);
            return (
              <Chip 
                label={categoryInfo ? categoryInfo.name : category}
                size="small"
                variant="outlined"
              />
            );
          }}
        />
        <TextField 
          source="id" 
          label="ID"
          sortable={false}
        />
        <EditButton />
        <DeleteButton 
          mutationMode="pessimistic"
          confirmTitle="Delete Environment Variable"
          confirmContent="Are you sure you want to delete this environment variable? This action cannot be undone."
        />
      </Datagrid>
    </List>
  );
};

// Custom Edit Component
export const EnvEdit = (props) => {
  const notify = useNotify();
  const redirect = useRedirect();

  const transform = (data) => {
    return {
      key: data.key,
      value: data.value,
      description: data.description || '',
    };
  };

  return (
    <Edit {...props} transform={transform} mutationMode="pessimistic">
      <SimpleForm>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <WarningIcon color="warning" />
            <Typography variant="body2">
              <strong>Warning:</strong> Changing environment variables will affect the application behavior.
              Make sure you know what you're doing.
            </Typography>
          </Stack>
        </Alert>
        
        <TextInput 
          source="key" 
          label="Key" 
          fullWidth 
          required
          helperText="The environment variable name (e.g., DB_HOST)"
        />
        
        <TextInput 
          source="value" 
          label="Value" 
          fullWidth 
          required
          helperText="The environment variable value"
        />
        
        <TextInput 
          source="description" 
          label="Description" 
          fullWidth 
          multiline 
          rows={2}
          helperText="Optional description of what this variable does"
        />
        
        <Alert severity="warning" sx={{ mt: 2 }}>
          <Typography variant="body2">
            Changes will be saved to the database and will take effect after restarting the application or reloading the environment.
          </Typography>
        </Alert>
      </SimpleForm>
    </Edit>
  );
};

// Custom Create Component
export const EnvCreate = (props) => {
  const notify = useNotify();
  const redirect = useRedirect();
  const dataProvider = useDataProvider();

  const transform = (data) => {
    return {
      key: data.key ? data.key.trim() : '',
      value: data.value ? data.value.trim() : '',
      description: data.description ? data.description.trim() : '',
    };
  };

  return (
    <Create {...props} transform={transform} mutationMode="pessimistic">
      <SimpleForm>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AddIcon color="info" />
            <Typography variant="body2">
              <strong>Add a new environment variable.</strong> Make sure the key is unique and follows the 
              standard naming conventions (e.g., DB_HOST, API_KEY).
            </Typography>
          </Stack>
        </Alert>
        
        <TextInput 
          source="key" 
          label="Key" 
          fullWidth 
          required
          helperText="The environment variable name (e.g., DB_HOST, CLUSTER_MODE)"
        />
        
        <TextInput 
          source="value" 
          label="Value" 
          fullWidth 
          required
          helperText="The environment variable value (e.g., production, false, 3002)"
        />
        
        <TextInput 
          source="description" 
          label="Description" 
          fullWidth 
          multiline 
          rows={2}
          helperText="Optional description of what this variable does"
        />
        
        <Alert severity="warning" sx={{ mt: 2 }}>
          <Typography variant="body2">
            New variables will be saved to the database and will take effect after restarting the application or reloading the environment.
          </Typography>
        </Alert>
      </SimpleForm>
    </Create>
  );
};