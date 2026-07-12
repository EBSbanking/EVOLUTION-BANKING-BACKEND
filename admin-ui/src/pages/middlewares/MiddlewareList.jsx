// admin-ui/src/pages/middlewares/MiddlewareList.jsx
import React from 'react';
import {
  List,
  Datagrid,
  TextField,
  NumberField,
  DateField,
  EditButton,
  ShowButton,
  useListContext,
  Button,
  TopToolbar,
} from 'react-admin';
import { Box, Chip, Typography } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';

const MiddlewareActions = () => {
  const { refetch } = useListContext();
  return (
    <TopToolbar>
      <Button
        label="Refresh"
        startIcon={<RefreshIcon />}
        onClick={refetch}
      />
    </TopToolbar>
  );
};

const StatusChip = ({ record }) => {
  const status = record?.status || 'AVAILABLE';
  const colorMap = {
    'AVAILABLE': 'success',
    'RUNNING': 'info',
    'STOPPED': 'error',
    'DISABLED': 'warning',
  };
  return (
    <Chip 
      label={status} 
      color={colorMap[status] || 'default'}
      size="small"
    />
  );
};

export const MiddlewareList = (props) => {
  return (
    <List 
      {...props} 
      actions={<MiddlewareActions />}
      sort={{ field: 'id', order: 'ASC' }}
      perPage={25}
    >
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" label="ID" sortable={true} />
        <TextField source="name" label="Name" sortable={true} />
        <NumberField source="size" label="Size (bytes)" sortable={false} />
        <DateField source="modified" label="Last Modified" showTime sortable={false} />
        <StatusChip source="status" label="Status" />
        <ShowButton />
        <EditButton />
      </Datagrid>
    </List>
  );
};

// ✅ Add default export
export default MiddlewareList;