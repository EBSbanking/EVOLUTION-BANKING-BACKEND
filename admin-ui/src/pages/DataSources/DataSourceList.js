import { List, Datagrid, TextField, SelectField, DeleteButton } from 'react-admin';

export const DataSourceList = () => (
  <List>
    <Datagrid rowClick="edit">
      <TextField source="name" />
      <TextField source="type" />
      <TextField source="jndiName" label="JNDI Name" />
      <TextField source="targets" />
      <SelectField source="status" choices={[{ id: 'active', name: 'Active' }, { id: 'inactive', name: 'Inactive' }]} />
      <DeleteButton />
    </Datagrid>
  </List>
);