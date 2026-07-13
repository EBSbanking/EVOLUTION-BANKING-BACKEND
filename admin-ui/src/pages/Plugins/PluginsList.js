// admin-ui/src/pages/Plugins/PluginsList.js
import { List, Datagrid, TextField, SelectField, BooleanField, TopToolbar, Button, useRecordContext, useNotify, useRefresh } from 'react-admin';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import PluginUploadButton from './PluginUploadButton';
import { API_BASE_URL } from '../../config';

const RowActions = () => {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();

  if (!record) return null;

  const handleStart = async () => {
    try {
      const token = localStorage.getItem('token');
      // ✅ Use /plugins (not /admin/plugins) because API_BASE_URL already has /admin
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

  const isRunning = record.status === 'active' || record.running === true;

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <Button 
        label="Start" 
        onClick={handleStart} 
        disabled={isRunning} 
        startIcon={<PlayArrowIcon />} 
        variant="contained"
        color="success"
        size="small"
      />
      <Button 
        label="Stop" 
        onClick={handleStop} 
        disabled={!isRunning} 
        startIcon={<StopIcon />} 
        variant="contained"
        color="warning"
        size="small"
      />
      <Button 
        label="Delete" 
        onClick={handleDelete} 
        startIcon={<DeleteIcon />} 
        variant="contained"
        color="error"
        size="small"
      />
    </div>
  );
};

const ListActions = () => (
  <TopToolbar>
    <PluginUploadButton />
  </TopToolbar>
);

export const PluginsList = () => (
  <List actions={<ListActions />} resource="plugins">
    <Datagrid rowClick={false}>
      <TextField source="id" label="ID" />
      <TextField source="name" label="Plugin Name" />
      <TextField source="version" label="Version" />
      <SelectField 
        source="status" 
        label="Status"
        choices={[
          { id: 'active', name: 'Active' }, 
          { id: 'stopped', name: 'Stopped' },
          { id: 'error', name: 'Error' }
        ]} 
      />
      <BooleanField source="autoStart" label="Auto-Start" />
      <TextField source="description" label="Description" />
      <RowActions />
    </Datagrid>
  </List>
);