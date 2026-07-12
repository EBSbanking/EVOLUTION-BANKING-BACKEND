// admin-ui/src/pages/Scheduler/SchedulerStatus.jsx

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
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
  Grid,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  PlayArrow as PlayArrowIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  AttachMoney as AttachMoneyIcon,
} from '@mui/icons-material';
import { useNotify } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

// Available services for EOD - INCLUDING PENALTY ACCRUAL
const availableServices = [
  { id: 'loanProcessing', label: 'Loan Processing' },
  { id: 'overdueLoans', label: 'Overdue Loans' },
  { id: 'processAutoCollections', label: 'Auto Collections' },
  { id: 'loanStatusUpdates', label: 'Loan Status Updates' },
  { id: 'interestPosting', label: 'Interest Posting' },
  { id: 'glTransactions', label: 'GL Transactions' },
  { id: 'termDepositInterest', label: 'Term Deposit Interest' },
  { id: 'reconciliation', label: 'Reconciliation' },
  { id: 'pendingRepayments', label: 'Pending Repayments' },
  { id: 'dormantAccounts', label: 'Dormant Accounts' },
  { id: 'standingOrders', label: 'Standing Orders' },
  { id: 'pendingGLTransactions', label: 'Pending GL Transactions' },
  { id: 'penaltyAccrual', label: 'Penalty Accrual' }, // ✅ ADDED
];

const SchedulerStatus = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [runningJob, setRunningJob] = useState(null);
  
  // EOD Status states
  const [eodStatus, setEodStatus] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // EOD Trigger states
  const [eodDialogOpen, setEodDialogOpen] = useState(false);
  const [eodOptions, setEodOptions] = useState({
    skipServices: [],
    runServices: [],
    selectedServices: [],
    userId: 'system'
  });
  const [eodProgress, setEodProgress] = useState(null);
  const [eodRunning, setEodRunning] = useState(false);
  const [eodResult, setEodResult] = useState(null);
  
  // Penalty Accrual states
  const [penaltyStatus, setPenaltyStatus] = useState(null);
  const [penaltyLoading, setPenaltyLoading] = useState(false);
  const [penaltyDialogOpen, setPenaltyDialogOpen] = useState(false);
  const [penaltyResult, setPenaltyResult] = useState(null);
  const [penaltyAccrualDate, setPenaltyAccrualDate] = useState(new Date().toISOString().split('T')[0]);
  
  const notify = useNotify();
  const navigate = useNavigate();

  // ========== FETCH SCHEDULED JOBS ==========
  const fetchJobs = async () => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('token');
    if (!token) {
      notify('Please log in again', { type: 'warning' });
      navigate('/login');
      setLoading(false);
      return;
    }

    try {
      const response = await httpClient(`${API_BASE_URL}/scheduler/jobs`);
      const jobsData = response.json?.data || response.json || response;
      console.log('📦 Scheduler jobs response:', jobsData);
      setJobs(Array.isArray(jobsData) ? jobsData : []);
    } catch (err) {
      console.error('❌ Failed to fetch scheduler jobs:', err);
      setError(err.message || 'Failed to fetch scheduler jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  // ========== FETCH EOD STATUS ==========
  const fetchEODStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await httpClient(`${API_BASE_URL}/os/eod/status`);
      const data = response.json || response;
      console.log('📦 EOD Status Response:', data);
      
      if (data.success) {
        setEodStatus(data.data);
      }
    } catch (err) {
      console.error('❌ Failed to fetch EOD status:', err);
    }
  };

  // ========== FETCH PENALTY STATUS ==========
  const fetchPenaltyStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await httpClient(`${API_BASE_URL}/penalty/status`);
      const data = response.json || response;
      console.log('📦 Penalty Status Response:', data);
      
      if (data.success) {
        setPenaltyStatus(data.data);
      }
    } catch (err) {
      console.error('❌ Failed to fetch penalty status:', err);
    }
  };

  // ========== RUN PENALTY ACCRUAL ==========
  const handleRunPenaltyAccrual = async () => {
    setPenaltyLoading(true);
    setPenaltyResult(null);
    setPenaltyDialogOpen(false);

    try {
      const payload = {
        accrualDate: penaltyAccrualDate || new Date().toISOString().split('T')[0]
      };

      console.log('📦 Penalty Accrual Payload:', payload);

      const response = await httpClient(`${API_BASE_URL}/penalty/accrue`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const result = response.json || response;
      console.log('📦 Penalty Accrual Response:', result);
      setPenaltyResult(result);

      if (result.success) {
        notify(`Penalty accrual completed: ${result.data?.penaltiesApplied || 0} penalties applied`, { 
          type: 'success' 
        });
        setTimeout(() => {
          fetchEODStatus();
          fetchJobs();
          fetchPenaltyStatus();
        }, 2000);
      } else {
        notify(`Penalty accrual failed: ${result.message || 'Unknown error'}`, { type: 'error' });
      }
    } catch (err) {
      console.error('❌ Penalty accrual failed:', err);
      notify(`Penalty accrual failed: ${err.message}`, { type: 'error' });
      setPenaltyResult({ success: false, error: err.message });
    } finally {
      setPenaltyLoading(false);
    }
  };

  // ========== HANDLE SERVICE TOGGLE ==========
  const handleServiceToggle = (serviceId) => {
    setEodOptions(prev => {
      const currentSelected = prev.selectedServices || [];
      if (currentSelected.includes(serviceId)) {
        return {
          ...prev,
          selectedServices: currentSelected.filter(id => id !== serviceId)
        };
      } else {
        return {
          ...prev,
          selectedServices: [...currentSelected, serviceId]
        };
      }
    });
  };

  const handleSelectAll = () => {
    if (eodOptions.selectedServices?.length === availableServices.length) {
      setEodOptions({ ...eodOptions, selectedServices: [] });
    } else {
      setEodOptions({ 
        ...eodOptions, 
        selectedServices: availableServices.map(s => s.id) 
      });
    }
  };

  // ========== TRIGGER EOD ==========
  const handleRunAllEOD = async () => {
    setEodRunning(true);
    setEodProgress({ status: 'starting', message: 'Starting EOD process...' });
    setEodResult(null);

    try {
      const payload = {
        userId: eodOptions.userId || 'system',
        selectedServices: eodOptions.selectedServices || [],
        skipServices: eodOptions.skipServices || [],
        runServices: eodOptions.runServices || []
      };

      console.log('📦 EOD Payload:', payload);

      const response = await httpClient(`${API_BASE_URL}/os/eod/trigger`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const result = response.json || response;
      console.log('📦 EOD Response:', result);
      setEodResult(result);

      if (result.success) {
        setEodProgress({ status: 'completed', message: 'EOD process completed successfully!' });
        notify('EOD process completed successfully', { type: 'success' });
        setTimeout(() => {
          fetchEODStatus();
          fetchJobs();
          fetchPenaltyStatus();
        }, 3000);
      } else {
        setEodProgress({ status: 'failed', message: `EOD failed: ${result.message || 'Unknown error'}` });
        notify(`EOD failed: ${result.message || 'Unknown error'}`, { type: 'error' });
      }
    } catch (err) {
      console.error('❌ EOD failed:', err);
      setEodProgress({ status: 'failed', message: `EOD failed: ${err.message}` });
      notify(`EOD failed: ${err.message}`, { type: 'error' });
    } finally {
      setEodRunning(false);
      setEodDialogOpen(false);
    }
  };

  // ========== RUN INDIVIDUAL JOB ==========
  const handleRunJob = async (jobName) => {
    setRunningJob(jobName);
    try {
      await httpClient(`${API_BASE_URL}/scheduler/jobs/${encodeURIComponent(jobName)}/run`, {
        method: 'POST',
      });
      notify(`Job "${jobName}" executed successfully`, { type: 'success' });
      setTimeout(() => {
        fetchJobs();
        fetchEODStatus();
        fetchPenaltyStatus();
      }, 2000);
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setRunningJob(null);
    }
  };

  // ========== DIALOG HANDLERS ==========
  const openEODDialog = () => {
    if (eodOptions.selectedServices?.length === 0) {
      setEodOptions({
        ...eodOptions,
        selectedServices: availableServices.map(s => s.id)
      });
    }
    setEodDialogOpen(true);
    setEodProgress(null);
    setEodResult(null);
  };

  const closeEODDialog = () => {
    if (!eodRunning) {
      setEodDialogOpen(false);
      setEodProgress(null);
      setEodResult(null);
    }
  };

  const openPenaltyDialog = () => {
    setPenaltyDialogOpen(true);
    setPenaltyResult(null);
  };

  const closePenaltyDialog = () => {
    if (!penaltyLoading) {
      setPenaltyDialogOpen(false);
      setPenaltyResult(null);
    }
  };

  // ========== AUTO REFRESH ==========
  useEffect(() => {
    fetchJobs();
    fetchEODStatus();
    fetchPenaltyStatus();
    
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchJobs();
        fetchEODStatus();
        fetchPenaltyStatus();
      }, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  // ========== HELPER FUNCTIONS ==========
  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  const getStatusChip = (status) => {
    const config = {
      idle: { label: 'Idle', color: 'default' },
      running: { label: 'Running', color: 'info' },
      success: { label: 'Success', color: 'success' },
      failed: { label: 'Failed', color: 'error' },
      completed: { label: 'Completed', color: 'success' },
      processing: { label: 'Processing', color: 'warning' },
      ACTIVE: { label: 'Active', color: 'success' },
      COMPLETED: { label: 'Completed', color: 'success' },
      FAILED: { label: 'Failed', color: 'error' },
      IDLE: { label: 'Idle', color: 'default' },
    };
    const { label, color } = config[status] || config.idle;
    return <Chip label={label} color={color} size="small" />;
  };

  // Get service health status - merge API data with available services
  const getServiceHealth = () => {
    if (eodStatus?.services && eodStatus.services.length > 0) {
      const apiServiceMap = {};
      eodStatus.services.forEach(s => {
        apiServiceMap[s.name.toLowerCase()] = s;
      });

      return availableServices.map(service => {
        const apiService = apiServiceMap[service.label.toLowerCase()] || 
                           apiServiceMap[service.id.toLowerCase()];
        
        if (apiService) {
          return {
            name: service.label,
            id: service.id,
            healthy: apiService.healthy !== undefined ? apiService.healthy : true,
            status: apiService.status || 'healthy',
            fromApi: true
          };
        }
        
        return {
          name: service.label,
          id: service.id,
          healthy: true,
          status: 'healthy',
          fromApi: false
        };
      });
    }

    return availableServices.map(service => ({
      name: service.label,
      id: service.id,
      healthy: true,
      status: 'unknown',
      fromApi: false
    }));
  };

  const eodJobs = jobs.filter(job => job.name && job.name.toLowerCase().includes('eod'));
  const penaltyJob = jobs.find(job => job.name && job.name.toLowerCase().includes('penalty'));

  // ========== STYLES ==========
  const styles = {
    headerBox: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      mb: 3,
      flexWrap: 'wrap',
      gap: 2,
    },
    buttonGroup: {
      display: 'flex',
      gap: 1,
      flexWrap: 'wrap',
    },
    eodSummaryCard: {
      mb: 3,
      bgcolor: '#f5f5f5',
    },
    penaltyCard: {
      mb: 3,
      bgcolor: '#e8f5e9',
      borderLeft: '4px solid #4caf50',
    },
    eodJobsCard: {
      mb: 3,
      bgcolor: '#fff3e0',
      borderLeft: '4px solid #ff9800',
    },
    jobRowEod: {
      backgroundColor: '#fff8e1',
    },
    jobRowPenalty: {
      backgroundColor: '#e8f5e9',
    },
    eodChip: {
      ml: 1,
      bgcolor: '#ff9800',
      color: 'white',
      fontWeight: 'bold',
    },
    penaltyChip: {
      ml: 1,
      bgcolor: '#4caf50',
      color: 'white',
      fontWeight: 'bold',
    },
    dialogHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 1,
    },
    dialogHeaderLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 1,
    },
    serviceSelectionPaper: {
      p: 2,
      maxHeight: 300,
      overflow: 'auto',
    },
    selectionSummary: {
      mt: 2,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    progressContainer: {
      mt: 2,
    },
    resultsContainer: {
      mt: 2,
    },
    serviceChip: {
      m: 0.5,
    },
  };

  const serviceHealth = getServiceHealth();
  const healthyCount = serviceHealth.filter(s => s.healthy).length;
  const totalServices = serviceHealth.length;

  // ========== RENDER ==========
  return (
    <Box sx={{ p: 3, maxWidth: '100%' }}>
      {/* Header */}
      <Box sx={styles.headerBox}>
        <Typography variant="h4" fontWeight="bold">
          Scheduled Jobs & EOD Status
        </Typography>
        <Box sx={styles.buttonGroup}>
          <Button
            variant="contained"
            startIcon={<AttachMoneyIcon />}
            onClick={openPenaltyDialog}
            disabled={penaltyLoading}
            sx={{
              backgroundColor: '#4caf50',
              color: '#ffffff',
              '&:hover': {
                backgroundColor: '#388e3c',
              },
              '&:disabled': {
                backgroundColor: 'rgba(76, 175, 80, 0.5)',
                color: 'rgba(255, 255, 255, 0.5)',
              },
            }}
          >
            {penaltyLoading ? 'Processing...' : 'Run Penalty Accrual'}
          </Button>
          
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={openEODDialog}
            disabled={eodRunning}
            sx={{
              backgroundColor: '#ed6c02',
              color: '#ffffff',
              '&:hover': {
                backgroundColor: '#e65100',
              },
              '&:disabled': {
                backgroundColor: 'rgba(237, 108, 2, 0.5)',
                color: 'rgba(255, 255, 255, 0.5)',
              },
            }}
          >
            {eodRunning ? 'Running...' : 'Run EOD Services'}
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => { fetchJobs(); fetchEODStatus(); fetchPenaltyStatus(); }}
            disabled={loading}
            sx={{
              color: '#1976d2',
              borderColor: '#1976d2',
              '&:hover': {
                backgroundColor: 'rgba(25, 118, 210, 0.04)',
                borderColor: '#1565c0',
              },
              '&:disabled': {
                color: 'rgba(25, 118, 210, 0.5)',
                borderColor: 'rgba(25, 118, 210, 0.5)',
              },
            }}
          >
            Refresh
          </Button>
          
          <Button
            variant={autoRefresh ? 'contained' : 'outlined'}
            onClick={() => setAutoRefresh(!autoRefresh)}
            size="small"
            sx={{
              backgroundColor: autoRefresh ? '#1976d2' : 'transparent',
              color: autoRefresh ? '#ffffff' : '#1976d2',
              borderColor: '#1976d2',
              '&:hover': {
                backgroundColor: autoRefresh ? '#1565c0' : 'rgba(25, 118, 210, 0.04)',
              },
            }}
          >
            {autoRefresh ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ============================================================
          PENALTY ACCRUAL STATUS CARD
          ============================================================ */}
      <Card sx={styles.penaltyCard}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <AttachMoneyIcon color="success" />
              <Typography variant="h6">Penalty Accrual Status</Typography>
              {penaltyJob && (
                <Chip
                  label="Scheduled Daily"
                  size="small"
                  sx={{ bgcolor: '#4caf50', color: 'white' }}
                />
              )}
            </Box>
            <Box display="flex" gap={1}>
              <Chip 
                label={penaltyStatus?.status || 'Idle'}
                color={penaltyStatus?.status === 'RUNNING' ? 'warning' : 'success'}
                size="small"
              />
              {penaltyStatus?.lastRun && (
                <Chip 
                  label={`Last Run: ${formatDate(penaltyStatus.lastRun)}`}
                  variant="outlined"
                  size="small"
                />
              )}
            </Box>
          </Box>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography color="textSecondary" gutterBottom>Schedule</Typography>
              <Typography variant="body1">Daily at 00:05 AM</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography color="textSecondary" gutterBottom>Status</Typography>
              {getStatusChip(penaltyStatus?.status || 'idle')}
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography color="textSecondary" gutterBottom>Last Run</Typography>
              <Typography variant="body1">{penaltyStatus?.lastRun ? formatDate(penaltyStatus.lastRun) : 'Never'}</Typography>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Typography color="textSecondary" gutterBottom>Next Run</Typography>
              <Typography variant="body1">{penaltyStatus?.nextRun ? formatDate(penaltyStatus.nextRun) : 'Scheduled'}</Typography>
            </Grid>
          </Grid>
          
          {penaltyJob && penaltyJob.lastError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Last error: {penaltyJob.lastError}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ============================================================
          EOD STATUS SUMMARY
          ============================================================ */}
      {eodStatus && (
        <Card sx={styles.eodSummaryCard}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">EOD Status Summary</Typography>
              <Chip 
                label={`${healthyCount}/${totalServices} Services Healthy`}
                color={healthyCount === totalServices ? 'success' : 'warning'}
                size="small"
              />
            </Box>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography color="textSecondary" gutterBottom>Current Business Date</Typography>
                <Typography variant="body1">
                  {eodStatus.system?.currentBusinessDate ? formatDate(eodStatus.system.currentBusinessDate) : 'Not Set'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography color="textSecondary" gutterBottom>Next Business Date</Typography>
                <Typography variant="body1">
                  {eodStatus.system?.nextBusinessDate ? formatDate(eodStatus.system.nextBusinessDate) : 'Not Set'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography color="textSecondary" gutterBottom>EOD Status</Typography>
                {getStatusChip(eodStatus.system?.eodStatus)}
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography color="textSecondary" gutterBottom>Last EOD Run</Typography>
                <Typography variant="body1">
                  {eodStatus.system?.lastRun ? formatDate(eodStatus.system.lastRun) : 'Never'}
                </Typography>
              </Grid>
            </Grid>
            
            {/* Service Health Summary - Showing ALL Services including Penalty Accrual */}
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Service Health ({healthyCount}/{totalServices})
                {!eodStatus.services && (
                  <Tooltip title="Services data not available from API - showing default status">
                    <InfoIcon fontSize="small" color="info" />
                  </Tooltip>
                )}
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5}>
                {serviceHealth.map((service) => (
                  <Tooltip 
                    key={service.id}
                    title={
                      service.fromApi 
                        ? `${service.name}: ${service.healthy ? 'Healthy ✓' : 'Unhealthy ✗'}`
                        : `${service.name}: Status unknown - default healthy`
                    }
                  >
                    <Chip
                      label={service.name}
                      size="small"
                      color={service.healthy ? 'success' : 'error'}
                      variant={service.fromApi ? 'filled' : 'outlined'}
                      icon={service.healthy ? <CheckCircleIcon /> : <ErrorIcon />}
                      sx={styles.serviceChip}
                    />
                  </Tooltip>
                ))}
              </Box>
              {!eodStatus.services && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                  ℹ️ Service health data not available from API. Showing all services as healthy.
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          EOD JOBS SUMMARY CARD
          ============================================================ */}
      <Card sx={styles.eodJobsCard}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
            <Box display="flex" alignItems="center">
              <ScheduleIcon sx={{ mr: 1, color: '#ff9800' }} />
              <Typography variant="h6">End‑of‑Day (EOD) Jobs</Typography>
              <Chip
                label={`${eodJobs.length} jobs`}
                size="small"
                sx={{ ml: 2, bgcolor: '#ff9800', color: 'white' }}
              />
            </Box>
          </Box>
          {eodJobs.length === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              No EOD jobs found in the registry. 
              <strong> Please ensure</strong> that <code>import './src/scheduler/eodScheduler.js';</code> is added to <code>server.js</code> and the backend is restarted.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ============================================================
          SCHEDULED JOBS TABLE
          ============================================================ */}
      {loading && jobs.length === 0 ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Job Name</strong></TableCell>
                <TableCell><strong>Description</strong></TableCell>
                <TableCell><strong>Schedule</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Last Run</strong></TableCell>
                <TableCell><strong>Last Error</strong></TableCell>
                <TableCell><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    No jobs registered.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => {
                  const isEOD = job.name && job.name.toLowerCase().includes('eod');
                  const isPenalty = job.name && job.name.toLowerCase().includes('penalty');
                  return (
                    <TableRow
                      key={job.name}
                      sx={isEOD ? styles.jobRowEod : isPenalty ? styles.jobRowPenalty : {}}
                    >
                      <TableCell>
                        {job.name}
                        {isEOD && (
                          <Chip
                            label="EOD"
                            size="small"
                            sx={styles.eodChip}
                          />
                        )}
                        {isPenalty && (
                          <Chip
                            label="Penalty"
                            size="small"
                            sx={styles.penaltyChip}
                          />
                        )}
                      </TableCell>
                      <TableCell>{job.description || '-'}</TableCell>
                      <TableCell>
                        <code>{job.schedule}</code>
                      </TableCell>
                      <TableCell>{getStatusChip(job.status)}</TableCell>
                      <TableCell>{formatDate(job.lastRun)}</TableCell>
                      <TableCell>
                        {job.lastError ? (
                          <Typography variant="body2" color="error">
                            {job.lastError}
                          </Typography>
                        ) : (
                          'None'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<PlayArrowIcon />}
                          onClick={() => handleRunJob(job.name)}
                          disabled={job.isRunning || runningJob === job.name}
                          sx={{
                            backgroundColor: isPenalty ? '#4caf50' : '#1976d2',
                            color: '#ffffff',
                            '&:hover': {
                              backgroundColor: isPenalty ? '#388e3c' : '#1565c0',
                            },
                            '&:disabled': {
                              backgroundColor: isPenalty ? 'rgba(76, 175, 80, 0.5)' : 'rgba(25, 118, 210, 0.5)',
                              color: 'rgba(255, 255, 255, 0.5)',
                            },
                          }}
                        >
                          {job.isRunning ? 'Running...' : 'Run Now'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ============================================================
          PENALTY ACCRUAL DIALOG
          ============================================================ */}
      <Dialog open={penaltyDialogOpen} onClose={closePenaltyDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={styles.dialogHeader}>
            <Box sx={styles.dialogHeaderLeft}>
              <AttachMoneyIcon color="success" />
              <Typography variant="h6">Run Penalty Accrual</Typography>
            </Box>
            <Chip 
              label="Daily Job"
              size="small"
              color="success"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          {penaltyResult ? (
            <Box sx={{ mt: 2 }}>
              <Alert 
                severity={penaltyResult.success ? 'success' : 'error'}
                sx={{ mb: 2 }}
              >
                {penaltyResult.success 
                  ? `Penalty accrual completed successfully! ${penaltyResult.data?.penaltiesApplied || 0} penalties applied totaling ₦${penaltyResult.data?.totalPenaltyAmount?.toFixed(2) || 0}`
                  : `Penalty accrual failed: ${penaltyResult.message || 'Unknown error'}`
                }
              </Alert>
              
              {penaltyResult.success && penaltyResult.data && (
                <Box sx={styles.resultsContainer}>
                  <Typography variant="subtitle2" gutterBottom>Accrual Summary:</Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableBody>
                        <TableRow>
                          <TableCell><strong>Total Loans Processed</strong></TableCell>
                          <TableCell>{penaltyResult.data.totalLoansProcessed || 0}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Penalties Applied</strong></TableCell>
                          <TableCell>{penaltyResult.data.penaltiesApplied || 0}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell><strong>Total Penalty Amount</strong></TableCell>
                          <TableCell>₦{penaltyResult.data.totalPenaltyAmount?.toFixed(2) || '0.00'}</TableCell>
                        </TableRow>
                        {penaltyResult.data.failedLoans?.length > 0 && (
                          <TableRow>
                            <TableCell><strong>Failed Loans</strong></TableCell>
                            <TableCell>
                              <Chip 
                                label={`${penaltyResult.data.failedLoans.length} failed`}
                                color="error"
                                size="small"
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Box>
          ) : (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                This will run the daily penalty accrual process for all overdue loans. 
                Penalties will be calculated and applied based on the configured penalty rules.
              </Typography>
              
              <TextField
                fullWidth
                label="Accrual Date"
                type="date"
                value={penaltyAccrualDate}
                onChange={(e) => setPenaltyAccrualDate(e.target.value)}
                margin="normal"
                size="small"
                helperText="Date to accrue penalties for (defaults to today)"
                InputLabelProps={{ shrink: true }}
              />
              
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  <strong>Note:</strong> This process will:
                  <br />• Calculate daily penalties for all overdue loans
                  <br />• Accrue penalties based on configured rules
                  <br />• Update loan penalty balances
                  <br />• Mark loans as DELINQUENT if penalties exceed threshold
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={closePenaltyDialog} 
            disabled={penaltyLoading}
            sx={{
              color: '#1976d2',
              '&:hover': {
                backgroundColor: 'rgba(25, 118, 210, 0.04)',
              },
              '&:disabled': {
                color: 'rgba(25, 118, 210, 0.5)',
              },
            }}
          >
            {penaltyResult ? 'Close' : 'Cancel'}
          </Button>
          
          {!penaltyResult && (
            <Button
              variant="contained"
              onClick={handleRunPenaltyAccrual}
              disabled={penaltyLoading}
              startIcon={penaltyLoading ? <CircularProgress size={20} /> : <AttachMoneyIcon />}
              sx={{
                backgroundColor: '#4caf50',
                color: '#ffffff',
                '&:hover': {
                  backgroundColor: '#388e3c',
                },
                '&:disabled': {
                  backgroundColor: 'rgba(76, 175, 80, 0.5)',
                  color: 'rgba(255, 255, 255, 0.5)',
                },
              }}
            >
              {penaltyLoading ? 'Processing...' : 'Run Penalty Accrual'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ============================================================
          EOD CONFIGURATION DIALOG WITH SERVICE SELECTION
          ============================================================ */}
      <Dialog open={eodDialogOpen} onClose={closeEODDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={styles.dialogHeader}>
            <Box sx={styles.dialogHeaderLeft}>
              <ScheduleIcon color="warning" />
              <Typography variant="h6">End of Day (EOD) Process</Typography>
            </Box>
            <Chip 
              label={`${eodOptions.selectedServices?.length || 0} services selected`}
              size="small"
              color="primary"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          {eodProgress ? (
            <Box sx={styles.progressContainer}>
              <Alert 
                severity={eodProgress.status === 'completed' ? 'success' : eodProgress.status === 'failed' ? 'error' : 'info'}
                sx={{ mb: 2 }}
              >
                {eodProgress.message}
              </Alert>
              {eodProgress.status === 'starting' && <LinearProgress />}
              
              {eodResult && eodResult.results && (
                <Box sx={styles.resultsContainer}>
                  <Typography variant="subtitle2" gutterBottom>Service Results:</Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Service</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Message</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.entries(eodResult.results).map(([service, result]) => (
                          <TableRow key={service}>
                            <TableCell>{service}</TableCell>
                            <TableCell>
                              {result.success ? (
                                <CheckCircleIcon color="success" fontSize="small" />
                              ) : (
                                <ErrorIcon color="error" fontSize="small" />
                              )}
                            </TableCell>
                            <TableCell>
                              {result.success ? result.result?.message || 'Success' : result.error?.message || 'Failed'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Box>
          ) : (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Select which services to run during the EOD process. This may take several minutes.
              </Typography>
              
              <TextField
                fullWidth
                label="User ID"
                value={eodOptions.userId}
                onChange={(e) => setEodOptions({ ...eodOptions, userId: e.target.value })}
                margin="normal"
                size="small"
                helperText="User ID to attribute the EOD process to"
              />
              
              {/* ===== SERVICE SELECTION ===== */}
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                Select Services to Run:
              </Typography>
              <Paper variant="outlined" sx={styles.serviceSelectionPaper}>
                <FormGroup>
                  <Grid container spacing={1}>
                    {availableServices.map((service) => (
                      <Grid item xs={12} sm={6} md={4} key={service.id}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={(eodOptions.selectedServices || []).includes(service.id)}
                              onChange={() => handleServiceToggle(service.id)}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2">
                              {service.label}
                            </Typography>
                          }
                        />
                      </Grid>
                    ))}
                  </Grid>
                </FormGroup>
              </Paper>
              
              {/* Selection summary */}
              <Box sx={styles.selectionSummary}>
                <Typography variant="caption" color="textSecondary">
                  {eodOptions.selectedServices?.length || 0} of {availableServices.length} services selected
                </Typography>
                <Button
                  size="small"
                  onClick={handleSelectAll}
                  sx={{
                    color: '#1976d2',
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.04)',
                    },
                  }}
                >
                  {eodOptions.selectedServices?.length === availableServices.length ? 'Deselect All' : 'Select All'}
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={closeEODDialog} 
            disabled={eodProgress?.status === 'starting'}
            sx={{
              color: '#1976d2',
              '&:hover': {
                backgroundColor: 'rgba(25, 118, 210, 0.04)',
              },
              '&:disabled': {
                color: 'rgba(25, 118, 210, 0.5)',
              },
            }}
          >
            {eodProgress ? 'Close' : 'Cancel'}
          </Button>
          
          {!eodProgress && (
            <Button
              variant="contained"
              onClick={handleRunAllEOD}
              disabled={eodRunning || !eodOptions.selectedServices?.length}
              startIcon={eodRunning ? <CircularProgress size={20} /> : <PlayArrowIcon />}
              sx={{
                backgroundColor: '#ed6c02',
                color: '#ffffff',
                '&:hover': {
                  backgroundColor: '#e65100',
                },
                '&:disabled': {
                  backgroundColor: 'rgba(237, 108, 2, 0.5)',
                  color: 'rgba(255, 255, 255, 0.5)',
                },
              }}
            >
              {eodRunning ? 'Running...' : `Run ${eodOptions.selectedServices?.length || 0} Services`}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SchedulerStatus;