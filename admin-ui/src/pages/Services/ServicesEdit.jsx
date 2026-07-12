// admin-ui/src/pages/Services/ServicesEdit.jsx
import React, { useState, useEffect } from 'react';
import { 
  Edit, 
  SimpleForm, 
  TextInput,
  useEditController,
  useNotify,
  useRedirect,
} from 'react-admin';
import { 
  Box, 
  CircularProgress, 
  Alert, 
  Paper, 
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@mui/material';  // ← All Material-UI imports here
import { 
  Delete as DeleteIcon,
  Code as CodeIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

export const ServicesEdit = (props) => {
  const { id, isLoading: isEditLoading } = useEditController(props);
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState(null);
  const [showContent, setShowContent] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const notify = useNotify();
  const redirect = useRedirect();

  // Fetch service details
  useEffect(() => {
    const fetchService = async () => {
      if (!id) return;
      
      setLoading(true);
      try {
        const response = await httpClient(`${API_BASE_URL}/services/${id}`);
        console.log('✅ Service details:', response);
        
        let serviceData = response.json?.data || response.json || response;
        setService(serviceData);
      } catch (err) {
        console.error('❌ Failed to fetch service:', err);
        notify(`Error: ${err.message}`, { type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    fetchService();
  }, [id, notify]);

  const handleViewContent = async () => {
    if (showContent) {
      setShowContent(false);
      setContent(null);
      return;
    }

    setLoadingContent(true);
    try {
      const response = await httpClient(`${API_BASE_URL}/services/${id}/content`);
      console.log('✅ Service content:', response);
      
      const contentData = response.json?.data || response.json || response;
      setContent(contentData);
      setShowContent(true);
    } catch (err) {
      console.error('❌ Failed to fetch service content:', err);
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setLoadingContent(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await httpClient(`${API_BASE_URL}/services/${id}`, {
        method: 'DELETE',
      });
      notify('Service deleted successfully', { type: 'success' });
      setDeleteDialogOpen(false);
      redirect('/services');
    } catch (err) {
      console.error('❌ Failed to delete service:', err);
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  if (isEditLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!service) {
    return (
      <Alert severity="error">
        Service not found. Please try refreshing the list.
      </Alert>
    );
  }

  return (
    <Edit {...props} resource="services" id={id}>
      <SimpleForm toolbar={false}>
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
                {service.id}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Name
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {service.name}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Filename
              </Typography>
              <Typography variant="body1">
                <Chip label={service.filename} size="small" />
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Status
              </Typography>
              <Chip 
                label={service.status || 'Running'} 
                color={service.status === 'Running' ? 'success' : 'default'}
              />
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Size
              </Typography>
              <Typography variant="body1">
                {service.size} bytes
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="body2" color="textSecondary">
                Last Modified
              </Typography>
              <Typography variant="body1">
                {new Date(service.modified).toLocaleString()}
              </Typography>
            </Box>
          </Box>
          
          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<CodeIcon />}
              onClick={handleViewContent}
              disabled={loadingContent}
            >
              {showContent ? 'Hide Content' : 'View Content'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete Service
            </Button>
          </Box>
        </Paper>

        {/* Service Content */}
        {showContent && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Service Code</Typography>
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                onClick={handleViewContent}
                disabled={loadingContent}
              >
                Refresh
              </Button>
            </Box>
            
            {loadingContent ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress />
              </Box>
            ) : (
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 2, 
                  maxHeight: 500, 
                  overflow: 'auto',
                  backgroundColor: '#f5f5f5',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                }}
              >
                {content || 'No content available'}
              </Paper>
            )}
          </Paper>
        )}

        {/* Read-only form fields */}
        <Box sx={{ display: 'none' }}>
          <TextInput source="id" disabled />
          <TextInput source="name" disabled />
          <TextInput source="filename" disabled />
          <TextInput source="size" disabled label="Size (bytes)" />
          <TextInput source="modified" disabled label="Last Modified" />
        </Box>
      </SimpleForm>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Service</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the service "{service.name}"?
            <br />
            <br />
            <Typography color="error" variant="body2">
              This action cannot be undone.
            </Typography>
          </Typography>
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
    </Edit>
  );
};