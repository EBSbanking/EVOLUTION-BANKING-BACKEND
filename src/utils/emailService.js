// Services/emailService.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ============================================
// EMAIL CONFIGURATION
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
  appName: process.env.SMTP_NAME || process.env.APP_NAME || 'Evolution Banking',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};

// Create email transporter
let emailTransporter = null;

const initEmailTransporter = () => {
  try {
    if (emailConfig.auth.user && emailConfig.auth.pass) {
      emailTransporter = nodemailer.createTransport({
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
      emailTransporter.verify((error, success) => {
        if (error) {
          console.error('❌ SMTP Transporter verification failed:', error.message);
          logger.error('SMTP Transporter verification failed:', error.message);
        } else {
          console.log('✅ SMTP Transporter verified successfully');
          logger.info('SMTP Transporter verified successfully');
        }
      });

      logger.info('✅ Email transporter initialized for notification service');
    } else {
      logger.warn('⚠️ SMTP not configured, email notifications disabled');
      console.warn('⚠️ SMTP not configured, email notifications disabled');
    }
  } catch (error) {
    logger.error('❌ Failed to initialize email transporter:', error);
    console.error('❌ Failed to initialize email transporter:', error);
  }
};

initEmailTransporter();

// ============================================
// EXPORT CONFIG AND TRANSPORTER
// ============================================
export { emailTransporter, emailConfig };

// ============================================
// SEND EMAIL FUNCTION
// ============================================
export const sendEmail = async (to, subject, html, text = null) => {
  try {
    if (!emailTransporter) {
      console.warn('⚠️ Email transporter not initialized, skipping email send');
      return { success: false, error: 'Email transporter not initialized' };
    }

    if (!to) {
      console.warn('⚠️ No recipient email provided');
      return { success: false, error: 'No recipient email provided' };
    }

    const mailOptions = {
      from: `"${emailConfig.appName} Notifications" <${emailConfig.from}>`,
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, ''),
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    logger.error(`Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

// ============================================
// SEND APPROVAL NOTIFICATION EMAIL
// ============================================
export const sendApprovalEmail = async (recipient, data) => {
  const {
    itemType,
    itemId,
    itemName,
    description,
    submittedBy,
    BU_ID,
    priority = 'medium',
    requestId,
    approvalLevel = 1,
    totalApprovals = 3
  } = data;

  const subject = `🔔 ${emailConfig.appName} - ${itemType} Approval Request #${itemId}`;
  const approvalUrl = `${emailConfig.frontendUrl}/cards/approvals/${requestId || itemId}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Approval Request</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #667eea; padding-bottom: 20px; }
          .header h1 { color: #667eea; font-size: 24px; margin: 0; }
          .greeting { font-size: 16px; color: #333; margin: 20px 0; }
          .card { background: #f8f9fa; border-radius: 8px; padding: 15px; margin: 15px 0; border-left: 4px solid #667eea; }
          .label { font-size: 12px; color: #888; text-transform: uppercase; }
          .value { font-size: 16px; color: #333; font-weight: 500; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; }
          .button:hover { background: #5a6fd6; }
          .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
          .priority-high { color: #dc2626; font-weight: bold; }
          .priority-medium { color: #d97706; font-weight: bold; }
          .priority-low { color: #2563eb; font-weight: bold; }
          .approval-progress { background: #f0f0f0; border-radius: 10px; padding: 10px; margin: 10px 0; }
          .approval-step { display: inline-block; padding: 5px 15px; margin: 0 5px; border-radius: 15px; font-size: 12px; }
          .approval-step.active { background: #667eea; color: #fff; }
          .approval-step.completed { background: #34d399; color: #fff; }
          .approval-step.pending { background: #f3f4f6; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 ${emailConfig.appName}</h1>
            <p style="color: #666;">Approval Request Notification</p>
          </div>

          <div class="greeting">
            Hello <strong>${recipient.user_name || recipient.name || 'Approver'}</strong>,
          </div>

          <p>A new <strong>${itemType}</strong> request has been submitted and requires your attention.</p>

          <div class="card">
            <div style="display: flex; justify-content: space-between;">
              <div>
                <div class="label">Request Type</div>
                <div class="value">${itemType}</div>
              </div>
              <span class="priority-${priority}">${priority.toUpperCase()}</span>
            </div>
            <div style="margin-top: 10px;">
              <div class="label">Reference ID</div>
              <div class="value">#${itemId}</div>
            </div>
          </div>

          <div style="margin: 15px 0;">
            <div><span class="label">Item Name:</span> <strong>${itemName}</strong></div>
            <div><span class="label">Submitted By:</span> ${submittedBy}</div>
            <div><span class="label">Branch:</span> ${BU_ID}</div>
            <div><span class="label">Submitted At:</span> ${new Date().toLocaleString()}</div>
            ${description ? `<div><span class="label">Description:</span> ${description}</div>` : ''}
          </div>

          <div class="approval-progress">
            <div style="text-align: center; margin-bottom: 10px;">
              <span class="label">Approval Progress</span>
            </div>
            <div style="text-align: center;">
              ${Array.from({ length: totalApprovals }, (_, i) => `
                <span class="approval-step ${i < approvalLevel ? 'completed' : i === approvalLevel ? 'active' : 'pending'}">
                  ${i + 1}
                </span>
              `).join(' → ')}
            </div>
            <div style="text-align: center; margin-top: 5px; font-size: 12px; color: #6b7280;">
              ${approvalLevel > 0 ? `Approved by ${approvalLevel} of ${totalApprovals}` : `Awaiting first approval`}
            </div>
          </div>

          <div style="text-align: center; margin: 25px 0;">
            <a href="${approvalUrl}" class="button">📋 Review & Approve</a>
          </div>

          <div style="text-align: center; margin: 15px 0; font-size: 14px; color: #6b7280;">
            <p>Or copy this link to your browser:</p>
            <p style="font-size: 12px; word-break: break-all; color: #667eea;">${approvalUrl}</p>
          </div>

          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${emailConfig.appName}. All rights reserved.</p>
            <p style="font-size: 11px; color: #bbb;">This is an automated notification, please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return await sendEmail(recipient.email, subject, html);
};

// ============================================
// SEND APPROVAL STATUS UPDATE EMAIL
// ============================================
export const sendApprovalStatusEmail = async (recipient, data) => {
  const {
    itemType,
    itemId,
    itemName,
    status,
    reason,
    approvedBy,
    submittedBy,
    BU_ID,
    requestId
  } = data;

  const isApproved = status === 'APPROVED';
  const statusEmoji = isApproved ? '✅' : '❌';
  const statusText = isApproved ? 'Approved' : 'Rejected';
  const statusColor = isApproved ? '#34d399' : '#f87171';

  const subject = `${statusEmoji} ${emailConfig.appName} - ${itemType} Request ${statusText} #${itemId}`;
  const approvalUrl = `${emailConfig.frontendUrl}/cards/approvals/${requestId || itemId}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Approval Status Update</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid ${statusColor}; padding-bottom: 20px; }
          .header h1 { color: ${statusColor}; font-size: 24px; margin: 0; }
          .greeting { font-size: 16px; color: #333; margin: 20px 0; }
          .status-badge { display: inline-block; padding: 8px 20px; border-radius: 20px; color: #fff; font-weight: bold; background: ${statusColor}; }
          .card { background: #f8f9fa; border-radius: 8px; padding: 15px; margin: 15px 0; border-left: 4px solid ${statusColor}; }
          .label { font-size: 12px; color: #888; text-transform: uppercase; }
          .value { font-size: 16px; color: #333; font-weight: 500; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; }
          .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${statusEmoji} ${statusText}</h1>
            <p style="color: #666;">${itemType} Request Status Update</p>
          </div>

          <div class="greeting">
            Hello <strong>${recipient.user_name || recipient.name || 'User'}</strong>,
          </div>

          <p>Your <strong>${itemType}</strong> request has been <strong>${statusText.toLowerCase()}</strong>.</p>

          <div style="text-align: center; margin: 20px 0;">
            <span class="status-badge">${statusText}</span>
          </div>

          <div class="card">
            <div>
              <div class="label">Reference ID</div>
              <div class="value">#${itemId}</div>
            </div>
            <div style="margin-top: 10px;">
              <div class="label">Item Name</div>
              <div class="value">${itemName}</div>
            </div>
            ${approvedBy ? `<div><span class="label">Reviewed By:</span> ${approvedBy}</div>` : ''}
            ${reason ? `<div><span class="label">Reason:</span> ${reason}</div>` : ''}
          </div>

          <div style="text-align: center; margin: 25px 0;">
            <a href="${approvalUrl}" class="button">📋 View Details</a>
          </div>

          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${emailConfig.appName}. All rights reserved.</p>
            <p style="font-size: 11px; color: #bbb;">This is an automated notification, please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return await sendEmail(recipient.email, subject, html);
};

// ============================================
// SEND BULK APPROVAL NOTIFICATIONS
// ============================================
export const sendBulkApprovalEmails = async (recipients, data) => {
  const results = {
    sent: [],
    failed: []
  };

  for (const recipient of recipients) {
    if (recipient.email) {
      const result = await sendApprovalEmail(recipient, data);
      if (result.success) {
        results.sent.push(recipient.email);
      } else {
        results.failed.push({ email: recipient.email, error: result.error });
      }
    }
  }

  return results;
};

// ============================================
// TEST EMAIL CONFIGURATION
// ============================================
export const testEmailConfig = async (testEmail) => {
  try {
    const result = await sendEmail(
      testEmail || emailConfig.auth.user,
      '🔧 Email Configuration Test',
      `
        <h1>${emailConfig.appName} - Email Test</h1>
        <p>If you're reading this, your email configuration is working correctly!</p>
        <p><strong>Configuration:</strong></p>
        <ul>
          <li>Host: ${emailConfig.host}</li>
          <li>Port: ${emailConfig.port}</li>
          <li>Secure: ${emailConfig.secure}</li>
          <li>From: ${emailConfig.from}</li>
          <li>App: ${emailConfig.appName}</li>
        </ul>
        <p>Sent at: ${new Date().toLocaleString()}</p>
      `
    );
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ============================================
// EXPORT ALL FUNCTIONS
// ============================================
export default {
  emailTransporter,
  emailConfig,
  sendEmail,
  sendApprovalEmail,
  sendApprovalStatusEmail,
  sendBulkApprovalEmails,
  testEmailConfig
};