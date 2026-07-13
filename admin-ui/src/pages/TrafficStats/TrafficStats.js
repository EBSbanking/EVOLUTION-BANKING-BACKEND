// admin-ui/src/pages/TrafficStats.js
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  LinearProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  Button,
  Alert,
  CircularProgress,
  Tooltip,
  Fade
} from '@mui/material';
import { styled } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import BarChartIcon from '@mui/icons-material/BarChart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PublicIcon from '@mui/icons-material/Public';
import MemoryIcon from '@mui/icons-material/Memory';

// ✅ Use environment variable or default
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002/api';

const StyledCard = styled(Card)(({ theme }) => ({
  borderRadius: 16,
  boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
  height: '100%',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
  },
}));

const GradientCard = styled(Card)(({ theme }) => ({
  borderRadius: 16,
  height: '100%',
  background: 'linear-gradient(135deg, #1e3a5f 0%, #2a4f7a 100%)',
  color: '#ffffff',
  boxShadow: '0 4px 20px rgba(30, 58, 95, 0.3)',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 8px 30px rgba(30, 58, 95, 0.4)',
  },
}));

const TrafficStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [redisStatus, setRedisStatus] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      // ✅ Use PUBLIC endpoints - NO /admin prefix
      // Check Redis status
      const statusUrl = `${API_BASE_URL}/traffic/status`;
      console.log('📡 Redis status URL:', statusUrl);
      
      try {
        const response = await fetch(statusUrl);
        console.log('📡 Redis status response status:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          setRedisStatus(result);
          console.log('✅ Redis Status:', result);
        } else {
          console.warn('⚠️ Redis status endpoint returned:', response.status);
          setRedisStatus({ 
            redisConnected: false, 
            redisStatus: 'Error',
            statusCode: response.status 
          });
        }
      } catch (err) {
        console.warn('⚠️ Redis status check failed:', err.message);
        setRedisStatus({ redisConnected: false, redisStatus: 'Error', error: err.message });
      }

      // Fetch traffic stats
      const statsUrl = `${API_BASE_URL}/traffic/stats`;
      console.log('📡 Traffic stats URL:', statsUrl);
      const response = await fetch(statsUrl);
      console.log('📡 Traffic stats response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Traffic stats response:', result);
        if (result.success) {
          setStats(result.data);
          setLastUpdated(new Date().toISOString());
        } else {
          setError(result.message || 'Failed to fetch traffic stats');
        }
      } else {
        setError(`Server returned ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      console.error('❌ Error fetching traffic stats:', err);
      setError(err.message || 'Failed to fetch traffic stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: '#e67e22' }} />
      </Box>
    );
  }

  // Extract data from response
  const data = stats || { totalRequests: 0, uniqueRoutes: 0, topRoutes: [] };
  const topRoutes = data.topRoutes || data.allRoutes?.slice(0, 10) || [];
  const totalRequests = data.totalRequests || 0;
  const uniqueRoutes = data.uniqueRoutes || 0;
  const isRedisConnected = redisStatus?.redisConnected || false;

  // Show Redis connection warning
  if (!isRedisConnected && !loading && !error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert 
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={fetchStats}>
              <RefreshIcon fontSize="small" sx={{ mr: 0.5 }} />
              Retry
            </Button>
          }
        >
          <Typography variant="body1" fontWeight="bold">
            Redis Not Connected
          </Typography>
          <Typography variant="body2">
            Traffic monitoring requires Redis. Please ensure Redis is running and restart the backend server.
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
            Status: {redisStatus?.redisStatus || 'Disconnected'}
            {redisStatus?.error && ` - ${redisStatus.error}`}
            {redisStatus?.statusCode && ` (HTTP ${redisStatus.statusCode})`}
          </Typography>
        </Alert>
        
        <Paper sx={{ mt: 3, p: 3, textAlign: 'center' }}>
          <MemoryIcon sx={{ fontSize: 64, color: '#e67e22', opacity: 0.3, mb: 2 }} />
          <Typography variant="h6" color="textSecondary">
            No Traffic Data Available
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Start Redis and make some API requests to see traffic analytics.
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
              Redis Status: {redisStatus?.redisStatus || 'Disconnected'}
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
              Redis Host: {redisStatus?.redisHost || 'localhost'}
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
              Redis Port: {redisStatus?.redisPort || '6379'}
            </Typography>
          </Box>
        </Paper>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert 
          severity="error" 
          action={
            <Button color="inherit" size="small" onClick={fetchStats}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  const topRoute = topRoutes.length > 0 ? topRoutes[0].route : 'N/A';
  const topRouteCount = topRoutes.length > 0 ? topRoutes[0].count : 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' }, 
        mb: 4 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ 
            p: 1.5, 
            borderRadius: 2, 
            background: 'linear-gradient(135deg, #1e3a5f, #2a4f7a)',
            color: '#fff'
          }}>
            <BarChartIcon sx={{ fontSize: 32 }} />
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a2e' }}>
              API Traffic Monitor
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Real-time API usage statistics and performance metrics
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: { xs: 2, sm: 0 } }}>
          <Tooltip title="Auto-refresh every 30 seconds">
            <Chip 
              label={isRedisConnected ? "Live" : "Offline"} 
              color={isRedisConnected ? "success" : "error"} 
              size="small"
              icon={isRedisConnected ? <TrendingUpIcon /> : <MemoryIcon />}
              sx={{ fontWeight: 600 }}
            />
          </Tooltip>
          <Button
            variant="contained"
            size="medium"
            startIcon={<RefreshIcon />}
            onClick={fetchStats}
            disabled={loading}
            sx={{
              background: 'linear-gradient(135deg, #e67e22, #f39c12)',
              '&:hover': {
                background: 'linear-gradient(135deg, #d35400, #e67e22)',
              },
            }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <GradientCard>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.8, mb: 1 }}>
                    Total Requests
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>
                    {totalRequests.toLocaleString() || 0}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    Last 60 seconds
                  </Typography>
                </Box>
                <PublicIcon sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </GradientCard>
        </Grid>

        <Grid item xs={12} md={4}>
          <StyledCard>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Unique Routes
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#1e3a5f' }}>
                    {uniqueRoutes || 0}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Total endpoints hit
                  </Typography>
                </Box>
                <MemoryIcon sx={{ fontSize: 48, color: '#1e3a5f', opacity: 0.2 }} />
              </Box>
            </CardContent>
          </StyledCard>
        </Grid>

        <Grid item xs={12} md={4}>
          <StyledCard>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Top Route
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem', color: '#e67e22' }}>
                    {topRoute}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {topRouteCount} requests
                  </Typography>
                </Box>
                <TrendingUpIcon sx={{ fontSize: 48, color: '#e67e22', opacity: 0.2 }} />
              </Box>
            </CardContent>
          </StyledCard>
        </Grid>
      </Grid>

      {/* Top Routes Table */}
      <Paper sx={{ p: 3, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
            Route Analytics
          </Typography>
          <Chip 
            label={`${topRoutes.length} active routes`} 
            size="small" 
            sx={{ 
              background: 'linear-gradient(135deg, #1e3a5f, #2a4f7a)',
              color: '#fff',
              fontWeight: 600,
            }}
          />
        </Box>
        <Divider sx={{ mb: 3 }} />
        
        {topRoutes.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="textSecondary">
              No traffic data available. Make some API requests to see analytics.
            </Typography>
            {!isRedisConnected && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                ⚠️ Redis is not connected. Traffic monitoring is disabled.
              </Typography>
            )}
          </Box>
        ) : (
          <Fade in timeout={500}>
            <List dense>
              {topRoutes.map((route, index) => {
                const percentage = route.percentage || 
                  (totalRequests > 0 ? ((route.count / totalRequests) * 100).toFixed(1) : 0);
                
                return (
                  <React.Fragment key={route.route}>
                    <ListItem sx={{ py: 1.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            <Chip 
                              label={`#${index + 1}`} 
                              size="small" 
                              color={index === 0 ? 'warning' : index === 1 ? 'info' : 'default'}
                              sx={{ minWidth: 45, fontWeight: 600 }}
                            />
                            <Typography sx={{ 
                              fontWeight: 500, 
                              fontFamily: 'monospace',
                              fontSize: '0.9rem',
                              color: '#1a1a2e'
                            }}>
                              {route.route}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                              <Chip 
                                label={`${route.count} req`} 
                                size="small" 
                                color="primary" 
                                variant="outlined"
                                sx={{ fontWeight: 500 }}
                              />
                              <Chip 
                                label={`${percentage}%`} 
                                size="small" 
                                sx={{ 
                                  background: percentage > 50 
                                    ? 'linear-gradient(135deg, #e67e22, #f39c12)' 
                                    : 'linear-gradient(135deg, #1e3a5f, #3498db)',
                                  color: '#fff',
                                  fontWeight: 600,
                                }}
                              />
                            </Box>
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 1, maxWidth: '100%' }}>
                            <LinearProgress 
                              variant="determinate" 
                              value={Math.min(percentage, 100)} 
                              sx={{ 
                                height: 6, 
                                borderRadius: 3,
                                backgroundColor: 'rgba(0,0,0,0.06)',
                                '& .MuiLinearProgress-bar': {
                                  background: index === 0 
                                    ? 'linear-gradient(90deg, #e67e22, #f39c12)' 
                                    : index === 1
                                    ? 'linear-gradient(90deg, #1e3a5f, #2a4f7a)'
                                    : 'linear-gradient(90deg, #3498db, #85c1e9)',
                                  borderRadius: 3,
                                }
                              }}
                            />
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < topRoutes.length - 1 && <Divider variant="inset" sx={{ ml: 7 }} />}
                  </React.Fragment>
                );
              })}
            </List>
          </Fade>
        )}
      </Paper>

      {/* Redis Status & Timestamp */}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip 
            label={isRedisConnected ? "Redis Connected ✅" : "Redis Disconnected ❌"} 
            size="small"
            color={isRedisConnected ? "success" : "error"}
            variant="outlined"
          />
          <Typography variant="caption" color="textSecondary">
            Host: {redisStatus?.redisHost || 'localhost'}:{redisStatus?.redisPort || '6379'}
          </Typography>
        </Box>
        <Typography variant="caption" color="textSecondary">
          Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Never'}
        </Typography>
      </Box>
    </Box>
  );
};

export default TrafficStats;