import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { useNotify } from 'react-admin';

const API_BASE_URL = 'http://localhost:3002/api/admin';

const TrafficMonitor = () => {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const notify = useNotify();

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      
      // ✅ Cache‑busting to prevent 304 responses
      const url = `${API_BASE_URL}/traffic?_=${Date.now()}`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });

      // If response is 304, treat as success with empty data
      if (response.status === 304) {
        setStats([]);
        setLastUpdated(new Date().toLocaleTimeString());
        setLoading(false);
        return;
      }

      // For any other non‑200, try to read the error message
      if (!response.ok) {
        let errorMessage = `Server returned ${response.status}`;
        try {
          const text = await response.text();
          if (text) errorMessage += `: ${text}`;
        } catch (_) { /* ignore */ }
        throw new Error(errorMessage);
      }

      // Parse JSON response
      let json;
      try {
        json = await response.json();
      } catch (parseError) {
        // If JSON parsing fails, try to get the raw text for debugging
        const rawText = await response.text();
        console.warn('Raw response:', rawText);
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }

      setStats(json.data || []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Traffic fetch error:', err);
      setError(err.message || 'Failed to fetch traffic stats');
      notify(`Traffic error: ${err.message}`, { type: 'error' });
      // Keep existing stats (don't clear them) on error
    } finally {
      setLoading(false);
    }
  };

  // Auto‑refresh every 30 seconds
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const sortedStats = [...stats].sort((a, b) => b.count - a.count);
  const totalRequests = sortedStats.reduce((sum, item) => sum + item.count, 0);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        📊 Traffic Monitor
      </Typography>

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="body2" color="textSecondary">
          Requests per route since last reset (auto‑resets every 60 seconds)
          {lastUpdated && (
            <span style={{ marginLeft: 16 }}>
              Last updated: <strong>{lastUpdated}</strong>
            </span>
          )}
          {totalRequests > 0 && (
            <span style={{ marginLeft: 16 }}>
              Total requests: <strong>{totalRequests}</strong>
            </span>
          )}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchStats}
          disabled={loading}
          size="small"
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: 'primary.main' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Route</TableCell>
                <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold' }}>
                  Request Count
                </TableCell>
                <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold' }}>
                  % of Total
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                    <Typography variant="body1" color="textSecondary">
                      {error ? 'Unable to load traffic data. Please try again.' : 'No traffic recorded yet. Make some API requests to see stats.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sortedStats.map((item, index) => {
                  const percentage = totalRequests > 0
                    ? ((item.count / totalRequests) * 100).toFixed(1)
                    : 0;

                  return (
                    <TableRow
                      key={item.route}
                      sx={{
                        bgcolor: index % 2 === 0 ? 'action.hover' : 'inherit',
                        '&:hover': { bgcolor: 'action.selected' },
                      }}
                    >
                      <TableCell component="th" scope="row">
                        <Typography variant="body2" fontWeight="medium">
                          {item.route}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="bold" color="primary">
                          {item.count}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="textSecondary">
                          {percentage}%
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!loading && sortedStats.length > 0 && (
        <Box mt={2}>
          <Typography variant="caption" color="textSecondary">
            ⚡ Top route: <strong>{sortedStats[0]?.route}</strong> with{' '}
            <strong>{sortedStats[0]?.count}</strong> requests
            {totalRequests > 0 && (
              <> ({((sortedStats[0]?.count / totalRequests) * 100).toFixed(1)}% of total)</>
            )}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default TrafficMonitor;