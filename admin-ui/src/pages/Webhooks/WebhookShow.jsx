// WebhookShow.jsx
import React, { useState, useEffect } from 'react';
import {
  Show,
  SimpleShowLayout,
  TextField,
  NumberField,
  BooleanField,
  useShowController,
  useNotify,
} from 'react-admin';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  Box,
  CircularProgress,
  Alert,
  Divider,
  Paper,
  Grid,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

export const WebhookShow = (props) => {
  const { record } = useShowController(props);
  const notify = useNotify();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = async () => {
    if (!record?.id) return;
    
    setLoading(true);
    try {
      const response = await httpClient(`${API_BASE_URL}/webhook_configs/${record.id}/status`);
      setStatus(response.json);
    } catch (err) {
      console.error('Failed to fetch webhook status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (record?.id) {
      fetchStatus();
      // Refresh status every 15 seconds
      const interval = setInterval(fetchStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [record?.id]);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await httpClient(`${API_BASE_URL}/webhook_configs/${record.id}/start`, {
        method: 'POST',
      });
      notify('Webhook started successfully', { type: 'success' });
      await fetchStatus();
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await httpClient(`${API_BASE_URL}/webhook_configs/${record.id}/stop`, {
        method: 'POST',
      });
      notify('Webhook stopped successfully', { type: 'success' });
      await fetchStatus();
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchStatus();
  };

  if (!record) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  const isRunning = status?.running || record?.running;
  const isEnabled = record?.enabled;

  return (
    <Show {...props}>
      <SimpleShowLayout>
        {/* Status Card */}
        <Card sx={{ mb: 3, bgcolor: isRunning ? '#e8f5e9' : '#f5f5f5' }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Typography variant="h6">
                    {record.webhook_name}
                  </Typography>
                  <Chip
                    label={isRunning ? 'RUNNING' : 'STOPPED'}
                    color={isRunning ? 'success' : 'error'}
                    size="medium"
                    icon={isRunning ? <PlayArrowIcon /> : <StopIcon />}
                  />
                  <Chip
                    label={isEnabled ? 'Enabled' : 'Disabled'}
                    color={isEnabled ? 'primary' : 'warning'}
                    size="small"
                  />
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box display="flex" justifyContent="flex-end" gap={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={handleRefresh}
                    disabled={loading}
                  >
                    Refresh
                  </Button>
                  {isRunning ? (
                    <Button
                      variant="contained"
                      color="error"
                      size="small"
                      startIcon={<StopIcon />}
                      onClick={handleStop}
                      disabled={actionLoading || !isEnabled}
                    >
                      {actionLoading ? 'Stopping...' : 'Stop'}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<PlayArrowIcon />}
                      onClick={handleStart}
                      disabled={actionLoading || !isEnabled}
                    >
                      {actionLoading ? 'Starting...' : 'Start'}
                    </Button>
                  )}
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Loading indicator for status */}
        {loading && (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={24} />
          </Box>
        )}

        {/* Webhook Details */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Webhook Details
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                ID
              </Typography>
              <Typography variant="body1">
                {record.id}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Webhook Name
              </Typography>
              <Typography variant="body1">
                <strong>{record.webhook_name}</strong>
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Port
              </Typography>
              <Typography variant="body1">
                {record.port ? (
                  <Chip
                    label={`Port ${record.port}`}
                    color="info"
                    size="small"
                    icon={<MemoryIcon />}
                  />
                ) : (
                  <Chip
                    label="Not configured"
                    color="warning"
                    size="small"
                  />
                )}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Load Balancer Group
              </Typography>
              <Typography variant="body1">
                {record.load_balancer_group || 'Default'}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Traffic (hits)
              </Typography>
              <Typography variant="body1">
                <Chip
                  label={record.traffic || 0}
                  color="info"
                  size="small"
                  icon={<SpeedIcon />}
                />
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Status
              </Typography>
              <Typography variant="body1">
                <Chip
                  label={isRunning ? 'Running' : 'Stopped'}
                  color={isRunning ? 'success' : 'error'}
                  size="small"
                />
                {!isEnabled && (
                  <Chip
                    label="Disabled"
                    color="warning"
                    size="small"
                    sx={{ ml: 1 }}
                  />
                )}
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        {/* Status Information */}
        {status && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Status Information
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="textSecondary">
                  Current Status
                </Typography>
                <Typography variant="body1">
                  <Chip
                    label={status.status || 'UNKNOWN'}
                    color={status.status === 'RUNNING' ? 'success' : 'error'}
                    size="small"
                  />
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="textSecondary">
                  Port
                </Typography>
                <Typography variant="body1">
                  {status.port || 'Not configured'}
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Typography variant="body2" color="textSecondary">
                  Enabled
                </Typography>
                <Typography variant="body1">
                  {status.enabled ? 'Yes' : 'No'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        )}

        {/* Actions Warning */}
        {!isEnabled && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This webhook is disabled. Enable it in the edit form to start it.
          </Alert>
        )}
        
        {!record.port && (
          <Alert severity="info" sx={{ mt: 2 }}>
            No port configured for this webhook. Configure a port in the edit form first.
          </Alert>
        )}
      </SimpleShowLayout>
    </Show>
  );
};
export default WebhookShow;