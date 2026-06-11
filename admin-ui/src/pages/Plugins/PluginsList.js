import { List, Datagrid, TextField, SelectField, BooleanField, TopToolbar, Button, useRecordContext, useNotify, useRefresh } from 'react-admin';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import DeleteIcon from '@mui/icons-material/Delete';
import PluginUploadButton from './PluginUploadButton';

const RowActions = () => {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();

  const handleStart = async () => {
    const res = await fetch(`/api/admin/plugins/${record.id}/start`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    if (res.ok) { notify('Started', { type: 'success' }); refresh(); }
    else notify('Start failed', { type: 'error' });
  };
  const handleStop = async () => {
    const res = await fetch(`/api/admin/plugins/${record.id}/stop`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    if (res.ok) { notify('Stopped', { type: 'success' }); refresh(); }
    else notify('Stop failed', { type: 'error' });
  };
  const handleDelete = async () => {
    if (!window.confirm('Delete plugin?')) return;
    const res = await fetch(`/api/admin/plugins/${record.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    if (res.ok) { notify('Deleted', { type: 'success' }); refresh(); }
    else notify('Delete failed', { type: 'error' });
  };

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <Button label="Start" onClick={handleStart} disabled={record.status === 'active'} startIcon={<PlayArrowIcon />} />
      <Button label="Stop" onClick={handleStop} disabled={record.status === 'stopped'} startIcon={<StopIcon />} />
      <Button label="Delete" onClick={handleDelete} startIcon={<DeleteIcon />} />
    </div>
  );
};

const ListActions = () => (
  <TopToolbar>
    <PluginUploadButton />
  </TopToolbar>
);

export const PluginsList = () => (
  <List actions={<ListActions />}>
    <Datagrid rowClick={false}>
      <TextField source="name" />
      <TextField source="version" />
      <SelectField source="status" choices={[{ id: 'active', name: 'Active' }, { id: 'stopped', name: 'Stopped' }]} />
      <BooleanField source="autoStart" label="Auto-Start" />
      <TextField source="targets" />
      <RowActions />
    </Datagrid>
  </List>
);