import express from 'express';
import vaultController from '../controllers/VaultController.js';
import VaultConfigController from '../controllers/vaultConfigController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { checkPermissions, tempBypassPermissions } from '../constants/roleMapping.js'; // Added tempBypassPermissions
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
  VIEW_VAULT_STATUS: 'VIEW_VAULT_STATUS'
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
  // [authenticate, tempBypassPermissions], // TEMPORARY: Use this for testing if permission issues persist
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
    // This would use a different controller method to get approvals by role
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
        
        // Create approval request (you'll need to implement this method in your Vault model)
        const approvalRequest = {
          approval_id: `APPR-${Date.now()}`,
          type: 'ACCESS_REQUEST',
          amount: 0, // No amount for access requests
          requested_by,
          requested_role: req.user.role,
          priority: 'HIGH',
          status: 'PENDING',
          created_at: new Date()
        };
        
        accessRequest.approval_required = true;
        accessRequest.approval_id = approvalRequest.approval_id;
        
        // Add to vault's pending approvals
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
          
          // Update currency breakdown if provided
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
      
      const statusInfo = {
        vault_info: {
          code: vault.VAULT_CD,
          name: vault.VAULT_NM,
          category: vault.VAULT_CATEGORY,
          security_level: vault.SECURITY_LEVEL
        },
        operational_status: {
          vault_status: vault.VAULT_STATUS,
          is_active: vault.IS_ACTIVE,
          requires_dual_control: vault.REQUIRES_DUAL_CONTROL,
          last_activity: vault.LAST_ACTIVITY_DATE
        },
        access_info: {
          authorized_personnel_count: vault.activeAuthorizedCount || 0,
          last_access: vault.LAST_ACCESS_LOG,
          access_schedule: vault.ACCESS_SCHEDULE
        },
        security_info: {
          security_breach_count: vault.SECURITY_BREACH_COUNT || 0,
          last_security_check: vault.LAST_SECURITY_CHECK,
          next_security_audit: vault.NEXT_SECURITY_AUDIT,
          active_security_features: (vault.SECURITY_FEATURES || []).filter(f => f.is_active).length
        },
        financial_info: {
          current_balance: vault.DRAWER_REF ? parseFloat(vault.DRAWER_REF.CURRENT_BALANCE?.toString() || '0') : 0,
          vault_capacity: parseFloat(vault.VAULT_CAPACITY?.toString() || '0'),
          utilization_percentage: vault.utilizationPercentage || 0,
          available_capacity: vault.availableCapacity || 0
        },
        maintenance_info: {
          maintenance_status: vault.maintenanceStatus || 'UNKNOWN',
          last_maintenance: vault.MAINTENANCE_SCHEDULE?.last_maintenance,
          next_maintenance: vault.MAINTENANCE_SCHEDULE?.next_maintenance
        },
        compliance_info: vault.securityCompliance || {}
      };
      
      res.json({
        success: true,
        data: statusInfo
      });
      
    } catch (error) {
      console.error('Get vault status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vault status',
        error: error.message
      });
    }
  }
);

// =============================================
// BULK OPERATIONS ROUTES
// =============================================

/**
 * @route   GET /api/vaults/branch/:branchCode
 * @desc    Get all vaults for a specific branch
 * @access  Branch Manager, Vault Manager
 * @permission VIEW_VAULTS
 */
router.get(
  '/branch/:branchCode',
  [authenticate, checkPermissions('VIEW_VAULTS')],
  async (req, res) => {
    const { branchCode } = req.params;
    const { category, status } = req.query;
    
    try {
      const filter = { 
        IS_ACTIVE: true 
      };
      
      if (category) filter.VAULT_CATEGORY = category;
      if (status) filter.VAULT_STATUS = status;
      
      const vaults = await Vault.find(filter)
        .populate({
          path: 'DRAWER_REF',
          match: { BRANCH_CODE: branchCode }
        })
        .exec();
      
      // Filter out vaults where DRAWER_REF is null (no branch match)
      const branchVaults = vaults.filter(vault => vault.DRAWER_REF !== null);
      
      res.json({
        success: true,
        data: {
          branch_code: branchCode,
          vault_count: branchVaults.length,
          vaults: branchVaults
        }
      });
      
    } catch (error) {
      console.error('Get branch vaults error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch branch vaults',
        error: error.message
      });
    }
  }
);

// =============================================
// HEALTH CHECK ROUTES
// =============================================

/**
 * @route   GET /api/vaults/health/status
 * @desc    Get system health status for all vaults
 * @access  System Administrators
 * @permission VIEW_VAULT_STATISTICS
 */
router.get(
  '/health/status',
  [authenticate, checkPermissions('VIEW_VAULT_STATISTICS')],
  async (req, res) => {
    try {
      const vaults = await Vault.find({ IS_ACTIVE: true }).populate('DRAWER_REF');
      
      const healthStatus = {
        total_vaults: vaults.length,
        operational: vaults.filter(v => v.VAULT_STATUS === 'OPERATIONAL').length,
        maintenance: vaults.filter(v => v.VAULT_STATUS === 'MAINTENANCE').length,
        emergency_lockdown: vaults.filter(v => v.VAULT_STATUS === 'EMERGENCY_LOCKDOWN').length,
        inventory: vaults.filter(v => v.VAULT_STATUS === 'INVENTORY').length,
        security_issues: vaults.filter(v => (v.SECURITY_BREACH_COUNT || 0) > 0).length,
        maintenance_required: vaults.filter(v => v.maintenanceStatus === 'OVERDUE' || v.maintenanceStatus === 'DUE_SOON').length,
        low_capacity: vaults.filter(v => parseFloat(v.utilizationPercentage || 0) > 90).length,
        high_security_vaults: vaults.filter(v => v.SECURITY_LEVEL === 'LEVEL_3' || v.SECURITY_LEVEL === 'LEVEL_4').length
      };
      
      res.json({
        success: true,
        data: healthStatus,
        timestamp: new Date()
      });
      
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system health status',
        error: error.message
      });
    }
  }
);

// =============================================
// HELPER FUNCTIONS
// =============================================

function isWithinOperatingHours(accessSchedule) {
  if (!accessSchedule || !accessSchedule.opening_time || !accessSchedule.closing_time) {
    return true; // Default to accessible if no schedule defined
  }
  
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  
  // Check if current day is in operating days
  if (accessSchedule.operating_days && !accessSchedule.operating_days.includes(currentDay)) {
    return false;
  }
  
  // Check if current time is within operating hours
  return currentTime >= accessSchedule.opening_time && currentTime <= accessSchedule.closing_time;
}

// =============================================
// DEBUG ROUTE FOR PERMISSION TESTING
// =============================================

/**
 * @route   GET /api/vaults/debug/permissions
 * @desc    Debug route to check user permissions for vault operations
 * @access  Authenticated users
 */
router.get(
  '/debug/permissions',
  authenticate,
  async (req, res) => {
    try {
      const userRoleId = req.user?.roleId || req.user?.BU_ROLE_ID;
      
      if (!userRoleId) {
        return res.status(401).json({
          success: false,
          message: 'User role not found'
        });
      }
      
      // Check all vault permissions
      const vaultPermissions = {};
      for (const [key, permission] of Object.entries(VAULT_PERMISSIONS)) {
        const hasPermission = await require('../constants/roleMapping.js').roleHasPermission(userRoleId, permission);
        vaultPermissions[key] = {
          permission,
          hasAccess: hasPermission
        };
      }
      
      res.json({
        success: true,
        user: {
          id: req.user?.id,
          username: req.user?.user_name,
          role: req.user?.role,
          roleId: userRoleId
        },
        vaultPermissions
      });
      
    } catch (error) {
      console.error('Debug permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check permissions',
        error: error.message
      });
    }
  }
);

// =============================================
// EXPORT VAULT PERMISSIONS FOR INTEGRATION
// =============================================

export { VAULT_PERMISSIONS };

export default router;