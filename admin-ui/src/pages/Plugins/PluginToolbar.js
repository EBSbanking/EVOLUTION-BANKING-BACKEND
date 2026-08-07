// admin-ui/src/pages/Plugins/PluginToolbar.js

import { TopToolbar } from 'react-admin';
import { Button, useRefresh } from 'react-admin';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RefreshIcon from '@mui/icons-material/Refresh';
import PluginUploadButton from './PluginUploadButton';
import { API_BASE_URL } from '../../config';

const PluginRefreshButton = () => {
  const refresh = useRefresh();
  
  const handleRefresh = () => {
    // Clear cache and refresh
    localStorage.removeItem('plugins_cache');
    // Also clear browser cache for the plugins endpoint
    fetch(`${API_BASE_URL}/plugins`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }).then(() => {
      refresh();
    }).catch(() => {
      refresh(); // Refresh anyway even if fetch fails
    });
  };
  
  return (
    <Button
      label="Refresh"
      onClick={handleRefresh}
      startIcon={<RefreshIcon />}
      variant="outlined"
      color="secondary"
    />
  );
};

export const PluginToolbar = () => (
  <TopToolbar>
    <PluginUploadButton />
    <PluginRefreshButton />
  </TopToolbar>
);

export default PluginToolbar;