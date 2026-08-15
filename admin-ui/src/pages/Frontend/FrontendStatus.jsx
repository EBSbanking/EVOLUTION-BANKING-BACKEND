// /admin-ui/src/pages/Frontend/FrontendStatus.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Paper,
  Chip,
  Button,
  CircularProgress,
  Alert,
  AlertTitle,
  Divider,
  LinearProgress,
  Stack,
  Tooltip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Public as PublicIcon,
  Storage as StorageIcon,
  Speed as SpeedIcon,
  Schedule as ScheduleIcon,
  Memory as MemoryIcon,
  Code as CodeIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../../config';
import { useNotify } from 'react-admin';

const FrontendStatus = () => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const notify = useNotify();

  // Helper function to make API calls
  const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          ...options.headers
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  };

  // Fetch frontend status
  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE_URL}/frontend/status?_=${Date.now()}`;
      console.log('🔍 Fetching frontend status from:', url);
      
      const response = await fetchWithTimeout(url);
      console.log('📊 Frontend Status Response:', response);

      // Extract data from response
      const data = response?.data || response;
      
      // Check if we got the frontend health response
      // Your backend returns: {"status":"OK","message":"Evolution Banking Frontend is running","timestamp":"2026-08-14T09:55:01.210Z"}
      // But your frontend-status endpoint returns: { data: { status: 'up', ... } }
      
      // Determine if frontend is healthy
      const isHealthy = data?.status === 'up' || data?.status === 'OK' || data?.status === 'healthy';
      
      setStatus({
        ...data,
        healthy: isHealthy,
        timestamp: data?.timestamp || data?.lastChecked || new Date().toISOString(),
      });
      
      setLastCheck(new Date().toISOString());
      
      notify('Frontend status updated', { type: 'success' });
    } catch (error) {
      console.error('❌ Failed to fetch frontend status:', error);
      setError(error.message || 'Failed to fetch frontend status');
      
      // Set fallback status
      setStatus({
        status: 'unknown',
        message: error.message || 'Unable to reach frontend',
        healthy: false,
        timestamp: new Date().toISOString(),
        error: error.message,
      });
      
      notify('Failed to fetch frontend status', { type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Get status color
  const getStatusColor = (statusValue) => {
    if (statusValue === 'up' || statusValue === 'OK' || statusValue === 'healthy') return 'success';
    if (statusValue === 'degraded') return 'warning';
    if (statusValue === 'down' || statusValue === 'error') return 'error';
    return 'default';
  };

  // Get status icon
  const getStatusIcon = (statusValue) => {
    if (statusValue === 'up' || statusValue === 'OK' || statusValue === 'healthy') {
      return <CheckCircleIcon sx={{ fontSize: 60, color: '#4caf50' }} />;
    }
    if (statusValue === 'degraded') {
      return <WarningIcon sx={{ fontSize: 60, color: '#ff9800' }} />;
    }
    if (statusValue === 'down' || statusValue === 'error') {
      return <ErrorIcon sx={{ fontSize: 60, color: '#f44336' }} />;
    }
    return <PublicIcon sx={{ fontSize: 60, color: '#9e9e9e' }} />;
  };

  // Loading state
  if (loading && !status) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Frontend Status Dashboard
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="caption" color="textSecondary">
            Last checked: {lastCheck ? new Date(lastCheck).toLocaleString() : 'Never'}
          </Typography>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={fetchStatus}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      )}

      {/* Main Status Card */}
      <Paper elevation={3} sx={{ p: 3, mb: 3, bgcolor: status?.healthy ? '#f0fdf4' : '#fef2f2' }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={3} sx={{ textAlign: 'center' }}>
            {getStatusIcon(status?.status)}
            <Typography variant="h6" sx={{ mt: 1 }}>
              {status?.status?.toUpperCase() || 'UNKNOWN'}
            </Typography>
            <Chip
              label={status?.healthy ? 'Healthy' : 'Unhealthy'}
              color={status?.healthy ? 'success' : 'error'}
              size="small"
            />
          </Grid>
          <Grid item xs={12} md={9}>
            <Typography variant="h5" gutterBottom>
              {status?.message || 'Frontend Application'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              URL: {status?.url || process.env.FRONTEND_URL || 'http://localhost:3000'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Status Code: {status?.statusCode || 'N/A'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Response Time: {status?.responseTime || 'N/A'}
            </Typography>
            {status?.containerStatus && (
              <Typography variant="body2" color="textSecondary">
                Container: {status.containerStatus}
              </Typography>
            )}
            {status?.timestamp && (
              <Typography variant="caption" color="textSecondary">
                Timestamp: {new Date(status.timestamp).toLocaleString()}
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* Status Cards Grid */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* System Status */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <StorageIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">System Status</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="textSecondary">Status</Typography>
                  <Chip
                    label={status?.status || 'Unknown'}
                    color={getStatusColor(status?.status)}
                    size="small"
                  />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="textSecondary">Health</Typography>
                  <Chip
                    label={status?.healthy ? 'Healthy' : 'Unhealthy'}
                    color={status?.healthy ? 'success' : 'error'}
                    size="small"
                  />
                </Box>
                {status?.uptime && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="textSecondary">Uptime</Typography>
                    <Typography variant="body2">
                      {Math.floor(status.uptime / 3600)}h {Math.floor((status.uptime % 3600) / 60)}m
                    </Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Metrics */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <SpeedIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Performance</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="textSecondary">Response Time</Typography>
                  <Typography variant="body2">{status?.responseTime || 'N/A'}</Typography>
                </Box>
                {status?.memoryUsage && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="textSecondary">Memory Usage</Typography>
                    <Typography variant="body2">
                      {Math.round(status.memoryUsage.heapUsed / 1024 / 1024)}MB
                    </Typography>
                  </Box>
                )}
                {status?.memoryUsage && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="textSecondary">Memory Total</Typography>
                    <Typography variant="body2">
                      {Math.round(status.memoryUsage.heapTotal / 1024 / 1024)}MB
                    </Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Frontend Details */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PublicIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Frontend Details</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="textSecondary">Version</Typography>
                  <Typography variant="body2">{status?.version || 'N/A'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="textSecondary">Docker Check</Typography>
                  <Typography variant="body2">
                    {status?.skipDockerCheck ? 'Skipped' : 'Enabled'}
                  </Typography>
                </Box>
                {status?.error && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="error">Error</Typography>
                    <Typography variant="body2" color="error" sx={{ maxWidth: '60%' }}>
                      {status.error}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Health Check Details */}
      {status?.healthCheck && Object.keys(status.healthCheck).length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Health Check Details
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Property</TableCell>
                  <TableCell>Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(status.healthCheck).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell>{key}</TableCell>
                    <TableCell>
                      {typeof value === 'object' 
                        ? JSON.stringify(value, null, 2)
                        : String(value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Full Response Data */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Raw Response Data</Typography>
          <Tooltip title="Copy to clipboard">
            <IconButton
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(status, null, 2));
                notify('Copied to clipboard', { type: 'info' });
              }}
            >
              <CodeIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <Box
          sx={{
            bgcolor: '#1e1e1e',
            color: '#d4d4d4',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            maxHeight: 400,
            fontFamily: 'monospace',
            fontSize: '0.8rem',
          }}
        >
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(status, null, 2)}
          </pre>
        </Box>
      </Paper>
    </Box>
  );
};

export default FrontendStatus;