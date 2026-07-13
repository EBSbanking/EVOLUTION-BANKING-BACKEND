// admin-ui/src/pages/Plugins/PluginUploadButton.js
import { Button, useNotify, useRefresh } from 'react-admin';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { API_BASE_URL } from '../../config';

const PluginUploadButton = () => {
  const notify = useNotify();
  const refresh = useRefresh();

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('plugin', file);
      formData.append('name', file.name.replace(/\.zip$/, ''));

      try {
        const token = localStorage.getItem('token');
        // ✅ Use /plugins/upload (not /admin/plugins/upload) 
        // because API_BASE_URL already ends with /admin
        const response = await fetch(`${API_BASE_URL}/plugins/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        const result = await response.json();

        if (response.ok) {
          notify('Plugin uploaded successfully', { type: 'success' });
          refresh();
        } else {
          const errorMsg = result.error || result.details || result.message || 'Unknown error';
          notify(`Upload failed: ${errorMsg}`, { type: 'error' });
        }
      } catch (error) {
        console.error('Upload error:', error);
        notify(`Upload failed: ${error.message || 'Network error'}`, { type: 'error' });
      }
    };
    input.click();
  };

  return (
    <Button
      label="Upload Plugin"
      onClick={handleUpload}
      startIcon={<CloudUploadIcon />}
    />
  );
};

export default PluginUploadButton;