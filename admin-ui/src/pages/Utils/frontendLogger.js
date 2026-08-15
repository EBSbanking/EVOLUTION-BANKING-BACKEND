// src/utils/frontendLogger.js
/**
 * Frontend Logger - For logging client-side events, errors, and activities
 */
class FrontendLogger {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logQueue = [];
    this.flushInterval = null;
    this.maxQueueSize = 50;
    this.apiEndpoint = '/api/logs/frontend';
    
    if (this.isProduction) {
      this.startAutoFlush();
    }
  }

  logActivity(data = {}) {
    const logEntry = {
      type: 'activity',
      timestamp: new Date().toISOString(),
      action: data.action || 'unknown_action',
      details: data.details || {},
      userId: data.userId || this.getUserId(),
      sessionId: data.sessionId || this.getSessionId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      environment: process.env.NODE_ENV || 'development'
    };

    if (!this.isProduction) {
      console.log(`📊 [${logEntry.action}]`, logEntry.details);
    }

    this.queueLog(logEntry);
  }

  logError(data = {}) {
    const logEntry = {
      type: 'error',
      timestamp: new Date().toISOString(),
      message: data.message || 'Unknown error',
      stack: data.stack || null,
      context: data.context || 'application',
      severity: data.severity || 'error',
      userId: data.userId || this.getUserId(),
      sessionId: data.sessionId || this.getSessionId(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      environment: process.env.NODE_ENV || 'development'
    };

    console.error(`❌ [${logEntry.context}]`, logEntry.message);
    if (logEntry.stack) {
      console.error(logEntry.stack);
    }

    this.queueLog(logEntry);
  }

  logApi(data = {}) {
    const logEntry = {
      type: 'api',
      timestamp: new Date().toISOString(),
      method: data.method || 'GET',
      url: data.url || 'unknown',
      status: data.status || 0,
      duration: data.duration || 0,
      request: data.request || null,
      response: data.response || null,
      userId: data.userId || this.getUserId(),
      sessionId: data.sessionId || this.getSessionId(),
      environment: process.env.NODE_ENV || 'development'
    };

    if (!this.isProduction) {
      const emoji = logEntry.status < 400 ? '✅' : '❌';
      console.log(`${emoji} [${logEntry.method}] ${logEntry.url} - ${logEntry.status} (${logEntry.duration}ms)`);
    }

    this.queueLog(logEntry);
  }

  logPageView(page, data = {}) {
    this.logActivity({
      action: 'page_view',
      details: {
        page: page || window.location.pathname,
        referrer: document.referrer,
        ...data
      }
    });
  }

  logUserAction(action, data = {}) {
    this.logActivity({
      action: action,
      details: {
        element: data.element || null,
        value: data.value || null,
        path: data.path || null,
        ...data
      }
    });
  }

  queueLog(logEntry) {
    this.logQueue.push(logEntry);
    if (this.logQueue.length >= this.maxQueueSize) {
      this.flushLogs();
    }
  }

  async flushLogs() {
    if (this.logQueue.length === 0) return;

    const logsToSend = [...this.logQueue];
    this.logQueue = [];

    try {
      if (document.visibilityState === 'hidden' || navigator.sendBeacon) {
        const blob = new Blob(
          [JSON.stringify({ logs: logsToSend, timestamp: new Date().toISOString() })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(this.apiEndpoint, blob);
      } else {
        const response = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logs: logsToSend, timestamp: new Date().toISOString() }),
        });

        if (!response.ok) {
          console.warn('⚠️ Failed to send logs to backend:', response.status);
          this.logQueue = [...logsToSend, ...this.logQueue];
        }
      }
    } catch (error) {
      console.warn('⚠️ Error sending logs:', error.message);
      this.logQueue = [...logsToSend, ...this.logQueue];
    }
  }

  startAutoFlush() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushInterval = setInterval(() => {
      this.flushLogs();
    }, 30000);

    window.addEventListener('beforeunload', () => {
      this.flushLogs();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushLogs();
      }
    });
  }

  getUserId() {
    try {
      const user = localStorage.getItem('user');
      if (user) {
        const parsed = JSON.parse(user);
        return parsed.id || parsed.userId || parsed.user_id || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  getSessionId() {
    try {
      let sessionId = sessionStorage.getItem('sessionId');
      if (!sessionId) {
        sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('sessionId', sessionId);
      }
      return sessionId;
    } catch {
      return null;
    }
  }

  getQueueStatus() {
    return {
      queueSize: this.logQueue.length,
      maxQueueSize: this.maxQueueSize,
      isProduction: this.isProduction
    };
  }

  clearQueue() {
    this.logQueue = [];
  }
}

const frontendLogger = new FrontendLogger();

if (typeof window !== 'undefined') {
  window.frontendLogger = frontendLogger;
}

export default frontendLogger;