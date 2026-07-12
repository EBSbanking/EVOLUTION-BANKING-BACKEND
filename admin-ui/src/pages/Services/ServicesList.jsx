// admin-ui/src/pages/Services/ServicesList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  useNotify,
  Button,
} from 'react-admin';
import {
  Box,
  Paper,
  TableContainer,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { green, red } from '@mui/material/colors';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

export const ServicesList = () => {
  const notify = useNotify();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        notify('Please log in again', { type: 'warning' });
        setLoading(false);
        return;
      }

      const response = await httpClient(`${API_BASE_URL}/services`);
      console.log('✅ Services response:', response);
      
      let data = response.json || response;
      
      if (data && data.data && Array.isArray(data.data)) {
        data = data.data;
      } else if (Array.isArray(data)) {
        // Already an array
      } else if (data && typeof data === 'object' && !Array.isArray(data)) {
        data = Object.values(data);
      }
      
      if (Array.isArray(data) && data.length > 0) {
        setServices(data);
        console.log(`✅ Loaded ${data.length} services`);
      } else {
        setServices([]);
        setError('No services found in the services directory');
      }
    } catch (err) {
      console.error('❌ Failed to fetch services:', err);
      setError(err.message || 'Failed to fetch services');
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 60000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert 
        severity="error" 
        onClose={() => setError(null)}
        action={
          <Button 
            label="Retry" 
            onClick={fetchServices}
            color="inherit"
            size="small"
          />
        }
      >
        {error}
      </Alert>
    );
  }

  if (services.length === 0) {
    return (
      <Alert 
        severity="info"
        action={
          <Button 
            label="Refresh" 
            onClick={fetchServices}
            color="inherit"
            size="small"
          />
        }
      >
        No services found in the services directory.
      </Alert>
    );
  }

  return (
    <Box>
      <Box mb={2} display="flex" justifyContent="space-between" alignItems="center">
        <Typography variant="h6">
          Services ({services.length})
        </Typography>
        <Button
          label="Refresh"
          onClick={fetchServices}
          startIcon={<RefreshIcon />}
        />
      </Box>

      <TableContainer component={Paper}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold' }}>ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold' }}>Service Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold' }}>Filename</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold' }}>Size (bytes)</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold' }}>Last Modified</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => {
              const isRunning = service.status === 'Running';
              return (
                <tr 
                  key={service.id || service.name}
                  style={{ 
                    borderBottom: '1px solid #e0e0e0',
                    backgroundColor: isRunning ? '#f1f8e9' : '#f5f5f5',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    window.location.href = `#/services/${service.id}/show`;
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isRunning ? '#dcedc8' : '#eeeeee';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isRunning ? '#f1f8e9' : '#f5f5f5';
                  }}
                >
                  <td style={{ padding: '12px 16px' }}>{service.id}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{service.name}</td>
                  <td style={{ padding: '12px 16px' }}>{service.filename}</td>
                  <td style={{ padding: '12px 16px' }}>{service.size?.toLocaleString() || 'N/A'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {service.modified ? new Date(service.modified).toLocaleString() : 'N/A'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      backgroundColor: isRunning ? green[100] : red[100],
                      color: isRunning ? green[900] : red[900],
                      padding: '4px 12px',
                      borderRadius: '16px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      display: 'inline-block',
                    }}>
                      {service.status || 'Unknown'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableContainer>
    </Box>
  );
};

export default ServicesList;