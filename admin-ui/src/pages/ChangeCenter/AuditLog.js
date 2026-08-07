// admin-ui/src/pages/ChangeCenter/AuditLog.jsx

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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tab,
  Tabs,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  Visibility as VisibilityIcon,
  ExpandMore as ExpandMoreIcon,
  EventNote as EventNoteIcon,
  Person as PersonIcon,
  Computer as ComputerIcon,
  Http as HttpIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { API_BASE_URL } from '../../config';
import { httpClient } from '../../App';

// Helper to build API URLs - handles both /api and /api/admin base URLs
const buildApiUrl = (path) => {
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  let baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  
  if (baseUrl.endsWith('/admin') && cleanPath.startsWith('admin/')) {
    const pathWithoutAdmin = cleanPath.substring(6);
    return `${baseUrl}/${pathWithoutAdmin}`;
  }
  
  if (!baseUrl.endsWith('/admin') && !cleanPath.startsWith('admin/')) {
    return `${baseUrl}/admin/${cleanPath}`;
  }
  
  return `${baseUrl}/${cleanPath}`;
};

// Helper to get value with fallback for empty/null/undefined values
const getValue = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '' || value === 'null' || value === 'undefined') {
    return fallback;
  }
  return value;
};

// Helper to get field value checking both uppercase and lowercase variants
const getField = (obj, fieldName) => {
  if (!obj) return null;
  // Try uppercase first (database format)
  if (obj[fieldName.toUpperCase()] !== undefined && obj[fieldName.toUpperCase()] !== null) {
    return obj[fieldName.toUpperCase()];
  }
  // Try lowercase (model format)
  if (obj[fieldName.toLowerCase()] !== undefined && obj[fieldName.toLowerCase()] !== null) {
    return obj[fieldName.toLowerCase()];
  }
  // Try original field name
  return obj[fieldName] || null;
};

// =============================================
// STATUS CHIP
// =============================================
const StatusChip = ({ status }) => {
  const colors = {
    SUCCESS: 'success',
    FAILED: 'error',
    PARTIAL_SUCCESS: 'warning',
    PENDING: 'info',
    PROCESSING: 'secondary'
  };
  return (
    <Chip 
      label={getValue(status, '—')}
      color={colors[status] || 'default'}
      size="small"
      variant="filled"
    />
  );
};

// =============================================
// EVENT TYPE CHIP
// =============================================
const EventTypeChip = ({ eventType }) => {
  const colors = {
    LOGIN: 'primary',
    LOGOUT: 'default',
    CREATE: 'success',
    UPDATE: 'info',
    DELETE: 'error',
    VIEW: 'secondary',
    EXPORT: 'warning',
    IMPORT: 'warning',
    APPROVE: 'success',
    REJECT: 'error',
    GENERAL: 'default'
  };
  
  const displayValue = getValue(eventType, 'GENERAL');
  
  return (
    <Chip 
      label={displayValue}
      color={colors[displayValue] || 'default'}
      size="small"
      variant="outlined"
    />
  );
};

// =============================================
// JSON DISPLAY COMPONENT
// =============================================
const JsonDisplay = ({ value, maxHeight = 200 }) => {
  if (!value) return <span style={{ color: '#999' }}>—</span>;
  
  let displayValue = value;
  if (typeof value === 'object') {
    displayValue = JSON.stringify(value, null, 2);
  }
  
  return (
    <pre style={{ 
      maxWidth: '100%',
      maxHeight: maxHeight, 
      overflow: 'auto', 
      fontSize: 12,
      margin: 0,
      padding: 8,
      background: '#f5f5f5',
      borderRadius: 4,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      fontFamily: 'monospace'
    }}>
      {displayValue}
    </pre>
  );
};

// =============================================
// STATS CARDS
// =============================================
const StatsCard = ({ title, value, icon, color, subtitle }) => (
  <Card sx={{ height: '100%' }}>
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
// AUDIT LOG DETAILS DIALOG
// =============================================
const AuditLogDetailsDialog = ({ open, onClose, logData }) => {
  if (!open || !logData) return null;

  const getStatusIcon = (status) => {
    switch(status) {
      case 'SUCCESS': return <CheckCircleIcon color="success" />;
      case 'FAILED': return <CancelIcon color="error" />;
      case 'PARTIAL_SUCCESS': return <WarningIcon color="warning" />;
      default: return <InfoIcon color="info" />;
    }
  };

  // Get field from logData with fallback
  const getLogField = (fieldName, fallback = '—') => {
    const value = getField(logData, fieldName);
    return getValue(value, fallback);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <EventNoteIcon />
            <Typography variant="h6">Audit Log Details</Typography>
            {logData.status && (
              <Box display="flex" alignItems="center" gap={0.5}>
                {getStatusIcon(logData.status)}
                <StatusChip status={logData.status} />
              </Box>
            )}
          </Box>
          <IconButton onClick={onClose}>
            <CancelIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">Event Type</Typography>
            <EventTypeChip eventType={getLogField('event_type', 'GENERAL')} />
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">Action</Typography>
            <Typography variant="body1">{getLogField('action', 'Unknown Action')}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">User ID</Typography>
            <Typography variant="body1">{getLogField('user_id', 'SYSTEM')}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">User Role</Typography>
            <Typography variant="body1">{getLogField('user_role')}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">Entity</Typography>
            <Typography variant="body1">{getLogField('entity_type', 'SYSTEM')}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">Entity ID</Typography>
            <Typography variant="body1">{getLogField('entity_id', '0')}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">IP Address</Typography>
            <Typography variant="body1">{getLogField('ip_address', '127.0.0.1')}</Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">Timestamp</Typography>
            <Typography variant="body1">
              {logData.created_at ? new Date(logData.created_at).toLocaleString() : '—'}
            </Typography>
          </Paper>
        </Box>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" color="textSecondary" gutterBottom>Description</Typography>
          <Typography variant="body1">{getLogField('description')}</Typography>
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">Endpoint</Typography>
            <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
              {getLogField('endpoint')}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="textSecondary">Method</Typography>
            <Chip label={getLogField('method')} size="small" />
          </Paper>
        </Box>

        {logData.old_value || logData.OLD_VALUE && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography><strong>Old Value</strong></Typography>
            </AccordionSummary>
            <AccordionDetails>
              <JsonDisplay value={logData.old_value || logData.OLD_VALUE} maxHeight={300} />
            </AccordionDetails>
          </Accordion>
        )}

        {logData.new_value || logData.NEW_VALUE && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography><strong>New Value</strong></Typography>
            </AccordionSummary>
            <AccordionDetails>
              <JsonDisplay value={logData.new_value || logData.NEW_VALUE} maxHeight={300} />
            </AccordionDetails>
          </Accordion>
        )}

        {logData.additional_info || logData.ADDITIONAL_INFO && (
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography><strong>Additional Info</strong></Typography>
            </AccordionSummary>
            <AccordionDetails>
              <JsonDisplay value={logData.additional_info || logData.ADDITIONAL_INFO} maxHeight={200} />
            </AccordionDetails>
          </Accordion>
        )}
      </DialogContent>
      
      <DialogActions>
        <MuiButton onClick={onClose}>Close</MuiButton>
      </DialogActions>
    </Dialog>
  );
};

// =============================================
// MAIN AUDIT LOG LIST
// =============================================
export const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    success: 0,
    failed: 0,
    pending: 0,
  });

  // Helper to get field from log with fallback
  const getLogField = (log, fieldName, fallback = '—') => {
    const value = getField(log, fieldName);
    return getValue(value, fallback);
  };

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const range = JSON.stringify([page * rowsPerPage, (page + 1) * rowsPerPage - 1]);
      const sort = JSON.stringify(['created_at', 'DESC']);
      const filter = {};
      
      if (searchTerm) filter.q = searchTerm;
      if (eventTypeFilter !== 'all') filter.event_type = eventTypeFilter;
      if (statusFilter !== 'all') filter.status = statusFilter;
      if (dateFrom) filter.date_from = dateFrom;
      if (dateTo) filter.date_to = dateTo;

      const queryParams = new URLSearchParams({
        range,
        sort,
        filter: JSON.stringify(filter),
      });

      const url = buildApiUrl(`audit?${queryParams.toString()}`);
      console.log('📊 Fetching audit logs from:', url);
      
      const response = await httpClient(url, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
      
      const data = response.json;
      
      let logsData = [];
      let total = 0;
      
      if (Array.isArray(data)) {
        logsData = data;
        total = data.length;
        const contentRange = response.headers?.get('Content-Range');
        if (contentRange) {
          const match = contentRange.match(/items \d+-\d+\/(\d+)/);
          if (match) total = parseInt(match[1]);
        }
      } else if (data.data && Array.isArray(data.data)) {
        logsData = data.data;
        total = data.total || data.data.length;
      } else {
        logsData = data.results || data.items || [];
        total = data.total || data.count || logsData.length;
      }
      
      setLogs(logsData);
      setFilteredLogs(logsData);
      setTotalCount(total);
      
      const successCount = logsData.filter(l => l.status === 'SUCCESS').length;
      const failedCount = logsData.filter(l => l.status === 'FAILED').length;
      const pendingCount = logsData.filter(l => l.status === 'PENDING' || l.status === 'PROCESSING').length;
      
      setStats({
        total: total,
        success: successCount,
        failed: failedCount,
        pending: pendingCount,
      });
      
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      setError(error.message || 'Failed to fetch audit logs');
      setLogs([]);
      setFilteredLogs([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, rowsPerPage, eventTypeFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const filtered = logs.filter(log => {
        const userId = getLogField(log, 'user_id', '');
        const eventType = getLogField(log, 'event_type', '');
        const action = getLogField(log, 'action', '');
        const description = getLogField(log, 'description', '');
        const entityType = getLogField(log, 'entity_type', '');
        const ipAddress = getLogField(log, 'ip_address', '');
        
        return userId.toLowerCase().includes(term) ||
               eventType.toLowerCase().includes(term) ||
               action.toLowerCase().includes(term) ||
               description.toLowerCase().includes(term) ||
               entityType.toLowerCase().includes(term) ||
               ipAddress.includes(term);
      });
      setFilteredLogs(filtered);
    } else {
      setFilteredLogs(logs);
    }
  }, [searchTerm, logs]);

  const handleRefresh = () => {
    fetchLogs();
  };

  const handleViewDetails = (log) => {
    setSelectedLog(log);
    setDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedLog(null);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setEventTypeFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  if (loading && logs.length === 0) {
    return (
      <Box p={3}>
        <LinearProgress />
        <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 2 }}>
          Loading audit logs...
        </Typography>
      </Box>
    );
  }

  return (
    <Box p={2}>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Total Logs"
            value={stats.total}
            icon={<EventNoteIcon />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Success"
            value={stats.success}
            icon={<CheckCircleIcon />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Failed"
            value={stats.failed}
            icon={<CancelIcon />}
            color="#d32f2f"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatsCard
            title="Pending"
            value={stats.pending}
            icon={<WarningIcon />}
            color="#ed6c02"
          />
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" flexWrap="wrap" alignItems="center" gap={2}>
          <TextField
            placeholder="Search logs..."
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
              label="Event Type"
              size="small"
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="LOGIN">Login</MenuItem>
              <MenuItem value="LOGOUT">Logout</MenuItem>
              <MenuItem value="CREATE">Create</MenuItem>
              <MenuItem value="UPDATE">Update</MenuItem>
              <MenuItem value="DELETE">Delete</MenuItem>
              <MenuItem value="VIEW">View</MenuItem>
              <MenuItem value="EXPORT">Export</MenuItem>
              <MenuItem value="IMPORT">Import</MenuItem>
              <MenuItem value="APPROVE">Approve</MenuItem>
              <MenuItem value="REJECT">Reject</MenuItem>
            </TextField>
            
            <TextField
              select
              label="Status"
              size="small"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="SUCCESS">Success</MenuItem>
              <MenuItem value="FAILED">Failed</MenuItem>
              <MenuItem value="PARTIAL_SUCCESS">Partial Success</MenuItem>
              <MenuItem value="PENDING">Pending</MenuItem>
              <MenuItem value="PROCESSING">Processing</MenuItem>
            </TextField>
            
            <TextField
              type="date"
              label="Date From"
              size="small"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
            
            <TextField
              type="date"
              label="Date To"
              size="small"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 150 }}
            />
            
            <MuiButton
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
              size="small"
            >
              Clear All
            </MuiButton>
          </Box>
        )}
        
        <Box mt={1}>
          <Typography variant="caption" color="textSecondary">
            Found {filteredLogs.length} logs
          </Typography>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>Timestamp</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Event</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Entity</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <Typography variant="body2" color="textSecondary">
                    No audit logs found
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log, index) => (
                <TableRow key={log.event_id || log.id || index} hover>
                  <TableCell>
                    <Typography variant="caption">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <EventTypeChip eventType={getLogField(log, 'event_type', 'GENERAL')} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{getLogField(log, 'action', 'Unknown Action')}</Typography>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2">{getLogField(log, 'user_id', 'SYSTEM')}</Typography>
                      {log.user_role && (
                        <Typography variant="caption" color="textSecondary">
                          {log.user_role}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2">{getLogField(log, 'entity_type', 'SYSTEM')}</Typography>
                      {log.entity_id && (
                        <Typography variant="caption" color="textSecondary">
                          ID: {log.entity_id}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <StatusChip status={log.status} />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View Details">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleViewDetails(log)}
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={totalCount}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(e, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
      />

      <AuditLogDetailsDialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        logData={selectedLog}
      />
    </Box>
  );
};

export default AuditLog;