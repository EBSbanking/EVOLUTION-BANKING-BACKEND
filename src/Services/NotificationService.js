// ✅ Correctly import the Notification model
import Notification from '../models/NotificationModel.js';

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
        console.warn('Notification missing required fields', {
          missingFields: {
            ROLE_ID: !ROLE_ID,
            message: !message,
            WORK_ITEM_ID: !WORK_ITEM_ID
          }
        });
        return { success: false, error: 'Missing required fields' };
      }

      // ✅ Construct new notification using imported Notification model
      const notification = new Notification({
        ROLE_ID,
        message,
        WORK_ITEM_ID,
        status: options.status || 'Pending',
        notificationType: options.notificationType || 'system',
        createdAt: new Date(),
        ...(options.EVENT_ID && { EVENT_ID: options.EVENT_ID }),
        ...(options.metadata && { metadata: options.metadata })
      });

      await notification.save();

      return { success: true, notification };

    } catch (error) {
      console.error('Notification processing error:', {
        error: error.message,
        stack: error.stack,
        input: options
      });
      return { success: false, error: error.message };
    }
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

// Export both the class and individual functions for flexibility
export default NotificationService;

// Named exports for backward compatibility
export const sendFailureNotification = NotificationService.sendFailureNotification.bind(NotificationService);
export const sendErrorNotification = NotificationService.sendErrorNotification.bind(NotificationService);
export const sendSuccessNotification = NotificationService.sendSuccessNotification.bind(NotificationService);
export const sendNotification = NotificationService.send.bind(NotificationService);