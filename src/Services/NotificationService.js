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

// Services/NotificationService.js - Updated functions

/**
 * Get users for a specific BU_ID
 * ✅ Enhanced: Checks users table AND user_roles table
 * ✅ Fixed: Always returns an array
 */
async getUsersForBU(BU_ID) {
  try {
    console.log(`🔍 Fetching users for BU: ${BU_ID}`);
    
    // First, try to find the business unit name from the business_units table
    let buName = null;
    try {
      const [buResult] = await sequelize.query(
        `SELECT BU_ID, BUSINESS_UNIT FROM business_units 
         WHERE BU_ID = :BU_ID OR BUSINESS_UNIT = :BU_ID`,
        {
          replacements: { BU_ID: BU_ID },
          type: sequelize.QueryTypes.SELECT
        }
      );
      if (buResult) {
        buName = buResult.BUSINESS_UNIT;
        console.log(`📋 Found BU name: "${buName}" for BU_ID: ${BU_ID}`);
      }
    } catch (err) {
      console.log('⚠️ Could not fetch BU name:', err.message);
    }
    
    // Build search values from multiple sources
    const searchValues = [
      BU_ID,
      String(BU_ID),
      parseInt(BU_ID),
      BU_ID.toString().padStart(3, '0'),
    ];
    
    // Add business unit name if found
    if (buName) {
      searchValues.push(buName);
      searchValues.push(buName.toUpperCase());
      searchValues.push(buName.toLowerCase());
      if (buName.includes(' ')) {
        searchValues.push(buName.replace(/ /g, ''));
        searchValues.push(buName.replace(/ /g, '_'));
      }
    }
    
    // Remove duplicates and invalid values
    const uniqueSearchValues = [...new Set(searchValues.filter(v => 
      v !== undefined && v !== null && v !== 'undefined' && v !== '' && v !== 'null'
    ))];
    
    console.log(`📋 Searching for users with values:`, uniqueSearchValues);
    
    // ✅ FIX: Use the correct column names - try both uppercase and lowercase
    const userResults = await sequelize.query(
      `SELECT id, user_name, username, email, BU_ID, BU_ROLE_ID, primary_business_role, 
              preferred_name, is_supervisor, main_business_unit, responsibility_centre, businessUnit,
              bu_id AS bu_id_lower, business_unit AS business_unit
       FROM users 
       WHERE is_active = 'Active'
       AND (
         BU_ID IN (:searchValues)
         OR bu_id IN (:searchValues)
         OR main_business_unit IN (:searchValues)
         OR responsibility_centre IN (:searchValues)
         OR businessUnit IN (:searchValues)
         OR business_unit IN (:searchValues)
       )
       LIMIT 50`,
      {
        replacements: { searchValues: uniqueSearchValues },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    // Ensure userResults is an array
    const userArray = Array.isArray(userResults) ? userResults : [];
    
    if (userArray.length > 0) {
      console.log(`✅ Found ${userArray.length} users for BU: ${BU_ID}`);
      userArray.forEach(u => {
        console.log(`  - ${u.user_name} (${u.primary_business_role || u.BU_ROLE_ID || 'N/A'}) - BU: ${u.BU_ID || u.bu_id_lower || u.main_business_unit || u.responsibility_centre || 'N/A'}`);
      });
      return userArray;
    }
    
    // ============================================================
    // STRATEGY 2: If no users found, try to find by role (managers)
    // ============================================================
    console.log(`⚠️ No users found with matching fields, looking for managers with similar roles...`);
    
    const managers = await sequelize.query(
      `SELECT DISTINCT u.id, u.user_name, u.username, u.email, u.BU_ID, u.BU_ROLE_ID, u.primary_business_role, 
              u.preferred_name, u.is_supervisor, u.main_business_unit, u.responsibility_centre, u.businessUnit,
              u.bu_id AS bu_id_lower
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.is_active = 'Active'
       AND (u.BU_ROLE_ID IN ('19', '20', '17', '30', '31', '32', '6', '13', '21', '14')
            OR u.primary_business_role IN ('Branch Manager', 'Supervisor', 'Manager', 'Head Teller', 'Team Lead')
            OR u.is_supervisor = 1
            OR ur.ROLE_NM IN ('Branch Manager', 'Supervisor', 'Manager', 'Team Lead'))
       LIMIT 10`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const managersArray = Array.isArray(managers) ? managers : [];
    
    if (managersArray.length > 0) {
      console.log(`✅ Found ${managersArray.length} managers system-wide as fallback`);
      managersArray.forEach(u => {
        console.log(`  - ${u.user_name} (${u.primary_business_role || u.BU_ROLE_ID || 'N/A'}) - BU: ${u.BU_ID || u.bu_id_lower || u.main_business_unit || u.responsibility_centre || 'N/A'}`);
      });
      return managersArray;
    }
    
    // ============================================================
    // STRATEGY 3: Check if there are ANY users with BU_ID = 101 directly
    // ============================================================
    console.log(`🔍 Looking for ANY users with BU_ID = ${BU_ID} in users table...`);
    
    const directUsers = await sequelize.query(
      `SELECT id, user_name, username, email, BU_ID, BU_ROLE_ID, primary_business_role, 
              preferred_name, is_supervisor, main_business_unit, responsibility_centre, businessUnit
       FROM users 
       WHERE is_active = 'Active'
       AND (BU_ID = :BU_ID OR bu_id = :BU_ID OR businessUnit = :BU_ID OR main_business_unit = :BU_ID)
       LIMIT 20`,
      {
        replacements: { BU_ID: String(BU_ID) },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const directUsersArray = Array.isArray(directUsers) ? directUsers : [];
    
    if (directUsersArray.length > 0) {
      console.log(`✅ Found ${directUsersArray.length} users with direct BU_ID match`);
      directUsersArray.forEach(u => {
        console.log(`  - ${u.user_name} (${u.primary_business_role || u.BU_ROLE_ID || 'N/A'}) - BU: ${u.BU_ID || 'N/A'}`);
      });
      return directUsersArray;
    }
    
    // ============================================================
    // STRATEGY 4: Ultimate fallback - Check user_roles table
    // ============================================================
    console.log(`🔍 Looking for users in user_roles table with BU_ID = ${BU_ID}...`);
    
    const roleUsers = await sequelize.query(
      `SELECT DISTINCT u.id, u.user_name, u.username, u.email, u.BU_ID, u.BU_ROLE_ID, 
              u.primary_business_role, u.preferred_name, u.is_supervisor, 
              u.main_business_unit, u.responsibility_centre, u.businessUnit
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.is_active = 'Active'
       AND (ur.BU_ID = :BU_ID OR ur.BU_ID = :BU_ID)
       LIMIT 20`,
      {
        replacements: { BU_ID: String(BU_ID) },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const roleUsersArray = Array.isArray(roleUsers) ? roleUsers : [];
    
    if (roleUsersArray.length > 0) {
      console.log(`✅ Found ${roleUsersArray.length} users in user_roles table with BU_ID match`);
      roleUsersArray.forEach(u => {
        console.log(`  - ${u.user_name} (${u.primary_business_role || u.BU_ROLE_ID || 'N/A'})`);
      });
      return roleUsersArray;
    }
    
    // ============================================================
    // STRATEGY 5: Last resort - Check if there are ANY users at all
    // ============================================================
    console.log(`⚠️ No users found for BU ${BU_ID}, checking if any users exist in system...`);
    
    const anyUsers = await sequelize.query(
      `SELECT id, user_name, username, email, BU_ID, BU_ROLE_ID, primary_business_role, 
              preferred_name, is_supervisor, main_business_unit, responsibility_centre, businessUnit
       FROM users 
       WHERE is_active = 'Active'
       LIMIT 5`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    const anyUsersArray = Array.isArray(anyUsers) ? anyUsers : [];
    
    if (anyUsersArray.length > 0) {
      console.log(`✅ Found ${anyUsersArray.length} active users in system. Returning first ${anyUsersArray.length} as fallback.`);
      anyUsersArray.forEach(u => {
        console.log(`  - ${u.user_name} (${u.primary_business_role || u.BU_ROLE_ID || 'N/A'}) - BU: ${u.BU_ID || 'N/A'}`);
      });
      return anyUsersArray;
    }
    
    console.log(`❌ No users found at all for BU: ${BU_ID}`);
    return [];

  } catch (error) {
    console.error('❌ Error fetching users for BU:', error);
    console.error('❌ Error details:', error.stack);
    return [];
  }
}

/**
 * Get approving officers (managers/supervisors) for a specific BU
 * ✅ Enhanced: Checks both users table AND user_roles table
 */
async getApprovingOfficers(BU_ID) {
  try {
    console.log(`🔍 Fetching approving officers for BU: ${BU_ID}`);
    
    // Manager role IDs
    const managerRoleIds = ['19', '20', '17', '30', '31', '32', '6', '13', '21', '14'];
    const managerRoleNames = [
      'Branch Manager', 'Supervisor', 'Manager', 'Head Teller', 'Team Lead',
      'Internal Control Manager', 'Financial Accountant Manager', 'Chief Operation Officer',
      'Chief Financial Officer'
    ];
    
    // Try multiple field matches
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
    
    // ✅ FIX: Use correct column names and search multiple fields
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
    
    const userArray = Array.isArray(userResults) ? userResults : [];
    
    if (userArray.length > 0) {
      console.log(`✅ Found ${userArray.length} approving officers for BU: ${BU_ID}`);
      userArray.forEach(u => {
        console.log(`  - ${u.user_name} (${u.primary_business_role || u.BU_ROLE_ID || 'N/A'}) - BU: ${u.BU_ID || u.bu_id_lower || u.main_business_unit || u.responsibility_centre || 'N/A'}`);
      });
      return userArray;
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
   * Get approving officers (managers/supervisors) for a specific BU
   * ✅ Enhanced: Checks both users table AND user_roles table
   */
  async getApprovingOfficers(BU_ID) {
    try {
      console.log(`🔍 Fetching approving officers for BU: ${BU_ID}`);
      
      // Manager role IDs
      const managerRoleIds = ['19', '20', '17', '30', '31', '32', '6', '13', '21', '14'];
      const managerRoleNames = [
        'Branch Manager', 'Supervisor', 'Manager', 'Head Teller', 'Team Lead',
        'Internal Control Manager', 'Financial Accountant Manager', 'Chief Operation Officer',
        'Chief Financial Officer'
      ];
      
      // Try multiple field matches
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
      const [userResults] = await sequelize.query(
        `SELECT id, user_name, username, email, BU_ID, BU_ROLE_ID, primary_business_role, 
                preferred_name, is_supervisor, main_business_unit, responsibility_centre, businessUnit
         FROM users 
         WHERE is_active = 'Active'
         AND (
           BU_ROLE_ID IN (:roleIds)
           OR primary_business_role IN (:roleNames)
           OR is_supervisor = 1
         )
         AND (
           BU_ID IN (:searchValues)
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
      const [roleResults] = await sequelize.query(
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
      const allResults = [...userResults, ...roleResults];
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

      // ✅ Get ALL users for this BU (from both users and user_roles tables)
      const allUsers = await this.getUsersForBU(BU_ID);
      
      if (allUsers.length === 0) {
        console.log(`⚠️ No users found for BU_ID: ${BU_ID}`);
        
        // ============================================
        // 🔥 CRITICAL FIX: Send to ALL possible users
        // ============================================
        
        // 1. Try to find users from user_roles table specifically
        console.log(`🔍 Looking for users in user_roles table for BU: ${BU_ID}`);
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
        
        // 2. Also try to find users with businessUnit = BU_ID
        const [buUsers] = await sequelize.query(
          `SELECT id, user_name, username, email, BU_ID, BU_ROLE_ID, primary_business_role, 
                  preferred_name, is_supervisor, main_business_unit, responsibility_centre, businessUnit
           FROM users 
           WHERE is_active = 'Active'
           AND (businessUnit = :BU_ID OR main_business_unit = :BU_ID)
           LIMIT 50`,
          {
            replacements: { BU_ID: String(BU_ID) },
            type: sequelize.QueryTypes.SELECT
          }
        );
        
        // 3. Merge all found users
        const allFoundUsers = [...roleUsers, ...buUsers];
        const uniqueFoundUsers = Array.from(
          new Map(allFoundUsers.map(user => [user.id, user])).values()
        );
        
        // 4. Send notifications to ALL found users
        if (uniqueFoundUsers.length > 0) {
          console.log(`✅ Found ${uniqueFoundUsers.length} users for BU ${BU_ID} from roles/businessUnit`);
          
          for (const user of uniqueFoundUsers) {
            try {
              await this.sendNotificationToUser(user, {
                itemType, 
                itemId, 
                itemName, 
                description: `⚠️ No approving officers found for BU ${BU_ID}. ${itemName} needs attention. Please assign approving officers to this BU.`, 
                submittedBy, 
                BU_ID, 
                metadata: {
                  ...metadata,
                  isFallback: true,
                  note: `No approving officers found for BU ${BU_ID} - sent as fallback`,
                  error: 'NO_APPROVING_OFFICERS'
                }, 
                priority: 'high'
              });
              console.log(`✅ Fallback notification sent to ${user.user_name}`);
            } catch (error) {
              console.error(`❌ Failed to send to ${user.user_name}:`, error.message);
            }
          }
        } else {
          // 5. If still no users found, try to find any user with BU_ID = 101
          console.log(`⚠️ No users found in user_roles table, trying direct BU_ID match...`);
          const [directUsers] = await sequelize.query(
            `SELECT id, user_name, username, email, BU_ID, BU_ROLE_ID, primary_business_role, 
                    preferred_name, is_supervisor, main_business_unit, responsibility_centre, businessUnit
             FROM users 
             WHERE is_active = 'Active'
             AND BU_ID = :BU_ID
             LIMIT 50`,
            {
              replacements: { BU_ID: String(BU_ID) },
              type: sequelize.QueryTypes.SELECT
            }
          );
          
          if (directUsers.length > 0) {
            console.log(`✅ Found ${directUsers.length} users with direct BU_ID match`);
            for (const user of directUsers) {
              try {
                await this.sendNotificationToUser(user, {
                  itemType, 
                  itemId, 
                  itemName, 
                  description: `⚠️ No approving officers found for BU ${BU_ID}. ${itemName} needs attention.`, 
                  submittedBy, 
                  BU_ID, 
                  metadata: {
                    ...metadata,
                    isFallback: true,
                    note: `No approving officers found for BU ${BU_ID} - sent as fallback`,
                    error: 'NO_APPROVING_OFFICERS'
                  }, 
                  priority: 'high'
                });
                console.log(`✅ Fallback notification sent to ${user.user_name}`);
              } catch (error) {
                console.error(`❌ Failed to send to ${user.user_name}:`, error.message);
              }
            }
          }
        }
        
        // 6. Create admin notification as fallback
        const adminNotification = await this.createAdminFallbackNotification({
          itemType, itemId, itemName, description, submittedBy, BU_ID, metadata, priority
        });
        
        // 7. Notify the submitter
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
          fallbackUsersCount: uniqueFoundUsers.length || directUsers?.length || 0
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

  // Services/NotificationService.js - Fixed createInAppNotification

/**
 * Create in-app (bell) notification
 * ✅ FIXED: Ensure recipient_id is properly set
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

    // ✅ IMPORTANT: Create the notification with recipient_id = userId
    // This ensures it appears in the user's personal notification list
    const notification = await Notification.create({
      recipient_id: userId,  // ✅ Primary - user's personal ID
      ROLE_ID: roleId || 'User',  // Secondary - role-based notifications
      message: this.buildInAppMessage(data.itemType, data.itemName, data.submittedBy),
      WORK_ITEM_ID: String(data.itemId || 'N/A'),
      EVENT_ID: `inapp_${data.itemType}_${Date.now()}`,
      status: 'pending',  // Start as pending/unread
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

  // Services/NotificationService.js - Fixed getUserPendingNotifications

/**
 * Get pending notifications for a user
 * ✅ FIXED: Properly fetch notifications for the specific user
 */
async getUserPendingNotifications(userId, roleId) {
  try {
    console.log(`🔍 Fetching pending notifications for userId: ${userId}, roleId: ${roleId}`);
    
    // ✅ Get notifications where recipient_id matches userId OR ROLE_ID matches roleId
    // This ensures the user sees both personal and role-based notifications
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

    // Get in-app notifications specifically for this user
    const inAppNotifications = await Notification.findAll({
      where: {
        recipient_id: userId,
        notification_type: 'in_app',
        status: { [Op.in]: ['pending', 'sent'] },
      },
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    // Merge and deduplicate
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
    
    // Log a sample notification for debugging
    if (uniqueNotifications.length > 0) {
      console.log('📋 Sample notification:', {
        id: uniqueNotifications[0].id,
        recipient_id: uniqueNotifications[0].recipient_id,
        ROLE_ID: uniqueNotifications[0].ROLE_ID,
        message: uniqueNotifications[0].message?.substring(0, 50),
        status: uniqueNotifications[0].status
      });
    }

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

// Named exports for specific notification types
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