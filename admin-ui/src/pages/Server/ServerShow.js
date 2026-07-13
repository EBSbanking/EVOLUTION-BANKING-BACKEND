// admin-ui/src/pages/Server/ServerShow.js
import React from 'react';
import { Show, SimpleShowLayout, TextField, useShowController } from 'react-admin';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  Chip, 
  Grid, 
  CircularProgress, 
  Alert,
  Divider,
  Paper,
  LinearProgress
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import CancelIcon from '@mui/icons-material/Cancel';

const healthMap = {
  OK: { color: 'success', icon: <CheckCircleIcon />, label: 'Healthy' },
  WARNING: { color: 'warning', icon: <WarningIcon />, label: 'Warning' },
  CRITICAL: { color: 'error', icon: <ErrorIcon />, label: 'Critical' },
  FAILED: { color: 'error', icon: <CancelIcon />, label: 'Failed' },
};

const StateChip = ({ state }) => {
  const getColor = () => {
    if (state === 'RUNNING') return 'success';
    if (state === 'DEGRADED') return 'warning';
    if (state === 'STOPPED') return 'error';
    return 'default';
  };
  return <Chip label={state || 'UNKNOWN'} color={getColor()} size="small" />;
};

const HealthChip = ({ health }) => {
  const { color, icon, label } = healthMap[health] || { color: 'default', icon: null, label: health || 'UNKNOWN' };
  return <Chip label={label} color={color} icon={icon} size="small" variant="outlined" />;
};

const formatUptime = (seconds) => {
  if (!seconds) return 'N/A';
  if (typeof seconds === 'string') return seconds;
  const numSeconds = Number(seconds);
  if (isNaN(numSeconds) || numSeconds === 0) return 'N/A';
  
  const days = Math.floor(numSeconds / 86400);
  const hours = Math.floor((numSeconds % 86400) / 3600);
  const minutes = Math.floor((numSeconds % 3600) / 60);
  const secs = Math.floor(numSeconds % 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

const formatMemory = (bytes) => {
  if (!bytes) return 'N/A';
  if (typeof bytes === 'string') return bytes;
  
  // If it's an object, try to extract bytes
  if (typeof bytes === 'object') {
    if (bytes.bytes) bytes = bytes.bytes;
    else if (bytes.rss) bytes = bytes.rss;
    else if (bytes.heapUsed) bytes = bytes.heapUsed;
    else if (bytes.heapTotal) bytes = bytes.heapTotal;
    else if (bytes.external) bytes = bytes.external;
    else return 'N/A';
  }
  
  const numBytes = Number(bytes);
  if (isNaN(numBytes) || numBytes === 0) return '0 B';
  
  if (numBytes > 1024 * 1024 * 1024) {
    return (numBytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  if (numBytes > 1024 * 1024) {
    return (numBytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  if (numBytes > 1024) {
    return (numBytes / 1024).toFixed(2) + ' KB';
  }
  return numBytes + ' B';
};

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

const MemoryUsageBar = ({ label, used, total }) => {
  const usedBytes = Number(used) || 0;
  const totalBytes = Number(total) || 1;
  const percentage = (usedBytes / totalBytes) * 100;
  const getColor = () => {
    if (percentage > 90) return 'error';
    if (percentage > 70) return 'warning';
    return 'success';
  };
  
  return (
    <Box sx={{ mb: 1 }}>
      <Box display="flex" justifyContent="space-between">
        <Typography variant="caption">{label}</Typography>
        <Typography variant="caption" color="textSecondary">
          {formatMemory(usedBytes)} / {formatMemory(totalBytes)}
        </Typography>
      </Box>
      <LinearProgress 
        variant="determinate" 
        value={Math.min(percentage, 100)} 
        color={getColor()}
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  );
};

const ServerDetails = ({ details }) => {
  if (!details) {
    return <Typography variant="body2" color="textSecondary">No additional details available</Typography>;
  }

  const memory = details.memory || {};
  const cpu = details.cpu || {};
  
  return (
    <Box>
      {/* Basic Info */}
      <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
        System Information
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={6} sm={4} md={3}>
          <MetricCard label="PID" value={details.pid} />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <MetricCard label="Uptime" value={details.uptime?.formatted || formatUptime(details.uptime)} />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <MetricCard label="Node Version" value={details.nodeVersion} />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <MetricCard label="Environment" value={details.environment} />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <MetricCard label="Hostname" value={details.hostname} />
        </Grid>
        <Grid item xs={6} sm={4} md={3}>
          <MetricCard label="Response Time" value={details.responseTime ? `${details.responseTime}ms` : 'N/A'} />
        </Grid>
      </Grid>

      {/* Memory Usage */}
      {memory && (memory.rss || memory.heapTotal) && (
        <>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 3, mb: 1 }}>
            Memory Usage
          </Typography>
          <Card variant="outlined" sx={{ p: 2, bgcolor: '#fafafa' }}>
            <MemoryUsageBar 
              label="RSS" 
              used={memory.rss?.bytes || memory.rss || 0} 
              total={memory.rss?.bytes || memory.rss || 0} 
            />
            <MemoryUsageBar 
              label="Heap Total" 
              used={memory.heapUsed?.bytes || memory.heapUsed || 0} 
              total={memory.heapTotal?.bytes || memory.heapTotal || 0} 
            />
            {memory.external && (
              <MemoryUsageBar 
                label="External" 
                used={memory.external?.bytes || memory.external || 0} 
                total={memory.external?.bytes || memory.external || 0} 
              />
            )}
          </Card>
        </>
      )}

      {/* CPU Info */}
      {cpu && (cpu.user || cpu.system) && (
        <>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 3, mb: 1 }}>
            CPU Usage
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4}>
              <MetricCard 
                label="User" 
                value={cpu.formatted?.user || (cpu.user ? `${(Number(cpu.user) / 1000000).toFixed(2)}ms` : 'N/A')} 
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <MetricCard 
                label="System" 
                value={cpu.formatted?.system || (cpu.system ? `${(Number(cpu.system) / 1000000).toFixed(2)}ms` : 'N/A')} 
              />
            </Grid>
          </Grid>
        </>
      )}

      {/* Load Average */}
      {details.loadAverage && (
        <>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 3, mb: 1 }}>
            Load Average
          </Typography>
          <Grid container spacing={2}>
            {Array.isArray(details.loadAverage) ? (
              <Grid item xs={12}>
                <MetricCard 
                  label="Load Average (1, 5, 15 min)" 
                  value={details.loadAverage.map(l => Number(l).toFixed(2)).join(', ')} 
                />
              </Grid>
            ) : (
              <Grid item xs={12}>
                <MetricCard label="Load Average" value={String(details.loadAverage)} />
              </Grid>
            )}
          </Grid>
        </>
      )}
    </Box>
  );
};

const ServerShow = props => {
  const { record, isLoading } = useShowController(props);
  
  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={8}>
        <CircularProgress />
      </Box>
    );
  }
  
  if (!record) {
    return <Alert severity="warning">Server not found</Alert>;
  }

  return (
    <Show {...props}>
      <SimpleShowLayout>
        <Card sx={{ mt: 2, p: 2, borderRadius: 3 }}>
          <CardContent>
            {/* Header */}
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
              <Box>
                <Typography variant="h5" fontWeight="bold">{record.name}</Typography>
                <Typography variant="body2" color="textSecondary">
                  {record.type} · Port {record.listenPort}
                </Typography>
              </Box>
              <Box display="flex" gap={1}>
                <StateChip state={record.state} />
                <HealthChip health={record.health} />
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Server Info */}
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 2 }}>
              Server Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4} md={3}>
                <MetricCard label="Type" value={record.type} />
              </Grid>
              <Grid item xs={6} sm={4} md={3}>
                <MetricCard label="Listen Port" value={record.listenPort} />
              </Grid>
              <Grid item xs={6} sm={4} md={3}>
                <MetricCard label="Cluster" value={record.cluster || 'Standalone'} />
              </Grid>
              <Grid item xs={6} sm={4} md={3}>
                <MetricCard label="Machine" value={record.machine || '-'} />
              </Grid>
            </Grid>

            {/* Health Details */}
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 4, mb: 2 }}>
              Health Details
            </Typography>
            <ServerDetails details={record.details} />
          </CardContent>
        </Card>
      </SimpleShowLayout>
    </Show>
  );
};

export default ServerShow;