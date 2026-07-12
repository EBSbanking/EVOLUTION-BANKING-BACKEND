import React from 'react';
import {
  List,
  Datagrid,
  TextField,
  FunctionField,
  useListContext,
  Pagination,
} from 'react-admin';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Chip,
  Paper,
  Divider,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import CancelIcon from '@mui/icons-material/Cancel';

// ----- Health status mapping -----
const healthMap = {
  OK: { color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  WARNING: { color: 'warning', icon: <WarningIcon fontSize="small" /> },
  CRITICAL: { color: 'error', icon: <ErrorIcon fontSize="small" /> },
  FAILED: { color: 'error', icon: <CancelIcon fontSize="small" /> },
};

// ----- System Status Summary -----
const SystemStatusSummary = () => {
  const { data } = useListContext();
  if (!data || data.length === 0) return null;

  const counts = { OK: 0, WARNING: 0, CRITICAL: 0, FAILED: 0 };
  data.forEach(server => {
    const h = server.health || 'UNKNOWN';
    if (counts.hasOwnProperty(h)) counts[h]++;
  });

  const total = data.length;

  return (
    <Card sx={{ mb: 3, bgcolor: 'background.paper' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>System Status</Typography>
        <Grid container spacing={2} alignItems="center">
          {Object.entries(healthMap).map(([status, { color, icon }]) => (
            <Grid item key={status}>
              <Box display="flex" alignItems="center">
                {icon}
                <Typography variant="body2" sx={{ ml: 0.5 }}>
                  {status} <strong>({counts[status] || 0})</strong>
                </Typography>
              </Box>
            </Grid>
          ))}
          <Grid item>
            <Divider orientation="vertical" flexItem />
          </Grid>
          <Grid item>
            <Typography variant="body2" color="textSecondary">
              Total: {total}
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

// ----- Change Center -----
const ChangeCenter = () => (
  <Paper sx={{ p: 2, mb: 3, bgcolor: '#fafafa' }}>
    <Typography variant="subtitle2" fontWeight="bold">Change Center</Typography>
    <Typography variant="body2" color="textSecondary">
      Configuration editing is enabled. Future changes will automatically be activated as you modify, add or delete items in this domain.
    </Typography>
    <Box mt={1}>
      <Chip label="View changes and restarts" size="small" clickable />
    </Box>
  </Paper>
);

// ----- Main Server List -----
export const ServerList = props => (
  <List
    {...props}
    title="Summary of Servers"
    sort={{ field: 'name', order: 'ASC' }}
    perPage={10}
    pagination={<Pagination rowsPerPageOptions={[5, 10, 25]} />}
  >
    <Box sx={{ p: 2 }}>
      <ChangeCenter />
      <SystemStatusSummary />
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="name" label="Name" sortable />
        <TextField source="type" label="Type" />

        {/* 🆕 Cluster: show "Standalone" if null */}
        <FunctionField
          label="Cluster"
          sortBy="cluster"
          render={record => record?.cluster || 'Standalone'}
        />

        {/* 🆕 Machine: show "-" if null */}
        <FunctionField
          label="Machine"
          sortBy="machine"
          render={record => record?.machine || '-'}
        />

        <FunctionField
          label="State"
          sortBy="state"
          render={record => {
            const state = record?.state || 'UNKNOWN';
            return <Chip label={state} color={state === 'RUNNING' ? 'success' : 'default'} size="small" />;
          }}
        />
        <FunctionField
          label="Health"
          sortBy="health"
          render={record => {
            const health = record?.health || 'UNKNOWN';
            const { color, icon } = healthMap[health] || { color: 'default', icon: null };
            return <Chip label={health} color={color} icon={icon} size="small" variant="outlined" />;
          }}
        />
        <TextField source="listenPort" label="Listen Port" />
      </Datagrid>
    </Box>
  </List>
);