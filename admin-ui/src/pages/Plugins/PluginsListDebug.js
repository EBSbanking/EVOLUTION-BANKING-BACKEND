// admin-ui/src/pages/Plugins/PluginsListDebug.js
import { List, Datagrid, TextField, useListContext } from 'react-admin';
import { Box, CircularProgress, Alert, Paper, Typography } from '@mui/material';

const DebugDatagrid = () => {
  const { data, isLoading, error } = useListContext();
  
  if (isLoading) return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">Error loading plugins: {error.message}</Alert>;
  
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return <Alert severity="info">No plugins found. Upload a plugin to get started.</Alert>;
  }
  
  // Log the data to see what's available
  console.log('📦 Plugin Data:', data);
  if (Array.isArray(data) && data.length > 0) {
    console.log('📦 Plugin fields:', Object.keys(data[0]));
  }
  
  return (
    <Datagrid>
      <TextField source="id" label="ID" />
      <TextField source="name" label="Name" />
      <TextField source="status" label="Status" />
      <TextField source="version" label="Version" />
      <TextField source="author" label="Author" />
      <TextField source="description" label="Description" />
    </Datagrid>
  );
};

export const PluginsListDebug = () => (
  <List resource="plugins">
    <DebugDatagrid />
  </List>
);