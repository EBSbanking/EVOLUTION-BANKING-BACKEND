// services/rfidAuthService.js
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import User from '../models/User.js';
import Login from '../models/Login.js';
import RFIDToken from '../models/RFIDToken.js';
import RFIDLoginLog from '../models/RFIDLoginLog.js';
import rfidReaderService from './rfidReaderService.js';
import logger from '../utils/logger.js';

// Environment variables
const RFID_ENABLED = process.env.RFID_ENABLED === 'true';
const RFID_PORT = process.env.RFID_PORT || 'COM3';
const RFID_BAUD_RATE = parseInt(process.env.RFID_BAUD_RATE) || 9600;

class RFIDAuthService {
  constructor() {
    this.rfidReader = rfidReaderService;
    this.twoFactorService = null; // Will be loaded lazily
    this.isInitialized = false;
    this.loginAttempts = new Map();
    this.pendingLogins = new Map();
    this.rfidEnabled = RFID_ENABLED;
    this.simulationMode = !RFID_ENABLED;
  }

  /**
   * Lazy load twoFactorService to avoid circular dependency
   */
  async getTwoFactorService() {
    if (!this.twoFactorService) {
      try {
        // Dynamically import twoFactorService to avoid circular dependency
        const module = await import('./TwoFactorService.js');
        this.twoFactorService = module.default;
        logger.info('✅ TwoFactorService loaded lazily');
      } catch (error) {
        logger.error('❌ Failed to load TwoFactorService:', error.message);
        // Create a fallback if needed
        this.twoFactorService = null;
      }
    }
    return this.twoFactorService;
  }

  /**
   * Initialize RFID reader
   * @param {string} portPath - COM port path
   * @param {number} baudRate - Baud rate for serial communication
   * @returns {Promise<boolean>}
   */
  async initialize(portPath = RFID_PORT, baudRate = RFID_BAUD_RATE) {
    // Check if RFID is disabled via environment variable
    if (!this.rfidEnabled) {
      logger.info('ℹ️ RFID disabled via environment variable');
      this.isInitialized = true;
      this.simulationMode = true;
      return true;
    }

    if (this.isInitialized) {
      return true;
    }

    try {
      // Check if RFID reader is available
      const status = this.rfidReader.getStatus();
      
      if (!status.serialPortAvailable) {
        logger.warn('⚠️ SerialPort not available - running in simulation mode');
        this.isInitialized = true;
        this.simulationMode = true;
        return true;
      }

      // Connect to RFID reader
      const connected = await this.rfidReader.connect(portPath, baudRate);
      this.isInitialized = connected;
      
      if (connected) {
        // Set up card detection listener
        this.rfidReader.onCardDetected((cardData) => {
          logger.info(`RFID Token detected: ${cardData.serialNumber}`);
          this.handleTokenDetection(cardData);
        });
        logger.info('✅ RFID reader initialized successfully');
        this.simulationMode = false;
      } else {
        logger.warn('⚠️ Failed to connect to RFID reader - running in simulation mode');
        this.isInitialized = true;
        this.simulationMode = true;
      }
      
      return connected || this.simulationMode;
    } catch (error) {
      logger.error('❌ RFID initialization error:', error.message);
      logger.warn('⚠️ Running in simulation mode');
      this.isInitialized = true;
      this.simulationMode = true;
      return true;
    }
  }

  /**
   * Step 1: Initial login with username + password
   * @param {string} username - User's username
   * @param {string} password - User's password
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<Object>}
   */
  async initialLogin(username, password, ipAddress, userAgent) {
    try {
      // Validate username/password
      const user = await User.findOne({
        where: {
          [Op.or]: [
            { username: username },
            { email: username },
            { user_name: username }
          ]
        }
      });

      if (!user) {
        await this.createLoginRecord(null, username, ipAddress, userAgent, 'Failed', false);
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      // Check if user is active
      if (user.status !== 'Active') {
        await this.createLoginRecord(user.id, user.username, ipAddress, userAgent, 'Failed', false);
        return {
          success: false,
          error: 'Account is not active'
        };
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        await this.createLoginRecord(user.id, user.username, ipAddress, userAgent, 'Failed', false);
        
        // Increment failed attempts
        this.incrementFailedAttempts(user.id);
        
        // Check if account should be locked
        if (this.isAccountLocked(user.id)) {
          await User.update(
            { lock_until: new Date(Date.now() + 15 * 60 * 1000) },
            { where: { id: user.id } }
          );
          return {
            success: false,
            error: 'Account locked due to multiple failed attempts'
          };
        }
        
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      // Reset failed attempts on successful login
      this.clearFailedAttempts(user.id);
      await User.update(
        { failed_attempts: 0, lock_until: null },
        { where: { id: user.id } }
      );

      // Check if user has 2FA enabled with RFID
      if (user.rfid_enabled && this.rfidEnabled) {
        // Generate a temporary session ID for the 2FA step
        const tempSessionId = this.generateTempSessionId();
        
        // Store pending login data
        this.pendingLogins.set(tempSessionId, {
          user_id: user.id,
          username: user.username,
          ip_address: ipAddress,
          user_agent: userAgent,
          timestamp: Date.now()
        });

        return {
          success: true,
          requireRFID: true,
          tempSessionId: tempSessionId,
          message: 'Please tap your RFID token to complete login',
          userId: user.id,
          simulationMode: this.simulationMode
        };
      }

      // No 2FA required or RFID disabled - complete login
      const sessionToken = this.generateJWT(user);
      
      await this.createLoginRecord(user.id, user.username, ipAddress, userAgent, 'Success', true);
      
      return {
        success: true,
        token: sessionToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name
        },
        simulationMode: this.simulationMode
      };

    } catch (error) {
      logger.error('Initial login error:', error);
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  }

  /**
   * Step 2: Verify RFID token for 2FA
   * @param {string} tempSessionId - Temporary session ID
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client user agent
   * @returns {Promise<Object>}
   */
  async verifyRFIDToken(tempSessionId, ipAddress, userAgent) {
    try {
      // Check if temp session exists
      const pendingLogin = this.pendingLogins.get(tempSessionId);
      if (!pendingLogin) {
        return {
          success: false,
          error: 'Invalid or expired session'
        };
      }

      // Check if session expired (5 minute timeout)
      if (Date.now() - pendingLogin.timestamp > 5 * 60 * 1000) {
        this.pendingLogins.delete(tempSessionId);
        return {
          success: false,
          error: 'Session expired. Please login again.'
        };
      }

      // Ensure RFID reader is initialized
      if (!this.isInitialized) {
        const initialized = await this.initialize();
        if (!initialized) {
          return {
            success: false,
            error: 'RFID reader is not available'
          };
        }
      }

      // Read RFID token
      const cardData = await this.rfidReader.readCard(10000);
      
      if (!cardData) {
        return {
          success: false,
          error: 'No RFID token detected. Please tap your token.',
          requireCard: true
        };
      }

      logger.info(`RFID Token detected for 2FA: ${cardData.serialNumber}`);

      // Find the RFID token in database
      const rfidToken = await this.findRFIDToken(cardData);
      
      if (!rfidToken) {
        await this.logRFIDAttempt(
          pendingLogin.user_id,
          null,
          cardData,
          false,
          'TokenNotFound',
          'RFID token not registered',
          ipAddress,
          userAgent
        );
        return {
          success: false,
          error: 'RFID token not recognized'
        };
      }

      // Check if token is active and assigned to this user
      if (!rfidToken.is_active) {
        await this.logRFIDAttempt(
          pendingLogin.user_id,
          rfidToken.id,
          cardData,
          false,
          'InactiveToken',
          'RFID token is inactive',
          ipAddress,
          userAgent
        );
        return {
          success: false,
          error: 'RFID token is inactive'
        };
      }

      if (rfidToken.user_id !== pendingLogin.user_id) {
        await this.logRFIDAttempt(
          pendingLogin.user_id,
          rfidToken.id,
          cardData,
          false,
          'TokenNotAssigned',
          'RFID token not assigned to this user',
          ipAddress,
          userAgent
        );
        return {
          success: false,
          error: 'Token not assigned to this user'
        };
      }

      // Get the user
      const user = await User.findByPk(pendingLogin.user_id);
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Check for too many failed attempts
      if (this.isAccountLocked(user.id)) {
        return {
          success: false,
          error: 'Account temporarily locked due to multiple failed attempts'
        };
      }

      // Update token usage
      await rfidToken.incrementUsage();

      // Log successful 2FA verification
      await this.logRFIDAttempt(
        user.id,
        rfidToken.id,
        cardData,
        true,
        'Success',
        null,
        ipAddress,
        userAgent
      );

      // Create login record
      await this.createLoginRecord(
        user.id,
        user.username,
        ipAddress,
        userAgent,
        'Success',
        true,
        true,
        rfidToken.serial_number
      );

      // Clear failed attempts
      this.clearFailedAttempts(user.id);

      // Remove pending login
      this.pendingLogins.delete(tempSessionId);

      // Generate final JWT token
      const sessionToken = this.generateJWT(user);

      return {
        success: true,
        message: '2FA verification successful',
        token: sessionToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name
        },
        simulationMode: this.simulationMode
      };

    } catch (error) {
      logger.error('RFID 2FA verification error:', error);
      return {
        success: false,
        error: 'Internal server error'
      };
    }
  }

  /**
   * Handle real-time token detection
   * @param {Object} cardData - Detected card data
   */
  handleTokenDetection(cardData) {
    logger.info(`Token ${cardData.serialNumber} detected`);
    
    // Check if there's a pending login for this token
    for (const [sessionId, pendingLogin] of this.pendingLogins.entries()) {
      logger.info(`Pending login session exists for user: ${pendingLogin.username}`);
    }
  }

  /**
   * Find RFID token in database
   * @param {Object} cardData - Card data from reader
   * @returns {Promise<Object|null>}
   */
  async findRFIDToken(cardData) {
    try {
      let token = await RFIDToken.findOne({
        where: {
          [Op.or]: [
            { serial_number: cardData.serialNumber },
            { card_number: cardData.cardNumber },
            { raw_data: cardData.raw }
          ],
          is_active: true
        }
      });

      // If not found by exact match, try partial match
      if (!token && cardData.cardNumber) {
        token = await RFIDToken.findOne({
          where: {
            card_number: {
              [Op.like]: `%${cardData.cardNumber}%`
            },
            is_active: true
          }
        });
      }

      return token;
    } catch (error) {
      logger.error('Error finding RFID token:', error);
      return null;
    }
  }

  /**
   * Create login record
   * @param {number} userId - User ID
   * @param {string} username - Username
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent
   * @param {string} status - Login status
   * @param {boolean} success - Success flag
   * @param {boolean} rfidUsed - Whether RFID was used
   * @param {string} rfidSerial - RFID serial number
   * @returns {Promise<void>}
   */
  async createLoginRecord(userId, username, ipAddress, userAgent, status, success, rfidUsed = false, rfidSerial = null) {
    try {
      await Login.create({
        user_id: userId,
        user_name: username,
        username: username,
        login_time: new Date(),
        ip_address: ipAddress,
        user_agent: userAgent,
        status: status,
        success: success,
        attempt_identifier: username,
        login_type: rfidUsed ? 'rfid_2fa' : 'password',
        device_type: this.detectDeviceType(userAgent),
        rfid_used: rfidUsed,
        rfid_token_serial: rfidSerial,
        two_factor_type: rfidUsed ? 'rfid' : 'none'
      });
    } catch (error) {
      logger.error('Error creating login record:', error);
    }
  }

  /**
   * Log RFID attempt
   * @param {number} userId - User ID
   * @param {number} tokenId - Token ID
   * @param {Object} cardData - Card data
   * @param {boolean} success - Success flag
   * @param {string} status - Status
   * @param {string} errorMessage - Error message
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent
   * @returns {Promise<void>}
   */
  async logRFIDAttempt(userId, tokenId, cardData, success, status, errorMessage, ipAddress, userAgent) {
    try {
      await RFIDLoginLog.create({
        user_id: userId,
        token_id: tokenId,
        serial_number: cardData.serialNumber || cardData.cardNumber,
        batch_number: cardData.batchNumber || null,
        card_number: cardData.cardNumber,
        raw_data: cardData.raw,
        success: success,
        status: status,
        error_message: errorMessage,
        ip_address: ipAddress,
        user_agent: userAgent,
        two_factor_step: 'token_verification',
        attempt_time: new Date()
      });
    } catch (error) {
      logger.error('Error logging RFID attempt:', error);
    }
  }

  /**
   * Detect device type from user agent
   * @param {string} userAgent - User agent string
   * @returns {string}
   */
  detectDeviceType(userAgent) {
    if (!userAgent) return 'unknown';
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    return 'desktop';
  }

  /**
   * Generate temporary session ID
   * @returns {string}
   */
  generateTempSessionId() {
    return `tmp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Increment failed login attempts
   * @param {number} userId - User ID
   */
  incrementFailedAttempts(userId) {
    const key = `failed_${userId}`;
    const attempts = this.loginAttempts.get(key) || 0;
    this.loginAttempts.set(key, attempts + 1);
    
    setTimeout(() => {
      this.loginAttempts.delete(key);
    }, 15 * 60 * 1000);
  }

  /**
   * Check if account is locked
   * @param {number} userId - User ID
   * @returns {boolean}
   */
  isAccountLocked(userId) {
    const key = `failed_${userId}`;
    const attempts = this.loginAttempts.get(key) || 0;
    return attempts >= 5;
  }

  /**
   * Clear failed attempts
   * @param {number} userId - User ID
   */
  clearFailedAttempts(userId) {
    const key = `failed_${userId}`;
    this.loginAttempts.delete(key);
  }

  /**
   * Generate JWT token
   * @param {Object} user - User object
   * @returns {string}
   */
  generateJWT(user) {
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      two_factor_verified: true
    };

    return jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
  }

  /**
   * Register RFID token for user
   * @param {number} userId - User ID
   * @param {Object} cardData - Card data from reader
   * @param {Object} options - Additional options
   * @returns {Promise<Object>}
   */
  async registerRFIDToken(userId, cardData, options = {}) {
    try {
      // Check if token already exists
      const existingToken = await RFIDToken.findOne({
        where: {
          [Op.or]: [
            { serial_number: cardData.serialNumber },
            { card_number: cardData.cardNumber }
          ]
        }
      });

      if (existingToken) {
        return {
          success: false,
          error: 'RFID token already registered',
          token: existingToken
        };
      }

      const tokenData = {
        user_id: userId,
        serial_number: cardData.serialNumber || options.serialNumber,
        batch_number: options.batchNumber || null,
        card_number: cardData.cardNumber,
        facility_code: cardData.facilityCode || null,
        raw_data: cardData.raw || null,
        manufacturer: options.manufacturer || 'HID Global',
        device_type: options.deviceType || 'Mini Token',
        date_code: options.dateCode || null,
        is_active: true,
        is_primary: options.isPrimary || false,
        registered_by: options.registeredBy || null,
        notes: options.notes || null
      };

      const token = await RFIDToken.create(tokenData);

      // Update user to enable RFID 2FA
      await User.update(
        { rfid_enabled: true },
        { where: { id: userId } }
      );

      return {
        success: true,
        token: token,
        message: 'RFID token registered successfully for 2FA'
      };
    } catch (error) {
      logger.error('Error registering RFID token:', error);
      return {
        success: false,
        error: 'Failed to register RFID token'
      };
    }
  }

  /**
   * Get RFID reader status
   * @returns {Object}
   */
  getReaderStatus() {
    const status = this.rfidReader.getStatus();
    return {
      ...status,
      enabled: this.rfidEnabled,
      simulationMode: this.simulationMode,
      initialized: this.isInitialized
    };
  }

  /**
   * Disconnect RFID reader
   */
  disconnectReader() {
    this.rfidReader.disconnect();
    this.isInitialized = false;
  }

  /**
   * Check if RFID is enabled
   * @returns {boolean}
   */
  isRFIDEnabled() {
    return this.rfidEnabled && !this.simulationMode;
  }

  /**
   * Check if in simulation mode
   * @returns {boolean}
   */
  isSimulationMode() {
    return this.simulationMode;
  }

  /**
   * Simulate card detection (for testing)
   * @param {Object} cardData - Optional card data to simulate
   * @returns {Promise<boolean>}
   */
  async simulateCard(cardData = null) {
    return await this.rfidReader.simulateCardDetection(cardData);
  }

  /**
   * Get pending login sessions
   * @returns {Array}
   */
  getPendingLogins() {
    const sessions = [];
    for (const [key, value] of this.pendingLogins.entries()) {
      sessions.push({
        sessionId: key,
        userId: value.user_id,
        username: value.username,
        timestamp: value.timestamp,
        age: Date.now() - value.timestamp
      });
    }
    return sessions;
  }

  /**
   * Clean up expired pending logins
   */
  cleanupPendingLogins() {
    const now = Date.now();
    const expiryMs = 5 * 60 * 1000; // 5 minutes
    
    for (const [key, value] of this.pendingLogins.entries()) {
      if (now - value.timestamp > expiryMs) {
        this.pendingLogins.delete(key);
      }
    }
  }

  /**
   * Get pending login by tempSessionId
   * @param {string} tempSessionId - Temporary session ID
   * @returns {Object|null}
   */
  getPendingLogin(tempSessionId) {
    return this.pendingLogins.get(tempSessionId) || null;
  }

  /**
   * Get all active RFID tokens for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>}
   */
  async getUserRFIDTokens(userId) {
    try {
      return await RFIDToken.findAll({
        where: {
          user_id: userId,
          is_active: true
        },
        order: [['is_primary', 'DESC'], ['created_at', 'DESC']]
      });
    } catch (error) {
      logger.error('Error getting user RFID tokens:', error);
      return [];
    }
  }

  /**
   * Deactivate RFID token
   * @param {number} tokenId - Token ID
   * @param {number} userId - User ID (for authorization)
   * @returns {Promise<Object>}
   */
  async deactivateRFIDToken(tokenId, userId) {
    try {
      const token = await RFIDToken.findOne({
        where: {
          id: tokenId,
          user_id: userId
        }
      });

      if (!token) {
        return {
          success: false,
          error: 'Token not found or not owned by user'
        };
      }

      token.is_active = false;
      await token.save();

      // Check if user has any other active tokens
      const activeTokens = await RFIDToken.count({
        where: {
          user_id: userId,
          is_active: true
        }
      });

      // If no active tokens, disable RFID for user
      if (activeTokens === 0) {
        await User.update(
          { rfid_enabled: false },
          { where: { id: userId } }
        );
      }

      return {
        success: true,
        message: 'RFID token deactivated successfully'
      };
    } catch (error) {
      logger.error('Error deactivating RFID token:', error);
      return {
        success: false,
        error: 'Failed to deactivate RFID token'
      };
    }
  }
}

// Create singleton instance
const rfidAuthService = new RFIDAuthService();

// Initialize RFID reader on service load (non-blocking)
rfidAuthService.initialize().catch(err => {
  logger.warn('⚠️ RFID initialization on load failed:', err.message);
});

export default rfidAuthService;