// services/NotificationService.js
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sequelize } from '../../config/db.js';
import logger from '../utils/logger.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

class NotificationService {
  constructor() {
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

    this.emailTransporter = null;
    this.initEmailTransporter();
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

        this.emailTransporter.verify((error, success) => {
          if (error) {
            console.error('❌ SMTP Transporter verification failed:', error.message);
          } else {
            console.log('✅ SMTP Transporter verified successfully');
          }
        });

        logger.info('✅ Email transporter initialized');
      } else {
        logger.warn('⚠️ SMTP not configured, email notifications disabled');
      }
    } catch (error) {
      logger.error('❌ Failed to initialize email transporter:', error);
    }
  }

  /**
   * Get users for a specific BU_ID
   * ✅ Dynamically checks available columns
   * ✅ Always returns an array
   */
  async getUsersForBU(BU_ID) {
    try {
      console.log(`🔍 Fetching users for BU: ${BU_ID}`);
      
      // ============================================================
      // STEP 1: Check what columns actually exist in the users table
      // ============================================================
      let columns = [];
      try {
        const [columnResults] = await sequelize.query(
          `SHOW COLUMNS FROM users`
        );
        columns = columnResults.map(col => col.Field);
        console.log('📋 Available columns in users table:', columns);
      } catch (colError) {
        console.warn('⚠️ Could not fetch columns:', colError.message);
        // Fallback columns
        columns = ['id', 'user_name', 'username', 'email', 'BU_ID', 'branch_id', 'role'];
      }
      
      // ============================================================
      // STEP 2: Build safe column list for SELECT
      // ============================================================
      const safeColumns = ['id', 'user_name', 'username', 'email', 'BU_ID', 'role', 'user_role', 'is_active', 'status']
        .filter(col => columns.includes(col));
      
      const selectClause = safeColumns.length > 0 ? safeColumns.join(', ') : '*';
      console.log(`📋 Safe columns for query: ${selectClause}`);
      
      // ============================================================
      // STEP 3: Build search values
      // ============================================================
      const searchValues = [
        BU_ID,
        String(BU_ID),
        parseInt(BU_ID),
        BU_ID.toString().padStart(3, '0'),
      ].filter(v => v !== undefined && v !== null && v !== '' && v !== 'null' && v !== 'undefined');
      
      const uniqueSearchValues = [...new Set(searchValues)];
      console.log(`📋 Searching for users with values:`, uniqueSearchValues);
      
      // ============================================================
      // STEP 4: Build WHERE clause with only columns that exist
      // ============================================================
      const whereConditions = [];
      const replacements = {};
      let paramIndex = 0;
      
      // Check each potential BU column and add to WHERE if it exists
      const buColumns = ['BU_ID', 'bu_id', 'branch_id', 'main_business_unit', 
                         'responsibility_centre', 'businessUnit', 'business_unit'];
      
      for (const col of buColumns) {
        if (columns.includes(col)) {
          const idx = paramIndex++;
          whereConditions.push(`${col} = :val${idx}`);
          replacements[`val${idx}`] = String(BU_ID);
          
          // Also try LIKE for partial matches
          const idx2 = paramIndex++;
          whereConditions.push(`${col} LIKE :val${idx2}`);
          replacements[`val${idx2}`] = `%${BU_ID}%`;
        }
      }
      
      // Add status/active check
      if (columns.includes('is_active')) {
        whereConditions.push(`is_active = 'Active'`);
      } else if (columns.includes('status')) {
        whereConditions.push(`status = 'Active'`);
      }
      
      // If no BU columns exist, don't filter by BU
      let whereClause = '';
      if (whereConditions.length > 0) {
        whereClause = `WHERE ${whereConditions.join(' OR ')}`;
      }
      
      console.log(`📋 WHERE clause: ${whereClause}`);
      
      // ============================================================
      // STEP 5: Execute query
      // ============================================================
      const query = `
        SELECT ${selectClause}
        FROM users 
        ${whereClause}
        LIMIT 50
      `;
      
      console.log(`🔍 Executing query: ${query}`);
      console.log(`🔍 With replacements:`, replacements);
      
      let users = await sequelize.query(query, {
        replacements: replacements,
        type: sequelize.QueryTypes.SELECT
      });
      
      // Ensure users is an array
      if (!Array.isArray(users)) {
        users = [];
      }
      
      if (users.length > 0) {
        console.log(`✅ Found ${users.length} users for BU: ${BU_ID}`);
        users.forEach(u => {
          console.log(`  - ${u.user_name || u.username || 'Unknown'} (${u.role || u.user_role || 'N/A'})`);
        });
        return users;
      }
      
      // ============================================================
      // STEP 6: FALLBACK - Get managers/admins
      // ============================================================
      console.log(`⚠️ No users found with matching fields, looking for managers...`);
      
      const managerConditions = [];
      const managerReplacements = {};
      let managerParamIndex = 0;
      
      // Check role columns
      const roleColumns = ['role', 'user_role', 'BU_ROLE_ID', 'primary_business_role'];
      const managerRoles = ['Manager', 'Branch Manager', 'Supervisor', 'Admin', 'Administrator', 
                            '19', '20', '17', '30', '31', '32', '6', '13', '21', '14'];
      
      let roleColFound = false;
      for (const col of roleColumns) {
        if (columns.includes(col)) {
          roleColFound = true;
          const idx = managerParamIndex++;
          managerConditions.push(`${col} IN (:roleValues${idx})`);
          managerReplacements[`roleValues${idx}`] = managerRoles;
        }
      }
      
      // If no role column found, try supervisor column
      if (!roleColFound && columns.includes('is_supervisor')) {
        managerConditions.push(`is_supervisor = 1`);
      }
      
      const managerWhere = managerConditions.length > 0 ? 
        `WHERE ${managerConditions.join(' OR ')}` : '';
      
      if (managerWhere) {
        const managerQuery = `
          SELECT ${selectClause}
          FROM users 
          ${managerWhere}
          LIMIT 10
        `;
        
        const managers = await sequelize.query(managerQuery, {
          replacements: managerReplacements,
          type: sequelize.QueryTypes.SELECT
        });
        
        if (Array.isArray(managers) && managers.length > 0) {
          console.log(`✅ Found ${managers.length} managers as fallback`);
          managers.forEach(u => {
            console.log(`  - ${u.user_name || u.username || 'Unknown'} (${u.role || u.user_role || 'N/A'})`);
          });
          return managers;
        }
      }
      
      // ============================================================
      // STEP 7: ULTIMATE FALLBACK - Get any active user
      // ============================================================
      console.log(`⚠️ No managers found, getting any active user...`);
      
      const anyUserQuery = `
        SELECT ${selectClause}
        FROM users 
        ${whereConditions.length > 0 ? whereClause : ''}
        LIMIT 5
      `;
      
      const anyUsers = await sequelize.query(anyUserQuery, {
        replacements: replacements,
        type: sequelize.QueryTypes.SELECT
      });
      
      if (Array.isArray(anyUsers) && anyUsers.length > 0) {
        console.log(`✅ Found ${anyUsers.length} active users as ultimate fallback`);
        return anyUsers;
      }
      
      console.log(`❌ No users found at all for BU: ${BU_ID}`);
      return [];

    } catch (error) {
      console.error('❌ Error fetching users for BU:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      // ============================================================
      // FINAL FALLBACK - Try a simple query without any filtering
      // ============================================================
      try {
        console.log('🔄 Trying ultimate fallback - getting any users...');
        const fallbackUsers = await sequelize.query(
          `SELECT id, user_name, username, email, role, user_role, BU_ID, branch_id 
           FROM users 
           LIMIT 5`,
          {
            type: sequelize.QueryTypes.SELECT
          }
        );
        
        if (Array.isArray(fallbackUsers) && fallbackUsers.length > 0) {
          console.log(`✅ Fallback: Found ${fallbackUsers.length} users`);
          return fallbackUsers;
        }
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError.message);
      }
      
      return [];
    }
  }

  /**
   * Get approving officers (managers/supervisors) for a specific BU
   * ✅ Checks both users table AND user_roles table
   */
  async getApprovingOfficers(BU_ID) {
    try {
      console.log(`🔍 Fetching approving officers for BU: ${BU_ID}`);
      
      const managerRoleIds = ['19', '20', '17', '30', '31', '32', '6', '13', '21', '14'];
      const managerRoleNames = [
        'Branch Manager', 'Supervisor', 'Manager', 'Head Teller', 'Team Lead',
        'Internal Control Manager', 'Financial Accountant Manager', 'Chief Operation Officer',
        'Chief Financial Officer'
      ];
      
      const searchValues = [
        BU_ID,
        String(BU_ID),
        parseInt(BU_ID),
        BU_ID.toString().padStart(3, '0'),
      ];
      
      const uniqueSearchValues = [...new Set(searchValues.filter(v => 
        v !== undefined && v !== null && v !== 'undefined' && v !== '' && v !== 'null'
      ))];
      
      console.log(`📋 Searching for approving officers with BU_ID in:`, uniqueSearchValues);
      
      // QUERY 1: Check users table directly
      const userResults = await sequelize.query(
        `SELECT id, user_name, username, email, BU_ID, BU_ROLE_ID, primary_business_role, 
                preferred_name, is_supervisor, main_business_unit, responsibility_centre, businessUnit,
                bu_id AS bu_id_lower
         FROM users 
         WHERE is_active = 'Active'
         AND (
           BU_ROLE_ID IN (:roleIds)
           OR primary_business_role IN (:roleNames)
           OR is_supervisor = 1
         )
         AND (
           BU_ID IN (:searchValues)
           OR bu_id IN (:searchValues)
           OR main_business_unit IN (:searchValues)
           OR responsibility_centre IN (:searchValues)
           OR businessUnit IN (:searchValues)
         )
         LIMIT 20`,
        {
          replacements: { 
            roleIds: managerRoleIds,
            roleNames: managerRoleNames,
            searchValues: uniqueSearchValues
          },
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      // QUERY 2: Check user_roles table
      const roleResults = await sequelize.query(
        `SELECT DISTINCT u.id, u.user_name, u.username, u.email, u.BU_ID, u.BU_ROLE_ID, 
                u.primary_business_role, u.preferred_name, u.is_supervisor, 
                u.main_business_unit, u.responsibility_centre, u.businessUnit
         FROM users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         WHERE u.is_active = 'Active'
         AND ur.BU_ID IN (:searchValues)
         AND (ur.ROLE_NM IN (:roleNames))
         AND u.id NOT IN (
           SELECT id FROM users 
           WHERE BU_ID IN (:searchValues) 
           OR main_business_unit IN (:searchValues)
           OR responsibility_centre IN (:searchValues)
           OR businessUnit IN (:searchValues)
         )
         LIMIT 20`,
        {
          replacements: { 
            roleNames: managerRoleNames,
            searchValues: uniqueSearchValues
          },
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      // Merge results, removing duplicates
      const allResults = [...(Array.isArray(userResults) ? userResults : []), ...(Array.isArray(roleResults) ? roleResults : [])];
      const uniqueResults = Array.from(
        new Map(allResults.map(user => [user.id, user])).values()
      );
      
      if (uniqueResults && uniqueResults.length > 0) {
        console.log(`✅ Found ${uniqueResults.length} approving officers for BU: ${BU_ID}`);
        uniqueResults.forEach(u => {
          console.log(`  - ${u.user_name} (${u.primary_business_role || u.BU_ROLE_ID || 'N/A'}) - BU: ${u.BU_ID || u.main_business_unit || u.responsibility_centre || 'N/A'}`);
        });
        return uniqueResults;
      }
      
      // If no approving officers found, get all users for this BU
      console.log(`⚠️ No approving officers found, getting all users for BU: ${BU_ID}`);
      return await this.getUsersForBU(BU_ID);

    } catch (error) {
      console.error('❌ Error fetching approving officers:', error);
      return [];
    }
  }

  /**
   * 🔥 FIXED: Send approval request notification to ALL users in the BU
   * ✅ No more recursion!
   */
  async sendApprovalNotification({
    itemType,
    itemId,
    itemName,
    description,
    submittedBy,
    BU_ID,
    metadata = {},
    priority = 'medium',
  }) {
    try {
      console.log(`📨 Sending approval notification for ${itemType} (ID: ${itemId})`);
      console.log(`📋 BU_ID: ${BU_ID}`);

      // ✅ Get ALL users for this BU
      const allUsers = await this.getUsersForBU(BU_ID);
      
      if (allUsers.length === 0) {
        console.log(`⚠️ No users found for BU_ID: ${BU_ID}`);
        
        // Try to find users from user_roles table
        const [roleUsers] = await sequelize.query(
          `SELECT DISTINCT u.id, u.user_name, u.username, u.email, u.BU_ID, u.BU_ROLE_ID, 
                  u.primary_business_role, u.preferred_name, u.is_supervisor, 
                  u.main_business_unit, u.responsibility_centre, u.businessUnit
           FROM users u
           INNER JOIN user_roles ur ON ur.user_id = u.id
           WHERE u.is_active = 'Active'
           AND ur.BU_ID = :BU_ID
           LIMIT 50`,
          {
            replacements: { BU_ID: String(BU_ID) },
            type: sequelize.QueryTypes.SELECT
          }
        );
        
        const roleUsersArray = Array.isArray(roleUsers) ? roleUsers : [];
        
        if (roleUsersArray.length > 0) {
          console.log(`✅ Found ${roleUsersArray.length} users in user_roles table`);
          
          // Create admin fallback notification
          const adminNotification = await this.createAdminFallbackNotification({
            itemType, itemId, itemName, description, submittedBy, BU_ID, metadata, priority
          });
          
          // Notify the submitter
          await this.sendSubmitterErrorNotification({
            itemType, itemId, itemName, submittedBy, BU_ID
          });
          
          return { 
            success: false, 
            error: 'No users found for this branch',
            BU_ID,
            itemType,
            itemId,
            adminNotification,
            fallbackUsersCount: roleUsersArray.length
          };
        }
        
        // Create admin fallback notification
        const adminNotification = await this.createAdminFallbackNotification({
          itemType, itemId, itemName, description, submittedBy, BU_ID, metadata, priority
        });
        
        // Notify the submitter
        await this.sendSubmitterErrorNotification({
          itemType, itemId, itemName, submittedBy, BU_ID
        });
        
        return { 
          success: false, 
          error: 'No users found for this branch',
          BU_ID,
          itemType,
          itemId,
          adminNotification
        };
      }

      console.log(`👥 Found ${allUsers.length} user(s) for BU_ID: ${BU_ID}`);
      
      const notifications = [];
      
      // ✅ Send to ALL users in the BU
      for (const user of allUsers) {
        try {
          const result = await this.sendNotificationToUser(user, {
            itemType, itemId, itemName, description, submittedBy, BU_ID, metadata, priority
          });
          notifications.push(result);
          console.log(`✅ Notification sent to ${user.user_name} (ID: ${user.id})`);
        } catch (error) {
          console.error(`❌ Error sending notification to user ${user.id}:`, error.message);
          notifications.push({
            userId: user.id,
            userName: user.user_name || 'Unknown',
            error: error.message,
            status: 'failed',
          });
        }
      }
      
      // Send confirmation to submitter
      await this.sendSubmitterNotification({
        itemType, itemId, itemName, submittedBy, BU_ID, usersCount: allUsers.length
      });
      
      return {
        success: true,
        message: `Sent ${notifications.length} approval notifications to users in BU ${BU_ID}`,
        notifications,
        itemType,
        itemId,
        BU_ID,
        totalUsers: allUsers.length,
      };

    } catch (error) {
      console.error('❌ Error sending approval notification:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.stack,
      };
    }
  }

  /**
   * Create admin fallback notification
   */
  async createAdminFallbackNotification({ itemType, itemId, itemName, description, submittedBy, BU_ID, metadata, priority }) {
    try {
      const [adminUser] = await sequelize.query(
        `SELECT id, user_name, username, email, BU_ROLE_ID, primary_business_role
         FROM users 
         WHERE is_active = 'Active' 
         AND (BU_ROLE_ID = '1' OR primary_business_role = 'Admin' OR user_name = 'admin')
         LIMIT 1`,
        {
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      const adminId = adminUser?.id || 1;
      const adminName = adminUser?.user_name || adminUser?.username || 'Admin';
      
      const notification = await Notification.create({
        recipient_id: adminId,
        ROLE_ID: 'Admin',
        message: `⚠️ No users found for BU ${BU_ID}. ${itemType} #${itemName} needs attention. Please assign users to this BU.`,
        WORK_ITEM_ID: String(itemId || 'N/A'),
        EVENT_ID: `system_${Date.now()}`,
        status: 'sent',
        notification_type: 'system',
        priority: 'high',
        recipient_name: adminName,
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
      
      console.log(`✅ Admin fallback notification created: ${notification.id}`);
      return notification;
      
    } catch (error) {
      console.error('❌ Failed to create admin fallback notification:', error.message);
      return null;
    }
  }

  /**
   * 🔥 FIXED: Notify approvers for a card request
   * This is the function that your controller is trying to import
   */
  async notifyApprovers(approvalRequest, workflowConfig) {
    try {
      console.log(`📨 Notifying approvers for request ${approvalRequest.id}`);
      
      const itemType = approvalRequest.requestType === 'REISSUE' ? 'Card Reissuance' : 'Card Issuance';
      const itemName = `Card ${approvalRequest.requestType}`;
      const description = `${itemType} request for customer ${approvalRequest.customerId}`;
      const submittedBy = approvalRequest.requestedBy || 'System';
      const BU_ID = approvalRequest.branchCode || approvalRequest.organizationName || 'MAIN';
      
      // Get the next approvers based on workflow config
      const approvalLevels = workflowConfig?.approvalLevels || [];
      const currentLevel = approvalRequest.approvalLevel || 0;
      
      // Get the next level approvers
      const nextLevel = currentLevel;
      let nextApprovers = [];
      
      if (approvalLevels.length > 0 && nextLevel < approvalLevels.length) {
        const levelConfig = approvalLevels[nextLevel];
        const roleId = levelConfig.roleId;
        const roleName = levelConfig.role || levelConfig.name || 'Approver';
        
        // Find users with this role
        const approverUsers = await this.getUsersForBU(BU_ID);
        
        // Filter users by role
        nextApprovers = approverUsers.filter(user => 
          parseInt(user.BU_ROLE_ID) === parseInt(roleId) ||
          user.primary_business_role === roleName ||
          user.primary_business_role?.toLowerCase() === roleName?.toLowerCase()
        );
        
        // If no users found with specific role, get all users in BU
        if (nextApprovers.length === 0) {
          console.log(`⚠️ No users found with role ${roleName}, notifying all users in BU`);
          nextApprovers = approverUsers;
        }
      }
      
      // If no approvers found, use admin fallback
      if (nextApprovers.length === 0) {
        console.log(`⚠️ No approvers found, using admin fallback`);
        const adminUsers = await this.getUsersForBU('1');
        if (adminUsers.length > 0) {
          nextApprovers = adminUsers;
        } else {
          // Ultimate fallback - get any active user
          const anyUsers = await this.getUsersForBU('MAIN');
          nextApprovers = anyUsers.length > 0 ? anyUsers : [];
        }
      }
      
      console.log(`👥 Found ${nextApprovers.length} approver(s) for request ${approvalRequest.id}`);
      
      // Send notifications to each approver
      const results = [];
      for (const approver of nextApprovers) {
        try {
          const result = await this.sendNotificationToUser(approver, {
            itemType,
            itemId: approvalRequest.id,
            itemName,
            description,
            submittedBy,
            BU_ID,
            priority: 'high',
            metadata: {
              requestId: approvalRequest.id,
              customerId: approvalRequest.customerId,
              accountNumber: approvalRequest.accountNumber,
              cardType: approvalRequest.cardData?.cardType,
              cardScheme: approvalRequest.cardData?.cardScheme,
              amount: approvalRequest.feeDetails?.totalAmount || 0,
              currentLevel: approvalRequest.approvalLevel,
              totalLevels: approvalLevels.length,
              workflowConfig: workflowConfig?.id
            }
          });
          results.push(result);
          console.log(`✅ Notification sent to approver: ${approver.user_name || approver.username}`);
        } catch (error) {
          console.error(`❌ Failed to send notification to approver ${approver.id}:`, error.message);
          results.push({ userId: approver.id, error: error.message });
        }
      }
      
      // Also send a notification to the requester confirming submission
      try {
        const requester = await User.findOne({
          where: {
            [Op.or]: [
              { id: approvalRequest.requestedBy },
              { username: approvalRequest.requestedBy }
            ]
          }
        });
        
        if (requester) {
          await this.sendNotificationToUser(requester, {
            itemType,
            itemId: approvalRequest.id,
            itemName,
            description: `Your ${itemType} request has been submitted and is awaiting approval`,
            submittedBy: 'System',
            BU_ID,
            priority: 'low',
            metadata: {
              requestId: approvalRequest.id,
              status: 'PENDING',
              approversNotified: nextApprovers.length
            }
          });
          console.log(`✅ Confirmation notification sent to requester: ${requester.user_name || requester.username}`);
        }
      } catch (error) {
        console.error('❌ Failed to send requester notification:', error.message);
      }
      
      return {
        success: true,
        message: `Notified ${results.length} approvers for request ${approvalRequest.id}`,
        approversNotified: results.length,
        results
      };
      
    } catch (error) {
      console.error('❌ Error in notifyApprovers:', error.message);
      return {
        success: false,
        error: error.message,
        requestId: approvalRequest?.id
      };
    }
  }

  /**
   * Alias for notifyApprovers for backward compatibility
   */
  async notifyApproversForRequest(approvalRequest, workflowConfig) {
    return this.notifyApprovers(approvalRequest, workflowConfig);
  }

  /**
   * Send notification to submitter confirming
   */
  async sendSubmitterNotification({ itemType, itemId, itemName, submittedBy, BU_ID, usersCount }) {
    try {
      const [submitter] = await sequelize.query(
        `SELECT id, user_name, username, email
         FROM users 
         WHERE id = :submittedBy OR user_name = :submittedBy
         LIMIT 1`,
        {
          replacements: { submittedBy: submittedBy },
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      if (!submitter) {
        console.log(`⚠️ Submitter not found: ${submittedBy}`);
        return null;
      }
      
      const notification = await Notification.create({
        recipient_id: submitter.id,
        ROLE_ID: 'User',
        message: `✅ Your ${itemType} (${itemName}) has been submitted for approval. ${usersCount} user(s) in BU ${BU_ID} have been notified.`,
        WORK_ITEM_ID: String(itemId || 'N/A'),
        EVENT_ID: `system_${Date.now()}`,
        status: 'sent',
        notification_type: 'system',
        priority: 'low',
        recipient_name: submitter.user_name || submitter.username,
        metadata: {
          itemType,
          itemId,
          itemName,
          BU_ID,
          usersCount,
          status: 'submitted_for_approval'
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      console.log(`✅ Submitter confirmation notification created: ${notification.id}`);
      return notification;
      
    } catch (error) {
      console.error('❌ Failed to send submitter notification:', error.message);
      return null;
    }
  }

  /**
   * Send submitter error notification
   */
  async sendSubmitterErrorNotification({ itemType, itemId, itemName, submittedBy, BU_ID }) {
    try {
      const [submitter] = await sequelize.query(
        `SELECT id, user_name, username, email
         FROM users 
         WHERE id = :submittedBy OR user_name = :submittedBy
         LIMIT 1`,
        {
          replacements: { submittedBy: submittedBy },
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      if (!submitter) {
        console.log(`⚠️ Submitter not found: ${submittedBy}`);
        return null;
      }
      
      const notification = await Notification.create({
        recipient_id: submitter.id,
        ROLE_ID: 'User',
        message: `⚠️ Your ${itemType} (${itemName}) was submitted but no users are assigned to BU ${BU_ID}. Please contact your administrator.`,
        WORK_ITEM_ID: String(itemId || 'N/A'),
        EVENT_ID: `system_${Date.now()}`,
        status: 'sent',
        notification_type: 'system',
        priority: 'medium',
        recipient_name: submitter.user_name || submitter.username,
        metadata: {
          itemType,
          itemId,
          itemName,
          BU_ID,
          note: 'No users found for this BU'
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      
      console.log(`✅ Submitter error notification created: ${notification.id}`);
      return notification;
      
    } catch (error) {
      console.error('❌ Failed to send submitter error notification:', error.message);
      return null;
    }
  }

  /**
   * Send notification to a single user
   */
  async sendNotificationToUser(user, data) {
    const { itemType, itemId, itemName, description, submittedBy, BU_ID, metadata, priority, isCC = false } = data;
    
    try {
      const userId = user.id;
      const userName = user.user_name || user.username || 'User';
      const email = user.email || null;
      const roleId = user.BU_ROLE_ID || user.primary_business_role || 'User';

      if (!userId) {
        throw new Error('User has no ID');
      }

      const notificationType = isCC ? 'email_cc' : 'email';
      const status = isCC ? 'sent' : 'pending';

      console.log(`📝 Creating notification for: ${userName} (ID: ${userId}) - ${isCC ? 'CC' : 'Primary'}`);
      console.log(`📋 User BU: ${user.BU_ID || user.main_business_unit || user.responsibility_centre}, Role: ${roleId}`);

      const notification = await Notification.create({
        recipient_id: userId,
        ROLE_ID: roleId || 'User',
        message: this.buildNotificationMessage(itemType, itemName, description, submittedBy),
        WORK_ITEM_ID: String(itemId || 'N/A'),
        EVENT_ID: `approval_${itemType}_${Date.now()}`,
        status: status,
        notification_type: notificationType,
        recipient_name: userName,
        priority: priority || 'medium',
        metadata: {
          itemType,
          itemId,
          itemName,
          description,
          submittedBy,
          BU_ID,
          submittedAt: new Date().toISOString(),
          isCC: isCC,
          ...metadata,
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      console.log(`✅ Notification created for ${userName}: ${notification.id}`);

      let emailSent = false;
      if (email && this.emailTransporter && !isCC) {
        emailSent = await this.sendEmailNotification(user, {
          itemType, itemId, itemName, description, submittedBy, BU_ID, metadata, notificationId: notification.id
        });
      }

      if (emailSent) {
        await notification.update({
          status: 'sent',
          sent_at: new Date(),
        });
      }

      // Create in-app notification
      await this.createInAppNotification(user, {
        itemType, itemId, itemName, description, submittedBy, BU_ID, priority: priority || 'medium'
      });

      return {
        userId: userId,
        userName: userName,
        email: email,
        notificationId: notification.id,
        emailSent,
        status: notification.status,
        isCC: isCC,
      };

    } catch (error) {
      console.error(`❌ Error sending notification to user ${user.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Send email notification to user
   */
  async sendEmailNotification(user, data) {
    try {
      if (!this.emailTransporter) {
        console.warn('⚠️ Email transporter not configured');
        return false;
      }

      const appName = this.emailConfig.name || process.env.APP_NAME || 'Evolution Banking';
      const fromEmail = this.emailConfig.from || this.emailConfig.auth.user;
      const userName = user.user_name || user.username || 'User';

      const emailContent = this.buildEmailTemplate(user, data, appName);

      const mailOptions = {
        from: `"${appName} Notifications" <${fromEmail}>`,
        to: user.email,
        subject: `🔔 ${appName} - New ${this.formatItemType(data.itemType)} Approval Request`,
        html: emailContent.html,
        text: emailContent.text,
      };

      const info = await this.emailTransporter.sendMail(mailOptions);
      console.log(`✅ Approval notification email sent to ${user.email}:`, info.messageId);

      return true;
    } catch (error) {
      logger.error(`❌ Failed to send email to ${user.email}:`, error);
      return false;
    }
  }

  /**
   * Create in-app (bell) notification
   */
  async createInAppNotification(user, data) {
    try {
      const userId = user.id || user.user_id;
      
      if (!userId) {
        console.warn(`⚠️ Skipping in-app notification - no user ID:`, user);
        return null;
      }
      
      const userName = user.user_name || user.username || 'User';
      const roleId = user.BU_ROLE_ID || user.primary_business_role || 'User';

      console.log(`📝 Creating in-app notification for: ${userName} (ID: ${userId})`);

      const notification = await Notification.create({
        recipient_id: userId,
        ROLE_ID: roleId || 'User',
        message: this.buildInAppMessage(data.itemType, data.itemName, data.submittedBy),
        WORK_ITEM_ID: String(data.itemId || 'N/A'),
        EVENT_ID: `inapp_${data.itemType}_${Date.now()}`,
        status: 'pending',
        notification_type: 'in_app',
        recipient_name: userName,
        priority: data.priority || 'medium',
        metadata: {
          itemType: data.itemType,
          itemId: data.itemId,
          itemName: data.itemName,
          description: data.description,
          submittedBy: data.submittedBy,
          BU_ID: data.BU_ID,
          submittedAt: new Date().toISOString(),
          ...data.metadata,
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      console.log(`✅ In-app notification created for ${userName}: ${notification.id}`);
      return notification;
    } catch (error) {
      console.error('❌ Error creating in-app notification:', error.message);
      return null;
    }
  }

  /**
   * Build notification message
   */
  buildNotificationMessage(itemType, itemName, description, submittedBy) {
    const typeMap = {
      'customer_creation': 'Customer Creation',
      'account_opening': 'Account Opening',
      'transaction': 'Transaction',
      'loan_application': 'Loan Application',
      'customer_update': 'Customer Update',
      'account_update': 'Account Update',
      'kyc_update': 'KYC Update',
      'cheque_request': 'Cheque Request',
      'transfer': 'Transfer',
      'deposit': 'Deposit',
      'withdrawal': 'Withdrawal',
      'customer_approved': 'Customer Approved',
      'customer_rejected': 'Customer Rejected',
      'Card Issuance': 'Card Issuance',
      'Card Reissuance': 'Card Reissuance',
    };

    const typeLabel = typeMap[itemType] || itemType;
    return `${typeLabel} #${itemName}: ${description} submitted by ${submittedBy}. Requires your approval.`;
  }

  /**
   * Build in-app message
   */
  buildInAppMessage(itemType, itemName, submittedBy) {
    const typeMap = {
      'customer_creation': 'New Customer',
      'account_opening': 'New Account',
      'transaction': 'Transaction',
      'loan_application': 'Loan Application',
      'customer_update': 'Customer Update',
      'account_update': 'Account Update',
      'kyc_update': 'KYC Update',
      'cheque_request': 'Cheque Request',
      'transfer': 'Transfer',
      'deposit': 'Deposit',
      'withdrawal': 'Withdrawal',
      'customer_approved': 'Customer Approved',
      'customer_rejected': 'Customer Rejected',
      'Card Issuance': 'Card Issuance',
      'Card Reissuance': 'Card Reissuance',
    };

    const typeLabel = typeMap[itemType] || itemType;
    return `📋 ${typeLabel}: "${itemName}" requires your approval. Submitted by ${submittedBy}`;
  }

  /**
   * Format item type for display
   */
  formatItemType(itemType) {
    const formatMap = {
      'customer_creation': 'Customer Creation',
      'account_opening': 'Account Opening',
      'transaction': 'Transaction',
      'loan_application': 'Loan Application',
      'customer_update': 'Customer Update',
      'account_update': 'Account Update',
      'kyc_update': 'KYC Update',
      'cheque_request': 'Cheque Request',
      'transfer': 'Transfer',
      'deposit': 'Deposit',
      'withdrawal': 'Withdrawal',
      'customer_approved': 'Customer Approved',
      'customer_rejected': 'Customer Rejected',
      'Card Issuance': 'Card Issuance',
      'Card Reissuance': 'Card Reissuance',
    };
    return formatMap[itemType] || itemType;
  }

  /**
   * Build email template
   */
  buildEmailTemplate(user, data, appName) {
    const typeLabel = this.formatItemType(data.itemType);
    const approvalUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/approvals/${data.itemType}/${data.itemId}`;
    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;
    const userName = user.user_name || user.username || 'User';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Approval Request</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
            .header { text-align: center; border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 25px; }
            .header h1 { color: #667eea; font-size: 28px; margin: 0; }
            .greeting { font-size: 16px; color: #333; margin-bottom: 20px; }
            .card { background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; }
            .card .label { font-size: 13px; color: #888; text-transform: uppercase; }
            .card .value { font-size: 16px; color: #333; font-weight: 500; margin-top: 2px; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
            .detail-item { background: #f8f9fa; padding: 12px 16px; border-radius: 8px; }
            .detail-item .label { font-size: 11px; color: #888; text-transform: uppercase; }
            .detail-item .value { font-size: 14px; color: #333; font-weight: 500; margin-top: 2px; }
            .button-container { text-align: center; margin: 30px 0; }
            .button { display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; }
            .button-secondary { display: inline-block; padding: 12px 30px; background: #ffffff; color: #667eea !important; text-decoration: none; border-radius: 8px; font-weight: 500; border: 2px solid #667eea; margin-left: 10px; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
            .priority-high { background: #fee2e2; color: #dc2626; }
            .priority-medium { background: #fef3c7; color: #d97706; }
            .priority-low { background: #dbeafe; color: #2563eb; }
            @media (max-width: 480px) { .details-grid { grid-template-columns: 1fr; } }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>🔐 ${appName}</h1></div>
            <div class="greeting">Hello <strong>${userName}</strong>,</div>
            <p style="color: #555;">A new ${typeLabel.toLowerCase()} has been submitted and requires your approval.</p>
            <div class="card">
              <div style="display: flex; justify-content: space-between;">
                <div><div class="label">Item Type</div><div class="value">${typeLabel}</div></div>
                <span class="priority-${data.priority || 'medium'}">${data.priority || 'Medium'}</span>
              </div>
              <div style="margin-top: 10px;"><div class="label">Reference ID</div><div class="value">#${data.itemId}</div></div>
            </div>
            <div class="details-grid">
              <div class="detail-item"><div class="label">Item Name</div><div class="value">${data.itemName}</div></div>
              <div class="detail-item"><div class="label">Submitted By</div><div class="value">${data.submittedBy}</div></div>
              <div class="detail-item"><div class="label">Branch</div><div class="value">${data.BU_ID}</div></div>
              <div class="detail-item"><div class="label">Submitted At</div><div class="value">${new Date().toLocaleString()}</div></div>
            </div>
            <div class="button-container">
              <a href="${approvalUrl}" class="button">📋 Review & Approve</a>
              <a href="${dashboardUrl}" class="button-secondary">📊 Go to Dashboard</a>
            </div>
            <div class="footer"><p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p></div>
          </div>
        </body>
      </html>
    `;

    const text = `
${appName} - Approval Request

Hello ${userName},

A new ${typeLabel.toLowerCase()} has been submitted and requires your approval.

Item Type: ${typeLabel}
Reference ID: #${data.itemId}
Item Name: ${data.itemName}
Submitted By: ${data.submittedBy}
Branch: ${data.BU_ID}
Submitted At: ${new Date().toLocaleString()}
Priority: ${data.priority || 'Medium'}

Please review and approve this request at:
${approvalUrl}

View all pending approvals on your dashboard:
${dashboardUrl}

---
${appName} - Secure Banking
This is an automated notification, please do not reply.
    `;

    return { html, text };
  }

  /**
   * Get pending notifications for a user
   */
  async getUserPendingNotifications(userId, roleId) {
    try {
      console.log(`🔍 Fetching pending notifications for userId: ${userId}, roleId: ${roleId}`);
      
      const notifications = await Notification.findAll({
        where: {
          [Op.or]: [
            { recipient_id: userId },
            { ROLE_ID: roleId }
          ],
          status: { [Op.in]: ['pending', 'sent', 'viewed'] },
        },
        order: [['created_at', 'DESC']],
        limit: 100,
      });

      const inAppNotifications = await Notification.findAll({
        where: {
          recipient_id: userId,
          notification_type: 'in_app',
          status: { [Op.in]: ['pending', 'sent'] },
        },
        order: [['created_at', 'DESC']],
        limit: 50,
      });

      const allNotifications = [...notifications, ...inAppNotifications];
      
      const uniqueNotifications = Array.from(
        new Map(allNotifications.map(n => [n.id, n])).values()
      );

      uniqueNotifications.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );

      const unreadCount = uniqueNotifications.filter(n => 
        n.status === 'pending' || n.status === 'sent'
      ).length;

      console.log(`✅ Found ${uniqueNotifications.length} notifications (${unreadCount} unread)`);

      return {
        success: true,
        notifications: uniqueNotifications,
        unreadCount: unreadCount,
        total: uniqueNotifications.length,
      };
    } catch (error) {
      logger.error('Error fetching user notifications:', error);
      return {
        success: false,
        error: error.message,
        notifications: [],
        unreadCount: 0,
        total: 0,
      };
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId) {
    try {
      const notification = await Notification.findByPk(notificationId);
      if (!notification) {
        return { success: false, error: 'Notification not found' };
      }

      notification.status = 'viewed';
      notification.viewed_at = new Date();
      await notification.save();
      
      return { success: true, notification };
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get branch-specific pending approvals summary
   */
  async getBranchPendingApprovalsSummary(BU_ID) {
    try {
      const pendingNotifications = await Notification.findAll({
        where: {
          status: { [Op.in]: ['pending', 'sent'] },
          notification_type: ['email', 'in_app'],
        },
        order: [['created_at', 'DESC']],
      });

      const branchNotifications = pendingNotifications.filter(n => {
        const metadata = n.metadata || {};
        return metadata.BU_ID === BU_ID || metadata.BU_ID === parseInt(BU_ID);
      });

      const grouped = {};
      branchNotifications.forEach(n => {
        const metadata = n.metadata || {};
        const type = metadata.itemType || 'unknown';
        if (!grouped[type]) {
          grouped[type] = [];
        }
        grouped[type].push(n);
      });

      return {
        success: true,
        BU_ID,
        total: branchNotifications.length,
        byType: grouped,
        notifications: branchNotifications,
      };
    } catch (error) {
      logger.error('Error getting branch pending approvals:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send failure notification
   */
  async sendFailureNotification(data) {
    try {
      console.log('📨 Sending failure notification:', data);
      
      const userId = data.userId || data.recipientId || 1;
      
      const notification = await Notification.create({
        recipient_id: userId,
        ROLE_ID: data.roleId || 'Admin',
        message: data.message || 'Operation failed',
        WORK_ITEM_ID: data.itemId || 'N/A',
        EVENT_ID: `failure_${Date.now()}`,
        status: 'sent',
        notification_type: 'system',
        priority: 'high',
        metadata: data.metadata || {},
        recipient_name: data.recipientName || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      console.log(`✅ Failure notification created: ${notification.id}`);
      return { success: true, notification };
    } catch (error) {
      console.error('❌ Error sending failure notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send error notification
   */
  async sendErrorNotification(data) {
    try {
      console.log('📨 Sending error notification:', data);
      
      const userId = data.userId || data.recipientId || 1;
      
      const notification = await Notification.create({
        recipient_id: userId,
        ROLE_ID: data.roleId || 'Admin',
        message: data.message || 'Error occurred',
        WORK_ITEM_ID: data.itemId || 'N/A',
        EVENT_ID: `error_${Date.now()}`,
        status: 'sent',
        notification_type: 'system',
        priority: 'urgent',
        metadata: {
          error: data.error,
          stack: data.stack,
          ...data.metadata
        },
        recipient_name: data.recipientName || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      console.log(`✅ Error notification created: ${notification.id}`);
      return { success: true, notification };
    } catch (error) {
      console.error('❌ Error sending error notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send success notification
   */
  async sendSuccessNotification(data) {
    try {
      console.log('📨 Sending success notification:', data);
      
      const userId = data.userId || data.recipientId || 1;
      
      const notification = await Notification.create({
        recipient_id: userId,
        ROLE_ID: data.roleId || 'Admin',
        message: data.message || 'Operation completed successfully',
        WORK_ITEM_ID: data.itemId || 'N/A',
        EVENT_ID: `success_${Date.now()}`,
        status: 'sent',
        notification_type: 'system',
        priority: 'low',
        metadata: data.metadata || {},
        recipient_name: data.recipientName || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      console.log(`✅ Success notification created: ${notification.id}`);
      return { success: true, notification };
    } catch (error) {
      console.error('❌ Error sending success notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send general notification
   */
  async sendNotification(data) {
    try {
      console.log('📨 Sending notification:', data);
      
      const userId = data.userId || data.recipientId || 1;
      
      const notification = await Notification.create({
        recipient_id: userId,
        ROLE_ID: data.roleId || 'Admin',
        message: data.message || 'Notification',
        WORK_ITEM_ID: data.itemId || 'N/A',
        EVENT_ID: `notification_${Date.now()}`,
        status: 'sent',
        notification_type: data.notificationType || 'system',
        priority: data.priority || 'medium',
        metadata: data.metadata || {},
        recipient_name: data.recipientName || null,
        expires_at: data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      console.log(`✅ Notification created: ${notification.id}`);
      return { success: true, notification };
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const notificationService = new NotificationService();

// Named exports
export default notificationService;
export const sendFailureNotification = (data) => notificationService.sendFailureNotification(data);
export const sendErrorNotification = (data) => notificationService.sendErrorNotification(data);
export const sendSuccessNotification = (data) => notificationService.sendSuccessNotification(data);
export const sendNotification = (data) => notificationService.sendNotification(data);
export const sendApprovalNotification = (data) => notificationService.sendApprovalNotification(data);
export const createInAppNotification = (data) => notificationService.createInAppNotification(data);
export const getUserPendingNotifications = (userId, roleId) => notificationService.getUserPendingNotifications(userId, roleId);
export const markNotificationAsRead = (notificationId) => notificationService.markNotificationAsRead(notificationId);
export const getBranchPendingApprovalsSummary = (BU_ID) => notificationService.getBranchPendingApprovalsSummary(BU_ID);
export const notifyApprovers = (approvalRequest, workflowConfig) => 
  notificationService.notifyApprovers(approvalRequest, workflowConfig);
export const notifyApproversForRequest = (approvalRequest, workflowConfig) => 
  notificationService.notifyApproversForRequest(approvalRequest, workflowConfig);