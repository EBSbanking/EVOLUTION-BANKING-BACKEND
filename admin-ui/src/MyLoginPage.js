import React from 'react';
import { Login, LoginForm } from 'react-admin';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import Paper from '@mui/material/Paper';
import { styled } from '@mui/material/styles';

const BrandIcon = styled(AccountBalanceIcon)(({ theme }) => ({
  fontSize: 64,
  color: '#ffffff',
  backgroundColor: '#1e3a5f',
  padding: 16,
  borderRadius: '50%',
  marginBottom: 16,
}));

const StyledLogin = styled(Login)({
  background: 'linear-gradient(135deg, #0b1a2e 0%, #1e3a5f 50%, #2a4f7a 100%)',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const LoginCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  maxWidth: 420,
  width: '100%',
  borderRadius: 16,
  boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
  background: 'rgba(255,255,255,0.95)',
  backdropFilter: 'blur(10px)',
}));

const BrandHeader = styled(Box)({
  textAlign: 'center',
  marginBottom: 24,
});

const BrandTitle = styled(Typography)({
  fontSize: '1.75rem',
  fontWeight: 700,
  color: '#1e3a5f',
  letterSpacing: '-0.5px',
  '& span': {
    color: '#e67e22',
  },
});

const BrandSubtitle = styled(Typography)({
  fontSize: '0.9rem',
  color: '#666',
  marginTop: 4,
  fontWeight: 500,
});

const MyLoginPage = () => (
  <StyledLogin>
    <LoginCard elevation={6}>
      <BrandHeader>
        <Box display="flex" justifyContent="center">
          <BrandIcon />
        </Box>
        <BrandTitle variant="h4">
          Evolution <span>Core X</span>
        </BrandTitle>
        <BrandSubtitle variant="body2">
          Banking Console · Warelogtech Limited
        </BrandSubtitle>
        <Box
          sx={{
            width: 60,
            height: 4,
            background: 'linear-gradient(90deg, #1e3a5f, #e67e22)',
            borderRadius: 2,
            margin: '12px auto 0',
          }}
        />
      </BrandHeader>
      <LoginForm />
      <Box mt={2} textAlign="center">
        <Typography variant="caption" color="textSecondary">
          © {new Date().getFullYear()} Evolution Core Banking Core X
        </Typography>
      </Box>
    </LoginCard>
  </StyledLogin>
);

export default MyLoginPage;