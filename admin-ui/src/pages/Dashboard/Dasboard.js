import React, { useEffect, useState } from 'react';
import { useDataProvider } from 'react-admin';
import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import CancelIcon from '@mui/icons-material/Cancel';

const healthIcons = {
  OK: <CheckCircleIcon color="success" />,
  WARNING: <WarningIcon color="warning" />,
  CRITICAL: <ErrorIcon color="error" />,
  FAILED: <CancelIcon color="error" />,
};

const SystemStatus = () => {
  const dataProvider = useDataProvider();
  const [counts, setCounts] = useState({ OK: 0, WARNING: 0, CRITICAL: 0, FAILED: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dataProvider.getList('servers', { pagination: { page: 1, perPage: 100 } })
      .then(({ data }) => {
        const healthCounts = { OK: 0, WARNING: 0, CRITICAL: 0, FAILED: 0 };
        data.forEach(server => {
          const h = server.health || 'UNKNOWN';
          if (healthCounts.hasOwnProperty(h)) healthCounts[h]++;
        });
        setCounts(healthCounts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [dataProvider]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Card sx={{ mb: 2, p: 1, bgcolor: 'background.paper' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>System Status</Typography>
        {loading ? (
          <Typography>Loading health status...</Typography>
        ) : (
          <Grid container spacing={2}>
            {Object.entries(healthIcons).map(([status, icon]) => (
              <Grid item xs={3} key={status}>
                <Box display="flex" alignItems="center">
                  {icon}
                  <Typography variant="body1" sx={{ ml: 1 }}>
                    {status} ({counts[status] || 0})
                  </Typography>
                </Box>
              </Grid>
            ))}
            <Grid item xs={3}>
              <Typography variant="body2" color="textSecondary">
                Total: {total}
              </Typography>
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );
};

export default SystemStatus;