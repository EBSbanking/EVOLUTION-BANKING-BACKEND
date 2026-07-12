// admin-ui/src/pages/Services/ServicesShow.jsx
import React from 'react';
import {
  Show,
  SimpleShowLayout,
  useShowController,
} from 'react-admin';
import {
  Box,
  CircularProgress,
  Alert,
  Paper,
  Typography,
  Chip,
} from '@mui/material';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

export const ServicesShow = (props) => {
  const { record, isLoading: isShowLoading } = useShowController(props);

  if (isShowLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!record) {
    return (
      <Alert severity="error">
        Service not found. Please try refreshing the list.
      </Alert>
    );
  }

  const isRunning = record.status === 'Running';

  return (
    <Show {...props}>
      <SimpleShowLayout>
        {/* Service Details Card */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Service Details
          </Typography>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}>
            <Box>
              <Typography variant="body2" color="textSecondary">
                ID
              </Typography>
              <Typography variant="body1">
                {record.id}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Name
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {record.name}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Filename
              </Typography>
              <Typography variant="body1">
                <Chip label={record.filename || record.name} size="small" />
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Status
              </Typography>
              <Chip 
                label={record.status || 'Running'} 
                color={isRunning ? 'success' : 'default'}
              />
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Size
              </Typography>
              <Typography variant="body1">
                {record.size ? `${record.size.toLocaleString()} bytes` : 'N/A'}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Last Modified
              </Typography>
              <Typography variant="body1">
                {record.modified ? new Date(record.modified).toLocaleString() : 'N/A'}
              </Typography>
            </Box>
            
            {record.path && (
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="body2" color="textSecondary">
                  File Path
                </Typography>
                <Typography variant="body2" sx={{ 
                  backgroundColor: '#f5f5f5', 
                  p: 1, 
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  wordBreak: 'break-all'
                }}>
                  {record.path || 'N/A'}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>
      </SimpleShowLayout>
    </Show>
  );
};

export default ServicesShow;