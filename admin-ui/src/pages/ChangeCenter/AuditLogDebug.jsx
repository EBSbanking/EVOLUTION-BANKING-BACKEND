// admin-ui/src/pages/AuditLogDebug.jsx (optional debug version)

import React, { useEffect } from 'react';
import { List, Datagrid, TextField, DateField, useListContext } from 'react-admin';

const DebugDatagrid = () => {
  const { data, isLoading } = useListContext();
  
  useEffect(() => {
    if (data) {
      console.log('📊 Audit Log Data:', data);
      console.log('📊 First record:', data[0]);
      console.log('📊 Total records:', Object.keys(data).length);
    }
  }, [data]);
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <Datagrid>
      <DateField source="created_at" label="Timestamp" showTime />
      <TextField source="event_type" label="Event" />
      <TextField source="action" label="Action" />
      <TextField source="user_id" label="User ID" />
      <TextField source="status" label="Status" />
      <TextField source="description" label="Description" />
    </Datagrid>
  );
};

export const AuditLogDebug = () => (
  <List resource="audit">
    <DebugDatagrid />
  </List>
);