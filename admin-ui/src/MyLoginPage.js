import React from 'react';
import { Login, LoginForm } from 'react-admin';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const MyLoginPage = () => (
  <Login>
    <Box
      sx={{
        textAlign: 'center',
        mb: 3,
        backgroundColor: '#1e3a5f',
        padding: 3,
        borderRadius: 2,
      }}
    >
      <Typography variant="h5" component="h1" sx={{ color: 'white', fontWeight: 'bold' }}>
        Evolution Banking Backend Console
      </Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', mt: 1 }}>
        Powered by React Admin
      </Typography>
    </Box>
    <LoginForm />
  </Login>
);

export default MyLoginPage;