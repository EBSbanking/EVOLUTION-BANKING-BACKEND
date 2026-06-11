// admin-ui/src/components/PluginUploadButton.js
import { Button, useNotify, useRefresh } from 'react-admin';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

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
        const response = await fetch('/admin/plugins/upload', {
          method: 'POST',
          body: formData,
          headers: {
            // Include your auth token if required
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (response.ok) {
          notify('Plugin uploaded successfully', { type: 'success' });
          refresh(); // reload the list
        } else {
          const error = await response.json();
          notify(`Upload failed: ${error.message || 'Unknown error'}`, { type: 'error' });
        }
      } catch (error) {
        notify('Network error while uploading', { type: 'error' });
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