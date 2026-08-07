// controllers/LoginController.js - COMPLETE CLEANED VERSION

// ============================================
// FIX: Get __dirname BEFORE any other imports that might need it
// ============================================
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// IMPORTS
// ============================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { Op } from 'sequelize';

// Load .env from parent directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import User from '../models/User.js';
import Login from '../models/Login.js';
import UserRole from '../models/UserRole.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import { getSecretKey } from '../middlewares/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';
import Permissions from '../models/Permissions.js';
import PERMISSIONS from '../constants/permissions.js';
import { roleHasPermission } from '../constants/roleMapping.js';
import sequelize from '../../config/db.js';
import { getUser } from '../models/index.js';
import LoginPolicy from '../models/LoginPolicy.js';
import RFIDToken from '../models/RFIDToken.js';
import twoFactorService from '../services/TwoFactorService.js';
import rfidReaderService from '../services/rfidReaderService.js';

// ============================================
// EMAIL CONFIGURATION (Same as TwoFactorService)
// ============================================
const emailConfig = {
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

// Store pending 2FA sessions
const pending2FASessions = new Map();

// Simple IP validation function
const validateIpAddress = (ip) => {
  const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  return ipRegex.test(ip);
};

// Get client IP from request
const getClientIp = (req) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  return ip && ip !== '::1' ? ip.split(',')[0].trim() : null;
};

// ============================================
// 📧 SEND WELCOME EMAIL FUNCTION - Picks from .env
// ============================================
async function sendWelcomeEmail({ 
  email, 
  userName, 
  password, 
  firstName, 
  role
}) {
  try {
    if (!email) {
      console.error('❌ No email provided');
      return false;
    }

    console.log('📧 Sending welcome email to:', email);
    console.log('📧 Using SMTP config from .env:', {
      host: emailConfig.host,
      port: emailConfig.port,
      user: emailConfig.auth.user,
      from: emailConfig.from
    });

    // Create transporter using emailConfig
    const transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.auth.user,
        pass: emailConfig.auth.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Verify transporter
    await transporter.verify();

    // ✅ ALL values from .env
    const fromEmail = emailConfig.from || emailConfig.auth.user;
    const appName = process.env.APP_NAME || emailConfig.name || 'Evolution Banking';
    const loginUrl = process.env.LOGIN_URL || 'http://localhost:3000/login';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@evolutionbanking.com';
    const appLogo = process.env.APP_LOGO_URL || null;
    const appColor = process.env.APP_PRIMARY_COLOR || '#667eea';
    const appSecondaryColor = process.env.APP_SECONDARY_COLOR || '#764ba2';

    // Generate HTML email
    const htmlContent = generateWelcomeEmailHTML({
      firstName,
      userName,
      password,
      role,
      loginUrl,
      appName,
      supportEmail,
      appLogo,
      appColor,
      appSecondaryColor
    });

    // Generate plain text email
    const textContent = generateWelcomeEmailText({
      firstName,
      userName,
      password,
      role,
      loginUrl,
      appName,
      supportEmail
    });

    const mailOptions = {
      from: `"${appName} Team" <${fromEmail}>`,
      to: email,
      subject: `Welcome to ${appName} - Your Account Has Been Created`,
      html: htmlContent,
      text: textContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent successfully:', info.messageId);
    return true;

  } catch (error) {
    console.error('❌ sendWelcomeEmail error:', error.message);
    console.error('❌ Error details:', error.stack);
    return false;
  }
}

// ============================================
// 📧 GENERATE WELCOME EMAIL HTML - Dynamic from .env
// ============================================
function generateWelcomeEmailHTML({ 
  firstName, 
  userName, 
  password, 
  role, 
  loginUrl, 
  appName, 
  supportEmail,
  appLogo,
  appColor = '#667eea',
  appSecondaryColor = '#764ba2'
}) {
  const currentYear = new Date().getFullYear();
  
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${appName}</title>
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
            border-bottom: 3px solid ${appColor};
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .header h1 {
            color: ${appColor};
            font-size: 28px;
            margin: 0;
            letter-spacing: -0.5px;
          }
          .header .logo {
            max-width: 150px;
            height: auto;
            margin-bottom: 10px;
          }
          .header p {
            color: #888;
            margin: 5px 0 0;
            font-size: 14px;
          }
          .greeting {
            font-size: 18px;
            color: #333;
            margin-bottom: 20px;
          }
          .welcome-text {
            color: #555;
            line-height: 1.7;
            font-size: 15px;
          }
          .credentials-card {
            background: linear-gradient(135deg, #f5f7ff 0%, #eef1ff 100%);
            border-radius: 12px;
            padding: 25px;
            margin: 25px 0;
            border: 2px solid ${appColor};
          }
          .credential-item {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e5ff;
          }
          .credential-item:last-child {
            border-bottom: none;
          }
          .credential-label {
            color: #666;
            font-weight: 600;
            font-size: 14px;
          }
          .credential-value {
            color: #333;
            font-weight: 500;
            font-family: 'Courier New', monospace;
            font-size: 15px;
            background: #ffffff;
            padding: 2px 12px;
            border-radius: 6px;
          }
          .button-container {
            text-align: center;
            margin: 30px 0;
          }
          .button {
            display: inline-block;
            padding: 14px 40px;
            background: linear-gradient(135deg, ${appColor} 0%, ${appSecondaryColor} 100%);
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
          }
          .button:hover {
            opacity: 0.9;
          }
          .info-box {
            background: #f8f9fa;
            padding: 15px 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid ${appColor};
          }
          .info-box p {
            margin: 5px 0;
            color: #555;
            font-size: 14px;
          }
          .security-note {
            background: #fef9e7;
            padding: 15px 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #f39c12;
          }
          .security-note p {
            margin: 5px 0;
            color: #856404;
            font-size: 14px;
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
            color: ${appColor};
            font-weight: 600;
          }
          @media (max-width: 480px) {
            .container { padding: 20px; }
            .credential-item { flex-direction: column; gap: 5px; }
            .button { display: block; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${appLogo ? `<img src="${appLogo}" alt="${appName}" class="logo" />` : ''}
            <h1>🏦 ${appName}</h1>
            <p>Secure Banking Platform</p>
          </div>
          
          <div class="greeting">
            Hello <strong>${firstName || 'User'}</strong> 👋
          </div>
          
          <div class="welcome-text">
            <p>Your account has been successfully created in the ${appName} system. 
            You can now log in using the credentials below.</p>
          </div>
          
          <div class="credentials-card">
            <h3 style="margin-top: 0; color: #4a3f7a;">🔐 Your Login Credentials</h3>
            
            <div class="credential-item">
              <span class="credential-label">👤 Username</span>
              <span class="credential-value">${userName}</span>
            </div>
            
            <div class="credential-item">
              <span class="credential-label">🔑 Password</span>
              <span class="credential-value">${password}</span>
            </div>
            
            <div class="credential-item">
              <span class="credential-label">🎯 Role</span>
              <span class="credential-value">${role || 'User'}</span>
            </div>
          </div>
          
          <div class="button-container">
            <a href="${loginUrl}" class="button">🚀 Login to Your Account</a>
          </div>
          
          <div class="info-box">
            <p><strong>📌 Login URL:</strong> ${loginUrl}</p>
            <p><strong>⏰ Session Expiry:</strong> 5 years from creation</p>
            <p><strong>🔄 Password Change:</strong> You'll be prompted to change your password on first login</p>
          </div>
          
          <div class="security-note">
            <p><strong>🔒 Important Security Notes:</strong></p>
            <p>• This is your temporary password. Please change it immediately after login.</p>
            <p>• Never share your password with anyone.</p>
            <p>• For security, we recommend enabling Two-Factor Authentication (2FA) in your profile.</p>
            <p>• If you didn't request this account, please contact support immediately.</p>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <p style="margin: 0; color: #555; font-size: 14px;">
              <strong>📧 Need help?</strong> Contact our support team at 
              <a href="mailto:${supportEmail}" style="color: ${appColor};">${supportEmail}</a>
            </p>
          </div>
          
          <div class="footer">
            <p>&copy; ${currentYear} <span class="brand">${appName}</span>. All rights reserved.</p>
            <p style="margin-top: 5px; font-size: 11px; color: #bbb;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// ============================================
// 📧 GENERATE WELCOME EMAIL PLAIN TEXT
// ============================================
function generateWelcomeEmailText({ firstName, userName, password, role, loginUrl, appName, supportEmail }) {
  const separator = '='.repeat(50);
  
  return `
${appName} - Welcome!

${separator}

Hello ${firstName || 'User'},

Your account has been successfully created in the ${appName} system.
You can now log in using the credentials below.

${separator}
🔐 YOUR LOGIN CREDENTIALS
${separator}

Username: ${userName}
Password: ${password}
Role:     ${role || 'User'}
Login URL: ${loginUrl}

${separator}
📌 IMPORTANT SECURITY NOTES
${separator}

• This is your temporary password. Please change it immediately after login.
• Never share your password with anyone.
• We recommend enabling Two-Factor Authentication (2FA) for enhanced security.
• If you didn't request this account, contact support immediately.

${separator}
🆘 NEED HELP?
${separator}

Contact our support team: ${supportEmail}

${separator}
${appName} - Secure Banking
${separator}
  `;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const createLoginLog = async (userId, username, ipAddress, userAgent, status, success, error = null, twoFactorType = 'none') => {
  try {
    return await Login.create({
      user_id: userId,
      user_name: username,
      username: username,
      login_time: new Date(),
      ip_address: ipAddress,
      user_agent: userAgent,
      status: status,
      success: success,
      error: error,
      attempt_identifier: username,
      login_type: twoFactorType === 'RFID' ? 'rfid_2fa' : 
                  twoFactorType === 'SMS' ? 'sms_2fa' : 
                  twoFactorType === 'Email' ? 'email_2fa' : 'password',
      device_type: detectDeviceType(userAgent),
      two_factor_type: twoFactorType === 'RFID' ? 'rfid' : 
                       twoFactorType === 'SMS' ? 'sms' : 
                       twoFactorType === 'Email' ? 'email' : 'none',
      rfid_used: false
    });
  } catch (error) {
    console.error('Error creating login log:', error);
    return null;
  }
};

const logRFIDAttempt = async (userId, tokenId, cardData, success, status, errorMessage, ipAddress, userAgent) => {
  try {
    const { default: RFIDLoginLog } = await import('../models/RFIDLoginLog.js');
    await RFIDLoginLog.create({
      user_id: userId,
      token_id: tokenId,
      serial_number: cardData.serialNumber || cardData.cardNumber,
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
    console.error('Error logging RFID attempt:', error);
  }
};

const detectDeviceType = (userAgent) => {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'mobile';
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'tablet';
  }
  return 'desktop';
};

const getRoleName = (user, isAdmin) => {
  if (isAdmin) return 'Administrator';
  const roleKey = user.BU_ROLE_ID?.toString();
  if (roleKey && ROLE_MAPPING[roleKey]) {
    return ROLE_MAPPING[roleKey].ROLE_NM || 'Staff';
  }
  return 'Staff';
};

const getPermissionsForUser = (user, isAdmin) => {
  if (isAdmin) {
    return Object.values(PERMISSIONS).flatMap(g => typeof g === 'object' ? Object.values(g) : []);
  }
  const roleKey = user.BU_ROLE_ID?.toString();
  if (roleKey && ROLE_MAPPING[roleKey]) {
    return ROLE_MAPPING[roleKey].permissions || [];
  }
  return ['DASHBOARD_STAFF', 'DASHBOARD_REAL_TIME_STATS', 'CUSTOMER_VIEW', 'ACCOUNT_VIEW_BALANCE', 'TRANSACTION_VIEW'];
};

const generateJWT = (user, isAdmin) => {
  const roleName = getRoleName(user, isAdmin);
  return jwt.sign(
    {
      userId: user.id,
      id: user.id,
      user_name: user.user_name || user.username,
      email: user.email,
      preferred_name: user.preferred_name || null,
      role: roleName,
      roleId: user.BU_ROLE_ID,
      BU_ROLE_ID: user.BU_ROLE_ID,
      isAdmin: isAdmin,
      businessUnit: user.main_business_unit || 'Wethral',
      accessibleBusinessUnits: [user.main_business_unit || 'Wethral'],
      rfid_enabled: user.rfid_enabled || false,
      two_factor_enabled: user.two_factor_enabled || false,
      iat: Math.floor(Date.now() / 1000)
    },
    getSecretKey() || process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    { expiresIn: '7d' }
  );
};

const complete2FALogin = async (user, ipAddress, userAgent, method, sessionId) => {
  try {
    await User.update({
      failed_attempts: 0,
      lock_until: null,
      last_login: new Date()
    }, { where: { id: user.id } });

    const isAdmin = parseInt(user.BU_ROLE_ID) === 1;

    let requiresPasswordChange = false;
    if (!isAdmin) {
      const isExpired = user.password_expiry_date && new Date() > new Date(user.password_expiry_date);
      requiresPasswordChange = user.force_password_change || isExpired;
    }

    const pendingSession = pending2FASessions.get(sessionId);
    if (pendingSession?.login_id) {
      const updateData = {
        status: 'Success',
        success: true,
        error: null,
        two_fa_method_used: method,
        two_fa_completed_at: new Date()
      };

      if (method === 'hardware_token') {
        updateData.rfid_used = true;
        updateData.two_factor_type = 'rfid';
        updateData.login_type = 'rfid_2fa';
      } else if (method === 'email_token') {
        updateData.email_2fa_verified = true;
        updateData.email_2fa_verified_at = new Date();
        updateData.two_factor_type = 'email';
        updateData.login_type = 'email_2fa';
      } else if (method === 'sms_token') {
        updateData.sms_2fa_verified = true;
        updateData.sms_2fa_verified_at = new Date();
        updateData.two_factor_type = 'sms';
        updateData.login_type = 'sms_2fa';
      }

      await Login.update(updateData, { where: { id: pendingSession.login_id } });
    }

    const token = generateJWT(user, isAdmin);

    return {
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        userId: user.id,
        user_name: user.user_name || user.username,
        email: user.email,
        preferred_name: user.preferred_name || null,
        role: getRoleName(user, isAdmin),
        BU_ROLE_ID: user.BU_ROLE_ID,
        primary_business_role: user.primary_business_role || getRoleName(user, isAdmin),
        businessUnit: user.main_business_unit || 'Wethral',
        isAdmin: isAdmin,
        is_first_login: user.is_first_login,
        force_password_change: user.force_password_change,
        requiresPasswordChange: requiresPasswordChange,
        permissions: getPermissionsForUser(user, isAdmin),
        rfid_enabled: user.rfid_enabled || false,
        two_factor_enabled: user.two_factor_enabled || false,
        two_factor_method_used: method,
        accessibleBusinessUnits: [user.main_business_unit || 'Wethral'],
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7*24*60*60*1000).toISOString()
      }
    };

  } catch (error) {
    console.error('❌ Complete 2FA login error:', error);
    throw error;
  }
};

// ============================================
// ✅ REGISTER USER - UPDATED WITH user_id = user_name AND EMAIL NOTIFICATION
// ============================================
export const registerUser = asyncHandler(async (req, res) => {
  const {
    user_name,
    password,
    employer_number,
    first_name,
    last_name,
    middle_name,
    preferred_name,
    job_title,
    email,
    customer_number,
    main_business_unit,
    responsibility_centre,
    primary_business_role,
    BU_ROLE_ID,
    start_date,
    expiry_date,
    earliest_login_time,
    latest_login_time,
    internal_employee_enabled,
    relationship_officer,
    enable_multi_session,
    validate_ip_address = false,
    note,
    ip_address,
    is_supervisor,
    is_main_BU,
    status,
    // 2FA Fields
    two_factor_enabled,
    two_factor_methods,
    two_factor_phone,
    two_factor_email
  } = req.body;

  console.log('📝 Registration request received:', {
    user_name,
    email,
    main_business_unit,
    responsibility_centre,
    primary_business_role,
    BU_ROLE_ID,
    two_factor_enabled,
    two_factor_methods,
    two_factor_phone,
    two_factor_email
  });

  // ============================================
  // ✅ DETAILED FIELD VALIDATION
  // ============================================
  const missingFields = [];
  if (!user_name) missingFields.push('user_name (Username)');
  if (!password) missingFields.push('password (Password)');
  if (!email) missingFields.push('email (Email)');
  if (!main_business_unit) missingFields.push('main_business_unit (Main Business Unit)');
  if (!responsibility_centre) missingFields.push('responsibility_centre (Responsibility Centre)');
  if (!primary_business_role) missingFields.push('primary_business_role (Primary Business Role)');
  if (!BU_ROLE_ID) missingFields.push('BU_ROLE_ID (Business Role ID)');

  if (missingFields.length > 0) {
    console.warn('❌ Missing required fields for registration:', {
      user_name,
      email,
      missingFields
    });
    
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
      missingFields: missingFields.map(f => f.split(' ')[0]),
      receivedData: {
        user_name: !!user_name,
        password: !!password,
        email: !!email,
        main_business_unit: !!main_business_unit,
        responsibility_centre: !!responsibility_centre,
        primary_business_role: !!primary_business_role,
        BU_ROLE_ID: !!BU_ROLE_ID,
        two_factor_enabled: !!two_factor_enabled,
        two_factor_phone: !!two_factor_phone,
        two_factor_email: !!two_factor_email
      },
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // ✅ CHECK FOR EXISTING USER
  // ============================================
  const existingUser = await User.findOne({
    where: {
      [Op.or]: [
        { email: email.toLowerCase() },
        { user_name: user_name }
      ]
    }
  });

  if (existingUser) {
    console.warn('⚠️ User already exists:', { user_name, email });
    return res.status(409).json({
      success: false,
      message: 'User already exists with this username or email',
      field: existingUser.user_name === user_name ? 'user_name' : 'email',
      value: existingUser.user_name === user_name ? user_name : email,
      timestamp: new Date().toISOString()
    });
  }

  // ============================================
  // ✅ VALIDATE ROLE
  // ============================================
  let roleExists = null;
  if (primary_business_role) {
    const normalizedRole = primary_business_role.toLowerCase().replace(/\s+/g, ' ').trim();
    roleExists = await UserRole.findOne({
      where: {
        ROLE_NM: { [Op.like]: normalizedRole }
      }
    });

    if (!roleExists) {
      const mappingEntry = Object.values(ROLE_MAPPING).find(
        role => role.ROLE_NM.toLowerCase() === normalizedRole
      );
      if (!mappingEntry) {
        console.warn(`❌ Role "${primary_business_role}" does not exist`, { user_name });
        return res.status(400).json({
          success: false,
          message: `Role "${primary_business_role}" does not exist. Please select a valid role.`,
          validRoles: Object.values(ROLE_MAPPING).map(r => r.ROLE_NM),
          timestamp: new Date().toISOString()
        });
      }
      roleExists = { ROLE_NM: mappingEntry.ROLE_NM, ROLE_ID: mappingEntry.id };
    }
  }

  // ============================================
  // ✅ VALIDATE IP ADDRESS
  // ============================================
  let finalIpAddress = ip_address || null;
  if (validate_ip_address) {
    if (!ip_address || !validateIpAddress(ip_address)) {
      finalIpAddress = getClientIp(req);
      if (!finalIpAddress) {
        console.warn('⚠️ Invalid or missing IP address', { user_name });
        finalIpAddress = req.ip;
      }
    }
  }

  // ============================================
  // ✅ HASH PASSWORD
  // ============================================
  const hashedPassword = await bcrypt.hash(password, 10);

  // ============================================
  // ✅ PREPARE 2FA DATA
  // ============================================
  const is2FAEnabled = two_factor_enabled === true || 
                       two_factor_enabled === 'true' || 
                       two_factor_enabled === 1;

  const twoFAMethods = two_factor_methods || {
    hardware_token: false,
    email_token: false,
    sms_token: false
  };

  // ============================================
  // ✅ CREATE USER WITH user_id = user_name
  // ============================================
  const newUser = await User.create({
    user_id: user_name, // ✅ Set user_id to same as user_name
    user_name,
    password: hashedPassword,
    employer_number,
    first_name,
    last_name,
    middle_name,
    preferred_name,
    job_title,
    email,
    customer_number,
    main_business_unit,
    responsibility_centre,
    primary_business_role: roleExists ? roleExists.ROLE_NM : primary_business_role,
    BU_ROLE_ID: BU_ROLE_ID || (roleExists ? roleExists.ROLE_ID : null),
    start_date: start_date || new Date(),
    expiry_date: expiry_date || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000),
    earliest_login_time: earliest_login_time || '00:00',
    latest_login_time: latest_login_time || '23:59',
    internal_employee_enabled: internal_employee_enabled !== undefined ? internal_employee_enabled : true,
    relationship_officer,
    enable_multi_session: enable_multi_session !== undefined ? enable_multi_session : false,
    validate_ip_address,
    note,
    ip_address: finalIpAddress,
    is_supervisor,
    is_main_BU,
    status: status || 'Active',
    passwordChangedAt: new Date(),
    // 2FA Fields
    two_factor_enabled: is2FAEnabled,
    two_factor_methods: twoFAMethods,
    two_factor_phone: two_factor_phone || null,
    two_factor_email: two_factor_email || null
  });

  console.info('✅ User registered successfully with 2FA:', { 
    id: newUser.id,
    user_id: newUser.user_id, // ✅ Log user_id too
    user_name: newUser.user_name, 
    email: newUser.email, 
    BU_ROLE_ID: newUser.BU_ROLE_ID,
    two_factor_enabled: newUser.two_factor_enabled,
    two_factor_methods: newUser.two_factor_methods,
    two_factor_phone: newUser.two_factor_phone,
    two_factor_email: newUser.two_factor_email,
    user_id_matches_user_name: newUser.user_id === newUser.user_name // ✅ Verify match
  });

  // ============================================
  // ✅ SEND WELCOME EMAIL WITH CREDENTIALS
  // ✅ ALL VALUES PICKED FROM .env
  // ============================================
  let emailSent = false;
  try {
    // Use the plain password from request (not hashed)
    const plainPassword = password;
    
    console.log('📧 Preparing to send welcome email with password:', {
      email: newUser.email,
      userName: newUser.user_name,
      passwordLength: plainPassword ? plainPassword.length : 0
    });
    
    // ✅ Only pass user-specific data, everything else from .env
    emailSent = await sendWelcomeEmail({
      email: newUser.email,
      userName: newUser.user_name,
      password: plainPassword,
      firstName: newUser.first_name || newUser.preferred_name || 'User',
      role: newUser.primary_business_role || 'User'
    });

    if (emailSent) {
      console.log(`✅ Welcome email sent to ${newUser.email}`);
    } else {
      console.warn(`⚠️ Failed to send welcome email to ${newUser.email}`);
    }
  } catch (emailError) {
    console.error('❌ Error sending welcome email:', emailError.message);
    console.error('❌ Email error stack:', emailError.stack);
    // Don't fail the user creation if email fails
  }

  // ============================================
  // ✅ RETURN SUCCESS RESPONSE
  // ============================================
  res.status(201).json({
    success: true,
    message: emailSent 
      ? 'User registered successfully. Welcome email sent.' 
      : 'User registered successfully but welcome email could not be sent.',
    user: {
      id: newUser.id,
      user_id: newUser.user_id, // ✅ Include user_id in response
      user_name: newUser.user_name,
      email: newUser.email,
      role: newUser.primary_business_role,
      BU_ROLE_ID: newUser.BU_ROLE_ID,
      status: newUser.status,
      ip_address: newUser.ip_address,
      two_factor_enabled: newUser.two_factor_enabled,
      two_factor_methods: newUser.two_factor_methods,
      two_factor_phone: newUser.two_factor_phone,
      two_factor_email: newUser.two_factor_email
    },
    emailSent: emailSent,
    timestamp: new Date().toISOString()
  });
}); // ✅ THIS CLOSING BRACE IS CRITICAL - MAKE SURE IT'S HERE!

// ============================================
// FORCE LOCK USER
// ============================================
export const forceLockUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason } = req.body;

  try {
    console.log('🔒 Force lock user request:', { identifier, reason, lockedBy: req.user?.id });

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    if (user.status === 'ForceLocked') {
      return res.status(400).json({
        success: false,
        message: 'User is already force-locked',
        user: {
          user_name: user.user_name,
          status: user.status,
          force_lock_reason: user.force_lock_reason,
          force_locked_at: user.force_locked_at,
          force_locked_by: user.force_locked_by
        }
      });
    }

    await user.update({
      status: 'ForceLocked',
      force_lock_reason: reason || 'Suspicious activity detected',
      force_locked_at: new Date(),
      force_locked_by: req.user.id,
      internal_employee_enabled: false
    });

    console.log('✅ User force-locked successfully:', {
      user_name: user.user_name,
      status: user.status,
      force_lock_reason: user.force_lock_reason,
      locked_by_admin_id: req.user.id
    });

    res.status(200).json({
      success: true,
      message: 'User force-locked successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        force_lock_reason: user.force_lock_reason,
        force_locked_at: user.force_locked_at,
        force_locked_by: user.force_locked_by
      },
      lockDetails: {
        reason: reason || 'Suspicious activity detected',
        timestamp: user.force_locked_at,
        performedBy: req.user.user_name
      }
    });

  } catch (error) {
    console.error('💥 Force lock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error force-locking user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// ============================================
// UNLOCK FORCE LOCKED USER (Force unlock a user)
// ============================================
export const unlockForceLockedUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason } = req.body;

  try {
    console.log('🔓 Unlock force-locked user request:', { 
      identifier, 
      reason, 
      unlockedBy: req.user?.user_name || req.user?.username || 'system'
    });

    // Find the user by identifier
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined && value !== 'null' && value !== 'undefined';
        })
      }
    });

    if (!user) {
      console.log('❌ User not found:', { identifier });
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    // Check if user is actually force-locked
    if (user.status !== 'ForceLocked') {
      console.log('ℹ️ User is not force-locked:', { 
        user_name: user.user_name, 
        status: user.status 
      });
      return res.status(400).json({
        success: false,
        message: 'User is not force-locked',
        user: {
          user_name: user.user_name,
          status: user.status
        }
      });
    }

    // Update user to unlock
    await user.update({
      status: 'Active',
      force_lock_reason: null,
      force_locked_at: null,
      force_locked_by: null,
      internal_employee_enabled: true,
      lock_until: null,
      failed_attempts: 0
    });

    console.log('✅ User unlocked from force-lock successfully:', {
      user_name: user.user_name,
      status: user.status
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked from force-lock successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status
      },
      unlockDetails: {
        reason: reason || 'Manual unlock by administrator',
        timestamp: new Date(),
        performedBy: req.user?.user_name || req.user?.username || 'System'
      }
    });

  } catch (error) {
    console.error('💥 Unlock force-locked user error:', {
      error: error.message,
      stack: error.stack,
      identifier
    });
    res.status(500).json({
      success: false,
      message: 'Error unlocking force-locked user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// FORCE RESET PASSWORD - WITH FORBIDDEN PASSWORD CHECK
// ============================================
export const forceResetPassword = asyncHandler(async (req, res) => {
  const { user_name, username, new_password } = req.body;
  
  try {
    console.log('🔄 FORCE PASSWORD RESET:', { user_name, username });
    
    const loginIdentifier = username || user_name;
    const UserModel = getUser();
    
    if (!UserModel || typeof UserModel.findOne !== 'function') {
      return res.status(503).json({ 
        success: false, 
        message: 'User model not ready' 
      });
    }

    // Find the user
    const user = await UserModel.findOne({
      where: {
        [Op.or]: [
          { user_name: loginIdentifier },
          { username: loginIdentifier }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // ✅ Check if password is forbidden
    const isForbidden = await isPasswordForbidden(new_password);
    if (isForbidden) {
      return res.status(400).json({
        success: false,
        message: 'This password is too common or weak. Please choose a stronger password.'
      });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(new_password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be 8+ characters with uppercase, lowercase, number, and special character'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update user password
    await user.update({
      password: hashedPassword,
      passwordChangedAt: new Date(),
      failed_attempts: 0,
      lock_until: null,
      // Force password change on next login
      force_password_change: true,
      is_first_login: false
    });

    console.log('✅ PASSWORD RESET SUCCESSFUL:', {
      user_name: user.user_name,
      new_password_length: new_password.length,
      force_password_change: true
    });

    res.json({ 
      success: true, 
      message: 'Password reset successfully. User must change password on next login.',
      user: { 
        user_name: user.user_name, 
        email: user.email,
        force_password_change: true
      }
    });

  } catch (error) {
    console.error('💥 Password reset error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Password reset failed', 
      error: error.message 
    });
  }
});


// ============================================
// GET USERS BY BUSINESS UNIT ID
// ============================================
export const getUsersByBU_ID = asyncHandler(async (req, res) => {
  try {
    const { bu_id } = req.params;
    const { 
      page = 1, 
      limit = 50, 
      status, 
      role_id,
      include_inactive = false,
      search_field = 'responsibility_centre'
    } = req.query;

    console.log('🔍 Get Users by BU_ID request:', { 
      bu_id, 
      page, 
      limit, 
      status,
      role_id,
      include_inactive,
      search_field
    });

    let searchColumn = 'responsibility_centre';
    
    if (search_field === 'main_business_unit') {
      searchColumn = 'main_business_unit';
    } else if (search_field === 'businessUnit') {
      searchColumn = 'businessUnit';
    } else if (search_field === 'branch') {
      searchColumn = 'branch';
    }

    const whereConditions = [];
    const replacements = [];
    
    whereConditions.push(`${searchColumn} = ?`);
    replacements.push(bu_id);

    if (searchColumn === 'responsibility_centre') {
      whereConditions.push('JSON_CONTAINS(accessibleBusinessUnits, ?, \'$\')');
      replacements.push(`"${bu_id}"`);
    }

    const whereClause = whereConditions.length > 1 
      ? `(${whereConditions.join(' OR ')})` 
      : whereConditions[0];

    let statusClause = '';
    if (status && status !== 'all') {
      statusClause = `AND status = ?`;
      replacements.push(status);
    } else if (!include_inactive || include_inactive === 'false') {
      statusClause = `AND status = ?`;
      replacements.push('Active');
    }

    let roleClause = '';
    if (role_id) {
      roleClause = `AND BU_ROLE_ID = ?`;
      replacements.push(role_id);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM users 
      WHERE ${whereClause} ${statusClause} ${roleClause}
    `;

    const [[{ total }]] = await User.sequelize.query(countQuery, {
      replacements: replacements
    });

    const usersQuery = `
      SELECT * FROM users 
      WHERE ${whereClause} ${statusClause} ${roleClause}
      ORDER BY 
        CASE 
          WHEN ${searchColumn} = ? THEN 1
          ELSE 2 
        END,
        first_name ASC, 
        last_name ASC
      LIMIT ? OFFSET ?
    `;

    const usersReplacements = [...replacements, bu_id, parseInt(limit), offset];
    const [users] = await User.sequelize.query(usersQuery, {
      replacements: usersReplacements
    });

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No users found for ${searchColumn} = "${bu_id}"`,
        data: {
          users: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          },
          summary: {
            searched_field: searchColumn,
            searched_value: bu_id,
            active_users: 0,
            inactive_users: 0,
            total_users: 0
          }
        }
      });
    }

    let permissionsTableExists = false;
    let permissionsColumns = [];
    
    try {
      const [columns] = await Permissions.sequelize.query(
        'SHOW COLUMNS FROM permissions'
      );
      permissionsColumns = columns.map(col => col.Field);
      permissionsTableExists = true;
    } catch (tableError) {
      console.warn('⚠️ Permissions table not found or error:', tableError.message);
    }

    const mappedUsers = await Promise.all(users.map(async (user) => {
      let permissions = [];
      let roleName = user.primary_business_role || 'Unknown Role';

      if (parseInt(user.BU_ROLE_ID) === 1) {
        permissions = Object.values(PERMISSIONS).flatMap(group => 
          typeof group === 'object' ? Object.values(group) : []
        );
        roleName = 'Administrator';
      } else if (permissionsTableExists) {
        try {
          const [permissionRows] = await Permissions.sequelize.query(
            'SELECT * FROM permissions WHERE BU_ROLE_ID = ? LIMIT 1',
            { replacements: [user.BU_ROLE_ID] }
          );

          if (permissionRows && permissionRows.length > 0) {
            const permissionData = permissionRows[0];
            
            if (permissionData.permissions) {
              permissions = Array.isArray(permissionData.permissions) 
                ? permissionData.permissions 
                : JSON.parse(permissionData.permissions || '[]');
            } else if (permissionData.allowed_permissions) {
              permissions = Array.isArray(permissionData.allowed_permissions)
                ? permissionData.allowed_permissions
                : JSON.parse(permissionData.allowed_permissions || '[]');
            } else if (permissionData.permission_list) {
              permissions = Array.isArray(permissionData.permission_list)
                ? permissionData.permission_list
                : JSON.parse(permissionData.permission_list || '[]');
            }
            
            roleName = permissionData.ROLE_NAME || 
                      permissionData.role_name || 
                      permissionData.ROLE_NM || 
                      roleName;
          }
        } catch (permError) {
          console.warn(`⚠️ Error getting permissions for role ${user.BU_ROLE_ID}:`, permError.message);
        }
      }

      const isLocked = user.lock_until && user.lock_until > Date.now();
      const lockRemaining = isLocked ? Math.ceil((user.lock_until - Date.now()) / 60000) : 0;

      let accessibleBusinessUnits = [];
      try {
        if (user.accessibleBusinessUnits) {
          accessibleBusinessUnits = typeof user.accessibleBusinessUnits === 'string' 
            ? JSON.parse(user.accessibleBusinessUnits)
            : user.accessibleBusinessUnits;
        }
      } catch (error) {
        console.warn('Error parsing accessibleBusinessUnits:', error.message);
      }

      return {
        id: user.id,
        user_id: user.user_id,
        user_name: user.user_name,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        employer_number: user.employer_number,
        job_title: user.job_title,
        main_business_unit: user.main_business_unit,
        businessUnit: user.businessUnit,
        responsibility_centre: user.responsibility_centre,
        branch: user.branch,
        is_main_BU: user.is_main_BU,
        accessibleBusinessUnits: accessibleBusinessUnits,
        primary_business_role: user.primary_business_role,
        BU_ROLE_ID: user.BU_ROLE_ID,
        role_name: roleName,
        permissions_count: permissions.length,
        is_administrator: parseInt(user.BU_ROLE_ID) === 1,
        status: user.status,
        internal_employee_enabled: user.internal_employee_enabled,
        is_supervisor: user.is_supervisor,
        enable_multi_session: user.enable_multi_session,
        validate_ip_address: user.validate_ip_address,
        ip_address: user.ip_address,
        lock_status: {
          is_locked: isLocked,
          is_force_locked: user.status === 'ForceLocked',
          failed_attempts: user.failed_attempts || 0,
          lock_until: user.lock_until,
          lock_remaining_minutes: lockRemaining,
          force_lock_reason: user.force_lock_reason,
          force_locked_at: user.force_locked_at,
          force_locked_by: user.force_locked_by
        },
        start_date: user.start_date,
        expiry_date: user.expiry_date,
        last_login: user.last_login,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
    }));

    const activeUsers = mappedUsers.filter(user => user.status === 'Active').length;
    const inactiveUsers = mappedUsers.filter(user => user.status !== 'Active').length;
    const lockedUsers = mappedUsers.filter(user => user.lock_status.is_locked).length;
    const supervisorUsers = mappedUsers.filter(user => user.is_supervisor).length;
    const administratorUsers = mappedUsers.filter(user => user.is_administrator).length;

    res.status(200).json({
      success: true,
      message: `Found ${mappedUsers.length} users for ${searchColumn} = "${bu_id}"`,
      data: {
        users: mappedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          searched_field: searchColumn,
          searched_value: bu_id,
          active_users: activeUsers,
          inactive_users: inactiveUsers,
          locked_users: lockedUsers,
          supervisor_users: supervisorUsers,
          administrator_users: administratorUsers,
          total_users: mappedUsers.length,
          query_filters: {
            status: status || 'Active (default)',
            role_id: role_id || 'All',
            include_inactive: include_inactive === 'true',
            search_field: searchColumn
          }
        }
      }
    });

  } catch (error) {
    console.error('💥 Get users by BU_ID error:', {
      message: error.message,
      stack: error.stack,
      bu_id: req.params.bu_id,
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching users by business unit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// GET USER PROFILE
// ============================================
export const getUserProfile = asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    const user = await User.findByPk(req.user.userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = user.get({ plain: true });
    let roleId = userData.BU_ROLE_ID;
    let permissions = {};
    let roleName = userData.primary_business_role || 'Unknown Role';
    let flattenedPermissions = [];

    if (parseInt(roleId) === 1) {
      permissions = Object.keys(PERMISSIONS).reduce((acc, key) => {
        const permissionGroup = PERMISSIONS[key];
        if (typeof permissionGroup === 'object') {
          const groupPermissions = Object.values(permissionGroup);
          acc[`${key}_ACCESS_LEVEL`] = groupPermissions;
          flattenedPermissions = flattenedPermissions.concat(groupPermissions);
        }
        return acc;
      }, {});
      roleName = 'Administrator';
    } else {
      const permissionsDoc = await Permissions.findOne({ 
        where: { BU_ROLE_ID: roleId },
        attributes: ['permissions', 'ROLE_NAME']
      });

      if (permissionsDoc) {
        permissions = permissionsDoc.permissions;
        roleName = permissionsDoc.ROLE_NAME;
        flattenedPermissions = Object.values(permissions).flat();
      } else {
        const roleDetails = getRoleWithPermissions(roleId);
        permissions = roleDetails.permissions;
        roleName = roleDetails.ROLE_NM;
        flattenedPermissions = Object.values(permissions).flat();
      }
    }

    const userResponse = {
      id: userData.id,
      user_name: userData.user_name,
      email: userData.email,
      first_name: userData.first_name,
      last_name: userData.last_name,
      employer_number: userData.employer_number,
      main_business_unit: userData.main_business_unit,
      primary_business_role: userData.primary_business_role,
      BU_ROLE_ID: userData.BU_ROLE_ID,
      status: userData.status,
      enable_multi_session: userData.enable_multi_session,
      validate_ip_address: userData.validate_ip_address,
      ip_address: userData.ip_address,
      is_supervisor: userData.is_supervisor
    };

    res.json({
      success: true,
      data: {
        user: userResponse,
        permissions: permissions,
        flattenedPermissions: flattenedPermissions,
        roleName: roleName,
        roleId: roleId,
        isAdministrator: parseInt(roleId) === 1
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// GET USER CONFIGURATION
// ============================================
export const getUserConfig = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing JWT token' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = user.get({ plain: true });

    let permissions = {};
    let roleName = userData.primary_business_role || 'Unknown Role';

    const permissionsDoc = await Permissions.findOne({ 
      where: { BU_ROLE_ID: userData.BU_ROLE_ID }
    });

    if (permissionsDoc) {
      permissions = permissionsDoc.permissions;
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(userData.BU_ROLE_ID);
      permissions = roleDetails?.permissions || {};
      roleName = roleDetails?.ROLE_NM || roleName;
    }

    const configData = {
      modules: getModulesForRole(userData.BU_ROLE_ID),
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: true
      },
      user: {
        userId: userData.id,
        user_name: userData.user_name,
        email: userData.email,
        role: roleName,
        roleId: userData.BU_ROLE_ID,
        businessUnit: userData.main_business_unit,
        status: userData.status,
        permissions: Object.values(permissions).flat(),
        isSupervisor: userData.is_supervisor || false,
        businessUnitId: userData.BU_ID
      }
    };

    res.status(200).json(configData);
  } catch (error) {
    console.error('Error fetching user config:', error.message, { stack: error.stack });
    
    const fallbackConfig = {
      modules: [],
      preferences: { theme: 'light' },
      user: {
        user_name: 'Unknown',
        role: 'Unknown',
        permissions: []
      }
    };
    
    res.status(200).json(fallbackConfig);
  }
});

// ============================================
// GET CLIENT IP ADDRESS
// ============================================
export const getClientIpController = asyncHandler(async (req, res) => {
  try {
    console.log('Processing getClientIpController request:', { headers: req.headers });
    const ip = getClientIp(req);
    if (!ip) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine client IP address.',
      });
    }
    res.status(200).json({
      success: true,
      message: 'Client IP address retrieved successfully',
      ip_address: ip,
    });
  } catch (error) {
    console.error('Error in getClientIpController:', error.message, {
      headers: req.headers,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// ============================================
// LOGIN FUNCTION with 2FA Integration
// ============================================
export const login = asyncHandler(async (req, res) => {
  const { username, user_name, password } = req.body;
  const loginIdentifier = (username || user_name)?.trim();
  const cleanPassword = password?.trim();
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  console.log('🔐 LOGIN ATTEMPT:', {
    login_identifier: loginIdentifier,
    password_length: cleanPassword?.length || 0,
    ip: ipAddress,
    timestamp: new Date().toISOString()
  });

  if (!loginIdentifier || !cleanPassword) {
    return res.status(400).json({
      success: false,
      message: 'Login identifier and password are required',
    });
  }

  try {
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: loginIdentifier },
          { username: loginIdentifier }
        ]
      },
      raw: true,
      attributes: { 
        include: ['id', 'user_name', 'username', 'email', 'preferred_name', 'password', 'default_password', 
                 'BU_ROLE_ID', 'status', 'internal_employee_enabled', 'is_first_login',
                 'force_password_change', 'primary_business_role', 'main_business_unit',
                 'earliest_login_time', 'latest_login_time', 'failed_attempts', 
                 'lock_until', 'last_login', 'password_expiry_date',
                 'rfid_enabled', 'two_factor_enabled', 'two_factor_methods',
                 'two_factor_phone', 'two_factor_email'] 
      }
    });

    if (!user) {
      console.log('❌ USER NOT FOUND');
      await createLoginLog(null, loginIdentifier, ipAddress, userAgent, 'Failed', false, 'User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        remainingAttempts: 5
      });
    }

    console.log('📊 USER FOUND:', {
      user_id: user.id,
      user_name: user.user_name,
      has_password: !!user.password,
      has_default_password: !!user.default_password,
      is_first_login: user.is_first_login,
      rfid_enabled: user.rfid_enabled,
      two_factor_enabled: user.two_factor_enabled,
      BU_ROLE_ID: user.BU_ROLE_ID
    });

    if (user.status !== 'Active' || !user.internal_employee_enabled) {
      await createLoginLog(user.id, user.user_name, ipAddress, userAgent, 'Failed', false, 'Account disabled');
      return res.status(401).json({
        success: false,
        message: 'User account is disabled or inactive',
      });
    }

    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      const lockTime = Math.ceil((new Date(user.lock_until) - new Date()) / 60000);
      return res.status(401).json({
        success: false,
        message: `Account is locked. Try again in ${lockTime} minutes.`,
        lock_until: user.lock_until
      });
    }

    // ========== PASSWORD VALIDATION ==========
    let isPasswordMatch = false;

    if (user.password && user.password.length > 0) {
      if (!user.password.startsWith('$2')) {
        await createLoginLog(user.id, user.user_name, ipAddress, userAgent, 'Failed', false, 'Invalid password hash');
        return res.status(401).json({
          success: false,
          message: 'Authentication error. Please contact administrator.',
          code: 'INVALID_PASSWORD_HASH'
        });
      }
      try {
        isPasswordMatch = await bcrypt.compare(cleanPassword, user.password);
        console.log('🔑 BCRYPT COMPARE RESULT:', isPasswordMatch);
      } catch (bcryptError) {
        console.error('❌ BCRYPT COMPARE ERROR:', bcryptError.message);
        return res.status(401).json({
          success: false,
          message: 'Authentication error. Please try again later.',
          code: 'BCRYPT_ERROR'
        });
      }
    }
    else if (user.is_first_login && user.default_password && user.default_password.length > 0) {
      console.log('🔑 CHECKING DEFAULT PASSWORD (first login)...');
      try {
        isPasswordMatch = await bcrypt.compare(cleanPassword, user.default_password);
        console.log('🔑 DEFAULT PASSWORD MATCH:', isPasswordMatch);
      } catch (defaultError) {
        console.error('❌ DEFAULT PASSWORD COMPARE ERROR:', defaultError.message);
        isPasswordMatch = false;
      }
    }
    else {
      console.error('❌ No password hash and no default password – login rejected');
      await createLoginLog(user.id, user.user_name, ipAddress, userAgent, 'Failed', false, 'No password hash');
      return res.status(401).json({
        success: false,
        message: 'Account not properly configured. Please contact administrator.',
        code: 'NO_PASSWORD_HASH'
      });
    }

    if (!isPasswordMatch) {
      console.log('❌ PASSWORD MISMATCH');
      const newFailedAttempts = (user.failed_attempts || 0) + 1;
      let lockUntil = null;
      if (newFailedAttempts >= 5) {
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        console.log('🔒 LOCKING ACCOUNT');
      }
      await User.update({
        failed_attempts: newFailedAttempts,
        lock_until: lockUntil
      }, { where: { id: user.id } });
      
      await createLoginLog(user.id, user.user_name, ipAddress, userAgent, 'Failed', false, 'Invalid password');
      
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        remainingAttempts: 5 - newFailedAttempts,
        locked: lockUntil !== null,
        lock_until: lockUntil
      });
    }

    // ========== FIRST LOGIN WITH DEFAULT PASSWORD – FORCE PASSWORD CHANGE ==========
    if (user.is_first_login && user.default_password && isPasswordMatch) {
      console.log('✅ First login with default password – forcing password change');
      const tempToken = jwt.sign(
        {
          userId: user.id,
          purpose: 'password_change',
          type: 'temp'
        },
        getSecretKey() || process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      await createLoginLog(user.id, user.user_name, ipAddress, userAgent, 'Pending', false, 'First login - password change required');
      return res.status(200).json({
        success: false,
        requiresPasswordChange: true,
        message: 'First login. Please set a new password to continue.',
        tempToken,
        redirectTo: '/first-time-password',
        user: {
          userId: user.id,
          user_name: user.user_name,
          name: user.preferred_name || user.user_name
        }
      });
    }

    console.log('✅ PASSWORD VERIFIED SUCCESSFULLY');

    // ========== GLOBAL LOGIN HOURS POLICY ENFORCEMENT ==========
    try {
      const policy = await LoginPolicy.findOne();
      if (policy && policy.enabled === true) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [earliestHour, earliestMinute] = policy.earliest_login_time.split(':').map(Number);
        const [latestHour, latestMinute] = policy.latest_login_time.split(':').map(Number);
        const earliestMinutes = earliestHour * 60 + earliestMinute;
        const latestMinutes = latestHour * 60 + latestMinute;

        const isAdminUser = parseInt(user.BU_ROLE_ID) === 1;
        if (!isAdminUser && (currentMinutes < earliestMinutes || currentMinutes > latestMinutes)) {
          await createLoginLog(user.id, user.user_name, ipAddress, userAgent, 'Failed', false, 'Outside login hours');
          return res.status(403).json({
            success: false,
            message: `Login allowed only between ${policy.earliest_login_time.slice(0,5)} and ${policy.latest_login_time.slice(0,5)}.`,
            code: 'LOGIN_HOURS_RESTRICTED'
          });
        }
        console.log(`✅ Login allowed – within policy window ${policy.earliest_login_time.slice(0,5)}-${policy.latest_login_time.slice(0,5)}`);
      } else {
        console.log('ℹ️ Login policy not enabled, skipping restriction');
      }
    } catch (policyError) {
      console.error('⚠️ Failed to check login policy:', policyError);
    }

    // ========== LICENSE VALIDATION ==========
    const isAdmin = parseInt(user.BU_ROLE_ID) === 1;
    
    if (!isAdmin) {
      console.log('🔍 CHECKING LICENSE VALIDITY FOR NON-ADMIN USER...');
      try {
        const licenseCheck = await validateLicenseForLogin();
        if (!licenseCheck || !licenseCheck.valid) {
          let statusCode = 403;
          if (licenseCheck?.code === 'NO_LICENSE') statusCode = 404;
          if (licenseCheck?.code === 'LICENSE_EXPIRED') statusCode = 410;
          await createLoginLog(user.id, user.user_name, ipAddress, userAgent, 'Failed', false, 'License validation failed');
          return res.status(statusCode).json({
            success: false,
            message: licenseCheck?.message || 'License validation failed',
            code: licenseCheck?.code || 'LICENSE_ERROR',
            details: licenseCheck?.details || {}
          });
        }
        console.log('✅ LICENSE VALID');
      } catch (licenseError) {
        console.error('⚠️ License validation error:', licenseError.message);
        console.log('⚠️ License validation failed but allowing login (graceful degradation)');
      }
    } else {
      console.log('✅ ADMIN USER - SKIPPING LICENSE CHECK');
    }

    // ========== GET UPDATED USER WITH 2FA FIELDS ==========
    const updatedUser = await User.findByPk(user.id, {
      attributes: { 
        include: [
          'force_password_change', 
          'password_expiry_date', 
          'rfid_enabled',
          'two_factor_enabled',
          'two_factor_methods',
          'two_factor_phone',
          'two_factor_email'
        ] 
      }
    });

    // ========== CHECK FOR 2FA ==========
    const has2FA = twoFactorService.hasAny2FAEnabled(updatedUser);
    
    if (has2FA) {
      console.log('🔐 2FA ENABLED - Requiring verification');
      
      const availableMethods = twoFactorService.getAvailableMethods(updatedUser);
      
      if (availableMethods.length === 0) {
        await createLoginLog(updatedUser.id, updatedUser.user_name, ipAddress, userAgent, 'Failed', false, 'No 2FA methods available');
        return res.status(400).json({
          success: false,
          message: '2FA enabled but no methods configured'
        });
      }

      const { sessionId, token, expiresAt } = twoFactorService.init2FASession(
        updatedUser.id,
        updatedUser.user_name || updatedUser.username,
        updatedUser.email,
        updatedUser.two_factor_phone,
        twoFactorService.getEnabledMethods(updatedUser)
      );

      const primaryMethod = availableMethods[0];
      let sendResult = { success: true };
      let smsId = null;

      if (primaryMethod.type === 'hardware_token') {
        sendResult = { success: true, hardware: true };
      } else {
        sendResult = await twoFactorService.sendAndStoreToken(
          sessionId,
          primaryMethod.type,
          updatedUser,
          token
        );
        
        if (sendResult.success && sendResult.smsId) {
          smsId = sendResult.smsId;
        }
      }

      if (!sendResult.success) {
        await createLoginLog(updatedUser.id, updatedUser.user_name, ipAddress, userAgent, 'Failed', false, 'Failed to send 2FA code');
        return res.status(500).json({
          success: false,
          message: 'Failed to send 2FA code',
          error: sendResult.error
        });
      }

      const loginRecord = await createLoginLog(
        updatedUser.id,
        updatedUser.user_name || updatedUser.username,
        ipAddress,
        userAgent,
        'Pending',
        false,
        `2FA Required via ${primaryMethod.type}`,
        primaryMethod.type === 'hardware_token' ? 'RFID' : 
        primaryMethod.type === 'sms_token' ? 'SMS' : 'Email'
      );

      pending2FASessions.set(sessionId, {
        user_id: updatedUser.id,
        login_id: loginRecord?.id,
        timestamp: Date.now()
      });

      console.log('📝 2FA session created:', { sessionId, userId: updatedUser.id });

      return res.status(200).json({
        success: true,
        require2FA: true,
        sessionId: sessionId,
        expiresAt: expiresAt,
        methods: availableMethods,
        primaryMethod: primaryMethod.type,
        message: primaryMethod.type === 'hardware_token' 
          ? 'Please tap your HID Mini Token on the reader' 
          : `2FA code sent via ${primaryMethod.label}`,
        smsId: smsId,
        provider: primaryMethod.provider || null,
        loginId: loginRecord?.id,
        ...(process.env.NODE_ENV === 'development' && { token: token })
      });
    }

    // ========== NO 2FA - Continue with normal login ==========
    console.log('ℹ️ No 2FA required - completing login');

    await User.update({
      failed_attempts: 0,
      lock_until: null,
      last_login: new Date()
    }, { where: { id: updatedUser.id } });

    let requiresPasswordChange = false;
    let tempToken = null;
    if (!isAdmin) {
      const isExpired = updatedUser.password_expiry_date && new Date() > new Date(updatedUser.password_expiry_date);
      requiresPasswordChange = updatedUser.force_password_change || isExpired;
      
      if (requiresPasswordChange && updatedUser.force_password_change) {
        tempToken = jwt.sign(
          {
            userId: updatedUser.id,
            purpose: 'password_change',
            type: 'temp',
            isForced: true
          },
          getSecretKey() || process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );
      }
    }

    if (tempToken) {
      console.log('✅ Forced password change – returning tempToken');
      await createLoginLog(updatedUser.id, updatedUser.user_name, ipAddress, userAgent, 'Pending', false, 'Forced password change required');
      return res.status(200).json({
        success: false,
        requiresPasswordChange: true,
        message: 'Your password has been reset by admin. Please set a new password to continue.',
        tempToken,
        redirectTo: '/first-time-password',
        user: {
          userId: updatedUser.id,
          user_name: updatedUser.user_name,
          name: updatedUser.preferred_name || updatedUser.user_name
        }
      });
    }

    const token = generateJWT(updatedUser, isAdmin);

    await createLoginLog(
      updatedUser.id,
      updatedUser.user_name || updatedUser.username,
      ipAddress,
      userAgent,
      'Success',
      true,
      'Login successful'
    );

    const response = {
      success: true,
      token,
      user: {
        userId: updatedUser.id,
        user_name: updatedUser.user_name || updatedUser.username || loginIdentifier,
        email: updatedUser.email,
        preferred_name: updatedUser.preferred_name || null,
        role: getRoleName(updatedUser, isAdmin),
        BU_ROLE_ID: updatedUser.BU_ROLE_ID,
        primary_business_role: updatedUser.primary_business_role || getRoleName(updatedUser, isAdmin),
        businessUnit: updatedUser.main_business_unit || 'Wethral',
        isAdmin: isAdmin,
        is_first_login: updatedUser.is_first_login,
        force_password_change: updatedUser.force_password_change,
        requiresPasswordChange: requiresPasswordChange,
        permissions: getPermissionsForUser(updatedUser, isAdmin),
        rfid_enabled: updatedUser.rfid_enabled || false,
        two_factor_enabled: updatedUser.two_factor_enabled || false,
        accessibleBusinessUnits: [updatedUser.main_business_unit || 'Wethral'],
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7*24*60*60*1000).toISOString()
      },
      message: 'Login successful'
    };
    res.status(200).json(response);
  } catch (error) {
    console.error('💥 LOGIN PROCESS ERROR:', {
      message: error.message,
      stack: error.stack,
      login_identifier: loginIdentifier
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// VERIFY 2FA TOKEN (Email/SMS)
// ============================================
export const verify2FAToken = asyncHandler(async (req, res) => {
  try {
    const { sessionId, token, method } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!sessionId || !token) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and token required'
      });
    }

    const verification = twoFactorService.verifyToken(sessionId, token);

    if (!verification.success) {
      const pendingSession = pending2FASessions.get(sessionId);
      if (pendingSession?.login_id) {
        await Login.update(
          { 
            status: 'Failed', 
            success: false,
            error: verification.error,
            error_code: 'TWO_FA_INVALID_TOKEN',
            two_fa_attempts: sequelize.literal('two_fa_attempts + 1')
          },
          { where: { id: pendingSession.login_id } }
        );
      }
      return res.status(401).json({
        success: false,
        message: verification.error,
        remaining: verification.remaining
      });
    }

    const session = twoFactorService.getSession(sessionId);
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    const user = await User.findByPk(session.user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await complete2FALogin(user, ipAddress, userAgent, method || 'email_token', sessionId);

    twoFactorService.clearSession(sessionId);
    pending2FASessions.delete(sessionId);

    res.json(result);

  } catch (error) {
    console.error('❌ Verify 2FA token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify 2FA token'
    });
  }
});

// ============================================
// VERIFY HARDWARE 2FA (RFID)
// ============================================
export const verifyHardware2FA = asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID required'
      });
    }

    const pendingSession = pending2FASessions.get(sessionId);
    if (!pendingSession) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    if (!rfidReaderService.isConnected) {
      const initialized = await rfidReaderService.connect();
      if (!initialized) {
        return res.status(503).json({
          success: false,
          message: 'RFID reader not available',
          requireCard: true
        });
      }
    }

    const cardData = await rfidReaderService.readCard(10000);
    
    if (!cardData) {
      return res.status(401).json({
        success: false,
        message: 'No RFID token detected. Please tap your token.',
        requireCard: true
      });
    }

    const verification = await twoFactorService.verifyHardwareToken(sessionId, cardData);

    if (!verification.success) {
      if (pendingSession.login_id) {
        await Login.update(
          { 
            status: 'Failed', 
            success: false,
            error: verification.error,
            error_code: 'RFID_VERIFICATION_FAILED',
            rfid_attempt_count: sequelize.literal('rfid_attempt_count + 1'),
            two_fa_attempts: sequelize.literal('two_fa_attempts + 1')
          },
          { where: { id: pendingSession.login_id } }
        );
      }
      return res.status(401).json({
        success: false,
        message: verification.error,
        requireCard: true
      });
    }

    const session = twoFactorService.getSession(sessionId);
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session expired'
      });
    }

    const user = await User.findByPk(session.user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await logRFIDAttempt(
      user.id,
      null,
      cardData,
      true,
      'Success',
      null,
      ipAddress,
      userAgent
    );

    const result = await complete2FALogin(user, ipAddress, userAgent, 'hardware_token', sessionId);

    twoFactorService.clearSession(sessionId);
    pending2FASessions.delete(sessionId);

    res.json(result);

  } catch (error) {
    console.error('❌ Hardware 2FA verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify hardware token'
    });
  }
});

// ============================================
// RESEND 2FA TOKEN
// ============================================
export const resend2FAToken = asyncHandler(async (req, res) => {
  try {
    const { sessionId, method } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID required'
      });
    }

    const session = twoFactorService.getSession(sessionId);
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    const user = await User.findByPk(session.user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await twoFactorService.resendToken(sessionId, method || 'email_token', user);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || 'Failed to resend token'
      });
    }

    const pendingSession = pending2FASessions.get(sessionId);
    if (pendingSession?.login_id) {
      const updateData = {
        two_fa_attempts: sequelize.literal('two_fa_attempts + 1')
      };
      if (method === 'email') {
        updateData.email_2fa_sent = true;
        updateData.email_2fa_sent_at = new Date();
      } else if (method === 'sms') {
        updateData.sms_2fa_sent = true;
        updateData.sms_2fa_sent_at = new Date();
      }
      await Login.update(updateData, { where: { id: pendingSession.login_id } });
    }

    const updatedSession = twoFactorService.getSession(sessionId);

    res.json({
      success: true,
      message: '2FA code resent successfully',
      expiresAt: result.expiresAt,
      smsId: updatedSession?.sms_id || null,
      ...(process.env.NODE_ENV === 'development' && { token: session.token })
    });

  } catch (error) {
    console.error('❌ Resend 2FA token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend 2FA token'
    });
  }
});

// ============================================
// GET 2FA STATUS
// ============================================
export const get2FAStatus = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.id || req.params.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const user = await User.findByPk(userId, {
      attributes: [
        'id', 
        'user_name', 
        'email',
        'two_factor_enabled',
        'two_factor_methods',
        'two_factor_phone',
        'two_factor_email',
        'rfid_enabled'
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const availableMethods = twoFactorService.getAvailableMethods(user);
    const enabledMethods = twoFactorService.getEnabledMethods(user);

    const rfidTokens = await RFIDToken.findAll({
      where: {
        user_id: userId,
        is_active: true
      },
      attributes: ['id', 'serial_number', 'batch_number', 'device_type', 'last_used_at', 'is_primary']
    });

    res.json({
      success: true,
      data: {
        two_factor_enabled: user.two_factor_enabled,
        enabled_methods: enabledMethods,
        available_methods: availableMethods,
        has_hardware_token: user.rfid_enabled,
        rfid_tokens: rfidTokens,
        phone: user.two_factor_phone,
        email: user.two_factor_email,
        methods_config: user.two_factor_methods
      }
    });

  } catch (error) {
    console.error('❌ Get 2FA status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get 2FA status'
    });
  }
});

// ============================================
// CONFIGURE 2FA (Admin only)
// ============================================
export const configure2FA = asyncHandler(async (req, res) => {
  try {
    const { 
      userId, 
      enabled, 
      methods, 
      phone,
      email 
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updateData = {
      two_factor_enabled: enabled || false,
      two_factor_methods: {
        hardware_token: methods?.includes('hardware_token') || false,
        email_token: methods?.includes('email_token') || false,
        sms_token: methods?.includes('sms_token') || false
      }
    };

    if (phone) {
      updateData.two_factor_phone = phone;
    }

    if (email) {
      updateData.two_factor_email = email;
    }

    await user.update(updateData);

    logger.info(`2FA settings updated for user ${user.user_name}`, {
      enabled: enabled,
      methods: methods
    });

    res.json({
      success: true,
      message: '2FA settings updated successfully',
      data: {
        two_factor_enabled: user.two_factor_enabled,
        two_factor_methods: user.two_factor_methods,
        two_factor_phone: user.two_factor_phone,
        two_factor_email: user.two_factor_email
      }
    });

  } catch (error) {
    console.error('❌ Configure 2FA error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to configure 2FA'
    });
  }
});

// ============================================
// TEST SMS CONFIGURATION
// ============================================
export const testSMSConfig = asyncHandler(async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number required'
      });
    }

    const result = await twoFactorService.testSMSConfiguration(phoneNumber);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'SMS configuration test successful',
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'SMS configuration test failed',
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ SMS test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test SMS configuration'
    });
  }
});

// ============================================
// GET SMS STATUS
// ============================================
export const getSMSStatus = asyncHandler(async (req, res) => {
  try {
    const { smsId } = req.params;
    
    if (!smsId) {
      return res.status(400).json({
        success: false,
        message: 'SMS ID required'
      });
    }

    const status = await twoFactorService.getSMSStatus(smsId);
    
    if (!status.success) {
      return res.status(404).json({
        success: false,
        message: status.error || 'SMS not found'
      });
    }

    res.json({
      success: true,
      data: {
        status: status.status,
        recipient: status.recipient,
        sentAt: status.sentAt,
        errorMessage: status.errorMessage
      }
    });

  } catch (error) {
    console.error('❌ Get SMS status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SMS status'
    });
  }
});

// ============================================
// GET 2FA STATISTICS (Admin only)
// ============================================
export const get2FAStatistics = asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const stats = await Login.get2FAStatistics(startDate, endDate);
    
    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Get 2FA statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get 2FA statistics'
    });
  }
});


// UPDATE USER
export const updateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: userId },
          { username: userId },
          { id: !isNaN(userId) ? parseInt(userId) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    await user.update(updateData);

    res.status(200).json({ 
      message: 'User updated successfully', 
      user: user
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
});

// DEACTIVATE USER
export const deactivateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: userId },
          { username: userId },
          { id: !isNaN(userId) ? parseInt(userId) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.update({ 
      status: 'Deactivated',
      internal_employee_enabled: false
    });

    res.status(200).json({ 
      message: 'User deactivated successfully', 
      user: user
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ message: 'Error deactivating user', error: error.message });
  }
});

// ACTIVATE USER
export const activateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: userId },
          { username: userId },
          { id: !isNaN(userId) ? parseInt(userId) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.update({ 
      status: 'Active',
      internal_employee_enabled: true
    });

    res.status(200).json({ 
      message: 'User activated successfully', 
      user: user
    });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ message: 'Error activating user', error: error.message });
  }
});

// GET ALL USERS
export const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] }
    });
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'No users found' });
    }

    const userRoles = await UserRole.findAll({
      attributes: ['USER_ID', 'ROLE_NMS', 'USER_ROLE_IDS', 'BU_ID', 'Business_Unit']
    });

    const roleMap = {};
    userRoles.forEach(role => {
      if (role.USER_ID) {
        if (roleMap[role.USER_ID]) {
          const existing = roleMap[role.USER_ID];
          const newRoles = Array.isArray(role.ROLE_NMS) ? role.ROLE_NMS : [role.ROLE_NMS];
          const existingRoles = Array.isArray(existing.ROLE_NMS) ? existing.ROLE_NMS : [existing.ROLE_NMS];
          roleMap[role.USER_ID] = {
            ...existing,
            ROLE_NMS: [...existingRoles, ...newRoles],
            USER_ROLE_IDS: [...(existing.USER_ROLE_IDS || []), ...(role.USER_ROLE_IDS || [])]
          };
        } else {
          roleMap[role.USER_ID] = role;
        }
      }
    });

    const usersWithRoles = users.map(user => {
      const userObj = user.toJSON();
      const userRole = roleMap[userObj.user_name] || roleMap[userObj.id];
      
      let roles = [];
      let roleIds = [];
      let businessUnit = null;
      
      if (userRole) {
        if (userRole.ROLE_NMS) {
          roles = Array.isArray(userRole.ROLE_NMS) ? userRole.ROLE_NMS : [userRole.ROLE_NMS];
        }
        if (userRole.USER_ROLE_IDS) {
          roleIds = Array.isArray(userRole.USER_ROLE_IDS) ? userRole.USER_ROLE_IDS : [userRole.USER_ROLE_IDS];
        }
        businessUnit = userRole.Business_Unit || userRole.BU_ID || null;
      }
      
      if (roles.length === 0 && userObj.BU_ROLE_NAME) {
        roles = [userObj.BU_ROLE_NAME];
      }
      
      return {
        ...userObj,
        roles: roles,
        roleIds: roleIds,
        businessUnit: businessUnit,
        hasRole: roles.length > 0,
        roleDisplay: roles.length > 0 ? roles.join(', ') : 'No Role Assigned'
      };
    });

    res.status(200).json({ 
      success: true,
      message: 'Users fetched successfully', 
      count: usersWithRoles.length,
      users: usersWithRoles 
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

// SIMPLE RESET PASSWORD
export const simpleResetPassword = asyncHandler(async (req, res) => {
  try {
    const { user_name, username, newPassword, new_password, newpassword, confirmPassword, confirm_password, confirmpassword } = req.body;
    const currentUser = req.user;

    const finalNewPassword = newPassword || new_password || newpassword;
    const finalConfirmPassword = confirmPassword || confirm_password || confirmpassword;

    console.log('🔄 SIMPLE Reset password request:', { 
      user_name, 
      username, 
      current_user: currentUser?.user_name,
      current_user_id: currentUser?.userId,
      isAdmin: currentUser?.isAdmin,
      newPasswordProvided: !!finalNewPassword,
      confirmProvided: !!finalConfirmPassword
    });

    const loginIdentifier = username || user_name;
    if (!loginIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Login identifier (username or user_name) is required'
      });
    }

    if (!finalNewPassword || finalNewPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password is required and should be at least 8 characters long'
      });
    }

    if (finalNewPassword !== finalConfirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Passwords do not match' 
      });
    }

    const UserModel = getUser();
    if (!UserModel || typeof UserModel.findOne !== 'function') {
      return res.status(503).json({
        success: false,
        message: 'User model not ready. Please try again.'
      });
    }

    const user = await UserModel.findOne({
      where: {
        [Op.or]: [
          { user_name: loginIdentifier },
          { username: loginIdentifier }
        ]
      }
    });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const isAdmin = currentUser?.isAdmin || currentUser?.role === 'Administrator' || 
                   parseInt(currentUser?.roleId || currentUser?.BU_ROLE_ID) === 1;
    const canReset = loginIdentifier === currentUser?.user_name || isAdmin;
    
    if (!canReset) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to reset this user\'s password'
      });
    }

    const hashedPassword = await bcrypt.hash(finalNewPassword, 10);
    
    await sequelize.query(
      'UPDATE users SET password = ?, passwordChangedAt = ?, failed_attempts = 0, lock_until = NULL WHERE id = ?',
      {
        replacements: [hashedPassword, new Date(), user.id],
        type: sequelize.QueryTypes.UPDATE
      }
    );

    console.log('✅ Password reset successfully for user:', user.user_name || user.username);

    res.json({ 
      success: true,
      message: 'Password reset successfully',
      user: {
        user_name: user.user_name,
        username: user.username,
        email: user.email,
        status: user.status
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('💥 Error in simple reset password:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ 
      success: false,
      message: 'Error resetting password', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ============================================
// UNLOCK USER
// ============================================
export const unlockUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason, unlockedBy } = req.body;

  try {
    console.log('🔓 Unlock user request:', { identifier, reason, unlockedBy });

    const UserModel = getUser();
    if (!UserModel || typeof UserModel.findOne !== 'function') {
      console.error('❌ User model not ready');
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. User model not initialized.',
        retryAfter: 5
      });
    }

    const user = await UserModel.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      console.log('❌ User not found:', { identifier });
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    const isLocked = user.lock_until && user.lock_until > Date.now();
    const hasFailedAttempts = user.failed_attempts > 0;

    if (!isLocked && !hasFailedAttempts) {
      console.log('ℹ️ User is not locked:', { user_name: user.user_name });
      return res.status(200).json({
        success: true,
        message: 'User is not locked',
        user: {
          user_name: user.user_name,
          status: user.status,
          locked: false,
          failed_attempts: user.failed_attempts
        }
      });
    }

    await user.update({
      failed_attempts: 0,
      lock_until: null,
      last_unlocked: new Date(),
      unlocked_by: unlockedBy || req.user?.user_name || 'system',
      unlock_reason: reason || 'Manual unlock by administrator'
    });

    console.log('✅ User unlocked successfully:', {
      user_name: user.user_name,
      failed_attempts: user.failed_attempts,
      lock_until: user.lock_until
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        failed_attempts: user.failed_attempts,
        lock_until: user.lock_until,
        last_unlocked: user.last_unlocked,
        unlocked_by: user.unlocked_by
      },
      unlockDetails: {
        reason: reason || 'Manual unlock by administrator',
        timestamp: new Date(),
        performedBy: unlockedBy || req.user?.user_name || 'system'
      }
    });

  } catch (error) {
    console.error('💥 User unlock error:', {
      message: error.message,
      stack: error.stack,
      identifier
    });
    
    res.status(500).json({
      success: false,
      message: 'Error unlocking user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET LOCKED USERS
// GET LOCKED USERS - WITH ROLE INFORMATION
export const getLockedUsers = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;

    const whereClause = {
      [Op.or]: [
        { lock_until: { [Op.gt]: new Date() } },
        { failed_attempts: { [Op.gt]: 0 } },
        { status: 'ForceLocked' }
      ]
    };

    if (search) {
      whereClause[Op.or] = [
        { user_name: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { employer_number: { [Op.like]: `%${search}%` } },
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // ✅ Include BU_ROLE_ID in the query
    const { count, rows: lockedUsers } = await User.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 
        'user_name', 
        'username',
        'email', 
        'first_name', 
        'last_name', 
        'employer_number', 
        'status', 
        'failed_attempts', 
        'lock_until', 
        'force_lock_reason', 
        'force_locked_at', 
        'force_locked_by', 
        'last_login', 
        'created_at',
        'BU_ROLE_ID',
        'primary_business_role',
        'user_id'
      ],
      order: [['lock_until', 'DESC'], ['failed_attempts', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    // ✅ Fetch user roles for all locked users
    const userIds = lockedUsers.map(user => user.id);
    let userRolesMap = {};
    
    if (userIds.length > 0) {
      try {
        const [roles] = await sequelize.query(
          `SELECT 
            ur.user_id,
            ur.ROLE_NM,
            ur.ROLE_ID,
            ur.BU_ID,
            ur.USER_NAME,
            ur.EMPLOYER_NUMBER,
            u.user_name as user_name
          FROM user_roles ur
          LEFT JOIN users u ON u.id = ur.user_id
          WHERE ur.user_id IN (:userIds)
          AND ur.REC_ST = 'A'`,
          {
            replacements: { userIds },
            type: sequelize.QueryTypes.SELECT
          }
        );
        
        roles.forEach(role => {
          const userId = role.user_id;
          const userName = role.USER_NAME || role.user_name;
          
          const roleInfo = {
            roleName: role.ROLE_NM || 'N/A',
            roleId: role.ROLE_ID,
            businessUnit: role.BU_ID
          };
          
          if (userId) userRolesMap[userId] = roleInfo;
          if (userName) userRolesMap[userName] = roleInfo;
          if (role.EMPLOYER_NUMBER) userRolesMap[role.EMPLOYER_NUMBER] = roleInfo;
        });
      } catch (roleError) {
        console.error('⚠️ Error fetching user roles:', roleError.message);
      }
    }

    const getUserRole = (user) => {
      let roleInfo = null;
      
      if (user.id && userRolesMap[user.id]) roleInfo = userRolesMap[user.id];
      if (!roleInfo && user.user_name && userRolesMap[user.user_name]) roleInfo = userRolesMap[user.user_name];
      if (!roleInfo && user.username && userRolesMap[user.username]) roleInfo = userRolesMap[user.username];
      if (!roleInfo && user.employer_number && userRolesMap[user.employer_number]) roleInfo = userRolesMap[user.employer_number];
      
      if (!roleInfo && user.BU_ROLE_ID) {
        for (const [key, value] of Object.entries(userRolesMap)) {
          if (value && value.roleId && String(value.roleId) === String(user.BU_ROLE_ID)) {
            roleInfo = value;
            break;
          }
        }
      }
      
      if (!roleInfo && user.primary_business_role) {
        return user.primary_business_role;
      }
      
      return roleInfo?.roleName || 'N/A';
    };

    const formattedUsers = lockedUsers.map(user => {
      const userData = user.get({ plain: true });
      const isLocked = userData.lock_until && userData.lock_until > Date.now();
      const lockRemaining = isLocked ? Math.ceil((userData.lock_until - Date.now()) / 60000) : 0;
      const roleName = getUserRole(userData);

      return {
        id: userData.id,
        user_id: userData.user_id,
        user_name: userData.user_name,
        username: userData.username || userData.user_name,
        name: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
        email: userData.email,
        employer_number: userData.employer_number,
        status: userData.status,
        role_name: roleName,
        BU_ROLE_ID: userData.BU_ROLE_ID,
        primary_business_role: userData.primary_business_role,
        failed_attempts: userData.failed_attempts,
        lock_until: userData.lock_until,
        is_locked: isLocked,
        is_force_locked: userData.status === 'ForceLocked',
        force_lock_reason: userData.force_lock_reason,
        force_locked_at: userData.force_locked_at,
        force_locked_by: userData.force_locked_by,
        lock_remaining: lockRemaining,
        last_login: userData.last_login,
        created_at: userData.created_at
      };
    });

    res.status(200).json({
      success: true,
      data: formattedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      },
      summary: {
        total_locked: formattedUsers.filter(u => u.is_locked).length,
        total_force_locked: formattedUsers.filter(u => u.is_force_locked).length,
        total_with_attempts: formattedUsers.filter(u => u.failed_attempts > 0).length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Get locked users error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error fetching locked users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// RESET USER SESSION
export const resetUser = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    console.log('🔄 Resetting user session for ID:', userId);

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password', 'passwordHistory'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = user.get({ plain: true });

    let permissions = {};
    let roleName = userData.primary_business_role || 'Unknown Role';
    let flattenedPermissions = [];

    if (parseInt(userData.BU_ROLE_ID) === 1) {
      permissions = Object.keys(PERMISSIONS).reduce((acc, key) => {
        const permissionGroup = PERMISSIONS[key];
        if (typeof permissionGroup === 'object') {
          const groupPermissions = Object.values(permissionGroup);
          acc[`${key}_ACCESS_LEVEL`] = groupPermissions;
          flattenedPermissions = flattenedPermissions.concat(groupPermissions);
        }
        return acc;
      }, {});
      roleName = 'Administrator';
    } else {
      const permissionsDoc = await Permissions.findOne({ 
        where: { BU_ROLE_ID: userData.BU_ROLE_ID },
        attributes: ['permissions', 'ROLE_NAME']
      });

      if (permissionsDoc) {
        permissions = permissionsDoc.permissions;
        roleName = permissionsDoc.ROLE_NAME;
        flattenedPermissions = Object.values(permissions).flat();
      } else {
        const roleDetails = getRoleWithPermissions(userData.BU_ROLE_ID);
        if (roleDetails) {
          permissions = roleDetails.permissions;
          roleName = roleDetails.ROLE_NM;
          flattenedPermissions = Object.values(permissions).flat();
        } else {
          permissions = {
            DASHBOARD_ACCESS_LEVEL: [PERMISSIONS.DASHBOARD.VIEW],
            CUSTOMER_ACCESS_LEVEL: [PERMISSIONS.CUSTOMER.VIEW]
          };
          roleName = userData.primary_business_role || 'User';
          flattenedPermissions = Object.values(permissions).flat();
        }
      }
    }

    const newToken = jwt.sign(
      {
        userId: userData.id,
        user_name: userData.user_name,
        role: roleName,
        roleId: userData.BU_ROLE_ID,
        isAdmin: userData.BU_ROLE_ID === 1,
        permissions: flattenedPermissions,
        iat: Math.floor(Date.now() / 1000),
      },
      getSecretKey(),
      { expiresIn: '7d' }
    );

    console.log('✅ User session reset successfully:', {
      user_name: userData.user_name,
      role: roleName,
      permissions_count: flattenedPermissions.length,
      new_token_generated: true
    });

    res.json({
      success: true,
      message: 'User session refreshed successfully',
      token: newToken,
      user: {
        ...userData,
        permissions: permissions,
        flattenedPermissions: flattenedPermissions,
        roleName: roleName,
        roleId: userData.BU_ROLE_ID,
        isAdministrator: parseInt(userData.BU_ROLE_ID) === 1,
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      cacheCleared: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Reset user session error:', {
      message: error.message,
      userId: req.user?.userId,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error resetting user session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function getRolePermissionsGrouped(roleId) {
  const roleEntry = Object.values(ROLE_MAPPING).find(role => role.ROLE_ID === roleId);
  return roleEntry ? roleEntry.permissions || {} : {};
}

function getRoleWithPermissions(roleId) {
  const roleEntry = Object.values(ROLE_MAPPING).find(role => role.ROLE_ID === roleId);
  return roleEntry || { ROLE_NM: 'Unknown', permissions: {} };
}

function getModulesForRole(roleId) {
  const baseModules = ['dashboard', 'profile', 'settings'];
  
  if (parseInt(roleId) === 1) {
    return [...baseModules, 'users', 'roles', 'permissions', 'reports', 'analytics', 'system'];
  } else {
    return baseModules;
  }
}

// ENABLE USER
export const enableUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  
  try {
    console.log('🔧 Enabling user:', identifier);
    
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.update({
      internal_employee_enabled: 1,
      status: 'Active',
      failed_attempts: 0,
      lock_until: null
    });

    res.status(200).json({
      success: true,
      message: 'User account enabled successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        internal_employee_enabled: user.internal_employee_enabled
      }
    });

  } catch (error) {
    console.error('💥 Enable user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error enabling user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET USER PERMISSIONS
export const getUserPermissions = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('BU_ROLE_ID username employer_number user_name')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let permissionsDoc = await Permissions.findOne({ 
      BU_ROLE_ID: user.BU_ROLE_ID 
    }).lean();

    let permissions = {};
    let roleName = 'Unknown Role';

    if (permissionsDoc) {
      permissions = permissionsDoc.permissions;
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(user.BU_ROLE_ID);
      permissions = roleDetails.permissions;
      roleName = roleDetails.ROLE_NM;
    }

    const flattenedPermissions = Object.values(permissions).flat();

    res.json({
      success: true,
      data: flattenedPermissions,
      permissions: permissions,
      roleId: user.BU_ROLE_ID,
      roleName: roleName,
      user: {
        id: user._id,
        username: user.username || user.user_name,
        employerNumber: user.employer_number
      }
    });

  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching permissions'
    });
  }
});

// GET BUSINESS UNIT SUMMARY
export const getBUSummary = asyncHandler(async (req, res) => {
  try {
    const { bu_id } = req.params;

    console.log('📊 Get Business Unit Summary request:', { bu_id });

    const buQuery = {
      $or: [
        { main_business_unit: bu_id },
        { BU_ID: bu_id },
        { branch: bu_id }
      ]
    };

    const users = await User.find(buQuery)
      .select('status BU_ROLE_ID role is_supervisor lock_until failed_attempts internal_employee_enabled')
      .lean();

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No users found for this business unit',
        data: {
          business_unit_id: bu_id,
          total_users: 0,
          summary: {
            active_users: 0,
            inactive_users: 0,
            locked_users: 0,
            supervisors: 0,
            administrators: 0,
            internal_employees: 0,
            external_users: 0
          },
          role_breakdown: {},
          status_breakdown: {}
        }
      });
    }

    const summary = {
      total_users: users.length,
      active_users: users.filter(user => 
        user.status === 'Active' || user.is_active === 'Active'
      ).length,
      inactive_users: users.filter(user => 
        user.status !== 'Active' && user.is_active !== 'Active'
      ).length,
      locked_users: users.filter(user => 
        user.lock_until && user.lock_until > Date.now()
      ).length,
      supervisors: users.filter(user => 
        user.is_supervisor || user.rofficer === 'Yes'
      ).length,
      administrators: users.filter(user => 
        parseInt(user.BU_ROLE_ID || user.role) === 1
      ).length,
      internal_employees: users.filter(user => 
        user.internal_employee_enabled || user.utype === 'Staff'
      ).length,
      external_users: users.filter(user => 
        !user.internal_employee_enabled && user.utype !== 'Staff'
      ).length
    };

    const roleBreakdown = users.reduce((acc, user) => {
      const roleId = user.BU_ROLE_ID || user.role;
      const roleKey = roleId ? roleId.toString() : 'unknown';
      
      if (!acc[roleKey]) {
        acc[roleKey] = {
          count: 0,
          role_id: roleId,
          role_name: getRoleWithPermissions(roleId)?.ROLE_NM || 'Unknown Role'
        };
      }
      acc[roleKey].count++;
      return acc;
    }, {});

    const statusBreakdown = users.reduce((acc, user) => {
      const status = user.status || (user.is_active === 'Active' ? 'Active' : 'Inactive');
      if (!acc[status]) {
        acc[status] = 0;
      }
      acc[status]++;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      message: `Business unit summary for ${bu_id}`,
      data: {
        business_unit_id: bu_id,
        total_users: summary.total_users,
        summary,
        role_breakdown: roleBreakdown,
        status_breakdown: statusBreakdown,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Get business unit summary error:', {
      message: error.message,
      stack: error.stack,
      bu_id: req.params.bu_id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business unit summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// VALIDATE PERMISSION
export const validatePermission = asyncHandler(async (req, res) => {
  try {
    const { permission } = req.body;

    if (!permission) {
      return res.status(400).json({
        success: false,
        message: 'Permission parameter is required'
      });
    }

    const user = await User.findById(req.user.userId)
      .select('BU_ROLE_ID')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (parseInt(user.BU_ROLE_ID) === 1) {
      return res.json({
        success: true,
        hasPermission: true,
        roleId: user.BU_ROLE_ID,
        isAdministrator: true
      });
    }

    let userPermissions = [];
    let roleName = 'Unknown Role';

    const permissionsDoc = await Permissions.findOne({ 
      BU_ROLE_ID: user.BU_ROLE_ID 
    }).lean();

    if (permissionsDoc) {
      userPermissions = Object.values(permissionsDoc.permissions).flat();
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(user.BU_ROLE_ID);
      userPermissions = Object.values(roleDetails.permissions).flat();
      roleName = roleDetails.ROLE_NM;
    }

    const hasPermission = userPermissions.includes(permission);

    res.json({
      success: true,
      hasPermission,
      roleId: user.BU_ROLE_ID,
      roleName: roleName,
      permissionRequested: permission
    });

  } catch (error) {
    console.error('Validate permission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error validating permission'
    });
  }
});

// VALIDATE PERMISSIONS
export const validatePermissions = asyncHandler(async (req, res) => {
  try {
    const { permissions: requiredPermissions, requireAll = true } = req.body;

    if (!requiredPermissions || !Array.isArray(requiredPermissions)) {
      return res.status(400).json({
        success: false,
        message: 'Permissions array is required'
      });
    }

    const user = await User.findById(req.user.userId)
      .select('BU_ROLE_ID')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (parseInt(user.BU_ROLE_ID) === 1) {
      const results = requiredPermissions.reduce((acc, perm) => {
        acc[perm] = true;
        return acc;
      }, {});

      return res.json({
        success: true,
        hasAllPermissions: true,
        hasAnyPermission: true,
        results,
        roleId: user.BU_ROLE_ID,
        isAdministrator: true
      });
    }

    let userPermissions = [];
    let roleName = 'Unknown Role';

    const permissionsDoc = await Permissions.findOne({ 
      BU_ROLE_ID: user.BU_ROLE_ID 
    }).lean();

    if (permissionsDoc) {
      userPermissions = Object.values(permissionsDoc.permissions).flat();
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(user.BU_ROLE_ID);
      userPermissions = Object.values(roleDetails.permissions).flat();
      roleName = roleDetails.ROLE_NM;
    }

    const results = requiredPermissions.reduce((acc, perm) => {
      acc[perm] = userPermissions.includes(perm);
      return acc;
    }, {});

    const hasAllPermissions = requiredPermissions.every(perm => results[perm]);
    const hasAnyPermission = requiredPermissions.some(perm => results[perm]);

    res.json({
      success: true,
      hasAllPermissions: requireAll ? hasAllPermissions : hasAnyPermission,
      hasAnyPermission,
      results,
      roleId: user.BU_ROLE_ID,
      roleName: roleName,
      userPermissionsCount: userPermissions.length
    });

  } catch (error) {
    console.error('Validate permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error validating permissions'
    });
  }
});

// GET USER BY EMPLOYER NUMBER
export const getUserByEmployerNumber = asyncHandler(async (req, res) => {
  try {
    const { employer_number } = req.params;
    
    console.log(`🔍 Searching user by employer_number: ${employer_number}`);
    
    const user = await User.findOne({ 
      where: {
        [Op.or]: [
          { employer_number: employer_number },
          { username: employer_number },
          { user_name: employer_number }
        ]
      }
    });
    
    if (!user) {
      console.log(`❌ User not found with employer_number/username: ${employer_number}`);
      return res.status(404).json({ 
        success: false,
        message: 'User not found',
        searchedValue: employer_number,
        suggestions: [
          'Check if employer number exists',
          'Try searching by username',
          'Verify user is active'
        ]
      });
    }

    console.log(`✅ User found: ${user.user_name || user.username} (ID: ${user.id})`);
    
    const userData = user.get({ plain: true });
    
    // ✅ FIX: Use getRoleName with proper parameters (user object and isAdmin flag)
    const isAdmin = parseInt(userData.BU_ROLE_ID) === 1;
    const roleName = getRoleName(userData, isAdmin);
    
    const mappedUser = {
      ...userData,
      user_name: userData.user_name || userData.username || '',
      first_name: userData.first_name || userData.fname || '',
      last_name: userData.last_name || userData.lname || '',
      full_name: `${userData.first_name || ''} ${userData.middle_name || ''} ${userData.last_name || ''}`.trim(),
      BU_ROLE_ID: userData.BU_ROLE_ID || userData.role || '',
      primary_business_role: userData.primary_business_role || userData.utype || '',
      role_name: roleName, // ✅ Fixed: Now uses correct parameters
      status: userData.status || (userData.is_active === 'Active' ? 'Active' : 'Inactive'),
      is_active: userData.is_active || (userData.status === 'Active'),
      main_business_unit: userData.main_business_unit || userData.branch || '',
      BU_ID: userData.BU_ID || userData.branch || '',
      is_supervisor: userData.is_supervisor || (userData.rofficer === 'Yes' || false),
      internal_employee_enabled: userData.internal_employee_enabled || (userData.utype === 'Staff' || false),
      employee_type: userData.utype || 'External',
      email: userData.email || '',
      phone: userData.phone || userData.phone_number || '',
      job_title: userData.job_title || ''
    };

    res.status(200).json({ 
      success: true,
      message: 'User found successfully', 
      data: {
        user: mappedUser,
        metadata: {
          id: userData.id,
          employer_number: userData.employer_number,
          last_login: userData.last_login,
          created_at: userData.created_at,
          updated_at: userData.updated_at,
          is_admin: userData.isAdmin || false
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user by employer number:', error);
    
    if (error.name === 'SequelizeDatabaseError') {
      console.error('Database error details:', error.parent?.sql);
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Error fetching user', 
      error: error.message,
      suggestion: 'Check database connection and user table structure'
    });
  }
});

// UNLOCK MULTIPLE USERS
export const unlockMultipleUsers = asyncHandler(async (req, res) => {
  const { identifiers, reason, unlockedBy } = req.body;

  if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Identifiers array is required'
    });
  }

  try {
    console.log('🔓 Unlock multiple users request:', { 
      count: identifiers.length, 
      reason, 
      unlockedBy 
    });

    const results = {
      successful: [],
      notFound: [],
      notLocked: [],
      errors: []
    };

    for (const identifier of identifiers) {
      try {
        const user = await User.findOne({
          where: {
            [Op.or]: [
              { user_name: { [Op.like]: identifier } },
              { username: { [Op.like]: identifier } },
              { email: { [Op.like]: identifier } },
              { employer_number: identifier },
              { id: !isNaN(identifier) ? parseInt(identifier) : null }
            ].filter(condition => {
              const value = Object.values(condition)[0];
              return value !== null && value !== undefined;
            })
          }
        });

        if (!user) {
          results.notFound.push(identifier);
          continue;
        }

        const isLocked = user.lock_until && user.lock_until > Date.now();
        const hasFailedAttempts = user.failed_attempts > 0;

        if (!isLocked && !hasFailedAttempts) {
          results.notLocked.push({
            identifier,
            user_name: user.user_name,
            reason: 'User is not locked'
          });
          continue;
        }

        await user.update({
          failed_attempts: 0,
          lock_until: null,
          last_unlocked: new Date(),
          unlocked_by: unlockedBy || req.user?.user_name || 'system',
          unlock_reason: reason || 'Bulk unlock by administrator'
        });

        results.successful.push({
          identifier,
          user_name: user.user_name
        });

      } catch (error) {
        results.errors.push({
          identifier,
          error: error.message
        });
      }
    }

    console.log('📊 Bulk unlock results:', results);

    res.status(200).json({
      success: true,
      message: `Bulk unlock completed: ${results.successful.length} successful, ${results.notFound.length} not found, ${results.notLocked.length} not locked, ${results.errors.length} errors`,
      results
    });

  } catch (error) {
    console.error('💥 Bulk unlock error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error processing bulk unlock',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// RESET ALL LOCKED USERS
export const resetAllLockedUsers = asyncHandler(async (req, res) => {
  try {
    if (req.user?.BU_ROLE_ID !== 1 && req.user?.primary_business_role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Administrator privileges required for this operation'
      });
    }

    const { reason } = req.body;

    console.log('🔄 Reset all locked users request by:', req.user.user_name);

    const result = await User.update(
      {
        failed_attempts: 0,
        lock_until: null,
        last_unlocked: new Date(),
        unlocked_by: req.user.user_name,
        unlock_reason: reason || 'Mass unlock by administrator',
        status: 'Active',
        force_lock_reason: null,
        force_locked_by: null,
        force_locked_at: null
      },
      {
        where: {
          [Op.or]: [
            { lock_until: { [Op.gt]: new Date() } },
            { failed_attempts: { [Op.gt]: 0 } },
            { status: 'ForceLocked' }
          ]
        }
      }
    );

    console.log('✅ Mass unlock completed:', result);

    res.status(200).json({
      success: true,
      message: `Successfully unlocked ${result[0]} users`,
      details: {
        modifiedCount: result[0],
        timestamp: new Date().toISOString(),
        performedBy: req.user.user_name,
        reason: reason || 'Mass unlock by administrator'
      }
    });

  } catch (error) {
    console.error('💥 Mass unlock error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error performing mass unlock',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET USER LOCK STATUS
export const getUserLockStatus = asyncHandler(async (req, res) => {
  const { identifier } = req.params;

  try {
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: { [Op.like]: identifier } },
          { username: { [Op.like]: identifier } },
          { email: { [Op.like]: identifier } },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      },
      attributes: ['id', 'user_name', 'email', 'status', 'failed_attempts', 'lock_until', 'last_login', 'last_unlocked', 'unlocked_by', 'force_lock_reason', 'force_locked_at', 'force_locked_by', 'username']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = user.get({ plain: true });
    const isLocked = userData.lock_until && userData.lock_until > Date.now();
    const lockRemaining = isLocked ? Math.ceil((userData.lock_until - Date.now()) / 60000) : 0;

    res.status(200).json({
      success: true,
      user: {
        id: userData.id,
        user_name: userData.user_name,
        email: userData.email,
        status: userData.status,
        lock_status: {
          is_locked: isLocked,
          is_force_locked: userData.status === 'ForceLocked',
          failed_attempts: userData.failed_attempts,
          lock_until: userData.lock_until,
          lock_remaining_minutes: lockRemaining,
          force_lock_reason: userData.force_lock_reason,
          force_locked_at: userData.force_locked_at,
          force_locked_by: userData.force_locked_by,
          can_login: !isLocked && userData.status === 'Active'
        },
        last_login: userData.last_login,
        last_unlocked: userData.last_unlocked,
        unlocked_by: userData.unlocked_by,
        username: userData.username || userData.user_name
      }
    });

  } catch (error) {
    console.error('💥 Get user lock status error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error fetching user lock status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}); // ✅ ADDED MISSING CLOSING BRACE AND PAREN

// CLEAR USER CACHES
export const clearUserCaches = asyncHandler(async (req, res) => {
  try {
    const { user_name } = req.params;
    const { clearAll = false } = req.body;

    let result;
    
    if (clearAll) {
      console.log('🗑️ Clearing all user caches requested by:', req.user.user_name);
      result = {
        cleared: 'all_user_caches',
        message: 'All user caches cleared (simulated)'
      };
    } else if (user_name) {
      const identifier = user_name;
      
      const user = await User.findOne({
        where: {
          [Op.or]: [
            { user_name: { [Op.like]: identifier } },
            { username: { [Op.like]: identifier } },
            { email: { [Op.like]: identifier } },
            { employer_number: identifier }
          ]
        }
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      console.log('🗑️ Clearing cache for user:', user.user_name, 'requested by:', req.user.user_name);
      
      result = {
        cleared: `cache_for_${user.user_name}`,
        user_id: user.id,
        message: `Cache cleared for user: ${user.user_name}`
      };
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either user_name or clearAll parameter is required'
      });
    }

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
      performedBy: req.user.user_name
    });

  } catch (error) {
    console.error('❌ Clear user caches error:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing user caches',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// GET USER SESSION INFO
export const getUserSessionInfo = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    const user = await User.findByPk(userId, {
      attributes: ['id', 'user_name', 'username', 'email', 'first_name', 'last_name', 'BU_ROLE_ID', 'primary_business_role', 'status', 'last_login', 'created_at', 'current_sessions', 'token', 'last_updated']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = user.get({ plain: true });

    const token = req.headers.authorization?.replace('Bearer ', '');
    let tokenInfo = {};
    
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded) {
          tokenInfo = {
            issuedAt: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : null,
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
            issuedAgo: decoded.iat ? Math.floor((Date.now() - decoded.iat * 1000) / 60000) + ' minutes ago' : null,
            expiresIn: decoded.exp ? Math.floor((decoded.exp * 1000 - Date.now()) / 60000) + ' minutes' : null
          };
        }
      } catch (error) {
        console.warn('Could not decode token for session info');
      }
    }

    const activeSessions = userData.current_sessions?.filter(session => session.is_active) || [];

    res.json({
      success: true,
      session: {
        user: {
          id: userData.id,
          user_name: userData.user_name,
          name: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
          role: userData.primary_business_role,
          roleId: userData.BU_ROLE_ID,
          status: userData.status,
          lastLogin: userData.last_login,
          accountCreated: userData.created_at,
          username: userData.username || userData.user_name
        },
        sessions: {
          activeCount: activeSessions.length,
          activeSessions: activeSessions.map(session => ({
            session_id: session.session_id,
            login_time: session.login_time,
            ip_address: session.ip_address,
            last_activity: session.last_activity
          })),
          legacyToken: userData.token ? '***' : null,
          legacyLastUpdated: userData.last_updated
        },
        token: tokenInfo,
        currentTime: new Date().toISOString(),
        sessionDuration: userData.last_login ? 
          Math.floor((Date.now() - new Date(userData.last_login).getTime()) / 60000) + ' minutes' : 
          'Unknown'
      }
    });

  } catch (error) {
    console.error('❌ Get user session info error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user session info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DEBUG USER CHECK
export const debugUserCheck = asyncHandler(async (req, res) => {
  const { user_name, username } = req.body;
  
  try {
    const loginIdentifier = username || user_name;

    if (!loginIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Login identifier (username or user_name) is required'
      });
    }

    console.log('🔍 Debug user check for:', loginIdentifier);
    
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: { [Op.like]: loginIdentifier } },
          { username: { [Op.like]: loginIdentifier } }
        ]
      }
    });
    
    console.log('📊 User search results:', {
      login_identifier: loginIdentifier,
      found: !!user,
      user: user ? {
        id: user.id,
        user_name: user.user_name,
        username: user.username,
        email: user.email,
        BU_ROLE_ID: user.BU_ROLE_ID,
        status: user.status
      } : null
    });

    res.json({
      success: true,
      login_identifier: loginIdentifier,
      found: !!user,
      userDetails: user ? {
        id: user.id,
        user_name: user.user_name || user.username,
        email: user.email,
        status: user.status,
        BU_ROLE_ID: user.BU_ROLE_ID
      } : null
    });

  } catch (error) {
    console.error('💥 Debug user check error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug check failed',
      error: error.message
    });
  }
});

// VERIFY ADMINISTRATOR PERMISSIONS
export const verifyAdministratorPermissions = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.user;
    
    const user = await User.findByPk(userId, {
      attributes: ['id', 'user_name', 'first_name', 'last_name', 'BU_ROLE_ID', 'primary_business_role']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = user.get({ plain: true });
    const isAdministrator = parseInt(userData.BU_ROLE_ID) === 1;
    const userName = userData.first_name && userData.last_name 
      ? `${userData.first_name} ${userData.last_name}` 
      : userData.user_name;

    if (!isAdministrator) {
      return res.status(200).json({
        success: true,
        isAdministrator: false,
        user: {
          id: userData.id,
          name: userName,
          roleId: userData.BU_ROLE_ID,
          user_name: userData.user_name
        },
        message: 'User is not an administrator'
      });
    }

    const allPermissions = Object.values(PERMISSIONS).flatMap(group => {
      if (typeof group === 'object') {
        return Object.values(group);
      }
      return [];
    });

    const permissionsDoc = await Permissions.findOne({ 
      where: { BU_ROLE_ID: 1 },
      attributes: ['permissions']
    });
    
    let adminPermissions = [];

    if (permissionsDoc?.permissions) {
      adminPermissions = Object.values(permissionsDoc.permissions).flat();
    } else {
      const rolePermissions = getRolePermissionsGrouped(1);
      adminPermissions = Object.values(rolePermissions).flat();
    }

    const missingPermissions = allPermissions.filter(
      permission => !adminPermissions.includes(permission)
    );

    const hasAllPermissions = missingPermissions.length === 0;

    return res.status(200).json({
      success: true,
      isAdministrator: true,
      hasAllPermissions: hasAllPermissions,
      user: {
        id: userData.id,
        name: userName,
        roleId: userData.BU_ROLE_ID,
        user_name: userData.user_name,
        primary_business_role: userData.primary_business_role
      },
      verification: {
        totalSystemPermissions: allPermissions.length,
        adminPermissionsCount: adminPermissions.length,
        missingPermissionsCount: missingPermissions.length,
        missingPermissions: hasAllPermissions ? [] : missingPermissions,
        coveragePercentage: Math.round((adminPermissions.length / allPermissions.length) * 100)
      },
      message: hasAllPermissions 
        ? 'Administrator has full system privileges' 
        : `Administrator has ${adminPermissions.length}/${allPermissions.length} permissions (${Math.round((adminPermissions.length / allPermissions.length) * 100)}% coverage)`
    });

  } catch (error) {
    console.error('Administrator verification error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error verifying administrator permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET USER TABLE INFO
export const getUserTableInfo = asyncHandler(async (req, res) => {
  try {
    const [columns] = await User.sequelize.query("SHOW COLUMNS FROM users");
    
    const sampleUsers = await User.findAll({
      limit: 5,
      attributes: [
        'id', 
        'user_name', 
        'main_business_unit', 
        'BU_ID', 
        'businessUnit', 
        'BU_ROLE_ID',
        'status'
      ]
    });
    
    res.status(200).json({
      success: true,
      table_structure: columns.map(col => ({
        field: col.Field,
        type: col.Type,
        null: col.Null,
        key: col.Key,
        default: col.Default,
        extra: col.Extra
      })),
      sample_users: sampleUsers,
      note: 'Use this to see which columns contain business unit data'
    });
    
  } catch (error) {
    console.error('Error getting table info:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET USERS BY ROLE ID
export const getUsersByRoleId = asyncHandler(async (req, res) => {
  const { roleId } = req.params;
  
  try {
    console.log(`🔍 SEARCHING FOR USERS WITH ROLE ID: ${roleId}`);
    
    const roleIdNum = parseInt(roleId);
    const roleName = ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`;
    
    console.log(`📌 Looking for users with role: ${roleName} (ID: ${roleIdNum})`);
    
    let usersFromDirect = [];
    
    try {
      usersFromDirect = await User.findAll({
        where: {
          [Op.and]: [
            {
              [Op.or]: [
                { BU_ROLE_ID: roleIdNum.toString() },
                { BU_ROLE_ID: roleIdNum },
                { primary_business_role: roleName },
                { primary_business_role: { [Op.iLike]: `%Customer Service Officer%` } },
                { primary_business_role: { [Op.iLike]: `%CUSTOMER SERVICE OFFICER%` } }
              ]
            },
            {
              status: {
                [Op.in]: ['Active', 'ACTIVE', 'active', 'Active ']
              }
            },
            {
              internal_employee_enabled: 1
            }
          ]
        },
        attributes: [
          'id', 'user_name', 'username', 'email', 
          'first_name', 'last_name', 'status', 
          'primary_business_role', 'BU_ROLE_ID',
          'main_business_unit', 'responsibility_centre'
        ],
        raw: true
      });
      
      console.log(`✅ Users found: ${usersFromDirect.length}`);
      
    } catch (directError) {
      console.error('❌ Error fetching from Users table:', directError.message);
    }
    
    let allActiveUsers = [];
    
    if (usersFromDirect.length === 0) {
      try {
        allActiveUsers = await User.findAll({
          where: {
            status: 'Active'
          },
          attributes: ['id', 'user_name', 'BU_ROLE_ID', 'primary_business_role'],
          raw: true,
          limit: 50
        });
        
        const filteredUsers = allActiveUsers.filter(user => {
          const userRoleId = parseInt(user.BU_ROLE_ID);
          const userRoleName = (user.primary_business_role || '').toLowerCase();
          const targetRoleName = roleName.toLowerCase();
          
          return userRoleId === roleIdNum || 
                 userRoleName.includes(targetRoleName) ||
                 userRoleName.includes('customer service officer');
        });
        
        if (filteredUsers.length > 0) {
          const userIds = filteredUsers.map(u => u.id);
          usersFromDirect = await User.findAll({
            where: { id: { [Op.in]: userIds } },
            attributes: ['id', 'user_name', 'username', 'email', 'first_name', 'last_name', 'status', 'primary_business_role', 'BU_ROLE_ID', 'main_business_unit', 'responsibility_centre'],
            raw: true
          });
        }
        
      } catch (simpleError) {
        console.error('Error in simple query:', simpleError.message);
      }
    }
    
    const formattedUsers = usersFromDirect.map(user => {
      return {
        userId: user.id.toString(),
        id: user.id.toString(),
        user_name: user.user_name,
        username: user.username || user.user_name,
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        status: user.status,
        primary_business_role: user.primary_business_role,
        BU_ROLE_ID: user.BU_ROLE_ID,
        businessUnit: {
          name: user.responsibility_centre || 'N/A',
          id: user.main_business_unit || ''
        },
        roles: {
          singleRole: {
            name: user.primary_business_role || roleName
          },
          multipleRoles: {
            ids: [roleIdNum],
            names: [user.primary_business_role || roleName]
          }
        },
        hasTargetRole: true,
        sysuserId: user.user_name,
        branch: user.responsibility_centre || 'N/A',
        branchId: user.main_business_unit || ''
      };
    });
    
    return res.status(200).json({
      success: true,
      count: formattedUsers.length,
      roleId: roleIdNum,
      roleName,
      message: formattedUsers.length > 0 
        ? `Found ${formattedUsers.length} user(s) with role ${roleName}`
        : `No users found with role ID ${roleId} (${roleName})`,
      users: formattedUsers,
      debug: {
        from_users_table: usersFromDirect.length,
        formatted_count: formattedUsers.length,
        raw_data_sample: usersFromDirect.length > 0 ? usersFromDirect[0] : 'No data'
      }
    });

  } catch (error) {
    console.error(`❌ ERROR GETTING USERS BY ROLE ID ${roleId}:`, error);
    return res.status(500).json({
      success: false,
      message: "Error fetching users by role ID",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      roleId
    });
  }
});

// ============================================
// EXPORT ALL FUNCTIONS
// ============================================

export default {
  registerUser,
  getClientIpController,
  updateUser,
  deactivateUser,
  getUserByEmployerNumber,
  getAllUsers,
  simpleResetPassword,
  getUserConfig,
  login,
  debugUserCheck,
  getUserPermissions,
  getUserProfile,
  validatePermission,
  validatePermissions,
  verifyAdministratorPermissions,
  unlockUser,
  unlockMultipleUsers,
  getLockedUsers,
  resetAllLockedUsers,
  getUserLockStatus,
  forceLockUser,
  forceResetPassword,
  unlockForceLockedUser,
  resetUser,
  clearUserCaches,
  getUserSessionInfo,
  enableUser,
  getUserTableInfo,
  getUsersByBU_ID,
  getUsersByRoleId,
  verify2FAToken,
  verifyHardware2FA,
  resend2FAToken,
  get2FAStatus,
  configure2FA,
  testSMSConfig,
  getSMSStatus,
  get2FAStatistics
};