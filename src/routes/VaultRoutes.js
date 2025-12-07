import express from 'express';
import vaultController from '../controllers/VaultController.js';
import VaultConfigController from '../controllers/vaultConfigController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { checkPermissions, tempBypassPermissions } from '../constants/roleMapping.js';
import Vault from '../models/Vault.js';
import Drawer from '../models/Drawer.js';
import mongoose from 'mongoose';

const router = express.Router();

// =============================================
// PERMISSION MAPPINGS FOR VAULT MODULE
// =============================================

const VAULT_PERMISSIONS = {
  // Vault Management
  CREATE_VAULT: 'CREATE_VAULT',
  VIEW_VAULTS: 'VIEW_VAULTS',
  UPDATE_VAULT: 'UPDATE_VAULT',
  DEACTIVATE_VAULT: 'DEACTIVATE_VAULT',
  
  // Configuration Management
  CONFIGURE_VAULT: 'CONFIGURE_VAULT',
  VIEW_VAULT_CONFIG: 'VIEW_VAULT_CONFIG',
  
  // Access Control
  MANAGE_VAULT_ACCESS: 'MANAGE_VAULT_ACCESS',
  AUTHORIZE_PERSONNEL: 'AUTHORIZE_PERSONNEL',
  REVOKE_AUTHORIZATION: 'REVOKE_AUTHORIZATION',
  VIEW_AUTHORIZED_PERSONNEL: 'VIEW_AUTHORIZED_PERSONNEL',
  
  // Approval Workflows
  CREATE_APPROVAL_REQUEST: 'CREATE_APPROVAL_REQUEST',
  APPROVE_REQUEST: 'APPROVE_REQUEST',
  VIEW_PENDING_APPROVALS: 'VIEW_PENDING_APPROVALS',
  
  // Security & Maintenance
  LOG_ACCESS_ATTEMPT: 'LOG_ACCESS_ATTEMPT',
  RECORD_MAINTENANCE: 'RECORD_MAINTENANCE',
  UPDATE_SECURITY_FEATURES: 'UPDATE_SECURITY_FEATURES',
  VIEW_ACCESS_LOGS: 'VIEW_ACCESS_LOGS',
  
  // Reporting & Analytics
  VIEW_VAULT_UTILIZATION: 'VIEW_VAULT_UTILIZATION',
  VIEW_SECURITY_COMPLIANCE: 'VIEW_SECURITY_COMPLIANCE',
  VIEW_VAULT_STATISTICS: 'VIEW_VAULT_STATISTICS',
  VIEW_AUDIT_TRAIL: 'VIEW_AUDIT_TRAIL',
  
  // Operational
  OPEN_VAULT: 'OPEN_VAULT',
  CLOSE_VAULT: 'CLOSE_VAULT',
  VIEW_VAULT_STATUS: 'VIEW_VAULT_STATUS',
  
  // ✅ **ADDED: VIEW_BRANCH_VAULTS permission**
  VIEW_BRANCH_VAULTS: 'VIEW_BRANCH_VAULTS',
  
  // ✅ **EXISTING: Branch Operations**
  VIEW_BRANCH_SUMMARY: 'VIEW_BRANCH_SUMMARY',
  TRANSFER_BETWEEN_BRANCHES: 'TRANSFER_BETWEEN_BRANCHES',
  BULK_BRANCH_AUTHORIZE: 'BULK_BRANCH_AUTHORIZE',
  
  // ✅ **NEW: Additional Branch Vault Management Permissions**
  MANAGE_BRANCH_VAULTS: 'MANAGE_BRANCH_VAULTS',
  CONFIGURE_BRANCH_VAULT: 'CONFIGURE_BRANCH_VAULT',
  VIEW_BRANCH_VAULT_STATUS: 'VIEW_BRANCH_VAULT_STATUS',
  BRANCH_VAULT_ACCESS: 'BRANCH_VAULT_ACCESS',
  
  // ✅ **NEW: Financial Operations**
  VAULT_DEPOSIT: 'VAULT_DEPOSIT',
  VAULT_WITHDRAWAL: 'VAULT_WITHDRAWAL',
  VAULT_TRANSFER: 'VAULT_TRANSFER',
  VAULT_RECONCILIATION: 'VAULT_RECONCILIATION',
  
  // ✅ **NEW: Audit & Compliance**
  VAULT_AUDIT: 'CONDUCT_VAULT_AUDIT',
  VAULT_COMPLIANCE_CHECK: 'PERFORM_VAULT_COMPLIANCE_CHECK',
  GENERATE_VAULT_REPORT: 'GENERATE_VAULT_REPORT',
  
  // ✅ **NEW: Emergency Operations**
  EMERGENCY_VAULT_ACCESS: 'EMERGENCY_VAULT_ACCESS',
  VAULT_LOCKDOWN: 'INITIATE_VAULT_LOCKDOWN',
  VAULT_ALARM_CONTROL: 'CONTROL_VAULT_ALARM',
  
  // ✅ **NEW: Key Management**
  MANAGE_VAULT_KEYS: 'MANAGE_VAULT_KEYS',
  ISSUE_TEMP_ACCESS: 'ISSUE_TEMPORARY_ACCESS',
  TRACK_KEY_USAGE: 'TRACK_KEY_USAGE',
  
  // ✅ **NEW: Capacity Management**
  VIEW_VAULT_CAPACITY: 'VIEW_VAULT_CAPACITY',
  UPDATE_VAULT_CAPACITY: 'UPDATE_VAULT_CAPACITY',
  VAULT_SPACE_ALLOCATION: 'MANAGE_VAULT_SPACE_ALLOCATION',
  
  // ✅ **NEW: Inventory Management**
  VAULT_INVENTORY_VIEW: 'VIEW_VAULT_INVENTORY',
  VAULT_INVENTORY_UPDATE: 'UPDATE_VAULT_INVENTORY',
  TRACK_VAULT_CONTENTS: 'TRACK_VAULT_CONTENTS',
  
  // ✅ **NEW: Schedule Management**
  MANAGE_VAULT_SCHEDULE: 'MANAGE_VAULT_SCHEDULE',
  VIEW_VAULT_CALENDAR: 'VIEW_VAULT_CALENDAR',
  SET_VAULT_HOURS: 'SET_VAULT_OPERATING_HOURS',
  
  // ✅ **NEW: Multi-level Access**
  TIER1_VAULT_ACCESS: 'TIER1_VAULT_ACCESS',
  TIER2_VAULT_ACCESS: 'TIER2_VAULT_ACCESS',
  TIER3_VAULT_ACCESS: 'TIER3_VAULT_ACCESS',
  
  // ✅ **NEW: Notification & Alerts**
  VAULT_ALERTS: 'VIEW_VAULT_ALERTS',
  CONFIGURE_VAULT_ALERTS: 'CONFIGURE_VAULT_ALERTS',
  ACKNOWLEDGE_VAULT_ALERT: 'ACKNOWLEDGE_VAULT_ALERT',
  
  // ✅ **NEW: Documentation**
  VAULT_DOCUMENTATION: 'VIEW_VAULT_DOCUMENTATION',
  UPDATE_VAULT_DOCS: 'UPDATE_VAULT_DOCUMENTATION',
  VAULT_POLICIES: 'VIEW_VAULT_POLICIES',
  
  // ✅ **NEW: Training & Certification**
  VAULT_TRAINING: 'ACCESS_VAULT_TRAINING',
  CERTIFY_PERSONNEL: 'CERTIFY_VAULT_PERSONNEL',
  VIEW_CERTIFICATIONS: 'VIEW_VAULT_CERTIFICATIONS',

   // ✅ **NEW: Vault Transaction Permissions**
  VAULT_DEPOSIT: 'VAULT_DEPOSIT',
  VAULT_WITHDRAWAL: 'VAULT_WITHDRAWAL',
  VAULT_TRANSFER: 'VAULT_TRANSFER',
  VIEW_VAULT_TRANSACTIONS: 'VIEW_VAULT_TRANSACTIONS',
  CANCEL_VAULT_TRANSACTION: 'CANCEL_VAULT_TRANSACTION',
  EXPORT_VAULT_TRANSACTIONS: 'EXPORT_VAULT_TRANSACTIONS',
};

// =============================================
// VAULT MANAGEMENT ROUTES
// =============================================

/**
 * @route   POST /api/vaults
 * @desc    Create a new vault
 * @access  Branch Manager, Vault Manager
 * @permission CREATE_VAULT
 */
router.post(
  '/',
  [authenticate, checkPermissions('CREATE_VAULT')],
  vaultController.createVault
);

/**
 * @route   GET /api/vaults
 * @desc    Get all vaults with filtering and pagination
 * @access  All authorized personnel
 * @permission VIEW_VAULTS
 */
router.get(
  '/',
  [authenticate, checkPermissions('VIEW_VAULTS')],
  vaultController.getAllVaults
);

/**
 * @route   GET /api/vaults/statistics
 * @desc    Get vault statistics and analytics
 * @access  Branch Manager, Vault Manager, Supervisor
 * @permission VIEW_VAULT_STATISTICS
 */
router.get(
  '/statistics',
  [authenticate, checkPermissions('VIEW_VAULT_STATISTICS')],
  vaultController.getVaultStatistics
);

/**
 * @route   GET /api/vaults/:id
 * @desc    Get vault by ID, code, or vault ID
 * @access  All authorized personnel
 * @permission VIEW_VAULTS
 */
router.get(
  '/:id',
  [authenticate, checkPermissions('VIEW_VAULTS')],
  vaultController.getVaultById
);

/**
 * @route   PUT /api/vaults/:id
 * @desc    Update vault details
 * @access  Branch Manager, Vault Manager
 * @permission UPDATE_VAULT
 */
router.put(
  '/:id',
  [authenticate, checkPermissions('UPDATE_VAULT')],
  vaultController.updateVault
);

/**
 * @route   DELETE /api/vaults/:id
 * @desc    Deactivate vault
 * @access  Branch Manager, Vault Manager
 * @permission DEACTIVATE_VAULT
 */
router.delete(
  '/:id',
  [authenticate, checkPermissions('DEACTIVATE_VAULT')],
  vaultController.deactivateVault
);

// =============================================
// ✅ NEW: BRANCH-SPECIFIC VAULT ROUTES
// =============================================

// =============================================
// ✅ NEW: BRANCH-SPECIFIC VAULT ROUTES
// =============================================

/**
 * @route   GET /api/vaults/branch/:branchCode
 * @desc    Get all vaults for a specific branch (Business Unit)
 * @access  Branch Manager, Vault Manager, Regional Manager
 * @permission VIEW_BRANCH_VAULTS
 */
router.get(
  '/branch/:branchId',
  [authenticate, checkPermissions('VIEW_BRANCH_VAULTS')],
  async (req, res) => {
    try {
      const { branchId } = req.params;
      
      // Get vaults for the specified branch
      const vaults = await Vault.find({
        BRANCH_CODE: branchId,
        IS_ACTIVE: true
      })
      .populate('DRAWER_REF')
      .sort({ VAULT_CD: 1 });
      
      if (vaults.length === 0) {
        return res.json({
          success: true,
          message: `No active vaults found for branch ${branchId}`,
          data: [],
          count: 0
        });
      }
      
      res.json({
        success: true,
        data: vaults,
        count: vaults.length,
        branch: branchId
      });
      
    } catch (error) {
      console.error('Error fetching branch vaults:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch branch vaults',
        error: error.message
      });
    }
  }
);
/**
 * @route   GET /api/vaults/branch/:branchCode/summary
 * @desc    Get consolidated vault summary for a branch
 * @access  Branch Manager, Vault Manager, Regional Manager
 * @permission VIEW_BRANCH_SUMMARY
 */
router.get(
  '/branch/:branchCode/summary',
  [authenticate, checkPermissions('VIEW_BRANCH_SUMMARY')],
  vaultController.getBranchVaultSummary
);

/**
 * @route   POST /api/vaults/:vaultId/transfer-branch
 * @desc    Transfer vault to another branch
 * @access  Regional Manager, Head Office
 * @permission TRANSFER_BETWEEN_BRANCHES
 */
router.post(
  '/:vaultId/transfer-branch',
  [authenticate, checkPermissions('TRANSFER_BETWEEN_BRANCHES')],
  vaultController.transferVaultToBranch
);

// =============================================
// VAULT CONFIGURATION ROUTES
// =============================================

/**
 * @route   GET /api/vaults/:id/configuration
 * @desc    Get vault configuration
 * @access  Branch Manager, Vault Manager
 * @permission VIEW_VAULT_CONFIG
 */
router.get(
  '/:id/configuration',
  [authenticate, checkPermissions('VIEW_VAULT_CONFIG')],
  VaultConfigController.getVaultConfiguration
);

/**
 * @route   PUT /api/vaults/:id/configuration
 * @desc    Update vault configuration
 * @access  Branch Manager, Vault Manager
 * @permission CONFIGURE_VAULT
 */
router.put(
  '/:id/configuration',
  [authenticate, checkPermissions('CONFIGURE_VAULT')],
  VaultConfigController.setVaultConfiguration
);

/**
 * @route   GET /api/vaults/configurations/templates/:category
 * @desc    Get configuration template for vault category
 * @access  Branch Manager, Vault Manager
 * @permission VIEW_VAULT_CONFIG
 */
router.get(
  '/configurations/templates/:category',
  [authenticate, checkPermissions('VIEW_VAULT_CONFIG')],
  VaultConfigController.getConfigurationTemplate
);

/**
 * @route   PUT /api/vaults/configurations/category/:category
 * @desc    Set configuration for all vaults in a category
 * @access  Vault Manager
 * @permission CONFIGURE_VAULT
 */
router.put(
  '/configurations/category/:category',
  [authenticate, checkPermissions('CONFIGURE_VAULT')],
  VaultConfigController.setConfigurationByCategory
);

/**
 * @route   GET /api/vaults/configurations/defaults
 * @desc    Get all default configurations
 * @access  Branch Manager, Vault Manager
 * @permission VIEW_VAULT_CONFIG
 */
router.get(
  '/configurations/defaults',
  [authenticate, checkPermissions('VIEW_VAULT_CONFIG')],
  VaultConfigController.getDefaultConfigurations
);

// =============================================
// ACCESS CONTROL ROUTES
// =============================================

/**
 * @route   POST /api/vaults/:id/authorize
 * @desc    Authorize personnel for vault access
 * @access  Branch Manager, Vault Manager
 * @permission AUTHORIZE_PERSONNEL
 */
router.post(
  '/:id/authorize',
  [authenticate, checkPermissions('AUTHORIZE_PERSONNEL')],
  vaultController.authorizePersonnel
);

/**
 * @route   POST /api/vaults/:id/authorize/bulk
 * @desc    Bulk authorize multiple personnel
 * @access  Branch Manager, Vault Manager
 * @permission AUTHORIZE_PERSONNEL
 */
router.post(
  '/:id/authorize/bulk',
  [authenticate, checkPermissions('AUTHORIZE_PERSONNEL')],
  vaultController.bulkAuthorizePersonnel
);

/**
 * @route   DELETE /api/vaults/:id/authorize/:userId
 * @desc    Revoke personnel authorization
 * @access  Branch Manager, Vault Manager
 * @permission REVOKE_AUTHORIZATION
 */
router.delete(
  '/:id/authorize/:userId',
  [authenticate, checkPermissions('REVOKE_AUTHORIZATION')],
  vaultController.revokeAuthorization
);

/**
 * @route   GET /api/vaults/:id/personnel
 * @desc    Get authorized personnel for vault
 * @access  All authorized personnel
 * @permission VIEW_AUTHORIZED_PERSONNEL
 */
router.get(
  '/:id/personnel',
  [authenticate, checkPermissions('VIEW_AUTHORIZED_PERSONNEL')],
  vaultController.getAuthorizedPersonnel
);

// =============================================
// ✅ NEW: BULK BRANCH AUTHORIZATION
// =============================================

/**
 * @route   POST /api/vaults/branch/:branchCode/bulk-authorize
 * @desc    Bulk authorize personnel for all vaults in branch
 * @access  Branch Manager, Regional Manager
 * @permission BULK_BRANCH_AUTHORIZE
 */
router.post(
  '/branch/:branchCode/bulk-authorize',
  [authenticate, checkPermissions('BULK_BRANCH_AUTHORIZE')],
  async (req, res) => {
    const { branchCode } = req.params;
    const { 
      personnel_list, 
      authorized_by, 
      access_level = 'LIMITED',
      notes = 'Bulk authorization for branch vaults'
    } = req.body;
    
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      if (!personnel_list || !Array.isArray(personnel_list) || !authorized_by) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: personnel_list (array), authorized_by'
        });
      }
      
      // Get all vaults in the branch
      const vaults = await Vault.find({
        BRANCH_CODE: branchCode,
        IS_ACTIVE: true
      }).session(session);
      
      if (vaults.length === 0) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `No active vaults found for branch ${branchCode}`
        });
      }
      
      const results = {
        successful_vaults: [],
        failed_vaults: [],
        total_vaults_updated: 0
      };
      
      // Process each vault
      for (const vault of vaults) {
        const vaultResults = {
          vault_code: vault.VAULT_CD,
          vault_name: vault.VAULT_NM,
          authorized_count: 0,
          failed_authorizations: []
        };
        
        // Authorize personnel for this vault
        for (const person of personnel_list) {
          try {
            // Use the vault's authorizePersonnel method
            vault.authorizePersonnel(
              person.user_id,
              person.user_name,
              person.user_role,
              authorized_by,
              access_level,
              notes
            );
            vaultResults.authorized_count++;
          } catch (error) {
            vaultResults.failed_authorizations.push({
              user_id: person.user_id,
              error: error.message
            });
          }
        }
        
        // Save vault if any authorizations were successful
        if (vaultResults.authorized_count > 0) {
          await vault.save({ session });
          results.total_vaults_updated++;
        }
        
        if (vaultResults.failed_authorizations.length === 0) {
          results.successful_vaults.push(vault.VAULT_CD);
        } else {
          results.failed_vaults.push({
            vault_code: vault.VAULT_CD,
            failures: vaultResults.failed_authorizations
          });
        }
      }
      
      await session.commitTransaction();
      
      res.json({
        success: true,
        message: 'Bulk branch authorization completed',
        data: {
          branch_code: branchCode,
          results,
          summary: {
            total_vaults_processed: vaults.length,
            vaults_updated: results.total_vaults_updated,
            personnel_authorized: personnel_list.length * results.total_vaults_updated
          }
        }
      });
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Bulk branch authorize error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk authorize personnel for branch vaults',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  }
);

// =============================================
// APPROVAL WORKFLOW ROUTES
// =============================================

/**
 * @route   POST /api/vaults/:id/approvals
 * @desc    Create approval request
 * @access  All authorized personnel
 * @permission CREATE_APPROVAL_REQUEST
 */
router.post(
  '/:id/approvals',
  [authenticate, checkPermissions('CREATE_APPROVAL_REQUEST')],
  vaultController.createApprovalRequest
);

/**
 * @route   POST /api/vaults/:id/approvals/:approvalId/approve
 * @desc    Approve a pending request
 * @access  Role-based (see escalation hierarchy)
 * @permission APPROVE_REQUEST
 */
router.post(
  '/:id/approvals/:approvalId/approve',
  [authenticate, checkPermissions('APPROVE_REQUEST')],
  vaultController.approveRequest
);

/**
 * @route   GET /api/vaults/:id/approvals/pending
 * @desc    Get pending approvals for vault
 * @access  All authorized personnel
 * @permission VIEW_PENDING_APPROVALS
 */
router.get(
  '/:id/approvals/pending',
  [authenticate, checkPermissions('VIEW_PENDING_APPROVALS')],
  vaultController.getPendingApprovals
);

/**
 * @route   GET /api/vaults/approvals/pending
 * @desc    Get all pending approvals for user's role
 * @access  All authorized personnel
 * @permission VIEW_PENDING_APPROVALS
 */
router.get(
  '/approvals/pending',
  [authenticate, checkPermissions('VIEW_PENDING_APPROVALS')],
  (req, res, next) => {
    const userRole = req.user.role;
    req.query.role = userRole;
    next();
  },
  vaultController.getPendingApprovals
);

// =============================================
// SECURITY & MAINTENANCE ROUTES
// =============================================

/**
 * @route   POST /api/vaults/:id/access-log
 * @desc    Log access attempt
 * @access  System/internal use
 * @permission LOG_ACCESS_ATTEMPT
 */
router.post(
  '/:id/access-log',
  [authenticate, checkPermissions('LOG_ACCESS_ATTEMPT')],
  vaultController.logAccessAttempt
);

/**
 * @route   POST /api/vaults/:id/maintenance
 * @desc    Record maintenance activity
 * @access  Branch Manager, Vault Manager, Supervisor
 * @permission RECORD_MAINTENANCE
 */
router.post(
  '/:id/maintenance',
  [authenticate, checkPermissions('RECORD_MAINTENANCE')],
  vaultController.recordMaintenance
);

/**
 * @route   PUT /api/vaults/:id/security
 * @desc    Update security features
 * @access  Branch Manager, Vault Manager
 * @permission UPDATE_SECURITY_FEATURES
 */
router.put(
  '/:id/security',
  [authenticate, checkPermissions('UPDATE_SECURITY_FEATURES')],
  vaultController.updateSecurityFeatures
);

/**
 * @route   GET /api/vaults/:id/access-logs
 * @desc    Get access logs (with pagination)
 * @access  Branch Manager, Vault Manager, Auditor
 * @permission VIEW_ACCESS_LOGS
 */
router.get(
  '/:id/access-logs',
  [authenticate, checkPermissions('VIEW_ACCESS_LOGS')],
  async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 50, startDate, endDate } = req.query;
    
    try {
      const vault = await Vault.findOne({
        $or: [
          { _id: id },
          { VAULT_ID: parseInt(id) || 0 },
          { VAULT_CD: id }
        ]
      });
      
      if (!vault) {
        return res.status(404).json({
          success: false,
          message: 'Vault not found'
        });
      }
      
      let accessLogs = vault.ACCESS_ATTEMPTS || [];
      
      // Filter by date range if provided
      if (startDate) {
        const start = new Date(startDate);
        accessLogs = accessLogs.filter(log => new Date(log.attempt_time) >= start);
      }
      
      if (endDate) {
        const end = new Date(endDate);
        accessLogs = accessLogs.filter(log => new Date(log.attempt_time) <= end);
      }
      
      // Sort by most recent first
      accessLogs.sort((a, b) => new Date(b.attempt_time) - new Date(a.attempt_time));
      
      // Pagination
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedLogs = accessLogs.slice(startIndex, endIndex);
      
      res.json({
        success: true,
        data: {
          vault: vault.VAULT_CD,
          access_logs: paginatedLogs,
          pagination: {
            current_page: parseInt(page),
            total_pages: Math.ceil(accessLogs.length / limit),
            total_records: accessLogs.length,
            records_per_page: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get access logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch access logs',
        error: error.message
      });
    }
  }
);

// =============================================
// REPORTING & ANALYTICS ROUTES
// =============================================

/**
 * @route   GET /api/vaults/:id/utilization
 * @desc    Get vault utilization report
 * @access  All authorized personnel
 * @permission VIEW_VAULT_UTILIZATION
 */
router.get(
  '/:id/utilization',
  [authenticate, checkPermissions('VIEW_VAULT_UTILIZATION')],
  vaultController.getVaultUtilization
);

/**
 * @route   GET /api/vaults/:id/compliance
 * @desc    Get security compliance report
 * @access  Branch Manager, Vault Manager, Auditor
 * @permission VIEW_SECURITY_COMPLIANCE
 */
router.get(
  '/:id/compliance',
  [authenticate, checkPermissions('VIEW_SECURITY_COMPLIANCE')],
  vaultController.getSecurityCompliance
);

/**
 * @route   GET /api/vaults/:id/audit-trail
 * @desc    Get comprehensive audit trail
 * @access  Branch Manager, Vault Manager, Auditor
 * @permission VIEW_AUDIT_TRAIL
 */
router.get(
  '/:id/audit-trail',
  [authenticate, checkPermissions('VIEW_AUDIT_TRAIL')],
  async (req, res) => {
    const { id } = req.params;
    const { action_type, user_id, start_date, end_date, page = 1, limit = 50 } = req.query;
    
    try {
      const vault = await Vault.findOne({
        $or: [
          { _id: id },
          { VAULT_ID: parseInt(id) || 0 },
          { VAULT_CD: id }
        ]
      }).populate('DRAWER_REF');
      
      if (!vault) {
        return res.status(404).json({
          success: false,
          message: 'Vault not found'
        });
      }
      
      // Collect audit data from various sources
      const auditData = {
        vault_info: {
          code: vault.VAULT_CD,
          name: vault.VAULT_NM,
          category: vault.VAULT_CATEGORY,
          status: vault.VAULT_STATUS
        },
        access_logs: vault.ACCESS_ATTEMPTS || [],
        maintenance_logs: vault.MAINTENANCE_LOGS || [],
        authorization_changes: vault.AUTHORIZED_PERSONNEL || [],
        approval_history: vault.PENDING_APPROVALS || [],
        security_checks: {
          last_security_check: vault.LAST_SECURITY_CHECK,
          security_breach_count: vault.SECURITY_BREACH_COUNT || 0,
          security_features: vault.SECURITY_FEATURES || []
        },
        compliance_info: vault.COMPLIANCE_INFO || {},
        insurance_details: vault.INSURANCE_DETAILS || {}
      };
      
      res.json({
        success: true,
        data: auditData
      });
    } catch (error) {
      console.error('Get audit trail error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch audit trail',
        error: error.message
      });
    }
  }
);

// =============================================
// ✅ NEW: BRANCH VAULT REPORTS
// =============================================

/**
 * @route   GET /api/vaults/branch/:branchCode/utilization
 * @desc    Get branch vault utilization report
 * @access  Branch Manager, Vault Manager
 * @permission VIEW_VAULT_UTILIZATION
 */
router.get(
  '/branch/:branchCode/utilization',
  [authenticate, checkPermissions('VIEW_VAULT_UTILIZATION')],
  async (req, res) => {
    const { branchCode } = req.params;
    
    try {
      // Get vaults by branch using the new controller
      req.params.branchCode = branchCode;
      const response = await vaultController.getVaultByBU(req, res, true); // Pass flag for internal call
      
      if (!response) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch branch vault utilization'
        });
      }
      
    } catch (error) {
      console.error('Get branch utilization error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch branch vault utilization',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/vaults/branch/:branchCode/configuration
 * @desc    Get branch vault configuration summary
 * @access  Branch Manager, Vault Manager
 * @permission VIEW_VAULT_CONFIG
 */
router.get(
  '/branch/:branchCode/configuration',
  [authenticate, checkPermissions('VIEW_VAULT_CONFIG')],
  async (req, res) => {
    const { branchCode } = req.params;
    
    try {
      const vaults = await Vault.find({
        BRANCH_CODE: branchCode,
        IS_ACTIVE: true
      }).populate('DRAWER_REF');
      
      const configSummary = {
        branch_code: branchCode,
        total_vaults: vaults.length,
        security_features: {},
        transaction_limits: {},
        access_configuration: {}
      };
      
      if (vaults.length === 0) {
        return res.json({
          success: true,
          message: `No vaults found for branch ${branchCode}`,
          data: configSummary
        });
      }
      
      // Aggregate security features
      vaults.forEach(vault => {
        vault.SECURITY_FEATURES?.forEach(feature => {
          if (feature.is_active) {
            if (!configSummary.security_features[feature.name]) {
              configSummary.security_features[feature.name] = {
                count: 0,
                percentage: 0
              };
            }
            configSummary.security_features[feature.name].count++;
          }
        });
      });
      
      // Calculate percentages
      Object.keys(configSummary.security_features).forEach(key => {
        configSummary.security_features[key].percentage = 
          vaults.length > 0 ? 
          ((configSummary.security_features[key].count / vaults.length) * 100).toFixed(2) + '%' : 
          '0%';
      });
      
      // Get common transaction limits
      const firstVault = vaults[0];
      configSummary.transaction_limits = {
        max_single_deposit: firstVault.TRANSACTION_LIMITS?.max_single_deposit?.toString() || 'Not configured',
        max_single_withdrawal: firstVault.TRANSACTION_LIMITS?.max_single_withdrawal?.toString() || 'Not configured',
        require_approval_amount: firstVault.TRANSACTION_LIMITS?.require_approval_amount?.toString() || 'Not configured'
      };
      
      configSummary.access_configuration = {
        requires_dual_control: vaults.filter(v => v.REQUIRES_DUAL_CONTROL).length,
        average_authorized_personnel: vaults.length > 0 ? 
          Math.round(vaults.reduce((sum, v) => sum + (v.AUTHORIZED_PERSONNEL?.length || 0), 0) / vaults.length) : 0,
        has_access_schedule: vaults.filter(v => v.ACCESS_SCHEDULE).length
      };
      
      res.json({
        success: true,
        data: configSummary
      });
      
    } catch (error) {
      console.error('Get branch configuration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch branch vault configuration',
        error: error.message
      });
    }
  }
);

// =============================================
// OPERATIONAL ROUTES
// =============================================

/**
 * @route   POST /api/vaults/:id/open
 * @desc    Request to open vault (creates approval if needed)
 * @access  All authorized personnel
 * @permission OPEN_VAULT
 */
router.post(
  '/:id/open',
  [authenticate, checkPermissions('OPEN_VAULT')],
  async (req, res) => {
    const { id } = req.params;
    const { purpose, estimated_duration, required_access_level, requested_by } = req.body;
    
    try {
      const vault = await Vault.findOne({
        $or: [
          { _id: id },
          { VAULT_ID: parseInt(id) || 0 },
          { VAULT_CD: id }
        ]
      });
      
      if (!vault) {
        return res.status(404).json({
          success: false,
          message: 'Vault not found'
        });
      }
      
      // Check if vault is operational
      if (vault.VAULT_STATUS !== 'OPERATIONAL') {
        return res.status(400).json({
          success: false,
          message: `Vault is currently ${vault.VAULT_STATUS?.toLowerCase() || 'inactive'}. Cannot open vault.`
        });
      }
      
      // Create access request
      const accessRequest = {
        request_id: `ACCESS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        purpose,
        estimated_duration,
        required_access_level: required_access_level || 'LIMITED',
        requested_by,
        request_date: new Date(),
        status: 'PENDING_APPROVAL'
      };
      
      // For high-security vaults or after-hours access, create approval request
      if (vault.SECURITY_LEVEL === 'LEVEL_3' || vault.SECURITY_LEVEL === 'LEVEL_4' || 
          !isWithinOperatingHours(vault.ACCESS_SCHEDULE)) {
        
        const approvalRequest = {
          approval_id: `APPR-${Date.now()}`,
          type: 'ACCESS_REQUEST',
          amount: 0,
          requested_by,
          requested_role: req.user.role,
          priority: 'HIGH',
          status: 'PENDING',
          created_at: new Date()
        };
        
        accessRequest.approval_required = true;
        accessRequest.approval_id = approvalRequest.approval_id;
        
        if (!vault.PENDING_APPROVALS) vault.PENDING_APPROVALS = [];
        vault.PENDING_APPROVALS.push(approvalRequest);
      } else {
        accessRequest.status = 'APPROVED';
        accessRequest.approval_required = false;
      }
      
      // Log the access request
      if (!vault.ACCESS_ATTEMPTS) vault.ACCESS_ATTEMPTS = [];
      vault.ACCESS_ATTEMPTS.push({
        user_id: requested_by,
        user_role: req.user.role,
        action: 'OPEN_REQUEST',
        success: accessRequest.status === 'APPROVED',
        notes: accessRequest.status === 'PENDING_APPROVAL' ? 'Awaiting approval' : null,
        ip_address: req.ip,
        attempt_time: new Date()
      });
      
      await vault.save();
      
      res.json({
        success: true,
        message: accessRequest.approval_required ? 
          'Vault open request submitted for approval' : 
          'Vault open request approved',
        data: {
          vault: vault.VAULT_CD,
          access_request: accessRequest,
          requires_approval: accessRequest.approval_required
        }
      });
      
    } catch (error) {
      console.error('Open vault request error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process vault open request',
        error: error.message
      });
    }
  }
);

/**
 * @route   POST /api/vaults/:id/close
 * @desc    Close vault and log session
 * @access  Authorized personnel who opened the vault
 * @permission CLOSE_VAULT
 */
router.post(
  '/:id/close',
  [authenticate, checkPermissions('CLOSE_VAULT')],
  async (req, res) => {
    const { id } = req.params;
    const { closed_by, session_notes, final_balance, currency_breakdown } = req.body;
    
    try {
      const vault = await Vault.findOne({
        $or: [
          { _id: id },
          { VAULT_ID: parseInt(id) || 0 },
          { VAULT_CD: id }
        ]
      }).populate('DRAWER_REF');
      
      if (!vault) {
        return res.status(404).json({
          success: false,
          message: 'Vault not found'
        });
      }
      
      // Update last access log with closing information
      if (vault.LAST_ACCESS_LOG) {
        vault.LAST_ACCESS_LOG.closed_by = closed_by;
        vault.LAST_ACCESS_LOG.closed_time = new Date();
        vault.LAST_ACCESS_LOG.session_notes = session_notes;
        
        // Calculate session duration
        const openTime = new Date(vault.LAST_ACCESS_LOG.access_time);
        const closeTime = new Date();
        const durationMinutes = Math.round((closeTime - openTime) / (1000 * 60));
        vault.LAST_ACCESS_LOG.duration_minutes = durationMinutes;
      }
      
      // Update drawer balance if provided
      if (final_balance && vault.DRAWER_REF) {
        const drawer = await Drawer.findById(vault.DRAWER_REF._id);
        if (drawer) {
          drawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(final_balance.toString());
          
          if (currency_breakdown) {
            drawer.CLOSING_CURRENCY = currency_breakdown;
          }
          
          await drawer.save();
        }
      }
      
      // Log the closure
      if (!vault.ACCESS_ATTEMPTS) vault.ACCESS_ATTEMPTS = [];
      vault.ACCESS_ATTEMPTS.push({
        user_id: closed_by,
        user_role: req.user.role,
        action: 'CLOSE_VAULT',
        success: true,
        notes: null,
        ip_address: req.ip,
        attempt_time: new Date()
      });
      
      await vault.save();
      
      res.json({
        success: true,
        message: 'Vault closed successfully',
        data: {
          vault: vault.VAULT_CD,
          closed_by,
          closure_time: new Date(),
          session_notes
        }
      });
      
    } catch (error) {
      console.error('Close vault error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to close vault',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/vaults/:id/status
 * @desc    Get current vault status and operational info
 * @access  All authorized personnel
 * @permission VIEW_VAULT_STATUS
 */
router.get(
  '/:id/status',
  [authenticate, checkPermissions('VIEW_VAULT_STATUS')],
  async (req, res) => {
    const { id } = req.params;
    
    try {
      const vault = await Vault.findOne({
        $or: [
          { _id: id },
          { VAULT_ID: parseInt(id) || 0 },
          { VAULT_CD: id }
        ]
      }).populate('DRAWER_REF');
      
      if (!vault) {
        return res.status(404).json({
          success: false,
          message: 'Vault not found'
        });
      }
      
      // Calculate utilization percentage if not already set
      let utilizationPercentage = vault.utilizationPercentage;
      let availableCapacity = vault.availableCapacity;
      
      if (!utilizationPercentage && vault.DRAWER_REF && vault.VAULT_CAPACITY) {
        const currentBalance = parseFloat(vault.DRAWER_REF.CURRENT_BALANCE?.toString() || '0');
        const vaultCapacity = parseFloat(vault.VAULT_CAPACITY.toString());
        
        utilizationPercentage = vaultCapacity > 0 
          ? (currentBalance / vaultCapacity) * 100 
          : 0;
        
        availableCapacity = vaultCapacity - currentBalance;
      }
      
      // Get active authorized personnel count
      const activeAuthorizedCount = await User.countDocuments({
        vaultAccessPermissions: {
          $elemMatch: {
            vaultId: vault._id,
            isActive: true,
            permissions: { $in: ['ACCESS', 'MANAGE'] }
          }
        },
        status: 'ACTIVE'
      });
      
      // Get latest access log
      const lastAccessLog = await AccessLog.findOne({
        vaultId: vault._id,
        accessType: { $in: ['ENTRY', 'WITHDRAWAL', 'DEPOSIT'] }
      }).sort({ timestamp: -1 });
      
      // Get security breach count
      const securityBreachCount = await SecurityLog.countDocuments({
        vaultId: vault._id,
        severity: { $in: ['HIGH', 'CRITICAL'] },
        resolved: false
      });
      
      const statusInfo = {
        vault_info: {
          code: vault.VAULT_CD,
          name: vault.VAULT_NM,
          category: vault.VAULT_CATEGORY,
          security_level: vault.SECURITY_LEVEL,
          location: vault.LOCATION,
          description: vault.DESCRIPTION
        },
        operational_status: {
          vault_status: vault.VAULT_STATUS,
          is_active: vault.IS_ACTIVE,
          requires_dual_control: vault.REQUIRES_DUAL_CONTROL,
          last_activity: vault.LAST_ACTIVITY_DATE,
          operational_mode: vault.OPERATIONAL_MODE || 'NORMAL'
        },
        access_info: {
          authorized_personnel_count: activeAuthorizedCount || 0,
          last_access: lastAccessLog ? {
            timestamp: lastAccessLog.timestamp,
            user: lastAccessLog.userId,
            type: lastAccessLog.accessType,
            amount: lastAccessLog.amount
          } : null,
          access_schedule: vault.ACCESS_SCHEDULE,
          access_restrictions: vault.ACCESS_RESTRICTIONS || []
        },
        security_info: {
          security_breach_count: securityBreachCount || 0,
          last_security_check: vault.LAST_SECURITY_CHECK,
          next_security_audit: vault.NEXT_SECURITY_AUDIT,
          active_security_features: (vault.SECURITY_FEATURES || []).filter(f => f.is_active).length,
          security_alerts: vault.SECURITY_ALERTS || []
        },
        financial_info: {
          current_balance: vault.DRAWER_REF ? parseFloat(vault.DRAWER_REF.CURRENT_BALANCE?.toString() || '0') : 0,
          vault_capacity: parseFloat(vault.VAULT_CAPACITY?.toString() || '0'),
          utilization_percentage: parseFloat(utilizationPercentage.toFixed(2)),
          available_capacity: parseFloat(availableCapacity.toFixed(2)),
          currency: vault.CURRENCY || 'USD',
          minimum_balance: vault.MINIMUM_BALANCE || 0,
          maximum_capacity: vault.MAXIMUM_CAPACITY || vault.VAULT_CAPACITY
        },
        maintenance_info: {
          maintenance_status: vault.maintenanceStatus || 'UNKNOWN',
          last_maintenance: vault.MAINTENANCE_SCHEDULE?.last_maintenance,
          next_maintenance: vault.MAINTENANCE_SCHEDULE?.next_maintenance,
          maintenance_history: vault.MAINTENANCE_HISTORY || [],
          maintenance_required: vault.MAINTENANCE_REQUIRED || false
        },
        compliance_info: {
          ...vault.securityCompliance || {},
          last_compliance_check: vault.LAST_COMPLIANCE_CHECK,
          next_compliance_audit: vault.NEXT_COMPLIANCE_AUDIT,
          compliance_score: vault.COMPLIANCE_SCORE || 0,
          regulatory_requirements: vault.REGULATORY_REQUIREMENTS || []
        },
        audit_info: {
          last_audit_date: vault.LAST_AUDIT_DATE,
          audit_findings: vault.AUDIT_FINDINGS || [],
          audit_resolution_status: vault.AUDIT_RESOLUTION_STATUS || 'PENDING'
        },
        metadata: {
          created_at: vault.CREATED_AT,
          updated_at: vault.UPDATED_AT,
          created_by: vault.CREATED_BY,
          last_modified_by: vault.LAST_MODIFIED_BY,
          version: vault.__v
        }
      };
      
      res.json({
        success: true,
        data: statusInfo,
        timestamp: new Date().toISOString(),
        request_id: req.requestId || Math.random().toString(36).substr(2, 9)
      });
      
    } catch (error) {
      console.error('Error fetching vault status:', error);
      
      // Handle specific error types
      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          message: 'Invalid vault ID format',
          error: error.message
        });
      }
      
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          error: error.message
        });
      }
      
      // Handle database connection errors
      if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
        return res.status(503).json({
          success: false,
          message: 'Database connection error. Please try again later.',
          error: 'Service unavailable'
        });
      }
      
      // Generic error response
      res.status(500).json({
        success: false,
        message: 'Internal server error while fetching vault status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export { VAULT_PERMISSIONS };

export default router;