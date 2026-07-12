// admin-ui/src/pages/middlewares/MiddlewareEdit.jsx
import React, { useState } from 'react';
import {
  Edit,
  SimpleForm,
  TextInput,
  useEditController,
  useNotify,
  useRedirect,
  Button,
  TopToolbar,
} from 'react-admin';
import {
  Box,
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
  TextField as MuiTextField,
} from '@mui/material';
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

const MiddlewareEditActions = ({ record }) => {
  const [content, setContent] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const notify = useNotify();
  const redirect = useRedirect();

  const handleSaveContent = async () => {
    setSaving(true);
    try {
      await httpClient(`${API_BASE_URL}/middlewares/${record.id}/content`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      notify('Middleware updated successfully', { type: 'success' });
      setEditDialogOpen(false);
      redirect('/middlewares');
    } catch (err) {
      notify(`Error: ${err.message}`, { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditContent = async () => {
    try {
      const response = await httpClient(`${API_BASE_URL}/middlewares/${record.id}`, {
        method: 'GET',
      });
      const data = response.json.data || response.json;
      setContent(data.content || '');
      setEditDialogOpen(true);
    } catch (err) {
      notify(`Error loading content: ${err.message}`, { type: 'error' });
    }
  };

  return (
    <TopToolbar>
      <Button
        label="Edit Content"
        onClick={handleEditContent}
      />
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit Middleware Content</DialogTitle>
        <DialogContent>
          <MuiTextField
            autoFocus
            margin="dense"
            label="Content"
            fullWidth
            multiline
            rows={20}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            variant="outlined"
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveContent} 
            color="primary"
            variant="contained"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </TopToolbar>
  );
};

export const MiddlewareEdit = (props) => {
  const { record, isLoading } = useEditController(props);
  const notify = useNotify();

  const transform = (data) => {
    return {
      ...data,
      name: data.name,
      id: data.id,
    };
  };

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

  return (
    <Edit {...props} transform={transform} mutationMode="pessimistic" actions={<MiddlewareEditActions record={record} />}>
      <SimpleForm>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Note:</strong> Only the name can be edited here. To edit the content, use the "Edit Content" button above.
          </Typography>
        </Alert>
        
        <TextInput 
          source="id" 
          label="ID" 
          disabled 
          fullWidth
        />
        
        <TextInput 
          source="name" 
          label="Name" 
          fullWidth 
          required
          helperText="The middleware file name"
        />
        
        <TextInput 
          source="status" 
          label="Status" 
          disabled
          fullWidth
        />
        
        <Box sx={{ mt: 2 }}>
          <Alert severity="warning">
            <Typography variant="body2">
              <strong>Warning:</strong> Changes to middleware files can affect your application's behavior.
              Make sure you know what you're doing.
            </Typography>
          </Alert>
        </Box>
      </SimpleForm>
    </Edit>
  );
};

// ✅ Add default export
export default MiddlewareEdit;