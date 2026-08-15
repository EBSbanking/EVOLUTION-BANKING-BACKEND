// src/services/HealthMonitorService.js
import { sendEmail } from '../utils/emailService.js';
import logger from '../utils/logger.js';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class HealthMonitorService {
  constructor() {
    this.isShuttingDown = false;
    this.alertCooldown = 60000; // 1 minute between alerts
    this.lastAlertTime = 0;
    this.alertRecipients = process.env.ALERT_EMAILS ? 
      process.env.ALERT_EMAILS.split(',') : 
      ['admin@yourbank.com'];
    this.checkInterval = null;
    this.healthLogFile = path.join(__dirname, '../../logs/health-monitor.log');
    this.ensureLogDirectory();
    this.lastCheckTime = null;
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.healthLogFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  logHealthEvent(event, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      ...data,
      hostname: os.hostname(),
      pid: process.pid
    };
    
    try {
      fs.appendFileSync(
        this.healthLogFile, 
        JSON.stringify(logEntry) + '\n'
      );
    } catch (error) {
      // Silent fail - don't want logging to cause issues
    }
  }

  async sendAlertEmail(subject, details, isCritical = true) {
    const now = Date.now();
    
    // Prevent alert spam
    if (now - this.lastAlertTime < this.alertCooldown && !isCritical) {
      console.log('⏳ Alert cooldown active, skipping notification');
      return;
    }
    
    this.lastAlertTime = now;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f4f7fc; padding: 20px; }
            .container { max-width: 700px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; border-bottom: 3px solid ${isCritical ? '#dc2626' : '#d97706'}; padding-bottom: 20px; }
            .header h1 { color: ${isCritical ? '#dc2626' : '#d97706'}; font-size: 24px; }
            .status-badge { display: inline-block; padding: 8px 20px; border-radius: 20px; color: #fff; font-weight: bold; background: ${isCritical ? '#dc2626' : '#d97706'}; }
            .info-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .info-table td { padding: 10px; border-bottom: 1px solid #eee; }
            .info-table .label { font-weight: 600; color: #555; width: 40%; }
            .info-table .value { color: #333; }
            .details { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; font-family: monospace; font-size: 13px; white-space: pre-wrap; }
            .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 ${isCritical ? 'CRITICAL' : 'WARNING'}</h1>
              <span class="status-badge">${isCritical ? 'SYSTEM DOWN' : 'SYSTEM DEGRADED'}</span>
            </div>

            <h2>${subject}</h2>

            <table class="info-table">
              <tr><td class="label">📅 Timestamp</td><td class="value">${new Date().toISOString()}</td></tr>
              <tr><td class="label">🖥️ Hostname</td><td class="value">${os.hostname()}</td></tr>
              <tr><td class="label">🆔 Process ID</td><td class="value">${process.pid}</td></tr>
              <tr><td class="label">📁 Node Version</td><td class="value">${process.version}</td></tr>
              <tr><td class="label">💾 Platform</td><td class="value">${os.platform()} ${os.release()}</td></tr>
              <tr><td class="label">📊 Memory Usage</td><td class="value">${JSON.stringify(this.formatMemory(process.memoryUsage()))}</td></tr>
              <tr><td class="label">⏱️ Uptime</td><td class="value">${this.formatUptime(process.uptime())}</td></tr>
              <tr><td class="label">🔄 CPU Load</td><td class="value">${os.loadavg().map(l => l.toFixed(2)).join(', ')}</td></tr>
            </table>

            ${details ? `
              <h3>📋 Details</h3>
              <div class="details">${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}</div>
            ` : ''}

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Evolution Banking - Health Monitor</p>
              <p style="font-size: 11px; color: #bbb;">This is an automated alert, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      ${subject}
      Timestamp: ${new Date().toISOString()}
      Hostname: ${os.hostname()}
      PID: ${process.pid}
      Details: ${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}
    `;

    // Send to all recipients
    const results = [];
    for (const recipient of this.alertRecipients) {
      if (recipient && recipient.includes('@')) {
        const result = await sendEmail(
          recipient.trim(),
          `🚨 ${subject}`,
          html,
          text
        );
        results.push({ recipient, ...result });
      }
    }

    this.logHealthEvent('alert_sent', { 
      recipients: this.alertRecipients, 
      subject, 
      isCritical 
    });

    return results;
  }

  formatMemory(memory) {
    return {
      rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memory.external / 1024 / 1024)} MB`
    };
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  }

  async checkHealth() {
    try {
      // Check database connection
      const { sequelize } = await import('../../config/db.js');
      await sequelize.authenticate();
      console.log('✅ Database health check passed');
      
      // Check disk space - only on non-Windows
      if (process.platform !== 'win32') {
        const diskInfo = this.getDiskSpace();
        if (diskInfo && diskInfo.free < 1024 * 1024 * 100) { // Less than 100MB free
          await this.sendAlertEmail(
            '⚠️ Low Disk Space Warning',
            {
              free: `${Math.round(diskInfo.free / 1024 / 1024)} MB`,
              total: `${Math.round(diskInfo.total / 1024 / 1024)} MB`,
              used: `${Math.round(diskInfo.used / 1024 / 1024)} MB`,
              usagePercent: `${Math.round((diskInfo.used / diskInfo.total) * 100)}%`
            },
            false
          );
        }
      } else {
        console.log('ℹ️ Disk space check disabled on Windows');
      }

      this.lastCheckTime = new Date();
      this.logHealthEvent('health_check_success', { 
        memory: this.formatMemory(process.memoryUsage()),
        uptime: process.uptime()
      });

      return true;
    } catch (error) {
      this.logHealthEvent('health_check_failed', { error: error.message });
      
      // Send alert for critical failure
      await this.sendAlertEmail(
        '🚨 Database Connection Failed',
        {
          error: error.message,
          stack: error.stack,
          memory: this.formatMemory(process.memoryUsage()),
          uptime: this.formatUptime(process.uptime())
        },
        true
      );
      
      return false;
    }
  }

  /**
   * Get disk space information
   * Works on Windows (PowerShell), Linux, and Mac
   */
  getDiskSpace() {
    try {
      let output;
      
      if (process.platform === 'win32') {
        // Windows - Try PowerShell first (more reliable)
        try {
          const psCommand = `Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -gt 0 } | Select-Object Name, Used, Free`;
          output = execSync(`powershell -Command "${psCommand}"`, { encoding: 'utf8' });
          
          const lines = output.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3 && parts[0].length === 2 && parts[0].endsWith(':')) {
              const free = parseInt(parts[2]) || 0;
              const used = parseInt(parts[1]) || 0;
              const total = free + used;
              if (total > 0) {
                return { total, used, free };
              }
            }
          }
        } catch (psError) {
          console.warn('PowerShell disk check failed, trying fallback:', psError.message);
        }
        
        // Fallback: Try WMIC (deprecated but works on older Windows)
        try {
          output = execSync('wmic logicaldisk where DriveType=3 get DeviceID,Size,FreeSpace', { encoding: 'utf8' });
          const lines = output.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3 && parts[0].includes(':')) {
              const size = parseInt(parts[1]);
              const free = parseInt(parts[2]);
              if (!isNaN(size) && !isNaN(free) && size > 0) {
                return { 
                  total: size, 
                  free: free,
                  used: size - free
                };
              }
            }
          }
        } catch (wmicError) {
          console.warn('WMIC disk check failed:', wmicError.message);
        }
        
        // Final fallback: Use Node's built-in for the current drive
        try {
          const drive = process.cwd().substring(0, 2);
          const result = execSync(`dir ${drive}\\`, { encoding: 'utf8' });
          // Parse dir output for free space
          const match = result.match(/([\d,]+)\s+bytes free/);
          if (match) {
            const free = parseInt(match[1].replace(/,/g, ''));
            // Estimate total as free * 2 (rough estimate)
            const total = free * 2;
            return { total, used: total - free, free };
          }
        } catch (dirError) {
          console.warn('Directory disk check failed:', dirError.message);
        }
        
        return null;
      } else {
        // Linux/Mac - use df
        output = execSync('df -k /', { encoding: 'utf8' });
        const lines = output.split('\n').filter(line => line.trim());
        for (const line of lines) {
          if (line.includes('/') && !line.includes('Filesystem')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              const total = parseInt(parts[1]) * 1024;
              const used = parseInt(parts[2]) * 1024;
              const free = parseInt(parts[3]) * 1024;
              if (!isNaN(total) && !isNaN(used) && !isNaN(free)) {
                return { total, used, free };
              }
            }
          }
        }
        return null;
      }
    } catch (error) {
      console.warn('Disk space check failed:', error.message);
      return null;
    }
  }

  // ================================================================
  // ✅ SHUTDOWN NOTIFICATION - WITH MONGODB LOG FILTERING
  // ================================================================
  async notifyShutdown(cause = 'Unknown') {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    const details = {
      cause,
      reason: cause,
      timestamp: new Date().toISOString(),
      uptime: this.formatUptime(process.uptime()),
      memory: this.formatMemory(process.memoryUsage()),
      pid: process.pid,
      hostname: os.hostname(),
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      env: process.env.NODE_ENV || 'development'
    };

    // Try to get the last few logs - FILTER OUT MONGODB LOGS
    try {
      const logPath = path.join(__dirname, '../../logs/app.log');
      if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf8');
        const lines = logs.split('\n').filter(Boolean);
        
        // ✅ FILTER: Remove MongoDB related logs
        const filteredLines = lines.filter(line => {
          const lowerLine = line.toLowerCase();
          return !lowerLine.includes('mongodb') && 
                 !lowerLine.includes('mongo') &&
                 !lowerLine.includes('mongod') &&
                 !lowerLine.includes('mongoose') &&
                 !lowerLine.includes('db connection') &&
                 !line.includes('MongoDB connected successfully');
        });
        
        // Get last 50 filtered lines
        details.recentLogs = filteredLines.slice(-50).join('\n');
        
        // If no logs after filtering, show a message
        if (!details.recentLogs || details.recentLogs.trim() === '') {
          details.recentLogs = 'No recent logs (MongoDB logs filtered out)';
        }
      }
    } catch (error) {
      details.recentLogs = 'Unable to read logs';
    }

    await this.sendAlertEmail(
      '🚨 SERVER SHUTDOWN NOTIFICATION',
      details,
      true
    );

    this.logHealthEvent('shutdown_notification_sent', details);
  }

  // ================================================================
  // ✅ START HEALTH MONITORING
  // ================================================================
  startMonitoring(interval = 300000) { // Default: 5 minutes
    console.log('🔄 Starting health monitor service...');
    
    // Check immediately on start
    setTimeout(() => this.checkHealth(), 5000);
    
    // Regular checks
    this.checkInterval = setInterval(() => {
      this.checkHealth();
    }, interval);

    // Register shutdown handlers
    this.registerShutdownHandlers();
  }

  registerShutdownHandlers() {
    // Handle SIGTERM (docker stop, systemd stop)
    process.on('SIGTERM', async () => {
      await this.notifyShutdown('SIGTERM - Process terminated');
      process.exit(0);
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      await this.notifyShutdown('SIGINT - Manual shutdown (Ctrl+C)');
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      await this.notifyShutdown(`Uncaught Exception: ${error.message}`);
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', async (reason) => {
      await this.notifyShutdown(`Unhandled Rejection: ${reason}`);
      console.error('Unhandled Rejection:', reason);
    });

    // Handle process exit
    process.on('exit', (code) => {
      if (!this.isShuttingDown) {
        this.notifyShutdown(`Process exited with code: ${code}`);
      }
    });
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('⏹️ Health monitoring stopped');
    }
  }
}

// Create singleton instance
const healthMonitor = new HealthMonitorService();

export default healthMonitor;
export { healthMonitor };