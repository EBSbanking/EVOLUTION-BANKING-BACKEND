import { List, Datagrid, TextField, DateField, FunctionField } from 'react-admin';

export const AuditLog = () => (
  <List resource="audit" sort={{ field: 'created_at', order: 'DESC' }}>
    <Datagrid>
      <DateField source="created_at" label="Timestamp" showTime />
      <TextField source="action" />
      <TextField source="resource_type" label="Resource Type" />
      <TextField source="resource_name" label="Resource Name" />
      <FunctionField label="Details" render={record => JSON.stringify(record.details)} />
      <TextField source="user_id" label="User ID" />
    </Datagrid>
  </List>
);