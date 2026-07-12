// admin-ui/src/pages/Services/ServicesCreate.jsx
import React, { useState } from 'react';
import { 
  Create, 
  SimpleForm, 
  TextInput, 
  SelectInput, 
  FileInput, 
  FileField,
  useNotify,
  useRedirect,
} from 'react-admin';
import { Box, Alert, Typography } from '@mui/material';  // ← Import Box from @mui/material
import { httpClient } from '../../App';
import { API_BASE_URL } from '../../config';

export const ServicesCreate = () => {
  const [file, setFile] = useState(null);
  const notify = useNotify();
  const redirect = useRedirect();

  const handleSubmit = async (data) => {
    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      }
      formData.append('name', data.name || '');
      formData.append('description', data.description || '');
      formData.append('type', data.type || 'custom');
      formData.append('status', data.status || 'Running');

      const response = await fetch(`${API_BASE_URL}/services`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create service');
      }

      const result = await response.json();
      console.log('✅ Service created:', result);
      
      notify('Service created successfully', { type: 'success' });
      redirect('/services');
    } catch (err) {
      console.error('❌ Failed to create service:', err);
      notify(`Error: ${err.message}`, { type: 'error' });
    }
  };

  return (
    <Create transform={handleSubmit}>
      <SimpleForm>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            Upload a JavaScript service file (.js). The service will be stored in the services directory.
          </Typography>
        </Alert>
        
        <TextInput 
          source="name" 
          label="Service Name"
          fullWidth 
          required
          helperText="Name of the service (will use filename if not provided)"
        />
        
        <TextInput 
          source="description" 
          label="Description" 
          fullWidth 
          multiline 
          rows={3}
        />
        
        <SelectInput 
          source="type" 
          label="Type"
          choices={[
            { id: 'database', name: 'Database' },
            { id: 'cache', name: 'Cache' },
            { id: 'queue', name: 'Queue' },
            { id: 'auth', name: 'Authentication' },
            { id: 'custom', name: 'Custom' },
          ]}
          defaultValue="custom"
        />
        
        <SelectInput 
          source="status" 
          label="Status"
          choices={[
            { id: 'Running', name: 'Running' },
            { id: 'Stopped', name: 'Stopped' },
          ]}
          defaultValue="Running"
        />
        
        <FileInput 
          source="file" 
          label="Upload Service File (.js)"
          accept=".js"
          onChange={(event) => {
            if (event.target?.files?.[0]) {
              setFile(event.target.files[0]);
            }
          }}
          required
        >
          <FileField source="src" title="title" />
        </FileInput>
      </SimpleForm>
    </Create>
  );
};