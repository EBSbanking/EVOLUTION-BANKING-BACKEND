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

const ServerStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const notify = useNotify();
  const navigate = useNavigate();

  // ---------- FETCH STATUS (with correct extraction) ----------
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
      // The httpClient wrapper has { status, headers, body, json: { data: ... } }
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

  // ---------- POLLING FUNCTIONS (also corrected) ----------
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

  // ---------- EFFECTS ----------
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // ---------- HANDLERS ----------
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

  // ---------- HELPERS ----------
  const formatUptime = (seconds) => {
    if (!seconds || isNaN(seconds)) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  };

  const formatMemory = (bytes) => {
    if (!bytes) return '0 MB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const isRunning = status?.status === 'Running';

  // ---------- RENDER ----------
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
          <Card sx={{ height: '100%' }}>
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
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">PID</Typography>
                    <Typography variant="body1">{status.pid || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">Uptime</Typography>
                    <Typography variant="body1">{formatUptime(status.uptime)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">Node Version</Typography>
                    <Typography variant="body1">{status.nodeVersion || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">Environment</Typography>
                    <Typography variant="body1">{status.env || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">Memory (RSS)</Typography>
                    <Typography variant="body1">{formatMemory(status.memory?.rss)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">CPU Load</Typography>
                    <Typography variant="body1">{status.cpu ? status.cpu.map(v => v.toFixed(2)).join(', ') : 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="caption" color="textSecondary" fontWeight="bold">Hostname</Typography>
                    <Typography variant="body1">{status.hostname || 'N/A'}</Typography>
                  </Grid>
                  {status.health && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="textSecondary" fontWeight="bold">Health Details</Typography>
                      <pre style={{ fontSize: '0.8rem', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                        {JSON.stringify(status.health, null, 2)}
                      </pre>
                    </Grid>
                  )}
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
          <Card sx={{ height: '100%' }}>
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
                >
                  Restart Server
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={handleStop}
                  disabled={actionLoading || loading || !isRunning}
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