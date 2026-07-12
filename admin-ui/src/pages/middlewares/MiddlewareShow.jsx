// admin-ui/src/pages/middlewares/MiddlewareShow.jsx
import React from 'react';
import {
  Show,
  SimpleShowLayout,
  TextField,
  NumberField,
  DateField,
  useShowController,
  useNotify,
  useRedirect,
  Button,
  TopToolbar,
} from 'react-admin';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Paper,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

const MiddlewareShowActions = ({ record }) => {
  const notify = useNotify();
  const redirect = useRedirect();
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await httpClient(`${API_BASE_URL}/middlewares/${record.id}`, {
        method: 'DELETE',
      });
      notify('Middleware deleted successfully', { type: 'success' });
      setDeleteDialogOpen(false);
      redirect('/middlewares');
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TopToolbar>
      <Button
        label="Edit"
        startIcon={<EditIcon />}
        component="a"
        href={`#/middlewares/${record?.id}/edit`}
      />
      <Button
        label="Delete"
        startIcon={<DeleteIcon />}
        onClick={() => setDeleteDialogOpen(true)}
        color="error"
      />
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Middleware</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the middleware "{record?.name}"?
            <br />
            <br />
            <strong style={{ color: 'red' }}>This action cannot be undone.</strong>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleDelete} 
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </TopToolbar>
  );
};

export const MiddlewareShow = (props) => {
  const { record, isLoading } = useShowController(props);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (!record) {
    return (
      <Alert severity="error">
        Middleware not found. Please try refreshing the list.
      </Alert>
    );
  }

  const isAvailable = record.status === 'AVAILABLE';

  return (
    <Show {...props} actions={<MiddlewareShowActions record={record} />}>
      <SimpleShowLayout>
        {/* Status Card */}
        <Card sx={{ mb: 3, bgcolor: isAvailable ? '#e8f5e9' : '#f5f5f5' }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={8}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Typography variant="h5">
                    {record.name}
                  </Typography>
                  <Chip
                    label={record.status || 'AVAILABLE'}
                    color={isAvailable ? 'success' : 'default'}
                    size="medium"
                  />
                </Box>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  ID: {record.id}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Middleware Details */}
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Middleware Details
          </Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Name
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {record.name}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                ID
              </Typography>
              <Typography variant="body1">
                {record.id}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Size
              </Typography>
              <Typography variant="body1">
                {record.size ? `${record.size.toLocaleString()} bytes` : 'N/A'}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Last Modified
              </Typography>
              <Typography variant="body1">
                {record.modified ? new Date(record.modified).toLocaleString() : 'N/A'}
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
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
                {record.filePath || record.path || 'N/A'}
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="body2" color="textSecondary">
                Status
              </Typography>
              <Chip
                label={record.status || 'AVAILABLE'}
                color={isAvailable ? 'success' : 'default'}
                size="small"
              />
            </Grid>
          </Grid>
        </Paper>
      </SimpleShowLayout>
    </Show>
  );
};

export default MiddlewareShow;