import React from 'react';
import { Edit, SimpleForm, NumberInput, BooleanInput, TextInput } from 'react-admin';

export const WebhookEdit = (props) => (
  <Edit {...props}>
    <SimpleForm>
      <TextInput source="webhook_name" label="Webhook Name" disabled />
      <NumberInput source="port" label="Port" />
      <BooleanInput source="enabled" label="Enabled" />
      <TextInput source="load_balancer_group" label="Load Balancer Group" />
    </SimpleForm>
  </Edit>
);