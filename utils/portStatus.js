// utils/portStatus.js
import logger from './logger.js';

class PortStatusMonitor {
  constructor() {
    this.isConnected = false;
    this.connectionTime = null;
  }

  onPortConnected(server, port) {
    server.on('listening', () => {
      this.isConnected = true;
      this.connectionTime = new Date();
      
      const address = server.address();
      logger.info(`🎯 PORT CONNECTION ESTABLISHED: Port ${port} is active`, {
        status: 'connected',
        timestamp: this.connectionTime.toISOString(),
        address: address.address,
        port: address.port,
        protocol: 'HTTP'
      });
      
      console.log(`\n✨ ========================================`);
      console.log(`✨ SERVER PORT CONNECTION SUCCESSFUL`);
      console.log(`✨ Port: ${port}`);
      console.log(`✨ Status: Listening for requests`);
      console.log(`✨ Time: ${this.connectionTime.toLocaleString()}`);
      console.log(`✨ ========================================\n`);
    });

    server.on('error', (error) => {
      this.isConnected = false;
      logger.error('PORT CONNECTION FAILED', {
        error: error.message,
        code: error.code,
        port: port
      });
    });
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      connectionTime: this.connectionTime,
      uptime: this.isConnected ? Date.now() - this.connectionTime.getTime() : 0
    };
  }
}

export default new PortStatusMonitor();