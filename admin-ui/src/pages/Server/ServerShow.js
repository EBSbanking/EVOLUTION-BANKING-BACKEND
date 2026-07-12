import React, { useState, useEffect } from 'react';
import { Show, SimpleShowLayout, TextField, useShowController } from 'react-admin';
import { Card, CardContent, Typography, Box, Chip, Grid, CircularProgress, Alert } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import CancelIcon from '@mui/icons-material/Cancel';

const healthMap = {
  OK: { color: 'success', icon: <CheckCircleIcon /> },
  WARNING: { color: 'warning', icon: <WarningIcon /> },
  CRITICAL: { color: 'error', icon: <ErrorIcon /> },
  FAILED: { color: 'error', icon: <CancelIcon /> },
};

const StateChip = ({ state }) => (
  <Chip
    label={state}
    color={state === 'RUNNING' ? 'success' : state === 'DEGRADED' ? 'warning' : 'default'}
    size="small"
  />
);

const HealthChip = ({ health }) => {
  const { color, icon } = healthMap[health] || { color: 'default', icon: null };
  return <Chip label={health} color={color} icon={icon} size="small" variant="outlined" />;
};

const formatUptime = (seconds) => {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
};

const formatMemory = (bytes) => {
  if (!bytes) return 'N/A';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
};

const ServerDetails = ({ details }) => {
  if (!details) return <Typography variant="body2" color="textSecondary">No additional details available</Typography>;
  return (
    <Grid container spacing={2}>
      <Grid item xs={6}><strong>PID</strong><br/>{details.pid || 'N/A'}</Grid>
      <Grid item xs={6}><strong>Uptime</strong><br/>{formatUptime(details.uptime)}</Grid>
      <Grid item xs={6}><strong>Node Version</strong><br/>{details.nodeVersion || 'N/A'}</Grid>
      <Grid item xs={6}><strong>Environment</strong><br/>{details.env || 'N/A'}</Grid>
      <Grid item xs={6}><strong>Memory (RSS)</strong><br/>{formatMemory(details.memory?.rss)}</Grid>
      <Grid item xs={6}><strong>CPU Load</strong><br/>{details.cpu ? details.cpu.map(v => v.toFixed(2)).join(', ') : 'N/A'}</Grid>
      <Grid item xs={6}><strong>Hostname</strong><br/>{details.hostname || 'N/A'}</Grid>
    </Grid>
  );
};

const ServerShow = props => {
  const { record, isLoading } = useShowController(props);
  if (isLoading) return <CircularProgress />;
  if (!record) return <Alert severity="warning">Server not found</Alert>;

  return (
    <Show {...props}>
      <SimpleShowLayout>
        <Card sx={{ mt: 2, p: 2 }}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography variant="h5">{record.name}</Typography>
              <Box>
                <StateChip state={record.state} />
                <HealthChip health={record.health} />
              </Box>
            </Box>
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={6}><strong>Type</strong><br/>{record.type}</Grid>
              <Grid item xs={6}><strong>Listen Port</strong><br/>{record.listenPort}</Grid>
              <Grid item xs={6}><strong>Cluster</strong><br/>{record.cluster || 'Standalone'}</Grid>
              <Grid item xs={6}><strong>Machine</strong><br/>{record.machine || '-'}</Grid>
            </Grid>
            <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>Health Details</Typography>
            <ServerDetails details={record.details} />
          </CardContent>
        </Card>
      </SimpleShowLayout>
    </Show>
  );
};

export default ServerShow;