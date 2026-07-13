// admin-ui/src/pages/Server/ServerStatus.js
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  Grid,
  Chip,
  Divider,
  LinearProgress,
  Paper,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  RestartAlt as RestartIcon,
  PowerSettingsNew as StopIcon,
} from '@mui/icons-material';
import { useNotify } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

const MetricCard = ({ label, value }) => (
  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#f8f9fa', height: '100%' }}>
    <Typography variant="caption" color="textSecondary" display="block" sx={{ fontWeight: 600 }}>
      {label}
    </Typography>
    <Typography variant="body1" sx={{ fontWeight: 700, color: '#1e3a5f' }}>
      {value || 'N/A'}
    </Typography>
  </Paper>
);

const ServerStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const notify = useNotify();
  const navigate = useNavigate();

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('token');
    if (!token) {
      notify('Please log in again', { type: 'warning' });
      navigate('/login');
      setLoading(false);
      return;
    }

    try {
      const response = await httpClient(`${API_BASE_URL}/server/status`);
      const statusData = response.json?.data || response.json || response;
      setStatus(statusData);
    } catch (err) {
      console.error('❌ Status fetch error:', err);
      setError(err.message || 'Failed to fetch server status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const pollUntilRunning = async () => {
    let attempts = 0;
    const maxAttempts = 15;
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        attempts++;
        try {
          const response = await httpClient(`${API_BASE_URL}/server/status`);
          const statusData = response.json?.data || response.json || response;
          if (statusData && statusData.status === 'Running') {
            clearInterval(interval);
            setStatus(statusData);
            notify('Server is back online!', { type: 'success' });
            resolve(true);
            return;
          }
        } catch (e) { /* ignore */ }
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          await fetchStatus();
          resolve(false);
        }
      }, 2000);
    });
  };

  const pollUntilStopped = async () => {
    let attempts = 0;
    const maxAttempts = 10;
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        attempts++;
        try {
          await httpClient(`${API_BASE_URL}/server/status`);
        } catch (e) {
          clearInterval(interval);
          setStatus(null);
          notify('Server has been stopped.', { type: 'success' });
          resolve(true);
          return;
        }
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          await fetchStatus();
          resolve(false);
        }
      }, 2000);
    });
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async () => {
    if (!window.confirm('⚠️ Are you sure you want to restart the server?')) return;
    setActionLoading(true);
    try {
      await httpClient(`${API_BASE_URL}/server/restart`, { method: 'POST' });
      notify('Server restart initiated. It will be back shortly.', { type: 'success' });
      await pollUntilRunning();
    } catch (err) {
      notify(`Restart failed: ${err.message}`, { type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!window.confirm('⚠️ Are you sure you want to STOP the server?')) return;
    setActionLoading(true);
    try {
      await httpClient(`${API_BASE_URL}/server/stop`, { method: 'POST' });
      notify('Server stop initiated. It will shut down.', { type: 'info' });
      await pollUntilStopped();
    } catch (err) {
      notify(`Stop failed: ${err.message}`, { type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds || isNaN(seconds)) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const formatMemory = (bytes) => {
    if (!bytes) return '0 MB';
    if (bytes > 1024 * 1024 * 1024) {
      return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const isRunning = status?.status === 'Running';

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Server Status
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Typography variant="h6" fontWeight="bold">Health</Typography>
                <Chip
                  label={loading ? 'Loading...' : status?.status || 'Stopped'}
                  color={
                    status?.status === 'Running' ? 'success' :
                    status?.status === 'Degraded' ? 'warning' : 'error'
                  }
                  icon={status?.status === 'Running' ? <CheckCircleIcon /> : <ErrorIcon />}
                />
              </Box>
              <Divider sx={{ my: 2 }} />
              {loading ? (
                <Box display="flex" justifyContent="center" py={4}>
                  <CircularProgress />
                </Box>
              ) : status ? (
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <MetricCard label="PID" value={status.pid} />
                  </Grid>
                  <Grid item xs={6}>
                    <MetricCard label="Uptime" value={formatUptime(status.uptime)} />
                  </Grid>
                  <Grid item xs={6}>
                    <MetricCard label="Node Version" value={status.nodeVersion} />
                  </Grid>
                  <Grid item xs={6}>
                    <MetricCard label="Environment" value={status.env} />
                  </Grid>
                  <Grid item xs={6}>
                    <MetricCard label="Memory (RSS)" value={formatMemory(status.memory?.rss)} />
                  </Grid>
                  <Grid item xs={6}>
                    <MetricCard label="CPU Load" value={status.cpu ? status.cpu.map(v => v.toFixed(2)).join(', ') : 'N/A'} />
                  </Grid>
                  <Grid item xs={12}>
                    <MetricCard label="Hostname" value={status.hostname} />
                  </Grid>
                </Grid>
              ) : (
                <Alert severity="info">Server is currently stopped.</Alert>
              )}
              <Box mt={2} display="flex" gap={1}>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={fetchStatus}
                  disabled={loading}
                >
                  Refresh
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">Server Controls</Typography>
              <Divider sx={{ my: 2 }} />
              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<RestartIcon />}
                  onClick={handleRestart}
                  disabled={actionLoading || loading || !isRunning}
                  fullWidth
                >
                  Restart Server
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={handleStop}
                  disabled={actionLoading || loading || !isRunning}
                  fullWidth
                >
                  Stop Server
                </Button>

                <Alert severity="info" sx={{ mt: 2 }}>
                  <strong>Restart</strong> gracefully restarts the backend container via Docker.
                  <br />
                  <strong>Stop</strong> shuts down the backend completely. Use the restart option to bring it back online.
                </Alert>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ServerStatus;