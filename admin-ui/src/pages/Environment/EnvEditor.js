// admin-ui/src/pages/Environment/EnvEditor.js
import { List, Datagrid, TextField, EditButton, SaveButton } from 'react-admin';

export const EnvEditor = () => (
  <List resource="env">
    <Datagrid rowClick="edit">
      <TextField source="key" />
      <TextField source="value" />
      <TextField source="description" />
      <EditButton />
    </Datagrid>
  </List>
);