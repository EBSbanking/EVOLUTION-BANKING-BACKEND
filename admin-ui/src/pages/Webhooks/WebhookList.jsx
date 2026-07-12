// WebhookList.jsx
import React, { useState, useEffect } from 'react';
import {
  useNotify,
} from 'react-admin';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  IconButton,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

export const WebhookList = () => {
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [editFormData, setEditFormData] = useState({
    port: '',
    enabled: true,
    load_balancer_group: '',
  });

  const fetchWebhooks = async () => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('token');
    if (!token) {
      notify('Please log in again', { type: 'warning' });
      setLoading(false);
      return;
    }

    try {
      const response = await httpClient(`${API_BASE_URL}/webhook_configs`);
      console.log('✅ Webhook configs response:', response);
      
      let data = response.json?.data || response.data || response;
      
      if (data && !Array.isArray(data) && typeof data === 'object') {
        data = Object.values(data);
      }
      
      if (Array.isArray(data)) {
        setRecords(data);
      } else {
        setRecords([]);
        setError('Data is not an array');
      }
    } catch (err) {
      console.error('❌ Failed to fetch webhook configs:', err);
      setError(err.message || 'Failed to fetch webhook configs');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWebhook = async (id) => {
    setActionLoading(id);
    try {
      await httpClient(`${API_BASE_URL}/webhook_configs/${id}/start`, {
        method: 'POST',
      });
      notify(`Webhook started successfully`, { type: 'success' });
      setTimeout(fetchWebhooks, 1000);
    } catch (err) {
      if (err.message.includes('No port assigned')) {
        notify('Please configure a port for this webhook first', { type: 'warning' });
        // Open edit dialog for this webhook
        const webhook = records.find(r => r.id === id);
        if (webhook) {
          handleEditClick(webhook);
        }
      } else {
        notify(`Error: ${err.message}`, { type: 'error' });
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleStopWebhook = async (id) => {
    setActionLoading(id);
    try {
      await httpClient(`${API_BASE_URL}/webhook_configs/${id}/stop`, {
        method: 'POST',
      });
      notify(`Webhook stopped successfully`, { type: 'success' });
      setTimeout(fetchWebhooks, 1000);
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditClick = (webhook) => {
    setEditingWebhook(webhook);
    setEditFormData({
      port: webhook.port || '',
      enabled: webhook.enabled === 1 || webhook.enabled === true,
      load_balancer_group: webhook.load_balancer_group || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    try {
      const response = await httpClient(`${API_BASE_URL}/webhook_configs/${editingWebhook.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          port: editFormData.port ? parseInt(editFormData.port) : null,
          enabled: editFormData.enabled,
          load_balancer_group: editFormData.load_balancer_group || null,
        }),
      });
      notify('Webhook updated successfully', { type: 'success' });
      setEditDialogOpen(false);
      setTimeout(fetchWebhooks, 1000);
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    }
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setEditingWebhook(null);
  };

  useEffect(() => {
    fetchWebhooks();
    const interval = setInterval(fetchWebhooks, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <Box display="flex" justifyContent="center" py={4}>
      <CircularProgress />
    </Box>
  );
  
  if (error) return <Alert severity="error">{error}</Alert>;
  
  if (records.length === 0) return (
    <Alert severity="info">
      No webhook configs found. 
      <Button 
        variant="outlined" 
        size="small" 
        onClick={fetchWebhooks}
        sx={{ ml: 2 }}
      >
        Refresh
      </Button>
    </Alert>
  );

  return (
    <Box>
      <Box mb={2} display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">Webhook Configurations</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchWebhooks}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>ID</strong></TableCell>
              <TableCell><strong>Webhook Name</strong></TableCell>
              <TableCell><strong>Port</strong></TableCell>
              <TableCell><strong>Enabled</strong></TableCell>
              <TableCell><strong>LB Group</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Traffic</strong></TableCell>
              <TableCell><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map(record => {
              const isRunning = record.running === true || record.running === 1;
              const isActionLoading = actionLoading === record.id;
              const hasPort = record.port !== null && record.port !== undefined;
              
              return (
                <TableRow 
                  key={record.id || record.webhook_name}
                  sx={{
                    backgroundColor: isRunning ? '#e8f5e9' : '#f5f5f5',
                    '&:hover': {
                      backgroundColor: isRunning ? '#c8e6c9' : '#eeeeee',
                    },
                  }}
                >
                  <TableCell>{record.id}</TableCell>
                  <TableCell>
                    <strong>{record.webhook_name}</strong>
                  </TableCell>
                  <TableCell>
                    {hasPort ? (
                      <Chip
                        label={`Port ${record.port}`}
                        color="info"
                        size="small"
                      />
                    ) : (
                      <Chip
                        label="No port"
                        color="warning"
                        size="small"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={record.enabled ? 'Enabled' : 'Disabled'}
                      color={record.enabled ? 'success' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{record.load_balancer_group || 'Default'}</TableCell>
                  <TableCell>
                    <Chip
                      label={isRunning ? 'Running' : 'Stopped'}
                      color={isRunning ? 'success' : 'error'}
                      size="small"
                      icon={isRunning ? <PlayArrowIcon /> : <StopIcon />}
                    />
                  </TableCell>
                  <TableCell>{record.traffic || 0}</TableCell>
                  <TableCell>
                    <Box display="flex" gap={1} flexWrap="wrap">
                      {isRunning ? (
                        <Button
                          variant="contained"
                          color="error"
                          size="small"
                          startIcon={<StopIcon />}
                          onClick={() => handleStopWebhook(record.id)}
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? 'Stopping...' : 'Stop'}
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          startIcon={<PlayArrowIcon />}
                          onClick={() => handleStartWebhook(record.id)}
                          disabled={isActionLoading || !record.enabled || !hasPort}
                          title={!hasPort ? 'Configure port first' : ''}
                        >
                          {isActionLoading ? 'Starting...' : 'Start'}
                        </Button>
                      )}
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleEditClick(record)}
                        title="Edit configuration"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={handleEditCancel} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit Webhook Configuration
          {editingWebhook && (
            <Typography variant="subtitle2" color="textSecondary">
              {editingWebhook.webhook_name} (ID: {editingWebhook.id})
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Port"
              type="number"
              value={editFormData.port}
              onChange={(e) => setEditFormData({ ...editFormData, port: e.target.value })}
              helperText="Enter the port number for this webhook (e.g., 3003, 3004)"
              fullWidth
              required
            />
            <TextField
              label="Load Balancer Group"
              value={editFormData.load_balancer_group}
              onChange={(e) => setEditFormData({ ...editFormData, load_balancer_group: e.target.value })}
              helperText="Optional: Group name for load balancing"
              fullWidth
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editFormData.enabled}
                  onChange={(e) => setEditFormData({ ...editFormData, enabled: e.target.checked })}
                  color="primary"
                />
              }
              label="Enabled"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditCancel} startIcon={<CancelIcon />}>
            Cancel
          </Button>
          <Button 
            onClick={handleEditSave} 
            variant="contained" 
            color="primary"
            startIcon={<SaveIcon />}
            disabled={!editFormData.port}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};