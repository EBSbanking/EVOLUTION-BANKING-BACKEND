import React from 'react';
import { Login, LoginForm } from 'react-admin';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import Paper from '@mui/material/Paper';
import { styled } from '@mui/material/styles';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';
import StorageIcon from '@mui/icons-material/Storage';

const StyledLogin = styled(Login)({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0a0e17',
  padding: 20,
});

const LoginContainer = styled(Paper)(({ theme }) => ({
  display: 'flex',
  width: '100%',
  maxWidth: 1100,
  minHeight: 650,
  borderRadius: 24,
  overflow: 'hidden',
  boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
  background: 'transparent',
}));

// Left Panel - Branding (Glass effect)
const BrandPanel = styled(Box)(({ theme }) => ({
  flex: 1.2,
  padding: theme.spacing(5),
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  background: 'linear-gradient(145deg, rgba(10, 14, 23, 0.95), rgba(20, 30, 50, 0.9))',
  backdropFilter: 'blur(20px)',
  borderRight: '1px solid rgba(255,255,255,0.05)',
  position: 'relative',
  overflow: 'hidden',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-30%',
    right: '-20%',
    width: '70%',
    height: '100%',
    background: 'radial-gradient(ellipse, rgba(230, 126, 34, 0.06) 0%, transparent 70%)',
  },
}));

const BrandIcon = styled(AccountBalanceIcon)({
  fontSize: 56,
  color: '#e67e22',
  marginBottom: 20,
});

// ✅ Fixed: BrandTitle with better visibility
const BrandTitle = styled(Typography)({
  fontSize: '2.2rem',
  fontWeight: 800,
  color: '#ffffff',
  letterSpacing: '-0.5px',
  textShadow: '0 2px 20px rgba(0,0,0,0.3)',
  '& span': {
    color: '#e67e22',
    textShadow: '0 0 30px rgba(230, 126, 34, 0.2)',
  },
});

// ✅ Added: BrandSubtitle component
const BrandSubtitle = styled(Typography)({
  fontSize: '0.9rem',
  color: 'rgba(255,255,255,0.6)',
  marginTop: 4,
  fontWeight: 500,
  letterSpacing: 1,
});

// ✅ Added: BrandDescription with more visibility
const BrandDescription = styled(Typography)({
  fontSize: '1rem',
  color: 'rgba(255,255,255,0.5)',
  marginTop: 8,
  letterSpacing: 0.5,
});

const StatsBox = styled(Box)({
  display: 'flex',
  gap: 40,
  marginTop: 40,
  paddingTop: 32,
  borderTop: '1px solid rgba(255,255,255,0.06)',
});

const StatItem = styled(Box)({
  '& .number': {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#ffffff',
  },
  '& .label': {
    fontSize: '0.7rem',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
});

// Right Panel - Login
const LoginPanel = styled(Box)(({ theme }) => ({
  flex: 1,
  padding: theme.spacing(5),
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  background: 'rgba(20, 28, 45, 0.95)',
  backdropFilter: 'blur(20px)',
  minWidth: 400,
}));

const LoginHeader = styled(Box)({
  marginBottom: 32,
});

const LoginTitle = styled(Typography)({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#ffffff',
});

const LoginSubtitle = styled(Typography)({
  fontSize: '0.85rem',
  color: 'rgba(255,255,255,0.5)',
  marginTop: 4,
});

// ✅ Updated: FooterText with bold and gradient styling
const FooterText = styled(Typography)(({ theme }) => ({
  fontSize: '0.85rem',
  fontWeight: 600,
  textAlign: 'center',
  marginTop: 24,
  paddingTop: 16,
  borderTop: '1px solid rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.6)',
  letterSpacing: 0.5,
  '& span': {
    background: 'linear-gradient(90deg, #e67e22, #f39c12)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
    fontWeight: 700,
  },
  '& .warelogtech': {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 500,
  },
  '&:hover': {
    color: 'rgba(255,255,255,0.8)',
    transition: 'color 0.3s ease',
  },
}));

// ✅ Styled Login Form with white inputs
const StyledLoginForm = styled(Box)({
  '& .MuiTextField-root': {
    marginBottom: 16,
  },
  '& .MuiInputLabel-root': {
    color: 'rgba(255,255,255,0.7) !important',
    '&.Mui-focused': {
      color: '#e67e22 !important',
    },
  },
  '& .MuiInputBase-root': {
    backgroundColor: 'rgba(255,255,255,0.08) !important',
    borderRadius: '8px !important',
    transition: 'all 0.3s ease',
    '&:hover': {
      backgroundColor: 'rgba(255,255,255,0.15) !important',
    },
    '&.Mui-focused': {
      backgroundColor: 'rgba(255,255,255,0.15) !important',
      boxShadow: '0 0 0 2px rgba(230, 126, 34, 0.3)',
    },
  },
  '& .MuiInputBase-input': {
    color: '#ffffff !important',
    padding: '14px 16px !important',
    '&::placeholder': {
      color: 'rgba(255,255,255,0.4) !important',
    },
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(255,255,255,0.15) !important',
    borderWidth: '1px !important',
  },
  '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: '#e67e22 !important',
    borderWidth: '2px !important',
  },
  '& .MuiButton-root': {
    marginTop: 8,
    height: 48,
    fontSize: '0.95rem',
    fontWeight: 600,
    background: 'linear-gradient(135deg, #e67e22, #f39c12) !important',
    borderRadius: '8px !important',
    textTransform: 'none',
    '&:hover': {
      background: 'linear-gradient(135deg, #d35400, #e67e22) !important',
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 25px rgba(230, 126, 34, 0.3)',
    },
    '&:active': {
      transform: 'translateY(0)',
    },
  },
  '& .MuiFormHelperText-root': {
    color: 'rgba(255,255,255,0.5) !important',
  },
  '& .MuiFormControl-root': {
    width: '100%',
  },
});

// ✅ Added: Decorative line component
const DecorativeLine = styled(Box)({
  width: 60,
  height: 4,
  background: 'linear-gradient(90deg, #e67e22, #f39c12)',
  borderRadius: 2,
  marginTop: 16,
});

const MyLoginPage = () => (
  <StyledLogin>
    <LoginContainer elevation={0}>
      <BrandPanel>
        <Box>
          <BrandIcon />
          
          {/* ✅ Now visible with proper styling */}
          <BrandTitle variant="h4">
            Evolution Banking <span>Core X</span>
          </BrandTitle>
          
          {/* ✅ BrandSubtitle now defined and visible */}
          <BrandSubtitle variant="body2">
            Backend Weblogic Console · Warelogtech Limited
          </BrandSubtitle>
          
          <DecorativeLine />
          
          <BrandDescription>
            Enterprise Banking Platform
          </BrandDescription>
        </Box>

        <StatsBox>
          <StatItem>
            <div className="number">99.9%</div>
            <div className="label">Uptime</div>
          </StatItem>
          <StatItem>
            <div className="number">24/7</div>
            <div className="label">Support</div>
          </StatItem>
          <StatItem>
            <div className="number">SSL</div>
            <div className="label">Encrypted</div>
          </StatItem>
        </StatsBox>

        <Box sx={{ mt: 'auto', pt: 4 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem', letterSpacing: 2 }}>
            WARE LOGTECH · ENTERPRISE SOLUTIONS
          </Typography>
        </Box>
      </BrandPanel>

      <LoginPanel>
        <LoginHeader>
          <LoginTitle>Secure Access</LoginTitle>
          <LoginSubtitle>Enter your credentials to continue</LoginSubtitle>
        </LoginHeader>

        <StyledLoginForm>
          <LoginForm />
        </StyledLoginForm>

        {/* ✅ Updated Footer with bold gradient text */}
        <FooterText>
          © {new Date().getFullYear()} <span>Evolution Core X</span> 
          <span className="warelogtech"> · Warelogtech</span>
        </FooterText>
      </LoginPanel>
    </LoginContainer>
  </StyledLogin>
);

export default MyLoginPage;