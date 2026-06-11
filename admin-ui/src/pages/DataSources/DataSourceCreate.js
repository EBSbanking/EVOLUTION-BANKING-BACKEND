import { Create, SimpleForm, TextInput, SelectInput, NumberInput, PasswordInput, SelectArrayInput, Button, useNotify, useRedirect } from 'react-admin';
import { useFormContext } from 'react-hook-form';

const DataSourceCreate = (props) => {
  const notify = useNotify();
  const redirect = useRedirect();

  const handleTestConnection = async (values) => {
    try {
      const response = await fetch('/admin/datasources/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (data.success) notify('Connection successful!', { type: 'success' });
      else notify('Connection failed', { type: 'warning' });
    } catch (error) {
      notify('Error testing connection', { type: 'error' });
    }
  };

  return (
    <Create {...props}>
      <SimpleForm>
        <TextInput source="name" fullWidth />
        <SelectInput source="type" choices={[
          { id: 'postgres', name: 'PostgreSQL' },
          { id: 'mysql', name: 'MySQL' },
        ]} />
        <TextInput source="jndiName" label="JNDI Name" fullWidth />
        <TextInput source="host" />
        <NumberInput source="port" />
        <TextInput source="database" />
        <TextInput source="username" />
        <PasswordInput source="password" />
        <NumberInput source="poolMin" label="Minimum Pool Size" />
        <NumberInput source="poolMax" label="Maximum Pool Size" />
        <SelectArrayInput source="targets" choices={[
          { id: 'dev', name: 'Development' },
          { id: 'prod', name: 'Production' },
        ]} />
        <Button label="Test Connection" onClick={() => handleTestConnection()}>
          Test Connection
        </Button>
      </SimpleForm>
    </Create>
  );
};

export default DataSourceCreate;