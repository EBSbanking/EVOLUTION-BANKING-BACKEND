// admin-ui/src/routes/HealthRoute.jsx
import React from 'react';

const HealthRoute = () => {
  return (
    <div style={{ 
      textAlign: 'center', 
      padding: '50px',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        maxWidth: '500px'
      }}>
        <h1 style={{ color: '#22c55e', fontSize: '48px', margin: '0 0 10px 0' }}>✅</h1>
        <h1 style={{ color: '#22c55e', fontSize: '24px', margin: '0 0 20px 0' }}>
          Evolution Banking Frontend
        </h1>
        <p style={{ fontSize: '18px', color: '#333' }}>Status: <strong style={{ color: '#22c55e' }}>OK</strong></p>
        <p style={{ color: '#666' }}>🕐 Timestamp: {new Date().toISOString()}</p>
        <p style={{ color: '#666' }}>🌍 Environment: {process.env.NODE_ENV || 'development'}</p>
        <p style={{ color: '#666' }}>📦 Version: {process.env.REACT_APP_VERSION || '1.0.0'}</p>
        <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #eee' }} />
        <p style={{ fontSize: '14px', color: '#999' }}>
          Evolution Banking System - Frontend Health Check
        </p>
      </div>
    </div>
  );
};

export default HealthRoute;