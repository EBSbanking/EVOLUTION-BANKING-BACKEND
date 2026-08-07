// admin-ui/src/pages/Plugins/PluginsList.js

import React, { useEffect, useState } from 'react';
import { 
  List, 
  Datagrid, 
  TextField, 
  SelectField, 
  BooleanField, 
  TopToolbar, 
  Button, 
  useRecordContext, 
  useNotify, 
  useRefresh, 
  Filter, 
  SearchInput, 
  SelectInput, 
  DateField, 
  useListContext 
} from 'react-admin';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PluginUploadButton from './PluginUploadButton';
import { API_BASE_URL } from '../../config';
import { Chip, Box, Stack, Typography, Paper, LinearProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';

// =============================================
// DEBUG COMPONENT - Will log plugin data to console
// =============================================
const DebugPluginData = () => {
  const { data, isLoading } = useListContext();
  
  useEffect(() => {
    if (data) {
      console.log('🔍 Plugins Data:', data);
      console.log('🔍 Plugins Count:', Array.isArray(data) ? data.length : 'Not an array');
      if (Array.isArray(data) && data.length > 0) {
        console.log('🔍 First Plugin:', data[0]);
        console.log('🔍 Plugin Fields:', Object.keys(data[0]));
        console.log('🔍 Plugin names:', data.map(p => p.name).join(', '));
      } else {
        console.log('🔍 No plugins found in data');
      }
    }
  }, [data]);
  
  if (isLoading) return null;
  return null;
};

// =============================================
// FILTER COMPONENT
// =============================================
const PluginFilter = (props) => (
  <Filter {...props}>
    <SearchInput source="q" placeholder="Search plugins..." alwaysOn />
    <SelectInput 
      source="status" 
      label="Status" 
      choices={[
        { id: 'active', name: 'Active' },
        { id: 'inactive', name: 'Inactive' },
        { id: 'stopped', name: 'Stopped' },
        { id: 'error', name: 'Error' },
        { id: 'installed', name: 'Installed' },
        { id: 'running', name: 'Running' },
        { id: 'starting', name: 'Starting' },
        { id: 'stopping', name: 'Stopping' },
      ]}
    />
  </Filter>
);

// =============================================
// REFRESH BUTTON COMPONENT
// =============================================
const PluginRefreshButton = () => {
  const refresh = useRefresh();
  const notify = useNotify();
  
  const handleRefresh = () => {
    // Clear cache
    localStorage.removeItem('plugins_cache');
    
    // Force cache bypass with a timestamp
    const timestamp = Date.now();
    fetch(`${API_BASE_URL}/plugins?_=${timestamp}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    }).then(() => {
      notify('Plugins refreshed successfully', { type: 'success' });
      refresh();
    }).catch((error) => {
      console.error('Refresh error:', error);
      notify('Failed to refresh plugins', { type: 'error' });
      refresh(); // Refresh anyway even if fetch fails
    });
  };
  
  return (
    <Button
      label="Refresh"
      onClick={handleRefresh}
      startIcon={<RefreshIcon />}
      variant="outlined"
      color="secondary"
    />
  );
};

// =============================================
// ROW ACTIONS COMPONENT
// =============================================
const RowActions = () => {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();

  if (!record) return null;

  const handleStart = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/plugins/${record.id}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        notify('Plugin started successfully', { type: 'success' });
        refresh();
      } else {
        const error = await response.json();
        const errorMsg = error.error || error.details || error.message || 'Unknown error';
        notify(`Start failed: ${errorMsg}`, { type: 'error' });
      }
    } catch (error) {
      console.error('Start error:', error);
      notify(`Start failed: ${error.message || 'Network error'}`, { type: 'error' });
    }
  };

  const handleStop = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/plugins/${record.id}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        notify('Plugin stopped successfully', { type: 'success' });
        refresh();
      } else {
        const error = await response.json();
        const errorMsg = error.error || error.details || error.message || 'Unknown error';
        notify(`Stop failed: ${errorMsg}`, { type: 'error' });
      }
    } catch (error) {
      console.error('Stop error:', error);
      notify(`Stop failed: ${error.message || 'Network error'}`, { type: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete plugin "${record.name}"?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/plugins/${record.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        notify('Plugin deleted successfully', { type: 'success' });
        refresh();
      } else {
        const error = await response.json();
        const errorMsg = error.error || error.details || error.message || 'Unknown error';
        notify(`Delete failed: ${errorMsg}`, { type: 'error' });
      }
    } catch (error) {
      console.error('Delete error:', error);
      notify(`Delete failed: ${error.message || 'Network error'}`, { type: 'error' });
    }
  };

  // Check if plugin is running - handle both 'active' and 'running' status
  const isRunning = record.status === 'active' || record.status === 'running' || record.running === true;
  // Check if plugin can be started
  const canStart = !isRunning && record.status !== 'starting';
  // Check if plugin can be stopped
  const canStop = isRunning && record.status !== 'stopping';

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button 
        label="Start" 
        onClick={handleStart} 
        disabled={!canStart} 
        startIcon={<PlayArrowIcon />} 
        variant="contained"
        color="success"
        size="small"
        sx={{ minWidth: '80px' }}
      />
      <Button 
        label="Stop" 
        onClick={handleStop} 
        disabled={!canStop} 
        startIcon={<StopIcon />} 
        variant="contained"
        color="warning"
        size="small"
        sx={{ minWidth: '80px' }}
      />
      <Button 
        label="Delete" 
        onClick={handleDelete} 
        startIcon={<DeleteIcon />} 
        variant="contained"
        color="error"
        size="small"
        sx={{ minWidth: '80px' }}
      />
    </Stack>
  );
};

// =============================================
// LIST ACTIONS COMPONENT
// =============================================
const ListActions = () => (
  <TopToolbar>
    <PluginUploadButton />
    <PluginRefreshButton />
  </TopToolbar>
);

// =============================================
// STATUS CHIP COMPONENT
// =============================================
const StatusChip = ({ source }) => {
  const record = useRecordContext();
  if (!record) return null;
  
  // Get status from multiple possible field names
  const value = record.status || record.Status || record.plugin_status || 'unknown';
  
  const colors = {
    active: 'success',
    running: 'success',
    inactive: 'default',
    stopped: 'warning',
    error: 'error',
    installed: 'info',
    starting: 'info',
    stopping: 'warning',
    unknown: 'default'
  };
  
  return (
    <Chip 
      label={value}
      color={colors[value?.toLowerCase()] || 'default'}
      size="small"
      variant="filled"
      sx={{ fontWeight: 'bold' }}
    />
  );
};

// =============================================
// MAIN PLUGINS LIST COMPONENT
// =============================================
export const PluginsList = () => {
  const theme = useTheme();
  
  return (
    <List 
      actions={<ListActions />} 
      resource="plugins"
      sort={{ field: 'name', order: 'ASC' }}
      filters={<PluginFilter />}
      perPage={25}
      sx={{ 
        '& .RaDatagrid-table': { 
          minWidth: '100%',
          '& th': { fontWeight: 'bold' }
        }
      }}
    >
      {/* Debug component - logs data to console */}
      <DebugPluginData />
      
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" label="ID" />
        <TextField source="name" label="Plugin Name" />
        <TextField source="version" label="Version" />
        <TextField source="author" label="Author" />
        <StatusChip source="status" label="Status" />
        <BooleanField 
          source="auto_start" 
          label="Auto-Start"
          sx={{ 
            '& .RaBooleanField-falseIcon': { color: theme.palette.error.main },
            '& .RaBooleanField-trueIcon': { color: theme.palette.success.main }
          }}
        />
        <TextField source="description" label="Description" />
        <DateField 
          source="installed_at" 
          label="Installed" 
          showTime 
          locales="en-US"
          options={{ 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }}
        />
        <RowActions />
      </Datagrid>
    </List>
  );
};

export default PluginsList;