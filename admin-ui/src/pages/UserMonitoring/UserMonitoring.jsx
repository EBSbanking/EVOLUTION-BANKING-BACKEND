// admin-ui/src/pages/UserMonitoring/UserMonitoring.jsx

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Grid,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Avatar,
  Stack,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  MenuItem,
  Button as MuiButton,
  InputAdornment,
  Alert,
  Snackbar,
  Tab,
  Tabs,
  Badge,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Person as PersonIcon,
  Devices as DevicesIcon,
  AccessTime as AccessTimeIcon,
  LocationOn as LocationOnIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  People as PeopleIcon,
  Storage as StorageIcon,
  Security as SecurityIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  Visibility as VisibilityIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  VpnKey as VpnKeyIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  Work as WorkIcon,
  Badge as BadgeIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../../config';
import { httpClient } from '../../App';

// =============================================
// STATS CARDS
// =============================================
const StatsCard = ({ title, value, icon, color, subtitle }) => (
  <Card sx={{ height: '100%', minWidth: 200 }}>
    <CardContent>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h4" fontWeight="bold">
            {value}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="textSecondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Avatar sx={{ bgcolor: color || 'primary.main', width: 48, height: 48 }}>
          {icon}
        </Avatar>
      </Box>
    </CardContent>
  </Card>
);

// =============================================
// SESSION STATUS CHIP
// =============================================
const SessionStatusChip = ({ lastActivity }) => {
  const idleTime = Date.now() - new Date(lastActivity).getTime();
  const isIdle = idleTime > 15 * 60 * 1000; // 15 minutes idle
  const status = isIdle ? 'idle' : 'active';
  
  const colors = {
    active: 'success',
    idle: 'warning',
    expired: 'error',
    terminated: 'error',
  };
  return <Chip label={status} color={colors[status] || 'default'} size="small" />;
};

// =============================================
// UNLOCK FORCE-LOCK BUTTON (Quick Action)
// =============================================
const UnlockForceLockButton = ({ userId, userName, onUnlock }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');

  const handleUnlock = async () => {
    setLoading(true);
    try {
      const identifier = userName || userId;
      const url = `${API_BASE_URL}/users/unlock-force-locked/${identifier}`;
      console.log('🔓 Unlock force-lock URL:', url);
      
      const response = await httpClient(url, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Manual unlock by administrator' }),
      });
      
      if (response.json.success) {
        onUnlock?.();
        setOpen(false);
        setReason('');
      }
    } catch (error) {
      console.error('Error unlocking user:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip title="Unlock Force-Locked User">
        <IconButton 
          size="small" 
          color="success"
          onClick={() => setOpen(true)}
        >
          <LockOpenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Unlock Force-Locked User</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Are you sure you want to unlock <strong>{userName}</strong>?
          </Typography>
          <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
            This will reactivate the user account and allow them to log in again.
          </Typography>
          <TextField
            label="Reason (optional)"
            fullWidth
            multiline
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ mt: 2 }}
            placeholder="e.g., Issue resolved, Admin override"
          />
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => setOpen(false)}>Cancel</MuiButton>
          <MuiButton
            onClick={handleUnlock}
            disabled={loading}
            variant="contained"
            color="success"
            startIcon={<LockOpenIcon />}
          >
            {loading ? 'Unlocking...' : 'Unlock User'}
          </MuiButton>
        </DialogActions>
      </Dialog>
    </>
  );
};

// =============================================
// USER DETAILS DIALOG - With correct API endpoints
// =============================================
const UserDetailsDialog = ({ open, onClose, sessionData, onActionComplete }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [actionLoading, setActionLoading] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const [isForceLocked, setIsForceLocked] = useState(false);

  // Use session data directly when dialog opens
  useEffect(() => {
    if (open && sessionData) {
      // Transform session data to match expected format
      const formattedData = {
        user: {
          id: sessionData.user_id,
          user_name: sessionData.user_name,
          username: sessionData.user_name,
          first_name: sessionData.full_name?.split(' ')[0] || sessionData.user_name,
          last_name: sessionData.full_name?.split(' ').slice(1).join(' ') || '',
          email: sessionData.email || 'N/A',
          primary_business_role: sessionData.role || 'N/A',
          main_business_unit: 'N/A',
          status: sessionData.status || 'Active',
          enable_multi_session: false,
          validate_ip_address: true,
          is_supervisor: false,
          employer_number: sessionData.user_id || 'N/A',
          force_lock_reason: sessionData.force_lock_reason || null,
          force_locked_at: sessionData.force_locked_at || null,
          force_locked_by: sessionData.force_locked_by || null,
        },
        roleName: sessionData.role || 'Unknown',
        flattenedPermissions: ['View Dashboard', 'Access Reports']
      };
      setUserData(formattedData);
      setIsForceLocked(sessionData.status === 'ForceLocked' || sessionData.is_force_locked === true);
    }
  }, [open, sessionData]);

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Force lock user - using the correct endpoint
  const handleForceLock = async () => {
    setActionLoading(true);
    try {
      const identifier = sessionData?.user_name;
      
      if (!identifier) {
        showSnackbar('User identifier not found', 'error');
        setActionLoading(false);
        return;
      }

      const url = `${API_BASE_URL}/users/force-lock/${identifier}`;
      console.log('🔒 Force lock URL:', url);
      
      const response = await httpClient(url, {
        method: 'POST',
        body: JSON.stringify({ reason: lockReason || 'Suspicious activity detected' }),
      });
      
      if (response.json.success) {
        showSnackbar('User force-locked successfully', 'success');
        setLockReason('');
        setIsForceLocked(true);
        onActionComplete?.();
      } else {
        showSnackbar(response.json.message || 'Failed to lock user', 'error');
      }
    } catch (error) {
      console.error('Error locking user:', error);
      showSnackbar(error.response?.data?.message || 'Error locking user. Please check if the user exists.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Unlock force-locked user - using the correct endpoint
  const handleUnlockForceLock = async () => {
    setActionLoading(true);
    try {
      const identifier = sessionData?.user_name;
      
      if (!identifier) {
        showSnackbar('User identifier not found', 'error');
        setActionLoading(false);
        return;
      }

      const url = `${API_BASE_URL}/users/unlock-force-locked/${identifier}`;
      console.log('🔓 Unlock force-lock URL:', url);

      const response = await httpClient(url, {
        method: 'POST',
        body: JSON.stringify({ reason: unlockReason || 'Manual unlock by administrator' }),
      });
      
      if (response.json.success) {
        showSnackbar('User unlocked from force-lock successfully', 'success');
        setUnlockReason('');
        setIsForceLocked(false);
        onActionComplete?.();
      } else {
        showSnackbar(response.json.message || 'Failed to unlock user', 'error');
      }
    } catch (error) {
      console.error('Error unlocking user:', error);
      showSnackbar(error.response?.data?.message || 'Error unlocking user', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Force reset password - using the correct endpoint
  const handleForceResetPassword = async () => {
    setActionLoading(true);
    try {
      const url = `${API_BASE_URL}/users/force-reset-password`;
      console.log('🔑 Reset password URL:', url);
      
      const response = await httpClient(url, {
        method: 'POST',
        body: JSON.stringify({
          user_name: sessionData?.user_name,
          new_password: newPassword,
        }),
      });
      
      if (response.json.success) {
        showSnackbar('Password reset successfully', 'success');
        setPasswordDialog(false);
        setNewPassword('');
        onActionComplete?.();
      } else {
        showSnackbar(response.json.message || 'Failed to reset password', 'error');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      showSnackbar(error.response?.data?.message || 'Error resetting password', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const validatePassword = (password) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              <PersonIcon />
              <Typography variant="h6">User Details</Typography>
              {isForceLocked && (
                <Chip 
                  label="Force Locked" 
                  color="error" 
                  size="small" 
                  icon={<LockIcon />}
                />
              )}
            </Box>
            <IconButton onClick={onClose}>
              <CancelIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers>
          {loading ? (
            <Box p={3}>
              <LinearProgress />
              <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 2 }}>
                Loading user details...
              </Typography>
            </Box>
          ) : userData ? (
            <>
              {/* User Info Header */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="textSecondary">Full Name</Typography>
                    <Typography variant="body1" fontWeight="bold">
                      {sessionData?.full_name || userData.user?.first_name || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="textSecondary">Username</Typography>
                    <Typography variant="body1">@{sessionData?.user_name || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="textSecondary">Email</Typography>
                    <Typography variant="body1">{sessionData?.email || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="textSecondary">Role</Typography>
                    <Chip 
                      label={sessionData?.role || 'Unknown'} 
                      color="primary" 
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="textSecondary">User ID</Typography>
                    <Typography variant="body1">{sessionData?.user_id || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="textSecondary">Status</Typography>
                    <Chip 
                      label={isForceLocked ? 'Force Locked' : 'Active'}
                      color={isForceLocked ? 'error' : 'success'}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="textSecondary">Login Time</Typography>
                    <Typography variant="body1">
                      {sessionData?.login_time ? new Date(sessionData.login_time).toLocaleString() : 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="textSecondary">Session Duration</Typography>
                    <Typography variant="body1">{sessionData?.duration || 'N/A'}</Typography>
                  </Grid>
                </Grid>
              </Paper>

              {/* Force Lock Details - Show when user is force locked */}
              {isForceLocked && userData.user?.force_lock_reason && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">Force Lock Details</Typography>
                  <Typography variant="body2">Reason: {userData.user.force_lock_reason}</Typography>
                  {userData.user.force_locked_at && (
                    <Typography variant="caption">
                      Locked at: {new Date(userData.user.force_locked_at).toLocaleString()}
                    </Typography>
                  )}
                  {userData.user.force_locked_by && (
                    <Typography variant="caption" display="block">
                      Locked by: {userData.user.force_locked_by}
                    </Typography>
                  )}
                </Alert>
              )}

              {/* Tabs */}
              <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="Profile" icon={<PersonIcon />} iconPosition="start" />
                <Tab label="Actions" icon={<AdminPanelSettingsIcon />} iconPosition="start" />
              </Tabs>

              {/* Tab Content */}
              {activeTab === 0 && (
                <Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="textSecondary">IP Address</Typography>
                      <Typography variant="body2">{sessionData?.ip_address || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="textSecondary">Device Type</Typography>
                      <Chip 
                        label={sessionData?.device_type || 'Desktop'} 
                        color={sessionData?.device_type === 'mobile' ? 'primary' : 'default'}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="textSecondary">Browser</Typography>
                      <Typography variant="body2">{sessionData?.browser || 'Unknown'}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="textSecondary">OS</Typography>
                      <Typography variant="body2">{sessionData?.os || 'Unknown'}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="textSecondary">Request Count</Typography>
                      <Typography variant="body2">{sessionData?.request_count || 0}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="textSecondary">Session ID</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                        {sessionData?.session_id || 'N/A'}
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {activeTab === 1 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Administrative Actions</Typography>
                  
                  <Grid container spacing={2}>
                    {/* Force Lock - Only show if user is NOT force locked */}
                    {!isForceLocked && (
                      <Grid item xs={12}>
                        <Paper sx={{ p: 2, bgcolor: '#fff3e0' }}>
                          <Typography variant="subtitle2" color="error" gutterBottom>
                            <LockIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
                            Force Lock User
                          </Typography>
                          <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                            This will lock the user account and prevent them from logging in.
                          </Typography>
                          <TextField
                            fullWidth
                            size="small"
                            label="Reason (optional)"
                            value={lockReason}
                            onChange={(e) => setLockReason(e.target.value)}
                            sx={{ mb: 1 }}
                            placeholder="e.g., Suspicious activity detected"
                          />
                          <MuiButton
                            variant="contained"
                            color="error"
                            startIcon={<LockIcon />}
                            onClick={handleForceLock}
                            disabled={actionLoading}
                          >
                            {actionLoading ? 'Processing...' : 'Force Lock User'}
                          </MuiButton>
                        </Paper>
                      </Grid>
                    )}

                    {/* Unlock Force Lock - Only show if user IS force locked */}
                    {isForceLocked && (
                      <Grid item xs={12}>
                        <Paper sx={{ p: 2, bgcolor: '#e8f5e9' }}>
                          <Typography variant="subtitle2" color="success.main" gutterBottom>
                            <LockOpenIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
                            Unlock Force-Locked User
                          </Typography>
                          <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                            This will unlock the user account and allow them to log in again.
                          </Typography>
                          <TextField
                            fullWidth
                            size="small"
                            label="Reason (optional)"
                            value={unlockReason}
                            onChange={(e) => setUnlockReason(e.target.value)}
                            sx={{ mb: 1 }}
                            placeholder="e.g., Issue resolved"
                          />
                          <MuiButton
                            variant="contained"
                            color="success"
                            startIcon={<LockOpenIcon />}
                            onClick={handleUnlockForceLock}
                            disabled={actionLoading}
                          >
                            {actionLoading ? 'Processing...' : 'Unlock User'}
                          </MuiButton>
                        </Paper>
                      </Grid>
                    )}

                    {/* Force Reset Password */}
                    <Grid item xs={12}>
                      <Paper sx={{ p: 2, bgcolor: '#e3f2fd' }}>
                        <Typography variant="subtitle2" color="primary" gutterBottom>
                          <VpnKeyIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
                          Force Reset Password
                        </Typography>
                        <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
                          Reset the user's password and require them to change it on next login.
                        </Typography>
                        <MuiButton
                          variant="contained"
                          color="primary"
                          startIcon={<VpnKeyIcon />}
                          onClick={() => setPasswordDialog(true)}
                        >
                          Reset Password
                        </MuiButton>
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </>
          ) : (
            <Box p={3} textAlign="center">
              <Alert severity="warning">
                <Typography variant="body2">
                  No user data available. Please try refreshing the page.
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions>
          <MuiButton onClick={onClose}>Close</MuiButton>
        </DialogActions>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={passwordDialog} onClose={() => setPasswordDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Force Reset Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Reset password for <strong>{sessionData?.user_name}</strong>
          </Typography>
          <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
            The user will be required to change their password on next login.
          </Typography>
          <TextField
            fullWidth
            type="password"
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            sx={{ mt: 2 }}
            helperText="Password must be 8+ characters with uppercase, lowercase, number, and special character"
          />
          {newPassword && !validatePassword(newPassword) && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Password must be 8+ characters with uppercase, lowercase, number, and special character
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => setPasswordDialog(false)}>Cancel</MuiButton>
          <MuiButton
            variant="contained"
            color="primary"
            onClick={handleForceResetPassword}
            disabled={!validatePassword(newPassword) || actionLoading}
          >
            {actionLoading ? 'Resetting...' : 'Reset Password'}
          </MuiButton>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

// =============================================
// TERMINATE SESSION BUTTON
// =============================================
const TerminateButton = ({ sessionId, onTerminate }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');

  const handleTerminate = async () => {
    setLoading(true);
    try {
      const response = await httpClient(`${API_BASE_URL}/users/sessions/terminate`, {
        method: 'POST',
        body: JSON.stringify({
          session_id: sessionId,
          reason: reason || 'Terminated by admin',
        }),
      });
      
      if (response.json.success) {
        onTerminate?.();
        setOpen(false);
      }
    } catch (error) {
      console.error('Error terminating session:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Tooltip title="Terminate Session">
        <IconButton size="small" color="error" onClick={() => setOpen(true)}>
          <BlockIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Terminate Session</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            Are you sure you want to terminate this session?
          </Typography>
          <TextField
            label="Reason (optional)"
            fullWidth
            multiline
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={() => setOpen(false)}>Cancel</MuiButton>
          <MuiButton
            onClick={handleTerminate}
            disabled={loading}
            variant="contained"
            color="error"
          >
            {loading ? 'Terminating...' : 'Terminate'}
          </MuiButton>
        </DialogActions>
      </Dialog>
    </>
  );
};

// =============================================
// MAIN USER MONITORING LIST
// =============================================
export const UserMonitoringList = () => {
  const [sessions, setSessions] = useState([]);
  const [filteredSessions, setFilteredSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalActive: 0,
    uniqueUsers: 0,
    desktop: 0,
    mobile: 0,
    tablet: 0,
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await httpClient(`${API_BASE_URL}/users/active-sessions`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
      
      const data = response.json;
      if (data.success) {
        const sessionsData = data.data.sessions || [];
        const summary = data.data.summary || {};
        
        setSessions(sessionsData);
        setFilteredSessions(sessionsData);
        setStats({
          totalActive: summary.total_active_sessions || 0,
          uniqueUsers: summary.unique_users || 0,
          desktop: sessionsData.filter(s => s.device_type === 'desktop').length,
          mobile: sessionsData.filter(s => s.device_type === 'mobile').length,
          tablet: sessionsData.filter(s => s.device_type === 'tablet').length,
        });
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let filtered = sessions;
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(s => 
        s.user_name?.toLowerCase().includes(term) ||
        s.full_name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        s.ip_address?.includes(term)
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      const idleThreshold = 15 * 60 * 1000;
      filtered = filtered.filter(s => {
        const isIdle = Date.now() - new Date(s.last_activity).getTime() > idleThreshold;
        return statusFilter === 'active' ? !isIdle : isIdle;
      });
    }
    
    // Device filter
    if (deviceFilter !== 'all') {
      filtered = filtered.filter(s => s.device_type === deviceFilter);
    }
    
    setFilteredSessions(filtered);
    setPage(0);
  }, [searchTerm, statusFilter, deviceFilter, sessions]);

  const handleRefresh = () => {
    fetchSessions();
  };

  const handleTerminate = () => {
    fetchSessions(); // Refresh after termination
  };

  const handleViewDetails = (record) => {
    setSelectedSession(record);
    setDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedSession(null);
  };

  const handleActionComplete = () => {
    fetchSessions(); // Refresh after any admin action
  };

  const getStatus = (lastActivity) => {
    const idleTime = Date.now() - new Date(lastActivity).getTime();
    return idleTime > 15 * 60 * 1000 ? 'idle' : 'active';
  };

  if (loading && sessions.length === 0) {
    return (
      <Box p={3}>
        <LinearProgress />
        <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 2 }}>
          Loading sessions...
        </Typography>
      </Box>
    );
  }

  return (
    <Box p={2}>
      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Active Sessions"
            value={stats.totalActive}
            icon={<DevicesIcon />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Unique Users"
            value={stats.uniqueUsers}
            icon={<PeopleIcon />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Desktop"
            value={stats.desktop}
            icon={<StorageIcon />}
            color="#ed6c02"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Mobile / Tablet"
            value={stats.mobile + stats.tablet}
            icon={<SecurityIcon />}
            color="#9c27b0"
          />
        </Grid>
      </Grid>

      {/* Toolbar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" flexWrap="wrap" alignItems="center" gap={2}>
          <TextField
            placeholder="Search by user, email, IP..."
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ flex: 1, minWidth: 200 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          
          <MuiButton
            startIcon={<FilterListIcon />}
            onClick={() => setShowFilters(!showFilters)}
            variant={showFilters ? 'contained' : 'outlined'}
            size="small"
          >
            Filters
          </MuiButton>
          
          <MuiButton
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            variant="outlined"
            size="small"
          >
            Refresh
          </MuiButton>
        </Box>
        
        {showFilters && (
          <Box display="flex" flexWrap="wrap" gap={2} mt={2}>
            <TextField
              select
              label="Status"
              size="small"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="idle">Idle</MenuItem>
            </TextField>
            
            <TextField
              select
              label="Device"
              size="small"
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="desktop">Desktop</MenuItem>
              <MenuItem value="mobile">Mobile</MenuItem>
              <MenuItem value="tablet">Tablet</MenuItem>
            </TextField>
            
            <MuiButton
              startIcon={<ClearIcon />}
              onClick={() => {
                setStatusFilter('all');
                setDeviceFilter('all');
                setSearchTerm('');
              }}
              size="small"
            >
              Clear All
            </MuiButton>
          </Box>
        )}
        
        <Box mt={1}>
          <Typography variant="caption" color="textSecondary">
            Found {filteredSessions.length} sessions
          </Typography>
        </Box>
      </Paper>

      {/* Sessions Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Session Info</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Device</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Location</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Last Activity</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <Typography variant="body2" color="textSecondary">
                    No sessions found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredSessions
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((record) => {
                  const status = getStatus(record.last_activity);
                  const isForceLocked = record.status === 'ForceLocked' || record.is_force_locked === true;
                  
                  return (
                    <TableRow key={record.id} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {record.full_name || record.user_name}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            @{record.user_name}
                          </Typography>
                          {record.role && (
                            <Chip
                              label={record.role}
                              size="small"
                              variant="outlined"
                              sx={{ ml: 1, fontSize: '10px', height: 20 }}
                            />
                          )}
                          {isForceLocked && (
                            <Chip
                              label="Locked"
                              size="small"
                              color="error"
                              icon={<LockIcon fontSize="small" />}
                              sx={{ ml: 1, fontSize: '10px', height: 20 }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      
                      <TableCell>
                        <Box>
                          <Typography variant="caption" display="block">
                            <AccessTimeIcon fontSize="inherit" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                            Login: {new Date(record.login_time).toLocaleString()}
                          </Typography>
                          <Typography variant="caption" display="block" color="textSecondary">
                            Duration: {record.duration}
                          </Typography>
                        </Box>
                      </TableCell>
                      
                      <TableCell>
                        <Box>
                          <Chip
                            label={record.device_type || 'Desktop'}
                            size="small"
                            color={
                              record.device_type === 'mobile'
                                ? 'primary'
                                : record.device_type === 'tablet'
                                ? 'info'
                                : 'default'
                            }
                          />
                          <Typography variant="caption" display="block" color="textSecondary">
                            {record.browser} / {record.os}
                          </Typography>
                        </Box>
                      </TableCell>
                      
                      <TableCell>
                        <Tooltip title={`IP: ${record.ip_address}`}>
                          <Box>
                            <Typography variant="caption" display="block">
                              <LocationOnIcon fontSize="inherit" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                              {record.ip_address}
                            </Typography>
                            <Typography variant="caption" display="block" color="textSecondary">
                              Requests: {record.request_count}
                            </Typography>
                          </Box>
                        </Tooltip>
                      </TableCell>
                      
                      <TableCell>
                        <Typography variant="caption">
                          {new Date(record.last_activity).toLocaleString()}
                        </Typography>
                      </TableCell>
                      
                      <TableCell>
                        <SessionStatusChip lastActivity={record.last_activity} />
                      </TableCell>
                      
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          {/* Unlock Force-Lock Button - Only show if user is force locked */}
                          {isForceLocked && (
                            <UnlockForceLockButton 
                              userId={record.user_id}
                              userName={record.user_name}
                              onUnlock={handleActionComplete}
                            />
                          )}
                          
                          <TerminateButton 
                            sessionId={record.session_id} 
                            onTerminate={handleTerminate}
                          />
                          
                          <Tooltip title="View Details">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => handleViewDetails(record)}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={filteredSessions.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(e, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
      />

      {/* User Details Dialog - Pass session data directly */}
      <UserDetailsDialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        sessionData={selectedSession}
        onActionComplete={handleActionComplete}
      />
    </Box>
  );
};

// =============================================
// MAIN EXPORT - Dashboard View
// =============================================
export const UserMonitoring = () => {
  return <UserMonitoringList />;
};

export default UserMonitoring;