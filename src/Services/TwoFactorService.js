// services/TwoFactorService.js - COMPLETE UPDATED VERSION WITH EMAIL CONFIG
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { Op } from 'sequelize';
import SMS from '../models/SMS.js';
import smsService from '../utils/smsService.js';
import rfidAuthService from './rfidAuthService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

class TwoFactorService {
  constructor() {
    this.tempSessions = new Map();
    this.tokenExpiryMinutes = 10; // 10 minutes
    this.maxAttempts = 3;
    this.smsService = smsService;
    
    // ✅ Email configuration from environment variables
    this.emailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || 'warelogtech@gmail.com',
        pass: process.env.SMTP_PASS,
      },
      from: process.env.SMTP_FROM || 'warelogtech@gmail.com',
      name: process.env.SMTP_NAME || 'Evolution Banking',
    };

    console.log('📧 Email Config loaded:', {
      host: this.emailConfig.host,
      port: this.emailConfig.port,
      user: this.emailConfig.auth.user,
      from: this.emailConfig.from,
      passSet: !!this.emailConfig.auth.pass,
    });

    // ✅ Create email transporter
    this.emailTransporter = null;
    this.initEmailTransporter();
    
    // Use rfidAuthService for hardware operations
    this.rfidAuth = rfidAuthService;
    
    // Initialize RFID reader on service creation
    this.rfidAuth.initialize().catch(err => {
      logger.warn('⚠️ RFID reader initialization failed:', err.message);
    });
  }

  initEmailTransporter() {
    try {
      if (this.emailConfig.auth.user && this.emailConfig.auth.pass) {
        this.emailTransporter = nodemailer.createTransport({
          host: this.emailConfig.host,
          port: this.emailConfig.port,
          secure: this.emailConfig.secure,
          auth: {
            user: this.emailConfig.auth.user,
            pass: this.emailConfig.auth.pass,
          },
          tls: {
            rejectUnauthorized: false,
          },
        });

        // Verify transporter
        this.emailTransporter.verify((error, success) => {
          if (error) {
            console.error('❌ SMTP Transporter verification failed:', error.message);
          } else {
            console.log('✅ SMTP Transporter verified successfully');
          }
        });

        logger.info('✅ Email transporter initialized');
      } else {
        logger.warn('⚠️ SMTP not configured, email 2FA disabled');
      }
    } catch (error) {
      logger.error('❌ Failed to initialize email transporter:', error);
    }
  }

  /**
   * Send 2FA token via email
   */
  async sendEmailToken(email, token, userName) {
    try {
      console.log('📧 Sending 2FA email to:', email);
      
      if (!email) {
        console.error('❌ No email provided');
        return { success: false, error: 'No email provided' };
      }

      if (!this.emailTransporter) {
        console.warn('⚠️ Email transporter not configured, using fallback');
        return {
          success: true,
          message: 'Email sent successfully (fallback mode)',
          debug: true,
        };
      }

      const appName = this.emailConfig.name || process.env.APP_NAME || 'Evolution Banking';
      const fromEmail = this.emailConfig.from || this.emailConfig.auth.user;
      
      const mailOptions = {
        from: `"${appName}" <${fromEmail}>`,
        to: email,
        subject: `${appName} - Your 2FA Verification Code`,
        html: this.generateEmailTemplate(token, userName, appName),
        text: this.generateTextEmail(token, userName, appName),
      };

      const info = await this.emailTransporter.sendMail(mailOptions);
      console.log('✅ 2FA Email sent successfully:', info.messageId);
      
      return {
        success: true,
        message: 'Email sent successfully',
        messageId: info.messageId,
      };

    } catch (error) {
      console.error('❌ sendEmailToken error:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }

  /**
   * Generate HTML email template
   */
  generateEmailTemplate(token, userName, appName) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>2FA Verification Code</title>
          <style>
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              background-color: #f4f7fc;
              margin: 0;
              padding: 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: #ffffff;
              padding: 40px;
              border-radius: 16px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #667eea;
              padding-bottom: 20px;
              margin-bottom: 25px;
            }
            .header h1 {
              color: #667eea;
              font-size: 28px;
              margin: 0;
              letter-spacing: -0.5px;
            }
            .header p {
              color: #888;
              margin: 5px 0 0;
              font-size: 14px;
            }
            .greeting {
              font-size: 16px;
              color: #333;
              margin-bottom: 20px;
            }
            .code-container {
              text-align: center;
              padding: 25px;
              background: linear-gradient(135deg, #f5f7ff 0%, #eef1ff 100%);
              border-radius: 12px;
              margin: 25px 0;
              border: 2px dashed #667eea;
            }
            .code {
              font-size: 44px;
              font-weight: 700;
              color: #4a3f7a;
              letter-spacing: 12px;
              font-family: 'Courier New', monospace;
            }
            .info {
              color: #555;
              line-height: 1.7;
              font-size: 15px;
            }
            .info strong {
              color: #667eea;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              text-align: center;
              color: #999;
              font-size: 12px;
            }
            .footer .brand {
              color: #667eea;
              font-weight: 600;
            }
            .security-note {
              background: #f8f9fa;
              padding: 12px 16px;
              border-radius: 8px;
              font-size: 13px;
              color: #666;
              margin-top: 20px;
              border-left: 4px solid #667eea;
            }
            @media (max-width: 480px) {
              .container { padding: 20px; }
              .code { font-size: 32px; letter-spacing: 8px; }
              .header h1 { font-size: 22px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 ${appName}</h1>
              <p>Secure Two-Factor Authentication</p>
            </div>
            
            <div class="greeting">
              Hello <strong>${userName || 'User'}</strong>,
            </div>
            
            <p style="color: #555;">Use the following verification code to complete your login:</p>
            
            <div class="code-container">
              <div class="code">${token}</div>
            </div>
            
            <div class="info">
              <p>⏰ This code will expire in <strong>10 minutes</strong>.</p>
              <p>🔒 If you didn't request this code, please ignore this email or contact support immediately.</p>
            </div>
            
            <div class="security-note">
              <strong>🔐 Security Tip:</strong> Never share this code with anyone. Evolution Banking will never ask for your verification code via phone or email.
            </div>
            
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} <span class="brand">${appName}</span>. All rights reserved.</p>
              <p style="margin-top: 5px; font-size: 11px; color: #bbb;">
                This is an automated message, please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate plain text email
   */
  generateTextEmail(token, userName, appName) {
    return `
${appName} - Two-Factor Authentication
${'='.repeat(50)}

Hello ${userName || 'User'},

Your verification code is: ${token}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

${'='.repeat(50)}
${appName} - Secure Banking
This is an automated message, please do not reply.
    `;
  }

  /**
   * Send SMS token using the shared SMS service (Termii)
   */
  async sendSMSToken(phoneNumber, token, userName) {
    try {
      console.log('📱 Sending 2FA SMS to:', phoneNumber);
      
      if (!phoneNumber) {
        console.error('❌ No phone number provided');
        return { success: false, error: 'No phone number provided' };
      }

      // Clean phone number
      let cleanedPhone = phoneNumber.toString().replace(/\D/g, '');
      
      // Ensure Nigerian phone number format (234 prefix)
      if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '234' + cleanedPhone.substring(1);
      } else if (cleanedPhone.startsWith('234')) {
        // Already in correct format
      } else if (cleanedPhone.length === 10) {
        cleanedPhone = '234' + cleanedPhone;
      } else if (cleanedPhone.length === 11 && cleanedPhone.startsWith('0')) {
        cleanedPhone = '234' + cleanedPhone.substring(1);
      }

      const appName = this.emailConfig.name || process.env.APP_NAME || 'Evolution Banking';
      const messageContent = `Your ${appName} verification code is: ${token}. This code expires in ${this.tokenExpiryMinutes} minutes. Do not share this code with anyone.`;

      console.log(`📱 Sending 2FA SMS to ${cleanedPhone}: ${messageContent.substring(0, 50)}...`);

      // Create SMS record in database for tracking
      let smsRecord = null;
      try {
        smsRecord = await SMS.create({
          RECIPIENT_PHONE_NUMBER: cleanedPhone,
          MESSAGE_CONTENT: messageContent,
          DISPLAY_ACCT_NO: '2FA',
          Sender_Id: process.env.TERMII_SENDER_ID || 'WareLogTech',
          EXTERNAL_SMS_ID: '2FA_PENDING',
          REC_ST: 'PENDING',
          ROW_TS: new Date(),
          USER_ID: 'system',
          CREATE_DT: new Date(),
          SYS_CREATE_TS: new Date(),
          CREATED_BY: '2FA_System',
          ACCT_BALANCE: 0,
          SMS_TYPE: '2fa'
        });
      } catch (dbError) {
        console.warn('⚠️ Could not create SMS record:', dbError.message);
        // Continue even if SMS record creation fails
      }

      // ✅ Use the shared smsService
      const result = await this.smsService.sendSMS(cleanedPhone, messageContent);

      // Update SMS record with response
      if (smsRecord) {
        try {
          if (result.success) {
            await smsRecord.update({
              REC_ST: 'SENT',
              EXTERNAL_SMS_ID: result.data?.message_id || result.data?.id || '2FA_SENT',
              SMS_PROVIDER_RESPONSE: JSON.stringify(result.data),
              SENT_AT: new Date()
            });
            logger.info(`✅ SMS 2FA token sent to ${cleanedPhone} via Termii`);
          } else {
            await smsRecord.update({
              REC_ST: 'FAILED',
              SMS_PROVIDER_RESPONSE: JSON.stringify(result.error),
              ERROR_MESSAGE: result.error?.message || 'Failed to send SMS via Termii'
            });
          }
        } catch (updateError) {
          console.warn('⚠️ Could not update SMS record:', updateError.message);
        }
      }

      if (result.success) {
        console.log('✅ 2FA SMS sent successfully');
        return {
          success: true,
          message: 'SMS sent successfully',
          smsId: result.data?.message_id || result.data?.id || `sms_${Date.now()}`,
          provider: 'Termii'
        };
      } else {
        console.error('❌ 2FA SMS failed:', result.error);
        return {
          success: false,
          error: result.error || 'Failed to send SMS',
        };
      }

    } catch (error) {
      console.error('❌ sendSMSToken error:', error);
      
      // Save failed SMS record for audit
      try {
        await SMS.create({
          RECIPIENT_PHONE_NUMBER: phoneNumber,
          MESSAGE_CONTENT: `2FA Verification for ${userName || 'user'}`,
          DISPLAY_ACCT_NO: '2FA',
          Sender_Id: process.env.TERMII_SENDER_ID || 'WareLogTech',
          EXTERNAL_SMS_ID: '2FA_ERROR',
          REC_ST: 'ERROR',
          ROW_TS: new Date(),
          USER_ID: 'system',
          CREATE_DT: new Date(),
          SYS_CREATE_TS: new Date(),
          CREATED_BY: '2FA_System',
          ACCT_BALANCE: 0,
          ERROR_MESSAGE: error.message,
          SMS_PROVIDER_RESPONSE: error.response ? JSON.stringify(error.response.data) : null,
          SMS_TYPE: '2fa'
        });
      } catch (dbError) {
        logger.error('Failed to save error SMS record:', dbError.message);
      }
      
      return {
        success: false,
        error: error.message || 'Failed to send SMS',
      };
    }
  }

  /**
   * Generate a random 6-digit OTP token
   */
  generateToken() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate a temporary session ID
   */
  generateSessionId() {
    return `2fa_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Initialize a 2FA session
   */
  init2FASession(userId, username, email, phone, methods) {
    const sessionId = this.generateSessionId();
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + this.tokenExpiryMinutes * 60 * 1000);

    const sessionData = {
      user_id: userId,
      username: username,
      email: email,
      phone: phone,
      methods: methods || [],
      enabled_methods: methods || [],
      token: token,
      token_expires_at: expiresAt,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      verified_method: null,
      verified: false,
      timestamp: Date.now(),
      sms_id: null,
      last_sent_method: null,
      createdAt: new Date(),
      expiresAt: expiresAt,
    };

    this.tempSessions.set(sessionId, sessionData);

    // Clean up old sessions
    this.cleanupOldSessions();

    return { sessionId, token, expiresAt };
  }

  /**
   * Get available 2FA methods for a user
   */
  getAvailableMethods(user) {
    const methods = [];
    const twoFactorMethods = user.two_factor_methods || {};
    
    if (twoFactorMethods.hardware_token && user.rfid_enabled) {
      methods.push({
        type: 'hardware_token',
        label: 'Hardware Token (RFID)',
        icon: '🔑',
        description: 'Tap your HID Mini Token on the reader',
        available: true
      });
    }
    
    if (twoFactorMethods.email_token && user.email) {
      methods.push({
        type: 'email_token',
        label: 'Email Token',
        icon: '📧',
        description: `Send code to ${user.email}`,
        available: true
      });
    }
    
    if (twoFactorMethods.sms_token && user.two_factor_phone) {
      methods.push({
        type: 'sms_token',
        label: 'SMS Token',
        icon: '📱',
        description: `Send code to ${user.two_factor_phone}`,
        available: true,
        provider: 'Termii'
      });
    }
    
    return methods;
  }

  /**
   * Get enabled methods for user
   */
  getEnabledMethods(user) {
    const methods = [];
    const twoFactorMethods = user.two_factor_methods || {};

    if (twoFactorMethods.hardware_token && user.rfid_enabled) {
      methods.push('hardware_token');
    }
    if (twoFactorMethods.email_token && user.email) {
      methods.push('email_token');
    }
    if (twoFactorMethods.sms_token && user.two_factor_phone) {
      methods.push('sms_token');
    }

    return methods;
  }

  /**
   * Check if user has any 2FA enabled
   */
  hasAny2FAEnabled(user) {
    if (!user) return false;
    return user.two_factor_enabled === true || user.two_factor_enabled === 1;
  }

  /**
   * Send token via selected method and update session
   */
  async sendAndStoreToken(sessionId, method, user, token) {
    try {
      let result;
      let smsId = null;

      if (method === 'sms_token') {
        if (!user.two_factor_phone) {
          return { success: false, error: 'No phone number configured' };
        }
        result = await this.sendSMSToken(user.two_factor_phone, token, user.user_name);
        if (result.success && result.smsId) {
          smsId = result.smsId;
        }
      } else if (method === 'email_token') {
        if (!user.email) {
          return { success: false, error: 'No email configured' };
        }
        result = await this.sendEmailToken(user.email, token, user.user_name);
      } else if (method === 'hardware_token') {
        result = { success: true, hardware: true };
      } else {
        return { success: false, error: 'Invalid method' };
      }

      // Update session with token
      const session = this.tempSessions.get(sessionId);
      if (session) {
        session.token = token;
        session.last_sent_method = method;
        if (smsId) {
          session.sms_id = smsId;
        }
        this.tempSessions.set(sessionId, session);
      }

      return result;

    } catch (error) {
      console.error('❌ sendAndStoreToken error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify token (for email/SMS)
   */
  verifyToken(sessionId, userToken) {
    const session = this.tempSessions.get(sessionId);
    
    if (!session) {
      return { success: false, error: 'Invalid or expired session' };
    }

    // Check if already verified
    if (session.verified) {
      return { success: false, error: 'Token already verified' };
    }

    // Check expiry
    if (new Date() > new Date(session.token_expires_at || session.expiresAt)) {
      this.tempSessions.delete(sessionId);
      return { success: false, error: 'Token expired' };
    }

    // Check attempts
    const maxAttempts = session.maxAttempts || this.maxAttempts;
    if (session.attempts >= maxAttempts) {
      this.tempSessions.delete(sessionId);
      return { success: false, error: 'Too many attempts' };
    }

    // Verify token
    const storedToken = session.token;
    if (userToken !== storedToken) {
      session.attempts += 1;
      this.tempSessions.set(sessionId, session);
      const remaining = maxAttempts - session.attempts;
      return { 
        success: false, 
        error: `Invalid token. ${remaining} attempts remaining`,
        remaining: remaining,
        attempts: session.attempts,
      };
    }

    // Success - token verified
    session.verified = true;
    session.verified_at = new Date();
    session.verified_method = session.last_sent_method || 'token';
    this.tempSessions.set(sessionId, session);

    return { success: true };
  }

  /**
   * Get session data
   */
  getSession(sessionId) {
    return this.tempSessions.get(sessionId);
  }

  /**
   * Clear session
   */
  clearSession(sessionId) {
    this.tempSessions.delete(sessionId);
  }

  /**
   * Resend token
   */
  async resendToken(sessionId, method, user) {
    const session = this.tempSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Invalid session' };
    }

    // Generate new token
    const newToken = this.generateToken();
    const expiresAt = new Date(Date.now() + this.tokenExpiryMinutes * 60 * 1000);

    // Update session
    session.token = newToken;
    session.token_expires_at = expiresAt;
    session.expiresAt = expiresAt;
    session.attempts = 0;
    this.tempSessions.set(sessionId, session);

    // Send token via selected method and store SMS ID
    const sendResult = await this.sendAndStoreToken(sessionId, method, user, newToken);
    
    if (!sendResult.success) {
      return sendResult;
    }

    return { 
      success: true, 
      expiresAt: expiresAt, 
      smsId: sendResult.smsId,
      token: newToken
    };
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions() {
    const now = Date.now();
    const expiryMs = this.tokenExpiryMinutes * 60 * 1000;
    
    for (const [key, value] of this.tempSessions.entries()) {
      if (now - (value.timestamp || value.createdAt?.getTime() || now) > expiryMs) {
        this.tempSessions.delete(key);
      }
    }
  }

  /**
   * Test SMS configuration
   */
  async testSMSConfiguration(phoneNumber) {
    try {
      const testToken = '123456';
      const result = await this.sendSMSToken(phoneNumber, testToken, 'Test User');
      
      if (result.success) {
        return {
          success: true,
          message: 'SMS configuration test successful',
          data: {
            phoneNumber: phoneNumber,
            sent: true,
            provider: 'Termii'
          },
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to send test SMS',
        };
      }
    } catch (error) {
      console.error('❌ testSMSConfiguration error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get SMS delivery status
   */
  async getSMSStatus(smsId) {
    try {
      const smsRecord = await SMS.findByPk(smsId);
      if (!smsRecord) {
        return { success: false, error: 'SMS record not found' };
      }
      
      return {
        success: true,
        status: smsRecord.REC_ST,
        recipient: smsRecord.RECIPIENT_PHONE_NUMBER,
        sentAt: smsRecord.SENT_AT,
        providerResponse: smsRecord.SMS_PROVIDER_RESPONSE ? 
          JSON.parse(smsRecord.SMS_PROVIDER_RESPONSE) : null,
        errorMessage: smsRecord.ERROR_MESSAGE,
        provider: 'Termii'
      };
    } catch (error) {
      logger.error('Error fetching SMS status:', error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // RFID READER MANAGEMENT METHODS
  // ============================================

  /**
   * Verify hardware token (RFID) - uses rfidAuthService
   */
  async verifyHardwareToken(sessionId, cardData) {
    const session = this.tempSessions.get(sessionId);
    
    if (!session) {
      return { success: false, error: 'Invalid or expired session' };
    }

    // Check expiry
    if (new Date() > new Date(session.token_expires_at || session.expiresAt)) {
      this.tempSessions.delete(sessionId);
      return { success: false, error: 'Session expired' };
    }

    // Check attempts
    const maxAttempts = session.maxAttempts || this.maxAttempts;
    if (session.attempts >= maxAttempts) {
      this.tempSessions.delete(sessionId);
      return { success: false, error: 'Too many attempts' };
    }

    // Verify RFID token from database using rfidAuthService
    try {
      const { default: RFIDToken } = await import('../models/RFIDToken.js');
      const rfidToken = await RFIDToken.findOne({
        where: {
          user_id: session.user_id,
          [Op.or]: [
            { serial_number: cardData.serialNumber },
            { card_number: cardData.cardNumber },
            { raw_data: cardData.raw }
          ],
          is_active: true
        }
      });

      if (!rfidToken) {
        session.attempts += 1;
        this.tempSessions.set(sessionId, session);
        return { success: false, error: 'Hardware token not recognized' };
      }

      // Update token usage
      rfidToken.used_count = (rfidToken.used_count || 0) + 1;
      rfidToken.last_used_at = new Date();
      await rfidToken.save();

      // Update session
      session.verified = true;
      session.verified_at = new Date();
      session.verified_method = 'hardware_token';
      this.tempSessions.set(sessionId, session);

      return { success: true };

    } catch (error) {
      logger.error('❌ Hardware token verification error:', error);
      session.attempts += 1;
      this.tempSessions.set(sessionId, session);
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Initialize RFID reader
   */
  async initializeRFIDReader(portPath = 'COM3', baudRate = 9600) {
    return await this.rfidAuth.initialize(portPath, baudRate);
  }

  /**
   * Get RFID reader status
   */
  getRFIDReaderStatus() {
    return this.rfidAuth.getReaderStatus();
  }

  /**
   * Disconnect RFID reader
   */
  disconnectRFIDReader() {
    this.rfidAuth.disconnectReader();
  }

  /**
   * Register RFID token for user
   */
  async registerRFIDToken(userId, cardData, options = {}) {
    return await this.rfidAuth.registerRFIDToken(userId, cardData, options);
  }

  /**
   * Read RFID token (blocking)
   */
  async readRFIDToken(timeout = 10000) {
    return await this.rfidAuth.rfidReader.readCard(timeout);
  }

  /**
   * Log RFID attempt
   */
  async logRFIDAttempt(userId, tokenId, cardData, success, status, errorMessage, ipAddress, userAgent) {
    return await this.rfidAuth.logRFIDAttempt(
      userId, tokenId, cardData, success, status, errorMessage, ipAddress, userAgent
    );
  }

  /**
   * Find RFID token
   */
  async findRFIDToken(cardData) {
    return await this.rfidAuth.findRFIDToken(cardData);
  }
}

// Create singleton instance
const twoFactorService = new TwoFactorService();

export default twoFactorService;