// services/notificationService.js
import Notification from '../models/NotificationModel.js';
import logger from '../utils/logger.js';

class NotificationService {
  /**
   * Sends a notification through the core banking workflow system.
   * @param {Object} options
   * @param {String} options.ROLE_ID - The target role for the notification.
   * @param {String} options.message - The content of the notification.
   * @param {Number} options.WORK_ITEM_ID - The workflow item ID associated with the notification.
   * @param {String} [options.status] - Optional status (default: 'Pending')
   * @param {String} [options.notificationType] - Optional type (default: 'system')
   * @param {Number} [options.EVENT_ID] - Optional event ID
   * @param {Object} [options.metadata] - Optional metadata
   * @returns {Promise<{success: boolean, notification?: object, error?: string}>}
   */
  static async send(options) {
    try {
      const { ROLE_ID, message, WORK_ITEM_ID } = options;

      // Validate required fields
      if (!ROLE_ID || !message || !WORK_ITEM_ID) {
        logger.warn('Notification missing required fields', {
          missingFields: {
            ROLE_ID: !ROLE_ID,
            message: !message,
            WORK_ITEM_ID: !WORK_ITEM_ID
          }
        });
        return { success: false, error: 'Missing required fields' };
      }

      // Construct new notification using Notification model
      const notification = await Notification.create({
        ROLE_ID,
        message,
        WORK_ITEM_ID,
        status: options.status || 'Pending',
        notificationType: options.notificationType || 'system',
        createdAt: new Date(),
        ...(options.EVENT_ID && { EVENT_ID: options.EVENT_ID }),
        ...(options.metadata && { metadata: options.metadata })
      });

      // Also send email if configured
      await sendEmailForRole(ROLE_ID, message, options);

      logger.info('Notification sent successfully', {
        notificationId: notification._id,
        ROLE_ID,
        notificationType: options.notificationType || 'system'
      });

      return { success: true, notification };

    } catch (error) {
      logger.error('Notification processing error:', {
        error: error.message,
        stack: error.stack,
        input: options
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send an approval request notification
   * @param {Object} params
   * @param {String} params.ROLE_ID - Target role (MANAGER or HEAD_OF_DEPARTMENT)
   * @param {String} params.accountNumber - Account number
   * @param {String} params.accountName - Account name
   * @param {String} params.action - Action type (Activation/Deactivation)
   * @param {String} params.requestId - Request ID
   * @param {String} params.currentStatus - Current account status
   * @param {String} params.requestedStatus - Requested account status
   * @param {String} params.reason - Reason for request
   * @param {String} params.urgency - Urgency level
   * @param {Date} params.expiryDate - Expiry date
   * @param {Number} params.WORK_ITEM_ID - Work item ID
   */
  static async sendApprovalRequest(params) {
    const { 
      ROLE_ID, 
      accountNumber, 
      accountName, 
      action, 
      requestId, 
      currentStatus, 
      requestedStatus, 
      reason, 
      urgency, 
      expiryDate,
      WORK_ITEM_ID 
    } = params;
    
    const message = `📋 Approval Required: ${action} for account ${accountNumber} (${accountName})`;
    
    return await this.send({
      ROLE_ID,
      WORK_ITEM_ID,
      message,
      status: 'Pending',
      notificationType: 'approval_request',
      metadata: {
        accountNumber,
        accountName,
        action,
        requestId,
        currentStatus,
        requestedStatus,
        reason,
        urgency,
        expiryDate,
        approvalLevel: ROLE_ID === 'MANAGER' ? 'First' : 'Second',
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send an approval status notification
   * @param {Object} params
   * @param {String} params.ROLE_ID - Target role
   * @param {String} params.accountNumber - Account number
   * @param {String} params.action - Action type
   * @param {String} params.requestId - Request ID
   * @param {String} params.status - Approval status (Approved/Rejected)
   * @param {String} params.approvalLevel - Approval level (First/Second)
   * @param {String} params.approvedBy - Who approved/rejected
   * @param {String} params.notes - Approval notes
   * @param {Number} params.WORK_ITEM_ID - Work item ID
   */
  static async sendApprovalStatus(params) {
    const { 
      ROLE_ID, 
      accountNumber, 
      action, 
      requestId, 
      status, 
      approvalLevel, 
      approvedBy, 
      notes,
      WORK_ITEM_ID 
    } = params;
    
    const message = `✅ ${status}: ${action} for account ${accountNumber} ${status.toLowerCase()} at ${approvalLevel} level`;
    
    return await this.send({
      ROLE_ID,
      WORK_ITEM_ID,
      message,
      status: status === 'Approved' ? 'Success' : 'Rejected',
      notificationType: 'approval_status',
      metadata: {
        accountNumber,
        action,
        requestId,
        status,
        approvalLevel,
        approvedBy,
        notes,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send an execution completion notification
   * @param {Object} params
   * @param {String} params.ROLE_ID - Target role (initiator)
   * @param {String} params.accountNumber - Account number
   * @param {String} params.action - Action type
   * @param {String} params.requestId - Request ID
   * @param {String} params.executedBy - Who executed
   * @param {Number} params.WORK_ITEM_ID - Work item ID
   */
  static async sendExecutionComplete(params) {
    const { 
      ROLE_ID, 
      accountNumber, 
      action, 
      requestId, 
      executedBy,
      WORK_ITEM_ID 
    } = params;
    
    const message = `✅ Execution Complete: ${action} for account ${accountNumber} has been completed`;
    
    return await this.send({
      ROLE_ID,
      WORK_ITEM_ID,
      message,
      status: 'Success',
      notificationType: 'execution_complete',
      metadata: {
        accountNumber,
        action,
        requestId,
        executedBy,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send a request cancellation notification
   * @param {Object} params
   * @param {String} params.ROLE_ID - Target role
   * @param {String} params.accountNumber - Account number
   * @param {String} params.action - Action type
   * @param {String} params.requestId - Request ID
   * @param {String} params.cancelledBy - Who cancelled
   * @param {String} params.reason - Cancellation reason
   * @param {Number} params.WORK_ITEM_ID - Work item ID
   */
  static async sendRequestCancelled(params) {
    const { 
      ROLE_ID, 
      accountNumber, 
      action, 
      requestId, 
      cancelledBy, 
      reason,
      WORK_ITEM_ID 
    } = params;
    
    const message = `❌ Request Cancelled: ${action} for account ${accountNumber} has been cancelled`;
    
    return await this.send({
      ROLE_ID,
      WORK_ITEM_ID,
      message,
      status: 'Cancelled',
      notificationType: 'request_cancelled',
      metadata: {
        accountNumber,
        action,
        requestId,
        cancelledBy,
        reason,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send a reminder for expiring requests
   * @param {Object} params
   * @param {String} params.ROLE_ID - Target role (approver)
   * @param {String} params.accountNumber - Account number
   * @param {String} params.action - Action type
   * @param {String} params.requestId - Request ID
   * @param {Number} params.hoursRemaining - Hours until expiry
   * @param {Number} params.WORK_ITEM_ID - Work item ID
   */
  static async sendReminder(params) {
    const { 
      ROLE_ID, 
      accountNumber, 
      action, 
      requestId, 
      hoursRemaining,
      WORK_ITEM_ID 
    } = params;
    
    const message = `⏰ Reminder: ${action} for account ${accountNumber} expires in ${hoursRemaining} hours`;
    
    return await this.send({
      ROLE_ID,
      WORK_ITEM_ID,
      message,
      status: 'Pending',
      notificationType: 'reminder',
      metadata: {
        accountNumber,
        action,
        requestId,
        hoursRemaining,
        urgency: 'HIGH',
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send a failure notification
   * @param {Object} params
   * @param {String} params.ROLE_ID - Target role
   * @param {Number} params.WORK_ITEM_ID - Work item ID
   * @param {String} params.failureReason - Reason for failure
   * @param {String} params.transactionType - Type of transaction
   * @param {Object} [params.metadata] - Additional metadata
   */
  static async sendFailureNotification(params) {
    const { ROLE_ID, WORK_ITEM_ID, failureReason, transactionType, metadata } = params;
    
    const message = `Transaction Failure: ${transactionType || 'Direct Debit'} failed. Reason: ${failureReason}`;
    
    return await this.send({
      ROLE_ID,
      WORK_ITEM_ID,
      message,
      status: 'Failed',
      notificationType: 'transaction_failure',
      metadata: {
        ...metadata,
        failureReason,
        transactionType,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send an error notification
   * @param {Object} params
   * @param {String} params.ROLE_ID - Target role
   * @param {Number} params.WORK_ITEM_ID - Work item ID
   * @param {String} params.errorMessage - Error message
   * @param {String} params.operation - Operation that failed
   * @param {Object} [params.metadata] - Additional metadata
   */
  static async sendErrorNotification(params) {
    const { ROLE_ID, WORK_ITEM_ID, errorMessage, operation, metadata } = params;
    
    const message = `System Error: ${operation || 'Operation'} encountered an error. Details: ${errorMessage}`;
    
    return await this.send({
      ROLE_ID,
      WORK_ITEM_ID,
      message,
      status: 'Error',
      notificationType: 'system_error',
      metadata: {
        ...metadata,
        errorMessage,
        operation,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send a success notification
   * @param {Object} params
   * @param {String} params.ROLE_ID - Target role
   * @param {Number} params.WORK_ITEM_ID - Work item ID
   * @param {String} params.successMessage - Success message
   * @param {String} params.transactionType - Type of transaction
   * @param {Object} [params.metadata] - Additional metadata
   */
  static async sendSuccessNotification(params) {
    const { ROLE_ID, WORK_ITEM_ID, successMessage, transactionType, metadata } = params;
    
    const message = `Transaction Success: ${transactionType || 'Direct Debit'} completed successfully. ${successMessage}`;
    
    return await this.send({
      ROLE_ID,
      WORK_ITEM_ID,
      message,
      status: 'Success',
      notificationType: 'transaction_success',
      metadata: {
        ...metadata,
        successMessage,
        transactionType,
        timestamp: new Date().toISOString()
      }
    });
  }
}

// Helper function to send email notifications for roles
const sendEmailForRole = async (ROLE_ID, message, options) => {
  try {
    // Get email addresses for the role
    const emailAddresses = await getEmailsForRole(ROLE_ID);
    
    if (emailAddresses.length > 0) {
      await sendEmailNotification({
        to: emailAddresses,
        subject: `Notification: ${options.notificationType || 'System Alert'}`,
        message,
        metadata: options.metadata
      });
    }
  } catch (error) {
    logger.error('Failed to send email for role:', error);
  }
};

// Helper to get email addresses for a role (mock implementation)
const getEmailsForRole = async (ROLE_ID) => {
  // In a real app, fetch from user/role service
  const roleEmails = {
    'MANAGER': ['manager@bank.com', 'operations.manager@bank.com'],
    'HEAD_OF_DEPARTMENT': ['head.dept@bank.com', 'hod.operations@bank.com'],
    'CUSTOMER_SERVICE': ['customerservice@bank.com'],
    'RISK_MANAGEMENT': ['risk@bank.com'],
    'COMPLIANCE': ['compliance@bank.com']
  };
  
  return roleEmails[ROLE_ID] || [];
};

// Email notification function
const sendEmailNotification = async (emailData) => {
  try {
    if (process.env.EMAIL_ENABLED !== 'true') {
      logger.info('Email notifications are disabled');
      return;
    }

    // Email template based on notification type
    const template = getEmailTemplate(emailData.metadata?.notificationType || 'system', emailData);
    
    // This would use nodemailer or similar in production
    logger.info('Email would be sent:', {
      to: emailData.to,
      subject: emailData.subject,
      template: emailData.metadata?.notificationType
    });
    
    // Implement actual email sending here
    // await transporter.sendMail({ ... });
    
  } catch (error) {
    logger.error('Failed to send email notification:', error);
  }
};

// Email template generator
const getEmailTemplate = (notificationType, data) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const message = data.message;
  const metadata = data.metadata || {};
  
  const templates = {
    'approval_request': {
      subject: `🔔 Approval Required: ${metadata.action || 'Account Action'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Approval Required</h2>
          <p>Dear Approver,</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #3498db;">Request Details:</h3>
            <p><strong>Action:</strong> ${metadata.action}</p>
            <p><strong>Account:</strong> ${metadata.accountNumber} (${metadata.accountName})</p>
            <p><strong>Current Status:</strong> ${metadata.currentStatus}</p>
            <p><strong>Requested Status:</strong> ${metadata.requestedStatus}</p>
            <p><strong>Reason:</strong> ${metadata.reason}</p>
            <p><strong>Request ID:</strong> ${metadata.requestId}</p>
            <p><strong>Expiry:</strong> ${new Date(metadata.expiryDate).toLocaleString()}</p>
          </div>
          
          <div style="margin: 30px 0;">
            <a href="${baseUrl}/workflow/${metadata.requestId}" 
               style="background-color: #3498db; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px; font-weight: bold;">
              Review Request
            </a>
          </div>
          
          <p style="color: #7f8c8d; font-size: 12px;">
            This is an automated notification from Banking System.
          </p>
        </div>
      `
    },
    
    'approval_status': {
      subject: `✅ ${metadata.status}: ${metadata.action || 'Request'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${metadata.status === 'Approved' ? '#27ae60' : '#e74c3c'};">${metadata.status}</h2>
          <p>Dear User,</p>
          
          <div style="background-color: ${metadata.status === 'Approved' ? '#e8f6f3' : '#fdedec'}; 
                     padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: ${metadata.status === 'Approved' ? '#27ae60' : '#e74c3c'};">Details:</h3>
            <p><strong>Action:</strong> ${metadata.action}</p>
            <p><strong>Account:</strong> ${metadata.accountNumber}</p>
            <p><strong>Status:</strong> ${metadata.status} at ${metadata.approvalLevel} level</p>
            <p><strong>Approved By:</strong> ${metadata.approvedBy}</p>
            <p><strong>Notes:</strong> ${metadata.notes || 'None provided'}</p>
            <p><strong>Request ID:</strong> ${metadata.requestId}</p>
          </div>
        </div>
      `
    },
    
    'execution_complete': {
      subject: `✅ Execution Complete: ${metadata.action || 'Action'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #27ae60;">Execution Complete</h2>
          <p>Dear User,</p>
          
          <div style="background-color: #e8f6f3; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #27ae60;">Details:</h3>
            <p><strong>Action:</strong> ${metadata.action}</p>
            <p><strong>Account:</strong> ${metadata.accountNumber}</p>
            <p><strong>Request ID:</strong> ${metadata.requestId}</p>
            <p><strong>Executed By:</strong> ${metadata.executedBy}</p>
            <p><strong>Date:</strong> ${new Date(metadata.timestamp).toLocaleString()}</p>
          </div>
          
          <p>The requested action has been completed successfully.</p>
        </div>
      `
    }
  };
  
  return templates[notificationType] || {
    subject: `Notification: ${message.substring(0, 50)}...`,
    html: `<p>${message}</p>`
  };
};

// Helper function to get WORK_ITEM_ID for approval requests
export const getWorkItemIdForApproval = (requestId) => {
  // Generate a work item ID based on request ID
  return parseInt(requestId.replace(/[^0-9]/g, '').substring(0, 10), 10) || Date.now();
};

// Convenience functions for the approval workflow
export const sendApprovalNotification = async (notificationData) => {
  const {
    type,
    userId,
    approverRole,
    requestId,
    action,
    accountNumber,
    accountName,
    currentStatus,
    requestedStatus,
    reason,
    urgency,
    expiryDate
  } = notificationData;

  const WORK_ITEM_ID = getWorkItemIdForApproval(requestId);
  
  switch (type) {
    case 'APPROVAL_REQUEST':
      return await NotificationService.sendApprovalRequest({
        ROLE_ID: approverRole,
        accountNumber,
        accountName,
        action,
        requestId,
        currentStatus,
        requestedStatus,
        reason,
        urgency,
        expiryDate,
        WORK_ITEM_ID
      });
      
    case 'REQUEST_APPROVED':
    case 'REQUEST_REJECTED':
      return await NotificationService.sendApprovalStatus({
        ROLE_ID: userId, // Send to initiator
        accountNumber,
        action,
        requestId,
        status: type === 'REQUEST_APPROVED' ? 'Approved' : 'Rejected',
        approvalLevel: approverRole === 'MANAGER' ? 'First' : 'Second',
        approvedBy: userId,
        notes: notificationData.notes || '',
        WORK_ITEM_ID
      });
      
    case 'EXECUTION_COMPLETE':
      return await NotificationService.sendExecutionComplete({
        ROLE_ID: userId, // Send to initiator
        accountNumber,
        action,
        requestId,
        executedBy: notificationData.executedBy,
        WORK_ITEM_ID
      });
      
    case 'REQUEST_CANCELLED':
      return await NotificationService.sendRequestCancelled({
        ROLE_ID: approverRole, // Send to approvers
        accountNumber,
        action,
        requestId,
        cancelledBy: userId,
        reason: notificationData.cancellationReason,
        WORK_ITEM_ID
      });
      
    case 'APPROVAL_REMINDER':
      return await NotificationService.sendReminder({
        ROLE_ID: approverRole,
        accountNumber,
        action,
        requestId,
        hoursRemaining: notificationData.hoursRemaining,
        WORK_ITEM_ID
      });
      
    default:
      logger.warn('Unknown notification type:', type);
      return { success: false, error: 'Unknown notification type' };
  }
};

// Batch notification sender
export const sendBatchNotifications = async (roleIds, notificationData) => {
  try {
    const results = await Promise.all(
      roleIds.map(roleId => 
        sendApprovalNotification({ ...notificationData, approverRole: roleId })
      )
    );
    
    logger.info('Batch notifications sent', {
      count: roleIds.length,
      type: notificationData.type
    });
    
    return results;
    
  } catch (error) {
    logger.error('Failed to send batch notifications:', error);
    throw error;
  }
};

// Check for expiring approvals and send reminders
export const checkAndSendReminders = async () => {
  try {
    // This would query pending approvals and send reminders
    // For now, it's a placeholder
    logger.info('Reminder check completed');
    return { success: true, remindersSent: 0 };
    
  } catch (error) {
    logger.error('Failed to check reminders:', error);
    return { success: false, error: error.message };
  }
};

// Named exports for convenience
export const sendFailureNotification = NotificationService.sendFailureNotification.bind(NotificationService);
export const sendErrorNotification = NotificationService.sendErrorNotification.bind(NotificationService);
export const sendSuccessNotification = NotificationService.sendSuccessNotification.bind(NotificationService);
export const sendApprovalRequest = NotificationService.sendApprovalRequest.bind(NotificationService);
export const sendApprovalStatus = NotificationService.sendApprovalStatus.bind(NotificationService);
export const sendExecutionComplete = NotificationService.sendExecutionComplete.bind(NotificationService);
export const sendRequestCancelled = NotificationService.sendRequestCancelled.bind(NotificationService);
export const sendReminder = NotificationService.sendReminder.bind(NotificationService);

// Export NotificationService as default
export default NotificationService;