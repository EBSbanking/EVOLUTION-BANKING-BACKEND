// controllers/NotificationController.js
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { Op } from 'sequelize';
import notificationService from '../services/NotificationService.js';
import logger from '../utils/logger.js';
import sequelize from '../../config/db.js';
import { emailTransporter, emailConfig } from '../utils/emailService.js';

// ============================================
// AI-POWERED: Get Supervisors by BU ONLY
// Uses intelligent matching to find the right people
// ============================================

/**
 * AI-Powered: Find the best supervisor for a given BU
 * Uses multiple strategies with intelligent fallback
 */
const findBestSupervisorForBU = async (BU_ID, options = {}) => {
  const { 
    excludeRoles = [28, 29, 30], // CSO, Teller, Head Teller
    fallbackToAdmin = true,
    includeAllSupervisors = false
  } = options;

  if (!BU_ID) {
    console.warn('⚠️ No BU_ID provided');
    return { success: false, recipients: [], strategy: 'no_bu_id' };
  }

  console.log(`🤖 AI: Finding best supervisor for BU: ${BU_ID}`);

  try {
    // ============================================
    // STRATEGY 1: Find users directly in this BU
    // ============================================
    let users = await User.findAll({
      where: {
        is_active: 'Active',
        [Op.or]: [
          { BU_ID: BU_ID },
          { main_business_unit: BU_ID },
          { responsibility_centre: BU_ID }
        ]
      },
      attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID', 'main_business_unit', 'responsibility_centre', 'role', 'is_supervisor']
    });

    console.log(`📊 Found ${users.length} users in BU ${BU_ID}`);

    if (users.length === 0) {
      console.log(`⚠️ No users found in BU ${BU_ID}`);
      
      // STRATEGY: Find users with matching main_business_unit or responsibility_centre
      const fallbackUsers = await User.findAll({
        where: {
          is_active: 'Active',
          [Op.or]: [
            { main_business_unit: BU_ID },
            { responsibility_centre: BU_ID }
          ]
        },
        attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID', 'main_business_unit', 'responsibility_centre', 'role', 'is_supervisor']
      });

      if (fallbackUsers.length > 0) {
        users = fallbackUsers;
        console.log(`📊 Found ${users.length} users via fallback search`);
      } else {
        return { success: false, recipients: [], strategy: 'no_users' };
      }
    }

    // ============================================
    // STRATEGY 2: Filter out excluded roles
    // ============================================
    let filteredUsers = users.filter(u => {
      const roleId = Number(u.BU_ROLE_ID);
      return !excludeRoles.includes(roleId);
    });

    console.log(`📊 After filtering excluded roles: ${filteredUsers.length} users`);

    if (filteredUsers.length === 0) {
      return { success: false, recipients: [], strategy: 'all_excluded' };
    }

    // ============================================
    // STRATEGY 3: Find users marked as supervisors
    // ============================================
    let supervisors = filteredUsers.filter(u => {
      return u.is_supervisor === true || 
             u.is_supervisor === 'true' || 
             u.is_supervisor === 1 ||
             u.is_supervisor === '1';
    });

    console.log(`📊 Found ${supervisors.length} users marked as supervisors`);

    // ============================================
    // STRATEGY 4: Find users with supervisor-like role names
    // ============================================
    if (supervisors.length === 0) {
      console.log(`🔍 No explicit supervisors found, checking role names...`);
      
      const supervisorPatterns = [
        'Manager', 'Supervisor', 'Head', 'Chief', 'Director', 
        'Lead', 'Officer', 'Controller', 'Executive', 'Administrator',
        'Team Lead', 'Team Leader', 'Senior'
      ];
      
      supervisors = filteredUsers.filter(u => {
        const roleName = (u.role || '').toLowerCase();
        const userName = (u.user_name || '').toLowerCase();
        
        // Check role name patterns
        const hasPattern = supervisorPatterns.some(pattern => 
          roleName.includes(pattern.toLowerCase())
        );
        
        // Check if username suggests supervisor (e.g., "manager", "supervisor")
        const userHasPattern = supervisorPatterns.some(pattern => 
          userName.includes(pattern.toLowerCase())
        );
        
        return hasPattern || userHasPattern;
      });
      
      console.log(`📊 Found ${supervisors.length} users with supervisor-like roles`);
    }

    // ============================================
    // STRATEGY 5: Find users with high role IDs (seniority)
    // ============================================
    if (supervisors.length === 0 && filteredUsers.length > 0) {
      console.log(`🔍 No supervisors found, finding most senior users...`);
      
      // Sort by BU_ROLE_ID (higher = more senior)
      supervisors = filteredUsers
        .sort((a, b) => {
          const roleA = Number(a.BU_ROLE_ID) || 0;
          const roleB = Number(b.BU_ROLE_ID) || 0;
          return roleB - roleA;
        })
        .slice(0, 3); // Take top 3 most senior
      
      console.log(`📊 Selected ${supervisors.length} most senior users`);
    }

    // ============================================
    // STRATEGY 6: If includeAll, return all filtered users
    // ============================================
    if (supervisors.length === 0 && includeAllSupervisors) {
      supervisors = filteredUsers;
      console.log(`📊 Returning all ${supervisors.length} filtered users`);
    }

    // ============================================
    // STRATEGY 7: Fallback to Admin
    // ============================================
    if (supervisors.length === 0 && fallbackToAdmin) {
      console.log(`🔍 No supervisors found, falling back to Admin users...`);
      
      const adminUsers = await User.findAll({
        where: {
          is_active: 'Active',
          [Op.or]: [
            { BU_ROLE_ID: '1' },
            { role: { [Op.like]: '%Admin%' } },
            { user_name: { [Op.in]: ['admin', 'superadmin', 'system'] } }
          ]
        },
        attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID', 'main_business_unit', 'responsibility_centre', 'role', 'is_supervisor']
      });
      
      supervisors = adminUsers;
      console.log(`📊 Falling back to ${supervisors.length} Admin users`);
    }

    // ============================================
    // FINAL: Return results
    // ============================================
    if (supervisors.length > 0) {
      console.log(`✅ AI: Found ${supervisors.length} supervisor(s) for BU ${BU_ID}:`);
      supervisors.forEach(u => {
        console.log(`  - ${u.user_name} (Role: ${u.BU_ROLE_ID || u.role || 'N/A'}, ID: ${u.id})`);
      });
      return { success: true, recipients: supervisors, strategy: 'ai_detected' };
    }

    console.log(`❌ AI: No supervisors found for BU ${BU_ID}`);
    return { success: false, recipients: [], strategy: 'none' };

  } catch (error) {
    console.error('❌ AI: Error finding supervisors:', error);
    return { success: false, recipients: [], strategy: 'error', error: error.message };
  }
};

// ============================================
// HELPER: Get BU-Specific Supervisor Recipients
// ============================================
const getBUApprovalRecipients = async (BU_ID) => {
  if (!BU_ID) {
    console.warn('⚠️ No BU_ID provided');
    return [];
  }

  try {
    console.log(`🔍 AI: Getting supervisors for BU: ${BU_ID}`);
    
    // Use AI-powered function to find supervisors
    const result = await findBestSupervisorForBU(BU_ID, {
      excludeRoles: [28, 29, 30],
      fallbackToAdmin: true,
      includeAllSupervisors: false
    });

    if (result.success && result.recipients.length > 0) {
      console.log(`✅ AI: Found ${result.recipients.length} supervisor(s) for BU ${BU_ID} (Strategy: ${result.strategy})`);
      return result.recipients;
    }

    // ============================================
    // ULTIMATE FALLBACK: Get any user in the BU
    // ============================================
    console.log(`⚠️ AI: No supervisors found, getting any user in BU ${BU_ID}`);
    
    const anyUser = await User.findOne({
      where: {
        is_active: 'Active',
        [Op.or]: [
          { BU_ID: BU_ID },
          { main_business_unit: BU_ID },
          { responsibility_centre: BU_ID }
        ]
      },
      attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID']
    });
    
    if (anyUser) {
      console.log(`✅ Found any user in BU ${BU_ID}: ${anyUser.user_name}`);
      return [anyUser];
    }
    
    // ============================================
    // FINAL FALLBACK: Get Admin
    // ============================================
    console.log(`❌ No users found in BU ${BU_ID}, falling back to Admin`);
    const admin = await User.findOne({
      where: {
        is_active: 'Active',
        BU_ROLE_ID: '1'
      }
    });
    
    return admin ? [admin] : [];

  } catch (error) {
    console.error('❌ Error getting BU recipients:', error);
    return [];
  }
};

// ============================================
// HELPER: Send Email Notification
// ============================================
const sendEmailNotifications = async (recipients, data) => {
  try {
    const { itemType, itemId, itemName, description, submittedBy, BU_ID, priority } = data;
    const appName = emailConfig.appName || process.env.APP_NAME || 'Evolution Banking';
    
    const transporter = emailTransporter;
    const fromEmail = emailConfig.from || 'noreply@evolutionbanking.com';
    
    if (!transporter) {
      console.warn('⚠️ Email transporter not configured, skipping emails');
      return { success: false, error: 'Email transporter not configured' };
    }
    
    const emailPromises = recipients
      .filter(r => r.email)
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
                    <div><span class="label">Business Unit:</span> ${BU_ID}</div>
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
Business Unit: ${BU_ID}
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
    
    console.log(`📨 AI: Sending approval notification for BU: ${BU_ID}`);
    console.log(`📨 AI: Item: ${itemType} - ${itemName} by ${submittedBy}`);
    
    // 1. Get supervisors using AI-powered BU detection
    const recipients = await getBUApprovalRecipients(BU_ID);
    
    if (recipients.length === 0) {
      console.log(`⚠️ AI: No recipients found in BU ${BU_ID}`);
      
      // Create notification for Admin as fallback
      const adminNotification = await Notification.create({
        user_id: 1,
        ROLE_ID: 'Admin',
        message: `⚠️ AI: No users found for BU ${BU_ID}. ${itemType} #${itemName} needs attention.`,
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
          note: '⚠️ AI: No users found for this BU - sent to Admin as fallback',
          error: 'NO_USERS_FOUND',
          aiDetected: false
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
          note: 'AI: No users found for this BU'
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      return { 
        success: false, 
        message: 'No users found in this business unit',
        BU_ID,
        adminNotification,
        submitterNotification,
        aiDetected: false
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
          totalApprovals: totalApprovals,
          aiDetected: true,
          aiStrategy: 'BU_ID_based'
        },
        recipient_name: recipient.user_name,
        recipient_id: recipient.id,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      });
    });
    
    const createdNotifications = await Promise.all(notificationPromises);
    console.log(`✅ AI: Created ${createdNotifications.length} in-app notifications for BU ${BU_ID}`);
    
    // 3. Send emails
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
      message: `AI: Approval notification sent to ${recipients.length} user(s) in BU ${BU_ID}`,
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
      emails: emailResult,
      aiDetected: true
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

    const recipient = await User.findByPk(recipientId, {
      attributes: ['id', 'user_name', 'email', 'BU_ROLE_ID', 'BU_ID']
    });

    if (!recipient) {
      console.warn(`⚠️ Recipient user ${recipientId} not found`);
      return { success: false, error: 'Recipient not found' };
    }

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