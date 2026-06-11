import { Edit, SimpleForm, TextInput, SelectInput, NumberInput, PasswordInput, SelectArrayInput } from 'react-admin';

export const DataSourceEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="name" disabled />
      <SelectInput source="type" choices={[{ id: 'postgres', name: 'PostgreSQL' }, { id: 'mysql', name: 'MySQL' }]} />
      <TextInput source="jndiName" label="JNDI Name" fullWidth />
      <TextInput source="host" />
      <NumberInput source="port" />
      <TextInput source="database" />
      <TextInput source="username" />
      <PasswordInput source="password" />
      <NumberInput source="poolMin" label="Minimum Pool Size" />
      <NumberInput source="poolMax" label="Maximum Pool Size" />
      <SelectArrayInput source="targets" choices={[{ id: 'dev', name: 'Development' }, { id: 'prod', name: 'Production' }]} />
    </SimpleForm>
  </Edit>
);