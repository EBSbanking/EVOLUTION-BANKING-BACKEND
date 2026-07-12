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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  RestartAlt as RestartIcon,
} from '@mui/icons-material';
import { useNotify, useRedirect } from 'react-admin';

const API_BASE_URL = 'http://localhost:3002/api/admin';

const FrontendStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const notify = useNotify();
  const redirect = useRedirect();

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated. Please log in.');
        setLoading(false);
        notify('Please log in first', { type: 'warning' });
        redirect('/login');
        return;
      }

      const url = `${API_BASE_URL}/frontend/status?_=${Date.now()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });

      if (response.status === 401) {
        setError('Session expired. Please log in again.');
        localStorage.removeItem('token');
        notify('Session expired', { type: 'error' });
        redirect('/login');
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed: ${response.status}`);
      }

      const json = await response.json();
      setStatus(json.data);
      setError(null);
    } catch (err) {
      console.error('Frontend status error:', err);
      setError(err.message || 'Failed to fetch frontend status');
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setDialogOpen(false);
    setRestarting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/frontend/restart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (response.ok) {
        notify(data.message || 'Frontend restart initiated.', { type: 'success' });
        // Wait a moment then refresh status
        setTimeout(fetchStatus, 3000);
      } else {
        throw new Error(data.message || 'Restart failed');
      }
    } catch (err) {
      console.error('Restart error:', err);
      notify(`Restart failed: ${err.message}`, { type: 'error' });
    } finally {
      setRestarting(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusChip = (status) => {
    const config = {
      up: { label: '✅ Up', color: 'success', icon: <CheckCircleIcon /> },
      degraded: { label: '⚠️ Degraded', color: 'warning', icon: <WarningIcon /> },
      down: { label: '❌ Down', color: 'error', icon: <ErrorIcon /> },
      unknown: { label: '❓ Unknown', color: 'default', icon: null },
    };
    const c = config[status] || config.unknown;
    return <Chip label={c.label} color={c.color} icon={c.icon} />;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        🌐 Frontend Status
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Health</Typography>
            {loading ? <CircularProgress size={24} /> : getStatusChip(status?.status)}
          </Box>
          <Divider sx={{ my: 2 }} />

          {status ? (
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold">URL</Typography>
                <Typography variant="body1" noWrap>{status.url}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold">Status Code</Typography>
                <Typography variant="body1">{status.statusCode || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold">Response Time</Typography>
                <Typography variant="body1">{status.responseTime}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold">Last Checked</Typography>
                <Typography variant="body1">{new Date(status.lastChecked).toLocaleTimeString()}</Typography>
              </Grid>
              {status.error && (
                <Grid item xs={12}>
                  <Alert severity="error">{status.error}</Alert>
                </Grid>
              )}
            </Grid>
          ) : (
            <Alert severity="info">No status data available.</Alert>
          )}

          <Box mt={2} display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchStatus}
              disabled={loading || restarting}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              color="warning"
              startIcon={<RestartIcon />}
              onClick={() => setDialogOpen(true)}
              disabled={loading || restarting}
            >
              Restart Frontend
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Restart Frontend?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will restart the frontend application. The service will be temporarily unavailable for a few seconds.
            {status?.url && ` (URL: ${status.url})`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRestart} color="warning" variant="contained">
            Restart
          </Button>
        </DialogActions>
      </Dialog>

      {restarting && (
        <Box mt={2} display="flex" alignItems="center" gap={1}>
          <CircularProgress size={20} />
          <Typography variant="body2">Restarting frontend...</Typography>
        </Box>
      )}
    </Box>
  );
};

export default FrontendStatus;