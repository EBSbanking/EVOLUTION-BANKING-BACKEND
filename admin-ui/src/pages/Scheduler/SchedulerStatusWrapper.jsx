import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { createTheme } from '@mui/material/styles';
import SchedulerStatus from './SchedulerStatus';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
});

const SchedulerStatusWrapper = (props) => (
  <StyledEngineProvider injectFirst>
    <ThemeProvider theme={theme}>
      <SchedulerStatus {...props} />
    </ThemeProvider>
  </StyledEngineProvider>
);

export default SchedulerStatusWrapper;