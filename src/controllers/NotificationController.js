// controllers/NotificationController.js
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { Op } from 'sequelize';
import notificationService from '../services/NotificationService.js';
import logger from '../utils/logger.js';
import sequelize from '../../config/db.js';
import { emailTransporter, emailConfig } from '../utils/emailService.js';

// ============================================
// SUPERVISOR ROLE DEFINITIONS
// ============================================
const SUPERVISOR_ROLES = [
  2,  // Head Banking Services
  6,  // Internal Control Manager
  7,  // Head of Credit
  8,  // Internal Audit Manager
  13, // Financial Accountant Manager
  14, // Chief Financial Officer
  15, // Chief Executive Officer
  17, // Loan Processing Supervisor
  19, // Branch Manager
  20, // Branch Operation Supervisor
  21, // Chief Operation Officer
  31, // Customer Relationship Supervisor
  32  // Recovery Team Lead
];

const EXCLUDED_ROLES = [28, 29, 30]; // Customer Service Officer (CSO), Teller, Head Teller

// ============================================
// HELPER: Get BU-Specific Supervisor Recipients
// ============================================
const getBUApprovalRecipients = async (BU_ID) => {
  if (!BU_ID) {
    console.warn('⚠️ No BU_ID provided for notification recipients');
    return [];
  }

  try {
    console.log(`🔍 Looking for users for BU: ${BU_ID}`);
    
    // STRATEGY 1: Find supervisors with BU_ID = BU_ID
    let users = await User.findAll({
      where: {
        BU_ROLE_ID: { [Op.in]: SUPERVISOR_ROLES },
        BU_ID: BU_ID,
        is_active: 'Active'
      },
      attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID', 'main_business_unit', 'responsibility_centre']
    });
    
    if (users.length > 0) {
      console.log(`✅ Found ${users.length} supervisor(s) with BU_ID = ${BU_ID}`);
      users.forEach(u => {
        console.log(`  - ${u.user_name} (BU_ROLE_ID: ${u.BU_ROLE_ID}) - BU: ${u.BU_ID}`);
      });
      return users;
    }
    
    // STRATEGY 2: Find supervisors with main_business_unit = BU_ID
    console.log(`⚠️ No users found with BU_ID = ${BU_ID}, checking main_business_unit...`);
    
    users = await User.findAll({
      where: {
        BU_ROLE_ID: { [Op.in]: SUPERVISOR_ROLES },
        main_business_unit: BU_ID,
        is_active: 'Active'
      },
      attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID', 'main_business_unit', 'responsibility_centre']
    });
    
    if (users.length > 0) {
      console.log(`✅ Found ${users.length} supervisor(s) with main_business_unit = ${BU_ID}`);
      users.forEach(u => {
        console.log(`  - ${u.user_name} (BU_ROLE_ID: ${u.BU_ROLE_ID}) - main_business_unit: ${u.main_business_unit}`);
      });
      return users;
    }
    
    // STRATEGY 3: Find supervisors with responsibility_centre = BU_ID
    console.log(`⚠️ No users found, checking responsibility_centre...`);
    
    users = await User.findAll({
      where: {
        BU_ROLE_ID: { [Op.in]: SUPERVISOR_ROLES },
        responsibility_centre: BU_ID,
        is_active: 'Active'
      },
      attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID', 'main_business_unit', 'responsibility_centre']
    });
    
    if (users.length > 0) {
      console.log(`✅ Found ${users.length} supervisor(s) with responsibility_centre = ${BU_ID}`);
      users.forEach(u => {
        console.log(`  - ${u.user_name} (BU_ROLE_ID: ${u.BU_ROLE_ID}) - responsibility_centre: ${u.responsibility_centre}`);
      });
      return users;
    }
    
    // STRATEGY 4: Find ANY user with main_business_unit = BU_ID
    console.log(`⚠️ No supervisors found, looking for any user with main_business_unit = ${BU_ID}...`);
    
    const [anyUsers] = await sequelize.query(
      `SELECT id, user_name, email, BU_ROLE_ID, BU_ID, primary_business_role, is_supervisor, main_business_unit, responsibility_centre
       FROM users 
       WHERE is_active = 'Active'
       AND main_business_unit = :BU_ID
       LIMIT 10`,
      {
        replacements: { BU_ID: BU_ID },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (anyUsers && anyUsers.length > 0) {
      console.log(`✅ Found ${anyUsers.length} user(s) with main_business_unit = ${BU_ID}`);
      anyUsers.forEach(u => {
        console.log(`  - ${u.user_name} (${u.BU_ROLE_ID || u.primary_business_role || 'N/A'}) - main_business_unit: ${u.main_business_unit}`);
      });
      return anyUsers;
    }
    
    // STRATEGY 5: Check for PCO03 specifically
    console.log(`🔍 Checking for PCO03 specifically...`);
    const [pco03] = await sequelize.query(
      `SELECT id, user_name, email, BU_ROLE_ID, BU_ID, primary_business_role, is_supervisor, main_business_unit, responsibility_centre
       FROM users 
       WHERE user_name = 'PCO03' AND is_active = 'Active'`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (pco03) {
      console.log(`✅ Found PCO03:`, pco03);
      console.log(`📋 PCO03 BU_ID: ${pco03.BU_ID}, Role: ${pco03.BU_ROLE_ID}, main_business_unit: ${pco03.main_business_unit}`);
      return [pco03];
    }
    
    // STRATEGY 6: Ultimate fallback - Admin users
    console.log(`⚠️ No users found, looking for Admin users...`);
    
    const [admins] = await sequelize.query(
      `SELECT id, user_name, email, BU_ROLE_ID, BU_ID, primary_business_role
       FROM users 
       WHERE is_active = 'Active'
       AND (BU_ROLE_ID = '1' OR primary_business_role = 'Admin' OR user_name = 'admin')
       LIMIT 3`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (admins && admins.length > 0) {
      console.log(`✅ Found ${admins.length} Admin users as ultimate fallback`);
      return admins;
    }
    
    console.log(`❌ No users found at all for BU: ${BU_ID}`);
    return [];

  } catch (error) {
    console.error('❌ Error getting BU recipients:', error);
    console.error('❌ Error details:', error.stack);
    return [];
  }
};

// ============================================
// HELPER: Send Email Notification (UPDATED)
// Uses the shared email transporter from emailService
// ============================================
const sendEmailNotifications = async (recipients, data) => {
  try {
    const { itemType, itemId, itemName, description, submittedBy, BU_ID, priority } = data;
    const appName = emailConfig.appName || process.env.APP_NAME || 'Evolution Banking';
    
    // Use the shared email transporter from emailService
    const transporter = emailTransporter;
    const fromEmail = emailConfig.from || 'noreply@evolutionbanking.com';
    
    if (!transporter) {
      console.warn('⚠️ Email transporter not configured, skipping emails');
      return { success: false, error: 'Email transporter not configured' };
    }
    
    const emailPromises = recipients
      .filter(r => r.email) // Only send to users with email
      .map(async (recipient) => {
        try {
          const subject = `🔔 ${appName} - New ${itemType} Approval Request`;
          const approvalUrl = `${emailConfig.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000'}/approvals/${itemType}/${itemId}`;
          
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
                    <h1>🔐 ${appName}</h1>
                    <p style="color: #666;">Approval Request Notification</p>
                  </div>
                  
                  <div class="greeting">
                    Hello <strong>${recipient.user_name}</strong>,
                  </div>
                  
                  <p>A new <strong>${itemType}</strong> has been submitted and requires your approval.</p>
                  
                  <div class="card">
                    <div style="display: flex; justify-content: space-between;">
                      <div>
                        <div class="label">Item Type</div>
                        <div class="value">${itemType}</div>
                      </div>
                      <span class="priority-${priority || 'medium'}">${priority || 'Medium'}</span>
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
                  
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${approvalUrl}" class="button">📋 Review & Approve</a>
                  </div>
                  
                  <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
                    <p style="font-size: 11px; color: #bbb;">This is an automated notification, please do not reply.</p>
                  </div>
                </div>
              </body>
            </html>
          `;
          
          const text = `
${appName} - Approval Request

Hello ${recipient.user_name},

A new ${itemType} has been submitted and requires your approval.

Item Type: ${itemType}
Reference ID: #${itemId}
Item Name: ${itemName}
Submitted By: ${submittedBy}
Branch: ${BU_ID}
Submitted At: ${new Date().toLocaleString()}
Priority: ${priority || 'Medium'}
${description ? `Description: ${description}` : ''}

Please review and approve this request at:
${approvalUrl}

---
${appName} - Secure Banking
This is an automated notification, please do not reply.
          `;
          
          const mailOptions = {
            from: `"${appName} Notifications" <${fromEmail}>`,
            to: recipient.email,
            subject: subject,
            html: html,
            text: text
          };
          
          const info = await transporter.sendMail(mailOptions);
          console.log(`✅ Email sent to ${recipient.email}: ${info.messageId}`);
          return { success: true, email: recipient.email, messageId: info.messageId };
          
        } catch (error) {
          console.error(`❌ Failed to send email to ${recipient.email}:`, error.message);
          return { success: false, email: recipient.email, error: error.message };
        }
      });
    
    const results = await Promise.all(emailPromises);
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`📧 Email results: ${successful} sent, ${failed} failed`);
    return { success: true, sent: successful, failed, results };
    
  } catch (error) {
    console.error('❌ Error sending emails:', error);
    return { success: false, error: error.message };
  }
};

// ============================================
// HELPER: Send Approval Notification to BU Users
// ============================================
export const sendApprovalNotificationToBUUsers = async (data) => {
  try {
    const { 
      BU_ID, 
      itemType, 
      itemId, 
      itemName, 
      description, 
      submittedBy,
      priority = 'high',
      metadata = {},
      requestId,
      approvalLevel = 0,
      totalApprovals = 3
    } = data;
    
    if (!BU_ID) {
      console.error('❌ BU_ID is required for approval notification');
      return { success: false, error: 'BU_ID is required' };
    }
    
    // 1. Get all users in this specific BU
    const recipients = await getBUApprovalRecipients(BU_ID);
    
    if (recipients.length === 0) {
      console.log(`⚠️ No recipients found in BU ${BU_ID}`);
      
      // Create a notification for Admin as fallback
      const adminNotification = await Notification.create({
        user_id: 1,
        ROLE_ID: 'Admin',
        message: `⚠️ No users found for BU ${BU_ID}. ${itemType} #${itemName} needs attention. Please assign users to this BU.`,
        WORK_ITEM_ID: String(itemId || 'N/A'),
        EVENT_ID: `system_${Date.now()}`,
        status: 'sent',
        notification_type: 'system',
        priority: 'high',
        recipient_id: 1,
        recipient_name: 'Admin',
        metadata: {
          itemType,
          itemId,
          itemName,
          description,
          submittedBy,
          BU_ID,
          submittedAt: new Date().toISOString(),
          ...metadata,
          note: '⚠️ No users found for this BU - sent to Admin as fallback',
          error: 'NO_USERS_FOUND'
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      // Also notify the submitter
      const submitterNotification = await Notification.create({
        user_id: 1,
        ROLE_ID: 'User',
        message: `⚠️ Your ${itemType} (${itemName}) was submitted but no users are assigned to BU ${BU_ID}. Please contact your administrator.`,
        WORK_ITEM_ID: String(itemId || 'N/A'),
        EVENT_ID: `system_${Date.now()}`,
        status: 'sent',
        notification_type: 'system',
        priority: 'medium',
        recipient_id: parseInt(submittedBy) || 2,
        recipient_name: submittedBy || 'User',
        metadata: {
          itemType,
          itemId,
          itemName,
          BU_ID,
          note: 'No users found for this BU'
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      return { 
        success: false, 
        message: 'No users found in this business unit',
        BU_ID,
        adminNotification,
        submitterNotification
      };
    }
    
    // 2. Create in-app notifications for each recipient
    const notificationPromises = recipients.map(recipient => {
      const roleName = recipient.BU_ROLE_ID || recipient.role || 'User';
      
      return Notification.create({
        user_id: recipient.id,
        ROLE_ID: String(roleName),
        message: `🔔 ${submittedBy} created a new ${itemType}: ${itemName}`,
        WORK_ITEM_ID: String(itemId || 'N/A'),
        EVENT_ID: metadata.event_id || `notification_${Date.now()}`,
        notification_type: 'approval',
        priority: priority || 'medium',
        metadata: {
          ...metadata,
          BU_ID: BU_ID,
          itemType: itemType,
          itemId: itemId,
          itemName: itemName,
          submittedBy: submittedBy,
          recipient_name: recipient.user_name,
          recipient_role: recipient.BU_ROLE_ID,
          recipient_email: recipient.email,
          recipient_bu: recipient.BU_ID || recipient.main_business_unit || recipient.responsibility_centre,
          requestId: requestId || itemId,
          approvalLevel: approvalLevel,
          totalApprovals: totalApprovals
        },
        recipient_name: recipient.user_name,
        recipient_id: recipient.id,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      });
    });
    
    const createdNotifications = await Promise.all(notificationPromises);
    console.log(`✅ Created ${createdNotifications.length} in-app notifications for users in BU ${BU_ID}`);
    
    // 3. SEND EMAILS to recipients with email addresses
    const emailResult = await sendEmailNotifications(recipients, {
      itemType,
      itemId,
      itemName,
      description,
      submittedBy,
      BU_ID,
      priority,
      requestId: requestId || itemId,
      approvalLevel,
      totalApprovals
    });
    
    if (emailResult.success) {
      console.log(`📧 Sent ${emailResult.sent} email notifications for BU ${BU_ID}`);
      if (emailResult.failed > 0) {
        console.warn(`⚠️ ${emailResult.failed} email(s) failed to send`);
      }
    } else {
      console.warn(`⚠️ Email notifications failed: ${emailResult.error}`);
    }
    
    return {
      success: true,
      message: `Approval notification sent to ${recipients.length} user(s) in BU ${BU_ID}`,
      recipients: recipients.map(r => ({ 
        name: r.user_name, 
        email: r.email || 'No email',
        role: r.BU_ROLE_ID
      })),
      notificationCount: createdNotifications.length,
      emailCount: emailResult.success ? emailResult.sent : 0,
      emailFailed: emailResult.success ? emailResult.failed : recipients.length,
      BU_ID: BU_ID,
      notifications: createdNotifications,
      emails: emailResult
    };
    
  } catch (error) {
    console.error('❌ Error sending approval notification to BU users:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

// ============================================
// HELPER: Send Status Update Notification
// ============================================
export const sendStatusUpdateNotification = async (data) => {
  try {
    const {
      recipientId,
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

    // Get the recipient user
    const recipient = await User.findByPk(recipientId, {
      attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID']
    });

    if (!recipient) {
      console.warn(`⚠️ Recipient user ${recipientId} not found`);
      return { success: false, error: 'Recipient not found' };
    }

    // Create in-app notification
    const notification = await Notification.create({
      user_id: recipient.id,
      ROLE_ID: String(recipient.BU_ROLE_ID || 'User'),
      message: `${status === 'APPROVED' ? '✅' : '❌'} Your ${itemType} request (${itemName}) has been ${status.toLowerCase()}`,
      WORK_ITEM_ID: String(itemId || 'N/A'),
      EVENT_ID: `status_${Date.now()}`,
      status: 'sent',
      notification_type: 'approval_status',
      priority: 'high',
      recipient_id: recipient.id,
      recipient_name: recipient.user_name,
      metadata: {
        itemType,
        itemId,
        itemName,
        status,
        reason,
        approvedBy,
        submittedBy,
        BU_ID,
        requestId,
        updatedAt: new Date().toISOString()
      }
    });

    // Send email if recipient has email
    let emailResult = null;
    if (recipient.email) {
      try {
        const appName = emailConfig.appName || process.env.APP_NAME || 'Evolution Banking';
        const statusEmoji = status === 'APPROVED' ? '✅' : '❌';
        const statusText = status === 'APPROVED' ? 'Approved' : 'Rejected';
        const statusColor = status === 'APPROVED' ? '#34d399' : '#f87171';
        const approvalUrl = `${emailConfig.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000'}/approvals/${itemType}/${requestId || itemId}`;

        const subject = `${statusEmoji} ${appName} - ${itemType} Request ${statusText} #${itemId}`;
        
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
                .button:hover { background: #5a6fd6; }
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
                  Hello <strong>${recipient.user_name}</strong>,
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
                  <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
                  <p style="font-size: 11px; color: #bbb;">This is an automated notification, please do not reply.</p>
                </div>
              </div>
            </body>
          </html>
        `;

        const mailOptions = {
          from: `"${appName} Notifications" <${emailConfig.from || 'noreply@evolutionbanking.com'}>`,
          to: recipient.email,
          subject: subject,
          html: html
        };

        const info = await emailTransporter.sendMail(mailOptions);
        emailResult = { success: true, messageId: info.messageId };
        console.log(`✅ Status email sent to ${recipient.email}: ${info.messageId}`);
        
      } catch (error) {
        console.error(`❌ Failed to send status email to ${recipient.email}:`, error.message);
        emailResult = { success: false, error: error.message };
      }
    }

    return {
      success: true,
      notification,
      emailSent: emailResult?.success || false,
      emailError: emailResult?.error || null
    };

  } catch (error) {
    console.error('❌ Error sending status update notification:', error);
    return { success: false, error: error.message };
  }
};

// ============================================
// GET USER NOTIFICATIONS
// ============================================
export const getUserNotifications = async (req, res) => {
  try {
    const { userId, roleId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const parsedUserId = parseInt(userId);
    if (isNaN(parsedUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid User ID format'
      });
    }

    const where = {};
    const orConditions = [{ user_id: parsedUserId }];
    
    if (roleId && roleId !== 'undefined' && roleId !== 'null' && roleId.trim() !== '') {
      orConditions.push({ ROLE_ID: roleId });
    }

    where[Op.or] = orConditions;

    console.log(`📋 Fetching notifications for user: ${userId}, role: ${roleId}`);

    const notifications = await Notification.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 50
    });

    const unreadCount = await Notification.count({
      where: {
        ...where,
        status: { [Op.in]: ['pending', 'sent'] }
      }
    });

    console.log(`📨 Found ${notifications.length} notifications, ${unreadCount} unread`);

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
      total: notifications.length
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
};

// ============================================
// MARK NOTIFICATION AS READ
// ============================================
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID is required'
      });
    }

    const notification = await Notification.findByPk(notificationId);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.status = 'viewed';
    notification.viewed_at = new Date();
    notification.updated_at = new Date();
    await notification.save();

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notification
    });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
};

// ============================================
// MARK ALL NOTIFICATIONS AS READ
// ============================================
export const markAllAsRead = async (req, res) => {
  try {
    const { userId, roleId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const parsedUserId = parseInt(userId);
    if (isNaN(parsedUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid User ID format'
      });
    }

    const orConditions = [{ user_id: parsedUserId }];
    
    if (roleId && roleId !== 'undefined' && roleId !== 'null' && roleId.trim() !== '') {
      orConditions.push({ ROLE_ID: roleId });
    }

    const where = {
      [Op.or]: orConditions,
      status: { [Op.in]: ['pending', 'sent'] }
    };

    const [updatedCount] = await Notification.update(
      { 
        status: 'viewed',
        viewed_at: new Date(),
        updated_at: new Date()
      },
      { where }
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      updated: updatedCount
    });

  } catch (error) {
    console.error('Error marking all as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark all as read',
      error: error.message
    });
  }
};

// ============================================
// CREATE NOTIFICATION
// ============================================
export const createNotification = async (req, res) => {
  try {
    const {
      user_id,
      role_id,
      message,
      work_item_id,
      event_id,
      notification_type,
      priority,
      metadata,
      recipient_id,
      recipient_name,
      expires_at
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const notification = await Notification.create({
      user_id: user_id || null,
      ROLE_ID: role_id,
      message,
      WORK_ITEM_ID: work_item_id,
      EVENT_ID: event_id,
      notification_type: notification_type || 'system',
      priority: priority || 'medium',
      metadata: metadata || {},
      recipient_id,
      recipient_name,
      expires_at,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    });

    return res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      notification
    });

  } catch (error) {
    console.error('Error creating notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: error.message
    });
  }
};

// ============================================
// DELETE NOTIFICATION
// ============================================
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID is required'
      });
    }

    const notification = await Notification.findByPk(notificationId);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.destroy();

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
};

// ============================================
// SEND APPROVAL NOTIFICATION (Controller)
// ============================================
export const sendApprovalNotification = async (req, res) => {
  try {
    const {
      itemType,
      itemId,
      itemName,
      description,
      submittedBy,
      BU_ID,
      metadata = {},
      priority = 'medium',
      requestId,
      approvalLevel = 0,
      totalApprovals = 3
    } = req.body;

    if (!itemType || !itemId || !itemName || !submittedBy || !BU_ID) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: itemType, itemId, itemName, submittedBy, BU_ID',
      });
    }

    const result = await sendApprovalNotificationToBUUsers({
      itemType,
      itemId,
      itemName,
      description,
      submittedBy,
      BU_ID,
      metadata,
      priority,
      requestId,
      approvalLevel,
      totalApprovals
    });

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(404).json(result);
    }

  } catch (error) {
    logger.error('❌ Error in sendApprovalNotification controller:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================
// SEND STATUS UPDATE NOTIFICATION (Controller)
// ============================================
export const sendStatusUpdate = async (req, res) => {
  try {
    const {
      recipientId,
      itemType,
      itemId,
      itemName,
      status,
      reason,
      approvedBy,
      submittedBy,
      BU_ID,
      requestId
    } = req.body;

    if (!recipientId || !itemType || !itemId || !itemName || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: recipientId, itemType, itemId, itemName, status'
      });
    }

    const result = await sendStatusUpdateNotification({
      recipientId,
      itemType,
      itemId,
      itemName,
      status,
      reason,
      approvedBy,
      submittedBy,
      BU_ID,
      requestId
    });

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(404).json(result);
    }

  } catch (error) {
    logger.error('❌ Error in sendStatusUpdate controller:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================
// GET BRANCH PENDING APPROVALS
// ============================================
export const getBranchPendingApprovals = async (req, res) => {
  try {
    const { BU_ID } = req.params;

    if (!BU_ID) {
      return res.status(400).json({
        success: false,
        error: 'Missing BU_ID',
      });
    }

    const where = {
      'metadata.BU_ID': BU_ID,
      status: { [Op.in]: ['pending', 'sent'] }
    };

    const pendingCount = await Notification.count({ where });

    const pendingNotifications = await Notification.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 20,
      attributes: ['id', 'message', 'notification_type', 'priority', 'created_at', 'metadata']
    });

    const supervisors = await getBUApprovalRecipients(BU_ID);

    return res.status(200).json({
      success: true,
      data: {
        BU_ID,
        pendingCount,
        supervisorCount: supervisors.length,
        supervisors: supervisors.map(s => ({
          id: s.id,
          name: s.user_name,
          email: s.email || 'No email',
          role_id: s.BU_ROLE_ID
        })),
        pendingNotifications
      }
    });

  } catch (error) {
    logger.error('❌ Error getting branch pending approvals:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================
// GET USER NOTIFICATIONS WITH SERVICE
// ============================================
export const getUserNotificationsService = async (req, res) => {
  try {
    const { userId, roleId } = req.params;

    if (!userId || !roleId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or roleId',
      });
    }

    let result = await notificationService.getUserPendingNotifications(
      parseInt(userId),
      roleId
    );

    if (!result.success || result.notifications.length === 0) {
      const where = { user_id: parseInt(userId) };
      if (roleId) {
        where.ROLE_ID = roleId;
      }

      const notifications = await Notification.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: 50
      });

      const unreadCount = await Notification.count({
        where: {
          ...where,
          status: { [Op.in]: ['pending', 'sent'] }
        }
      });

      return res.status(200).json({
        success: true,
        notifications,
        unreadCount,
        total: notifications.length,
        source: 'fallback'
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    logger.error('❌ Error getting user notifications:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================
// GET NOTIFICATION STATS
// ============================================
export const getNotificationStats = async (req, res) => {
  try {
    const { BU_ID } = req.params;

    if (!BU_ID) {
      return res.status(400).json({
        success: false,
        error: 'BU_ID is required'
      });
    }

    const statusCounts = await Notification.findAll({
      where: {
        'metadata.BU_ID': BU_ID
      },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status']
    });

    const priorityCounts = await Notification.findAll({
      where: {
        'metadata.BU_ID': BU_ID
      },
      attributes: [
        'priority',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['priority']
    });

    const totalCount = await Notification.count({
      where: {
        'metadata.BU_ID': BU_ID
      }
    });

    const supervisors = await getBUApprovalRecipients(BU_ID);

    return res.status(200).json({
      success: true,
      data: {
        BU_ID,
        total: totalCount,
        byStatus: statusCounts,
        byPriority: priorityCounts,
        supervisorCount: supervisors.length,
        supervisors: supervisors.map(s => s.user_name)
      }
    });

  } catch (error) {
    logger.error('❌ Error getting notification stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================
// EXPORT ALL CONTROLLERS
// ============================================
export default {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification,
  sendApprovalNotification,
  sendStatusUpdate,
  getBranchPendingApprovals,
  getUserNotificationsService,
  getNotificationStats,
  getBUApprovalRecipients,
  sendApprovalNotificationToBUUsers,
  sendStatusUpdateNotification
};