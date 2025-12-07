// routes/testRoutes.js or add to existing routes
import express from 'express';
import permissionSync from '../utils/permissionSync.js';
import roleMapping from '../constants/roleMapping.js';

const router = express.Router();

/**
 * @route   GET /api/test/vault-permissions
 * @desc    Test vault transaction permissions
 */
router.get('/vault-permissions', async (req, res) => {
  try {
    console.log('🔍 Manual Vault Permission Test ==================');
    
    // Run the test
    await roleMapping.testVaultTransactionPermissions();
    
    // Get summary
    const summary = await permissionSync.getVaultPermissionSummary();
    
    // Run comprehensive check
    const comprehensiveResult = await permissionSync.comprehensiveVaultPermissionCheck();
    
    res.json({
      success: true,
      message: 'Vault permission test completed',
      timestamp: new Date(),
      summary: {
        totalRoles: summary.totalRoles,
        rolesWithVaultAccess: summary.rolesWithVaultAccess.length,
        vaultTransactionStats: summary.vaultTransactionStats
      },
      comprehensiveCheck: comprehensiveResult,
      criticalRoles: {
        branchManager: {
          VAULT_DEPOSIT: await roleMapping.roleHasPermission(19, 'VAULT_DEPOSIT'),
          VAULT_WITHDRAWAL: await roleMapping.roleHasPermission(19, 'VAULT_WITHDRAWAL'),
          VIEW_VAULT_TRANSACTIONS: await roleMapping.roleHasPermission(19, 'VIEW_VAULT_TRANSACTIONS')
        },
        headTeller: {
          VAULT_DEPOSIT: await roleMapping.roleHasPermission(30, 'VAULT_DEPOSIT'),
          VAULT_WITHDRAWAL: await roleMapping.roleHasPermission(30, 'VAULT_WITHDRAWAL')
        },
        teller: {
          VAULT_DEPOSIT: await roleMapping.roleHasPermission(29, 'VAULT_DEPOSIT')
        }
      }
    });
    
  } catch (error) {
    console.error('Vault permission test error:', error);
    res.status(500).json({
      success: false,
      message: 'Vault permission test failed',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/test/role-permissions/:roleId
 * @desc    Get permissions for specific role
 */
router.get('/role-permissions/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    const role = roleMapping.ROLE_MAPPING[roleId];
    
    if (!role) {
      return res.status(404).json({
        success: false,
        message: `Role ID ${roleId} not found`
      });
    }
    
    const vaultPermissions = role.permissions?.VAULT_ACCESS_LEVEL || [];
    
    // Check specific vault transaction permissions
    const transactionPermissions = {
      VAULT_DEPOSIT: vaultPermissions.includes('VAULT_DEPOSIT'),
      VAULT_WITHDRAWAL: vaultPermissions.includes('VAULT_WITHDRAWAL'),
      VAULT_TRANSFER: vaultPermissions.includes('VAULT_TRANSFER'),
      VIEW_VAULT_TRANSACTIONS: vaultPermissions.includes('VIEW_VAULT_TRANSACTIONS'),
      CANCEL_VAULT_TRANSACTION: vaultPermissions.includes('CANCEL_VAULT_TRANSACTION'),
      EXPORT_VAULT_TRANSACTIONS: vaultPermissions.includes('EXPORT_VAULT_TRANSACTIONS')
    };
    
    res.json({
      success: true,
      data: {
        roleId,
        roleName: role.ROLE_NM,
        totalVaultPermissions: vaultPermissions.length,
        vaultPermissions,
        transactionPermissions,
        hasAnyTransactionPermission: Object.values(transactionPermissions).some(v => v)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get role permissions',
      error: error.message
    });
  }
});

export default router;