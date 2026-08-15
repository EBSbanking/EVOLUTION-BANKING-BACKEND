// src/components/HealthMonitor.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import frontendLogger from '../pages/Utils/frontendLogger';

const HealthMonitor = ({ className = '' }) => {
  const [health, setHealth] = useState({
    backend: { status: 'checking', message: 'Checking...', data: null },
    frontend: { status: 'checking', message: 'Checking...', data: null },
    lastCheck: null,
    responseTime: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper function to make API calls with proper error handling
  const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  };

  // Fetch health status
  const fetchHealth = useCallback(async () => {
    const startTime = Date.now();
    setIsLoading(true);
    setError(null);

    try {
      // Backend health check
      const backendUrl = `${API_BASE_URL}/health`;
      console.log('🔍 Fetching backend health from:', backendUrl);
      const backendResponse = await fetchWithTimeout(backendUrl);
      
      // Frontend status check (with cache busting)
      const frontendUrl = `${API_BASE_URL}/frontend/status?_=${Date.now()}`;
      console.log('🔍 Fetching frontend status from:', frontendUrl);
      const frontendResponse = await fetchWithTimeout(frontendUrl);

      console.log('📊 Backend Response:', backendResponse);
      console.log('📊 Frontend Response:', frontendResponse);

      // Extract frontend status from your API structure
      const frontendData = frontendResponse?.data || frontendResponse;
      const frontendStatus = frontendData?.status || 'unknown';
      const isFrontendUp = frontendStatus === 'up';
      
      // Extract backend status
      const backendData = backendResponse?.data || backendResponse;
      const backendStatus = backendData?.status || backendResponse?.status || 'unknown';
      const isBackendUp = backendStatus === 'healthy' || backendStatus === 'up' || backendStatus === 'OK';

      // Update health state with proper data extraction
      const healthData = {
        backend: {
          status: isBackendUp ? 'healthy' : 'unhealthy',
          message: isBackendUp ? 'Backend is running' : 'Backend is unhealthy',
          data: backendResponse
        },
        frontend: {
          status: isFrontendUp ? 'healthy' : (frontendStatus === 'unknown' ? 'checking' : 'unhealthy'),
          message: isFrontendUp ? 'Frontend is running' : (frontendData?.error || 'Frontend is offline'),
          data: frontendData
        },
        lastCheck: new Date().toISOString(),
        responseTime: Date.now() - startTime
      };

      setHealth(healthData);
      
      // Log successful health check
      if (frontendLogger && frontendLogger.logActivity) {
        frontendLogger.logActivity({
          action: 'health_check_success',
          details: {
            backendStatus: healthData.backend.status,
            frontendStatus: healthData.frontend.status,
            responseTime: healthData.responseTime
          }
        });
      }

    } catch (error) {
      console.error('❌ Health check failed:', error);
      
      setHealth(prev => ({
        ...prev,
        backend: { 
          status: 'error', 
          message: error.message || 'Failed to check backend',
          data: null
        },
        frontend: { 
          status: 'error', 
          message: error.message || 'Failed to check frontend',
          data: null
        },
        lastCheck: new Date().toISOString()
      }));
      
      setError(error.message || 'Health check failed');
      
      if (frontendLogger && frontendLogger.logError) {
        frontendLogger.logError({
          message: error.message,
          context: 'health_check',
          details: error
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh every 30 seconds
  useEffect(() => {
    fetchHealth();
    
    // Auto-refresh interval
    const interval = setInterval(fetchHealth, 30000);
    
    // Cleanup
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Manual refresh
  const handleRefresh = () => {
    if (frontendLogger && frontendLogger.logActivity) {
      frontendLogger.logActivity({
        action: 'health_check_manual_refresh',
        details: { timestamp: new Date().toISOString() }
      });
    }
    fetchHealth();
  };

  // Status badge component using emojis
  const StatusBadge = ({ status, message }) => {
    const config = {
      healthy: { icon: '✅', className: 'text-green-500', bg: 'bg-green-100', label: 'Healthy' },
      checking: { icon: '⏳', className: 'text-blue-500', bg: 'bg-blue-100', label: 'Checking...' },
      unhealthy: { icon: '⚠️', className: 'text-yellow-500', bg: 'bg-yellow-100', label: 'Unhealthy' },
      error: { icon: '❌', className: 'text-red-500', bg: 'bg-red-100', label: 'Error' }
    };

    const current = config[status] || config.checking;

    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${current.bg}`}>
        <span className="text-base">{current.icon}</span>
        <span className="text-sm font-medium">{message || current.label}</span>
      </div>
    );
  };

  // Format response time
  const formatResponseTime = (time) => {
    if (!time) return 'N/A';
    if (typeof time === 'string') return time;
    return `${time}ms`;
  };

  // Loading skeleton
  if (isLoading && !health.lastCheck) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="flex justify-between items-center mb-4">
            <div className="h-6 bg-gray-200 rounded w-40"></div>
            <div className="h-4 bg-gray-200 rounded w-24"></div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-32"></div>
                <div className="h-3 bg-gray-200 rounded w-24 mt-1"></div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-32"></div>
                <div className="h-3 bg-gray-200 rounded w-24 mt-1"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">🌐 Frontend & Health Status</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Last Check: {health.lastCheck ? new Date(health.lastCheck).toLocaleString() : 'Never'}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <span className={`text-gray-600 ${isLoading ? 'animate-spin' : ''}`}>🔄</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600 flex items-center gap-2">
            <span>❌</span>
            {error}
          </p>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Backend Status */}
        <div className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-blue-500 text-xl">🖥️</span>
            <span className="font-medium text-gray-700">Backend</span>
            <StatusBadge 
              status={health.backend.status} 
              message={health.backend.status === 'checking' ? 'Checking...' : health.backend.message}
            />
          </div>
          {health.backend.data && (
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <p>Status: {health.backend.data.status || health.backend.data.message || 'N/A'}</p>
              {health.backend.data.uptime !== undefined && (
                <p>Uptime: {Math.floor(health.backend.data.uptime / 3600)}h {Math.floor((health.backend.data.uptime % 3600) / 60)}m</p>
              )}
              {health.backend.data.memoryUsage && (
                <p>Memory: {Math.round(health.backend.data.memoryUsage.heapUsed / 1024 / 1024)}MB</p>
              )}
              {health.backend.data.responseTime && (
                <p>Response: {formatResponseTime(health.backend.data.responseTime)}</p>
              )}
            </div>
          )}
        </div>

        {/* Frontend Status */}
        <div className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-green-500 text-xl">🌍</span>
            <span className="font-medium text-gray-700">Frontend</span>
            <StatusBadge 
              status={health.frontend.status} 
              message={health.frontend.status === 'checking' ? 'Checking...' : health.frontend.message}
            />
          </div>
          {health.frontend.data && (
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <p>Status: {health.frontend.data.status || 'N/A'}</p>
              {health.frontend.data.url && (
                <p>URL: <span className="font-mono">{health.frontend.data.url}</span></p>
              )}
              {health.frontend.data.statusCode && (
                <p>HTTP Status: {health.frontend.data.statusCode}</p>
              )}
              {health.frontend.data.responseTime && (
                <p>Response Time: {health.frontend.data.responseTime}</p>
              )}
              {health.frontend.data.error && (
                <p className="text-red-500">Error: {health.frontend.data.error}</p>
              )}
              {health.frontend.data.containerStatus && (
                <p>Container: {health.frontend.data.containerStatus}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Frontend Application Details */}
      {health.frontend.data && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">📋 Frontend Application Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
            <div>
              <p><span className="font-medium">Status:</span> {health.frontend.data.status || 'Unknown'}</p>
              {health.frontend.data.lastChecked && (
                <p><span className="font-medium">Last Checked:</span> {new Date(health.frontend.data.lastChecked).toLocaleString()}</p>
              )}
              {health.frontend.data.responseTime && (
                <p><span className="font-medium">Response Time:</span> {health.frontend.data.responseTime}</p>
              )}
            </div>
            <div>
              {health.frontend.data.url && (
                <p><span className="font-medium">URL:</span> <span className="font-mono text-xs">{health.frontend.data.url}</span></p>
              )}
              {health.frontend.data.statusCode && (
                <p><span className="font-medium">HTTP Status:</span> {health.frontend.data.statusCode}</p>
              )}
              {health.frontend.data.containerStatus && (
                <p><span className="font-medium">Container:</span> {health.frontend.data.containerStatus}</p>
              )}
              {health.frontend.data.skipDockerCheck !== undefined && (
                <p><span className="font-medium">Docker Check:</span> {health.frontend.data.skipDockerCheck ? 'Skipped' : 'Enabled'}</p>
              )}
            </div>
          </div>
          {health.frontend.data.healthCheck && Object.keys(health.frontend.data.healthCheck).length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-600">Health Check Details:</p>
              <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                {JSON.stringify(health.frontend.data.healthCheck, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* No Data Message */}
      {!health.frontend.data && !isLoading && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">📭 No status data available.</p>
        </div>
      )}

      {/* Response Time */}
      {health.responseTime > 0 && (
        <div className="mt-3 text-right text-xs text-gray-400">
          ⏱️ Check completed in {health.responseTime}ms
        </div>
      )}
    </div>
  );
};

export default HealthMonitor;