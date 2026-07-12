// admin-ui/src/pages/Utils/UtilsStatus.jsx
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Grid,
  Alert,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

const API_BASE_URL = 'http://localhost:3002/api/admin';

const UtilsStatus = () => {
  const [utils, setUtils] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUtilsStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/utils/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch utils status');
      const json = await response.json();
      setUtils(json.data || []);
    } catch (err) {
      console.error('Utils fetch error:', err);
      setError(err.message || 'Failed to fetch utils status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUtilsStatus();
  }, []);

  const getStatusChip = (status) => {
    if (status === 'running') {
      return <Chip label="Running" color="success" icon={<CheckCircleIcon />} />;
    } else if (status === 'failed') {
      return <Chip label="Failed" color="error" icon={<ErrorIcon />} />;
    }
    return <Chip label="Unknown" color="default" />;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Utility Files Status
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box mb={2}>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchUtilsStatus}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {loading && utils.length === 0 ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>File Name</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Error (if any)</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {utils.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    No utility files found.
                  </TableCell>
                </TableRow>
              ) : (
                utils.map((util) => (
                  <TableRow key={util.name}>
                    <TableCell>{util.name}</TableCell>
                    <TableCell>{getStatusChip(util.status)}</TableCell>
                    <TableCell>
                      {util.error ? (
                        <Typography variant="body2" color="error">
                          {util.error}
                        </Typography>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default UtilsStatus;