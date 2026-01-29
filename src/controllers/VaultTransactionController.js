// controllers/vaultTransactionController.js
import Vault from '../models/Vault.js';
import Drawer from '../models/Drawer.js';
import VaultTransaction from '../models/VaultTransaction.js';
import AuditTrail from '../models/AuditTrail.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import { parse, format } from 'date-fns';

// Async handler utility
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Deposit cash into vault
 */
export const vaultDeposit = asyncHandler(async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const {
      vaultId,
      drawerId,
      amount,
      currencyBreakdown,
      transactionType = "DEPOSIT",
      referenceNo,
      description,
      userId,
      verifiedBy,
      approvalId,
      sourceType,
      sourceId
    } = req.body;

    // Validate required fields
    if (!vaultId || !drawerId || !amount || amount <= 0 || !userId || !sourceId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: vaultId, drawerId, amount, userId, sourceId'
      });
    }

    // Find vault with associated drawer
    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: vaultId },
          { VAULT_ID: parseInt(vaultId) || 0 },
          { VAULT_CD: vaultId }
        ]
      },
      include: [{
        model: Drawer,
        as: 'drawer'
      }],
      transaction: t
    });

    if (!vault || !vault.drawer) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault or associated drawer not found'
      });
    }

    const drawer = await Drawer.findByPk(drawerId, { transaction: t });
    if (!drawer) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }

    // Convert decimal values
    const amountNum = parseFloat(amount);
    const vaultCapacity = parseFloat(vault.VAULT_CAPACITY);
    const currentVaultBalance = parseFloat(vault.drawer.CURRENT_BALANCE);
    
    // Check vault capacity
    if (currentVaultBalance + amountNum > vaultCapacity) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Deposit would exceed vault capacity',
        currentBalance: currentVaultBalance,
        capacity: vaultCapacity,
        wouldBe: currentVaultBalance + amountNum
      });
    }

    // Check drawer balance if source is drawer
    if (sourceType === 'DRAWER') {
      const drawerBalance = parseFloat(drawer.CURRENT_BALANCE);
      if (drawerBalance < amountNum) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Insufficient drawer balance',
          available: drawerBalance,
          required: amountNum
        });
      }
    }

    // Update balances
    if (sourceType === 'DRAWER') {
      // Debit drawer, credit vault
      await drawer.update({
        CURRENT_BALANCE: parseFloat(drawer.CURRENT_BALANCE) - amountNum
      }, { transaction: t });
    }

    // Credit vault
    await vault.drawer.update({
      CURRENT_BALANCE: currentVaultBalance + amountNum
    }, { transaction: t });

    // Create transaction record
    const transaction = await VaultTransaction.create({
      transactionId: `VTRX-${Date.now()}`,
      vaultId: vault.id,
      vaultCode: vault.VAULT_CD,
      drawerId: drawer.id,
      transactionType,
      amount: amountNum,
      currencyBreakdown,
      referenceNo,
      description,
      userId,
      verifiedBy,
      approvalId,
      sourceType,
      sourceId,
      status: 'COMPLETED',
      previousBalance: currentVaultBalance,
      newBalance: currentVaultBalance + amountNum,
      ipAddress: req.ip
    }, { transaction: t });

    // Create audit trail
    await AuditTrail.create({
      event_id: Date.now(),
      user_id: userId,
      event_type: 'VAULT_TRANSACTION',
      action: `Vault ${transactionType}`,
      entity_type: 'Vault',
      entity_id: vault.id,
      description: description || `Vault ${transactionType.toLowerCase()}`,
      reference_no: referenceNo,
      additional_info: {
        vault_code: vault.VAULT_CD,
        amount: amountNum,
        transaction_type: transactionType,
        source_type: sourceType,
        source_id: sourceId,
        currency_breakdown: currencyBreakdown,
        verified_by: verifiedBy
      },
      ip_address: req.ip
    }, { transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: `Vault ${transactionType.toLowerCase()} completed successfully`,
      data: {
        transaction: {
          transactionId: transaction.transactionId,
          referenceNo: transaction.referenceNo,
          amount: amountNum,
          type: transactionType,
          status: 'COMPLETED',
          timestamp: new Date()
        },
        vault: {
          code: vault.VAULT_CD,
          previousBalance: currentVaultBalance,
          newBalance: currentVaultBalance + amountNum,
          netChange: amountNum
        },
        source: sourceType === 'DRAWER' ? {
          type: 'Drawer',
          id: drawerId,
          previousBalance: parseFloat(drawer.CURRENT_BALANCE) + amountNum,
          newBalance: parseFloat(drawer.CURRENT_BALANCE),
          netChange: -amountNum
        } : null
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('Vault transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process vault transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Withdraw cash from vault
 */
export const vaultWithdrawal = asyncHandler(async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const {
      vaultId,
      drawerId,
      amount,
      currencyBreakdown,
      transactionType = "WITHDRAWAL",
      referenceNo,
      description,
      userId,
      verifiedBy,
      approvalId,
      destinationType,
      destinationId,
      purpose
    } = req.body;

    // Validate required fields
    if (!vaultId || !drawerId || !amount || amount <= 0 || !userId || !destinationId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: vaultId, drawerId, amount, userId, destinationId'
      });
    }

    // Find vault with associated drawer
    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: vaultId },
          { VAULT_ID: parseInt(vaultId) || 0 },
          { VAULT_CD: vaultId }
        ]
      },
      include: [{
        model: Drawer,
        as: 'drawer'
      }],
      transaction: t
    });

    if (!vault || !vault.drawer) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault or associated drawer not found'
      });
    }

    const drawer = await Drawer.findByPk(drawerId, { transaction: t });
    if (!drawer) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }

    // Check vault balance
    const amountNum = parseFloat(amount);
    const currentVaultBalance = parseFloat(vault.drawer.CURRENT_BALANCE);
    
    if (currentVaultBalance < amountNum) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Insufficient vault balance',
        available: currentVaultBalance,
        required: amountNum
      });
    }

    // Update vault balance
    await vault.drawer.update({
      CURRENT_BALANCE: currentVaultBalance - amountNum
    }, { transaction: t });

    // Credit destination drawer if applicable
    if (destinationType === 'DRAWER') {
      const destinationDrawer = await Drawer.findOne({
        where: {
          [Op.or]: [
            { id: destinationId },
            { DRAWER_ID: parseInt(destinationId) || 0 }
          ]
        },
        transaction: t
      });

      if (!destinationDrawer) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Destination drawer not found'
        });
      }

      await destinationDrawer.update({
        CURRENT_BALANCE: parseFloat(destinationDrawer.CURRENT_BALANCE) + amountNum
      }, { transaction: t });
    }

    // Create transaction record
    const transaction = await VaultTransaction.create({
      transactionId: `VTRX-${Date.now()}`,
      vaultId: vault.id,
      vaultCode: vault.VAULT_CD,
      drawerId: drawer.id,
      transactionType,
      amount: amountNum,
      currencyBreakdown,
      referenceNo,
      description,
      userId,
      verifiedBy,
      approvalId,
      destinationType,
      destinationId,
      purpose,
      status: 'COMPLETED',
      previousBalance: currentVaultBalance,
      newBalance: currentVaultBalance - amountNum,
      ipAddress: req.ip
    }, { transaction: t });

    // Create audit trail
    await AuditTrail.create({
      event_id: Date.now(),
      user_id: userId,
      event_type: 'VAULT_TRANSACTION',
      action: `Vault ${transactionType}`,
      entity_type: 'Vault',
      entity_id: vault.id,
      description: description || `Vault ${transactionType.toLowerCase()}`,
      reference_no: referenceNo,
      additional_info: {
        vault_code: vault.VAULT_CD,
        amount: amountNum,
        transaction_type: transactionType,
        destination_type: destinationType,
        destination_id: destinationId,
        purpose: purpose,
        currency_breakdown: currencyBreakdown,
        verified_by: verifiedBy
      },
      ip_address: req.ip
    }, { transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: `Vault ${transactionType.toLowerCase()} completed successfully`,
      data: {
        transaction: {
          transactionId: transaction.transactionId,
          referenceNo: transaction.referenceNo,
          amount: amountNum,
          type: transactionType,
          status: 'COMPLETED',
          timestamp: new Date()
        },
        vault: {
          code: vault.VAULT_CD,
          previousBalance: currentVaultBalance,
          newBalance: currentVaultBalance - amountNum,
          netChange: -amountNum
        },
        destination: destinationType === 'DRAWER' ? {
          type: 'Drawer',
          id: destinationId,
          netChange: amountNum
        } : null
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('Vault withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process vault withdrawal',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Vault to Vault Transfer
 */
export const vaultToVaultTransfer = asyncHandler(async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const {
      sourceVaultId,
      targetVaultId,
      amount,
      currencyBreakdown,
      transactionType = "VAULT_TRANSFER",
      referenceNo,
      description,
      userId,
      verifiedBy,
      approvalId,
      transferReason
    } = req.body;

    // Validate required fields
    if (!sourceVaultId || !targetVaultId || !amount || amount <= 0 || !userId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sourceVaultId, targetVaultId, amount, userId'
      });
    }

    // Find source vault with drawer
    const sourceVault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: sourceVaultId },
          { VAULT_ID: parseInt(sourceVaultId) || 0 },
          { VAULT_CD: sourceVaultId }
        ]
      },
      include: [{
        model: Drawer,
        as: 'drawer'
      }],
      transaction: t
    });

    if (!sourceVault || !sourceVault.drawer) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Source vault or associated drawer not found'
      });
    }

    // Find target vault with drawer
    const targetVault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: targetVaultId },
          { VAULT_ID: parseInt(targetVaultId) || 0 },
          { VAULT_CD: targetVaultId }
        ]
      },
      include: [{
        model: Drawer,
        as: 'drawer'
      }],
      transaction: t
    });

    if (!targetVault || !targetVault.drawer) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Target vault or associated drawer not found'
      });
    }

    // Check source vault balance
    const amountNum = parseFloat(amount);
    const sourceBalance = parseFloat(sourceVault.drawer.CURRENT_BALANCE);
    
    if (sourceBalance < amountNum) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Insufficient source vault balance',
        available: sourceBalance,
        required: amountNum
      });
    }

    // Check target vault capacity
    const targetCapacity = parseFloat(targetVault.VAULT_CAPACITY);
    const targetBalance = parseFloat(targetVault.drawer.CURRENT_BALANCE);
    
    if (targetBalance + amountNum > targetCapacity) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transfer would exceed target vault capacity',
        currentBalance: targetBalance,
        capacity: targetCapacity,
        wouldBe: targetBalance + amountNum
      });
    }

    // Update balances
    await sourceVault.drawer.update({
      CURRENT_BALANCE: sourceBalance - amountNum
    }, { transaction: t });

    await targetVault.drawer.update({
      CURRENT_BALANCE: targetBalance + amountNum
    }, { transaction: t });

    // Create transaction record
    const transaction = await VaultTransaction.create({
      transactionId: `V2V-${Date.now()}`,
      sourceVaultId: sourceVault.id,
      sourceVaultCode: sourceVault.VAULT_CD,
      targetVaultId: targetVault.id,
      targetVaultCode: targetVault.VAULT_CD,
      transactionType,
      amount: amountNum,
      currencyBreakdown,
      referenceNo,
      description,
      userId,
      verifiedBy,
      approvalId,
      transferReason,
      status: 'COMPLETED',
      sourcePreviousBalance: sourceBalance,
      sourceNewBalance: sourceBalance - amountNum,
      targetPreviousBalance: targetBalance,
      targetNewBalance: targetBalance + amountNum,
      ipAddress: req.ip
    }, { transaction: t });

    // Create audit trails for both vaults
    await AuditTrail.bulkCreate([
      {
        event_id: Date.now(),
        user_id: userId,
        event_type: 'VAULT_TRANSFER',
        action: 'Vault to Vault Transfer - DEBIT',
        entity_type: 'Vault',
        entity_id: sourceVault.id,
        description: `Transfer to vault ${targetVault.VAULT_CD}: ${description || 'Vault transfer'}`,
        reference_no: referenceNo,
        additional_info: {
          source_vault_code: sourceVault.VAULT_CD,
          target_vault_code: targetVault.VAULT_CD,
          amount: amountNum,
          transfer_reason: transferReason,
          currency_breakdown: currencyBreakdown,
          verified_by: verifiedBy,
          previous_balance: sourceBalance,
          new_balance: sourceBalance - amountNum,
          net_change: -amountNum
        },
        ip_address: req.ip
      },
      {
        event_id: Date.now() + 1,
        user_id: userId,
        event_type: 'VAULT_TRANSFER',
        action: 'Vault to Vault Transfer - CREDIT',
        entity_type: 'Vault',
        entity_id: targetVault.id,
        description: `Transfer from vault ${sourceVault.VAULT_CD}: ${description || 'Vault transfer'}`,
        reference_no: referenceNo,
        additional_info: {
          source_vault_code: sourceVault.VAULT_CD,
          target_vault_code: targetVault.VAULT_CD,
          amount: amountNum,
          transfer_reason: transferReason,
          currency_breakdown: currencyBreakdown,
          verified_by: verifiedBy,
          previous_balance: targetBalance,
          new_balance: targetBalance + amountNum,
          net_change: amountNum
        },
        ip_address: req.ip
      }
    ], { transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: 'Vault to vault transfer completed successfully',
      data: {
        transaction: {
          transactionId: transaction.transactionId,
          referenceNo: transaction.referenceNo,
          amount: amountNum,
          type: transactionType,
          status: 'COMPLETED',
          timestamp: new Date()
        },
        sourceVault: {
          code: sourceVault.VAULT_CD,
          previousBalance: sourceBalance,
          newBalance: sourceBalance - amountNum,
          netChange: -amountNum
        },
        targetVault: {
          code: targetVault.VAULT_CD,
          previousBalance: targetBalance,
          newBalance: targetBalance + amountNum,
          netChange: amountNum
        }
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('Vault to vault transfer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process vault to vault transfer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get vault transactions with filters
 */
export const getVaultTransactions = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      vaultId,
      transactionType,
      startDate,
      endDate,
      status,
      userId,
      minAmount,
      maxAmount
    } = req.query;

    const whereClause = {};

    // Apply filters
    if (vaultId) {
      whereClause[Op.or] = [
        { vaultId: vaultId },
        { vaultCode: vaultId },
        { sourceVaultId: vaultId },
        { targetVaultId: vaultId }
      ];
    }

    if (transactionType) whereClause.transactionType = transactionType;
    if (status) whereClause.status = status;
    if (userId) whereClause.userId = userId;

    // Date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      whereClause.amount = {};
      if (minAmount) whereClause.amount[Op.gte] = parseFloat(minAmount);
      if (maxAmount) whereClause.amount[Op.lte] = parseFloat(maxAmount);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: transactions } = await VaultTransaction.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: count,
          pages: totalPages,
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get vault transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vault transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add this function to your vaultTransactionController.js before the exports:

/**
 * Get pending vault transactions (for approval workflow)
 */
export const getVaultPendingTransactions = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      vaultId,
      transactionType,
      minAmount,
      maxAmount,
      userId
    } = req.query;

    const whereClause = {
      status: 'PENDING'
    };

    // Apply filters
    if (vaultId) {
      whereClause[Op.or] = [
        { vaultId: vaultId },
        { vaultCode: vaultId }
      ];
    }

    if (transactionType) whereClause.transactionType = transactionType;
    if (userId) whereClause.userId = userId;

    // Amount range filter
    if (minAmount || maxAmount) {
      whereClause.amount = {};
      if (minAmount) whereClause.amount[Op.gte] = parseFloat(minAmount);
      if (maxAmount) whereClause.amount[Op.lte] = parseFloat(maxAmount);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: transactions } = await VaultTransaction.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'ASC']],
      include: [
        {
          model: Vault,
          as: 'vault',
          attributes: ['VAULT_CD', 'VAULT_NM']
        }
      ]
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    // Format response
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      transactionId: tx.transactionId,
      referenceNo: tx.referenceNo,
      type: tx.transactionType,
      amount: parseFloat(tx.amount),
      vault: tx.vault ? {
        code: tx.vault.VAULT_CD,
        name: tx.vault.VAULT_NM
      } : null,
      userId: tx.userId,
      createdAt: tx.createdAt,
      requiresApproval: tx.approvalId ? true : false,
      approvalId: tx.approvalId,
      description: tx.description,
      currencyBreakdown: tx.currencyBreakdown
    }));

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions,
        summary: {
          totalPending: count,
          totalAmount: transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0),
          byType: transactions.reduce((acc, tx) => {
            acc[tx.transactionType] = (acc[tx.transactionType] || 0) + 1;
            return acc;
          }, {})
        },
        pagination: {
          total: count,
          pages: totalPages,
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get pending transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Also add this function for bulk approval if needed:
/**
 * Approve pending vault transactions
 */
export const approveVaultTransactions = asyncHandler(async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { transactionIds } = req.body;
    const { approvedBy, approvalNotes } = req.body;

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Transaction IDs array is required'
      });
    }

    if (!approvedBy) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'approvedBy is required'
      });
    }

    // Find all pending transactions
    const transactions = await VaultTransaction.findAll({
      where: {
        id: { [Op.in]: transactionIds },
        status: 'PENDING'
      },
      transaction: t
    });

    if (transactions.length === 0) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'No pending transactions found'
      });
    }

    // Update all transactions
    const updatePromises = transactions.map(tx => 
      tx.update({
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date(),
        approvalNotes,
        updatedAt: new Date()
      }, { transaction: t })
    );

    await Promise.all(updatePromises);

    // Create audit trail for each transaction
    const auditTrails = transactions.map(tx => ({
      event_id: Date.now() + tx.id,
      user_id: approvedBy,
      event_type: 'VAULT_TRANSACTION_APPROVAL',
      action: 'Transaction Approved',
      entity_type: 'VaultTransaction',
      entity_id: tx.id,
      description: `Approved: ${approvalNotes || 'Bulk approval'}`,
      reference_no: tx.transactionId,
      additional_info: {
        transaction_type: tx.transactionType,
        amount: parseFloat(tx.amount),
        vault_code: tx.vaultCode,
        approved_by: approvedBy,
        approval_notes: approvalNotes
      },
      ip_address: req.ip,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    await AuditTrail.bulkCreate(auditTrails, { transaction: t });

    await t.commit();

    res.json({
      success: true,
      message: `Successfully approved ${transactions.length} transaction(s)`,
      data: {
        approvedCount: transactions.length,
        transactionIds: transactions.map(tx => tx.transactionId),
        approvedBy,
        approvedAt: new Date()
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('Approve transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get vault transaction by ID
 */
export const getVaultTransactionById = asyncHandler(async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await VaultTransaction.findOne({
      where: {
        [Op.or]: [
          { id: transactionId },
          { transactionId: transactionId },
          { referenceNo: transactionId }
        ]
      }
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: transaction
    });

  } catch (error) {
    console.error('Get transaction by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get vault balance
 */
export const getVaultBalance = asyncHandler(async (req, res) => {
  try {
    const { vaultId } = req.params;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: vaultId },
          { VAULT_ID: parseInt(vaultId) || 0 },
          { VAULT_CD: vaultId }
        ]
      },
      include: [{
        model: Drawer,
        as: 'drawer'
      }]
    });

    if (!vault || !vault.drawer) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const balance = parseFloat(vault.drawer.CURRENT_BALANCE);
    const capacity = parseFloat(vault.VAULT_CAPACITY);
    const utilization = capacity > 0 ? (balance / capacity * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        vaultCode: vault.VAULT_CD,
        vaultName: vault.VAULT_NM,
        currentBalance: balance,
        formattedBalance: new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN'
        }).format(balance),
        vaultCapacity: capacity,
        availableCapacity: capacity - balance,
        utilizationPercentage: `${utilization}%`,
        lastUpdated: vault.drawer.updatedAt
      }
    });

  } catch (error) {
    console.error('Get vault balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vault balance',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Validate vault transaction before processing
 */
export const validateVaultTransaction = asyncHandler(async (req, res) => {
  try {
    const {
      transactionType,
      vaultId,
      drawerId,
      amount,
      sourceId,
      destinationId,
      sourceType,
      destinationType
    } = req.body;

    // Basic validation
    if (!transactionType || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction data. transactionType and positive amount are required.'
      });
    }

    const validationResults = {
      isValid: true,
      errors: [],
      warnings: [],
      details: {}
    };

    // Validate vault exists and is active
    if (vaultId) {
      const vault = await Vault.findOne({
        where: {
          [Op.or]: [
            { id: vaultId },
            { VAULT_ID: parseInt(vaultId) || 0 },
            { VAULT_CD: vaultId }
          ],
          REC_ST: { [Op.in]: ['ACTIVE', 'A'] }
        },
        include: [{
          model: Drawer,
          as: 'drawer'
        }]
      });

      if (!vault) {
        validationResults.isValid = false;
        validationResults.errors.push('Vault not found or inactive');
      } else {
        validationResults.details.vault = {
          id: vault.id,
          code: vault.VAULT_CD,
          name: vault.VAULT_NM,
          status: vault.REC_ST,
          capacity: parseFloat(vault.VAULT_CAPACITY),
          currentBalance: vault.drawer ? parseFloat(vault.drawer.CURRENT_BALANCE) : 0,
          isOperational: vault.IS_OPERATIONAL === 'Y'
        };

        // Check if vault is operational
        if (vault.IS_OPERATIONAL !== 'Y') {
          validationResults.warnings.push('Vault is not operational');
        }
      }
    }

    // Validate drawer exists and is active
    if (drawerId) {
      const drawer = await Drawer.findOne({
        where: {
          [Op.or]: [
            { id: drawerId },
            { DRAWER_ID: parseInt(drawerId) || 0 }
          ],
          REC_ST: { [Op.in]: ['ACTIVE', 'A'] }
        }
      });

      if (!drawer) {
        validationResults.isValid = false;
        validationResults.errors.push('Drawer not found or inactive');
      } else {
        validationResults.details.drawer = {
          id: drawer.id,
          drawerId: drawer.DRAWER_ID,
          currentBalance: parseFloat(drawer.CURRENT_BALANCE),
          status: drawer.REC_ST,
          maxCapacity: parseFloat(drawer.MAX_CAPACITY)
        };

        // Check drawer capacity
        const amountNum = parseFloat(amount);
        if (transactionType === 'DEPOSIT' && drawer.CURRENT_BALANCE < amountNum) {
          validationResults.isValid = false;
          validationResults.errors.push(`Insufficient drawer balance. Available: ${drawer.CURRENT_BALANCE}, Required: ${amountNum}`);
        }
      }
    }

    // Validate source/destination based on transaction type
    const amountNum = parseFloat(amount);

    switch (transactionType) {
      case 'DEPOSIT':
        if (!sourceId || !sourceType) {
          validationResults.isValid = false;
          validationResults.errors.push('Source ID and source type are required for deposits');
        }
        
        if (sourceType === 'DRAWER') {
          const sourceDrawer = await Drawer.findOne({
            where: {
              [Op.or]: [
                { id: sourceId },
                { DRAWER_ID: parseInt(sourceId) || 0 }
              ]
            }
          });

          if (sourceDrawer) {
            validationResults.details.source = {
              type: 'DRAWER',
              id: sourceDrawer.id,
              currentBalance: parseFloat(sourceDrawer.CURRENT_BALANCE),
              canWithdraw: parseFloat(sourceDrawer.CURRENT_BALANCE) >= amountNum
            };

            if (parseFloat(sourceDrawer.CURRENT_BALANCE) < amountNum) {
              validationResults.isValid = false;
              validationResults.errors.push(`Insufficient source drawer balance. Available: ${sourceDrawer.CURRENT_BALANCE}, Required: ${amountNum}`);
            }
          }
        }
        break;

      case 'WITHDRAWAL':
        if (!destinationId || !destinationType) {
          validationResults.isValid = false;
          validationResults.errors.push('Destination ID and destination type are required for withdrawals');
        }

        // Check vault balance for withdrawals
        if (validationResults.details.vault && validationResults.details.vault.currentBalance < amountNum) {
          validationResults.isValid = false;
          validationResults.errors.push(`Insufficient vault balance. Available: ${validationResults.details.vault.currentBalance}, Required: ${amountNum}`);
        }

        if (destinationType === 'DRAWER') {
          const destDrawer = await Drawer.findOne({
            where: {
              [Op.or]: [
                { id: destinationId },
                { DRAWER_ID: parseInt(destinationId) || 0 }
              ]
            }
          });

          if (destDrawer) {
            validationResults.details.destination = {
              type: 'DRAWER',
              id: destDrawer.id,
              currentBalance: parseFloat(destDrawer.CURRENT_BALANCE),
              maxCapacity: parseFloat(destDrawer.MAX_CAPACITY),
              willExceedCapacity: (parseFloat(destDrawer.CURRENT_BALANCE) + amountNum) > parseFloat(destDrawer.MAX_CAPACITY)
            };

            if ((parseFloat(destDrawer.CURRENT_BALANCE) + amountNum) > parseFloat(destDrawer.MAX_CAPACITY)) {
              validationResults.warnings.push('Deposit may exceed destination drawer capacity');
            }
          }
        }
        break;

      case 'VAULT_TRANSFER':
        const { targetVaultId } = req.body;
        
        if (!targetVaultId) {
          validationResults.isValid = false;
          validationResults.errors.push('Target vault ID is required for vault transfers');
        }

        // Validate source vault balance
        if (validationResults.details.vault && validationResults.details.vault.currentBalance < amountNum) {
          validationResults.isValid = false;
          validationResults.errors.push(`Insufficient source vault balance. Available: ${validationResults.details.vault.currentBalance}, Required: ${amountNum}`);
        }

        // Validate target vault
        if (targetVaultId) {
          const targetVault = await Vault.findOne({
            where: {
              [Op.or]: [
                { id: targetVaultId },
                { VAULT_ID: parseInt(targetVaultId) || 0 },
                { VAULT_CD: targetVaultId }
              ]
            },
            include: [{
              model: Drawer,
              as: 'drawer'
            }]
          });

          if (!targetVault) {
            validationResults.isValid = false;
            validationResults.errors.push('Target vault not found');
          } else {
            validationResults.details.targetVault = {
              id: targetVault.id,
              code: targetVault.VAULT_CD,
              name: targetVault.VAULT_NM,
              currentBalance: targetVault.drawer ? parseFloat(targetVault.drawer.CURRENT_BALANCE) : 0,
              capacity: parseFloat(targetVault.VAULT_CAPACITY),
              willExceedCapacity: targetVault.drawer ? 
                (parseFloat(targetVault.drawer.CURRENT_BALANCE) + amountNum) > parseFloat(targetVault.VAULT_CAPACITY) : false
            };

            if (targetVault.drawer && 
                (parseFloat(targetVault.drawer.CURRENT_BALANCE) + amountNum) > parseFloat(targetVault.VAULT_CAPACITY)) {
              validationResults.warnings.push('Transfer may exceed target vault capacity');
            }
          }
        }
        break;
    }

    // Check if amount exceeds daily limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dailyTransactions = await VaultTransaction.findAll({
      where: {
        vaultId: vaultId,
        status: 'COMPLETED',
        createdAt: {
          [Op.between]: [today, tomorrow]
        }
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('amount')), 'dailyTotal']
      ],
      raw: true
    });

    const dailyTotal = parseFloat(dailyTransactions[0]?.dailyTotal || 0);
    const proposedDailyTotal = dailyTotal + amountNum;
    
    // Example daily limit - you might want to make this configurable
    const DAILY_LIMIT = 10000000; // 10 million

    if (proposedDailyTotal > DAILY_LIMIT) {
      validationResults.warnings.push(`Proposed transaction exceeds daily limit. Daily total would be: ${proposedDailyTotal.toLocaleString()}, Limit: ${DAILY_LIMIT.toLocaleString()}`);
    }

    validationResults.details.dailySummary = {
      todayTotal: dailyTotal,
      proposedTotal: proposedDailyTotal,
      dailyLimit: DAILY_LIMIT,
      remainingLimit: Math.max(0, DAILY_LIMIT - dailyTotal)
    };

    // Check if approval is required
    const APPROVAL_THRESHOLD = 1000000; // 1 million - configurable
    if (amountNum >= APPROVAL_THRESHOLD) {
      validationResults.details.requiresApproval = true;
      validationResults.details.approvalThreshold = APPROVAL_THRESHOLD;
      validationResults.warnings.push(`Transaction requires approval (amount ≥ ${APPROVAL_THRESHOLD.toLocaleString()})`);
    } else {
      validationResults.details.requiresApproval = false;
    }

    // Final validation summary
    const response = {
      success: validationResults.isValid,
      message: validationResults.isValid ? 'Transaction validation passed' : 'Transaction validation failed',
      data: {
        isValid: validationResults.isValid,
        transactionType,
        amount: amountNum,
        validationResults: validationResults.details,
        warnings: validationResults.warnings,
        errors: validationResults.errors
      }
    };

    res.status(validationResults.isValid ? 200 : 400).json(response);

  } catch (error) {
    console.error('Transaction validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get vault daily summary
 */
export const getVaultDailySummary = asyncHandler(async (req, res) => {
  try {
    const { vaultId, date } = req.params;
    
    const targetDate = parse(date, 'yyyy-MM-dd', new Date());
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: vaultId },
          { VAULT_ID: parseInt(vaultId) || 0 },
          { VAULT_CD: vaultId }
        ]
      },
      include: [{
        model: Drawer,
        as: 'drawer'
      }]
    });

    if (!vault || !vault.drawer) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Get transactions for the day
    const transactions = await VaultTransaction.findAll({
      where: {
        [Op.or]: [
          { vaultId: vault.id },
          { sourceVaultId: vault.id },
          { targetVaultId: vault.id }
        ],
        createdAt: {
          [Op.between]: [startOfDay, endOfDay]
        },
        status: 'COMPLETED'
      },
      order: [['createdAt', 'ASC']]
    });

    // Calculate totals
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalTransfersOut = 0;
    let totalTransfersIn = 0;
    
    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount);
      
      if (tx.transactionType === 'DEPOSIT') {
        totalDeposits += amount;
      } else if (tx.transactionType === 'WITHDRAWAL') {
        totalWithdrawals += amount;
      } else if (tx.transactionType === 'VAULT_TRANSFER') {
        if (tx.sourceVaultId === vault.id) {
          totalTransfersOut += amount;
        } else if (tx.targetVaultId === vault.id) {
          totalTransfersIn += amount;
        }
      }
    });

    const netChange = (totalDeposits + totalTransfersIn) - (totalWithdrawals + totalTransfersOut);
    const closingBalance = parseFloat(vault.drawer.CURRENT_BALANCE);

    res.json({
      success: true,
      data: {
        date: format(targetDate, 'yyyy-MM-dd'),
        vaultCode: vault.VAULT_CD,
        vaultName: vault.VAULT_NM,
        summary: {
          totalTransactions: transactions.length,
          totalDeposits,
          totalWithdrawals,
          totalTransfersIn,
          totalTransfersOut,
          netChange,
          openingBalance: closingBalance - netChange,
          closingBalance
        },
        transactions: transactions.slice(0, 50) // Limit to last 50 transactions
      }
    });

  } catch (error) {
    console.error('Get vault daily summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get vault transaction history
 */
export const getVaultTransactionHistory = asyncHandler(async (req, res) => {
  try {
    const { vaultId } = req.params;
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      transactionType
    } = req.query;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: vaultId },
          { VAULT_ID: parseInt(vaultId) || 0 },
          { VAULT_CD: vaultId }
        ]
      }
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const whereClause = {
      [Op.or]: [
        { vaultId: vault.id },
        { sourceVaultId: vault.id },
        { targetVaultId: vault.id }
      ]
    };

    if (transactionType) whereClause.transactionType = transactionType;

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: transactions } = await VaultTransaction.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    res.json({
      success: true,
      data: {
        vaultCode: vault.VAULT_CD,
        vaultName: vault.VAULT_NM,
        transactions,
        pagination: {
          total: count,
          pages: totalPages,
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get vault transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Search vault transactions
 */
export const searchVaultTransactions = asyncHandler(async (req, res) => {
  try {
    const { q, field = 'referenceNo' } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const whereClause = {
      [field]: { [Op.like]: `%${q}%` }
    };

    const transactions = await VaultTransaction.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json({
      success: true,
      data: {
        count: transactions.length,
        transactions
      }
    });

  } catch (error) {
    console.error('Search transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Cancel vault transaction
 */
export const cancelVaultTransaction = asyncHandler(async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { transactionId } = req.params;
    const { cancelledBy, reason } = req.body;

    if (!cancelledBy || !reason) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'cancelledBy and reason are required'
      });
    }

    const transaction = await VaultTransaction.findOne({
      where: {
        [Op.or]: [
          { id: transactionId },
          { transactionId: transactionId }
        ]
      },
      transaction: t
    });

    if (!transaction) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.status !== 'PENDING') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Only pending transactions can be cancelled'
      });
    }

    // Update transaction status
    await transaction.update({
      status: 'CANCELLED',
      cancelledBy,
      cancellationReason: reason,
      cancelledAt: new Date()
    }, { transaction: t });

    await t.commit();

    res.json({
      success: true,
      message: 'Transaction cancelled successfully',
      data: transaction
    });

  } catch (error) {
    await t.rollback();
    console.error('Cancel transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Reverse vault transaction
 */
export const reverseVaultTransaction = asyncHandler(async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { transactionId } = req.params;
    const { reversedBy, reason } = req.body;

    if (!reversedBy || !reason) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'reversedBy and reason are required'
      });
    }

    const originalTransaction = await VaultTransaction.findOne({
      where: {
        [Op.or]: [
          { id: transactionId },
          { transactionId: transactionId }
        ]
      },
      transaction: t
    });

    if (!originalTransaction) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (originalTransaction.status !== 'COMPLETED') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Only completed transactions can be reversed'
      });
    }

    // Create reverse transaction data
    let reverseTransactionData = {
      transactionId: `RVRS-${Date.now()}`,
      originalTransactionId: originalTransaction.transactionId,
      transactionType: 'REVERSAL',
      amount: originalTransaction.amount,
      description: `Reversal of ${originalTransaction.description || originalTransaction.transactionType}`,
      userId: reversedBy,
      status: 'COMPLETED',
      reversalReason: reason,
      ipAddress: req.ip
    };

    // Handle different transaction types
    switch (originalTransaction.transactionType) {
      case 'DEPOSIT':
        reverseTransactionData = {
          ...reverseTransactionData,
          vaultId: originalTransaction.vaultId,
          vaultCode: originalTransaction.vaultCode,
          drawerId: originalTransaction.drawerId,
          destinationType: originalTransaction.sourceType,
          destinationId: originalTransaction.sourceId,
          purpose: 'REVERSAL'
        };
        break;
        
      case 'WITHDRAWAL':
        reverseTransactionData = {
          ...reverseTransactionData,
          vaultId: originalTransaction.vaultId,
          vaultCode: originalTransaction.vaultCode,
          drawerId: originalTransaction.drawerId,
          sourceType: originalTransaction.destinationType,
          sourceId: originalTransaction.destinationId,
          purpose: 'REVERSAL'
        };
        break;
        
      case 'VAULT_TRANSFER':
        reverseTransactionData = {
          ...reverseTransactionData,
          sourceVaultId: originalTransaction.targetVaultId,
          sourceVaultCode: originalTransaction.targetVaultCode,
          targetVaultId: originalTransaction.sourceVaultId,
          targetVaultCode: originalTransaction.sourceVaultCode,
          amount: originalTransaction.amount,
          transferReason: `Reversal: ${originalTransaction.transferReason || 'Vault transfer'}`
        };
        break;
    }

    const reverseTransaction = await VaultTransaction.create(reverseTransactionData, { transaction: t });

    // Update original transaction
    await originalTransaction.update({
      status: 'REVERSED',
      reversedBy,
      reversalReason: reason,
      reversedAt: new Date()
    }, { transaction: t });

    // Create audit trail
    await AuditTrail.create({
      event_id: Date.now(),
      user_id: reversedBy,
      event_type: 'VAULT_TRANSACTION_REVERSAL',
      action: 'Transaction Reversal',
      entity_type: 'VaultTransaction',
      entity_id: originalTransaction.id,
      description: `Reversal: ${reason}`,
      reference_no: reverseTransaction.transactionId,
      additional_info: {
        original_transaction: originalTransaction.transactionId,
        original_type: originalTransaction.transactionType,
        amount: parseFloat(originalTransaction.amount),
        reason: reason
      },
      ip_address: req.ip
    }, { transaction: t });

    await t.commit();

    res.json({
      success: true,
      message: 'Transaction reversed successfully',
      data: {
        originalTransaction: {
          transactionId: originalTransaction.transactionId,
          status: 'REVERSED'
        },
        reversalTransaction: reverseTransaction
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('Reverse transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reverse transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get vault transaction statistics
 */
export const getVaultTransactionStatistics = asyncHandler(async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { startDate, endDate } = req.query;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: vaultId },
          { VAULT_ID: parseInt(vaultId) || 0 },
          { VAULT_CD: vaultId }
        ]
      }
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const whereClause = {
      [Op.or]: [
        { vaultId: vault.id },
        { sourceVaultId: vault.id },
        { targetVaultId: vault.id }
      ],
      status: 'COMPLETED'
    };

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const transactions = await VaultTransaction.findAll({
      where: whereClause,
      raw: true
    });

    const statistics = {
      totalTransactions: transactions.length,
      byType: {
        DEPOSIT: 0,
        WITHDRAWAL: 0,
        VAULT_TRANSFER: 0,
        REVERSAL: 0
      },
      totalAmount: {
        DEPOSIT: 0,
        WITHDRAWAL: 0,
        VAULT_TRANSFER_OUT: 0,
        VAULT_TRANSFER_IN: 0
      },
      approvalStats: {
        requiresApproval: 0,
        approved: 0,
        rejected: 0,
        pending: 0
      }
    };

    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount);
      const type = tx.transactionType;
      
      // Count by type
      statistics.byType[type] = (statistics.byType[type] || 0) + 1;
      
      // Sum amounts by type
      if (type === 'DEPOSIT') {
        statistics.totalAmount.DEPOSIT += amount;
      } else if (type === 'WITHDRAWAL') {
        statistics.totalAmount.WITHDRAWAL += amount;
      } else if (type === 'VAULT_TRANSFER') {
        if (tx.sourceVaultId === vault.id) {
          statistics.totalAmount.VAULT_TRANSFER_OUT += amount;
        } else if (tx.targetVaultId === vault.id) {
          statistics.totalAmount.VAULT_TRANSFER_IN += amount;
        }
      }
    });

    res.json({
      success: true,
      data: {
        vaultCode: vault.VAULT_CD,
        vaultName: vault.VAULT_NM,
        statistics
      }
    });

  } catch (error) {
    console.error('Get transaction statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get vault transaction by reference number
 */
export const getVaultTransactionByReference = asyncHandler(async (req, res) => {
  try {
    const { referenceNo } = req.params;
    const { includeRelated = false } = req.query;

    if (!referenceNo) {
      return res.status(400).json({
        success: false,
        message: 'Reference number is required'
      });
    }

    // Build query
    const queryOptions = {
      where: {
        [Op.or]: [
          { referenceNo: referenceNo },
          { transactionId: referenceNo }
        ]
      }
    };

    // Include related data if requested
    if (includeRelated === 'true') {
      queryOptions.include = [
        {
          model: Vault,
          as: 'vault',
          attributes: ['id', 'VAULT_CD', 'VAULT_NM', 'VAULT_CAPACITY', 'REC_ST']
        },
        {
          model: Drawer,
          as: 'drawer',
          attributes: ['id', 'DRAWER_ID', 'CURRENT_BALANCE', 'REC_ST']
        }
      ];
    }

    // Find transaction
    const transaction = await VaultTransaction.findOne(queryOptions);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: `Transaction with reference ${referenceNo} not found`
      });
    }

    // Format response
    const formattedTransaction = {
      id: transaction.id,
      transactionId: transaction.transactionId,
      referenceNo: transaction.referenceNo,
      transactionType: transaction.transactionType,
      amount: parseFloat(transaction.amount),
      status: transaction.status,
      description: transaction.description,
      
      // Source information
      source: {
        vaultId: transaction.vaultId,
        vaultCode: transaction.vaultCode,
        drawerId: transaction.drawerId,
        sourceType: transaction.sourceType,
        sourceId: transaction.sourceId,
        sourceVaultId: transaction.sourceVaultId,
        sourceVaultCode: transaction.sourceVaultCode
      },
      
      // Destination information
      destination: {
        destinationType: transaction.destinationType,
        destinationId: transaction.destinationId,
        targetVaultId: transaction.targetVaultId,
        targetVaultCode: transaction.targetVaultCode
      },
      
      // Balances
      balances: {
        previousBalance: parseFloat(transaction.previousBalance),
        newBalance: parseFloat(transaction.newBalance),
        sourcePreviousBalance: parseFloat(transaction.sourcePreviousBalance),
        sourceNewBalance: parseFloat(transaction.sourceNewBalance),
        targetPreviousBalance: parseFloat(transaction.targetPreviousBalance),
        targetNewBalance: parseFloat(transaction.targetNewBalance)
      },
      
      // Currency information
      currency: {
        breakdown: transaction.currencyBreakdown,
        currency: transaction.currency
      },
      
      // User information
      user: {
        userId: transaction.userId,
        verifiedBy: transaction.verifiedBy,
        approvedBy: transaction.approvedBy,
        cancelledBy: transaction.cancelledBy,
        reversedBy: transaction.reversedBy
      },
      
      // Approval information
      approval: {
        approvalId: transaction.approvalId,
        approvedAt: transaction.approvedAt,
        approvalNotes: transaction.approvalNotes
      },
      
      // Status timestamps
      timestamps: {
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        approvedAt: transaction.approvedAt,
        cancelledAt: transaction.cancelledAt,
        reversedAt: transaction.reversedAt
      },
      
      // Additional information
      additionalInfo: {
        purpose: transaction.purpose,
        transferReason: transaction.transferReason,
        reversalReason: transaction.reversalReason,
        cancellationReason: transaction.cancellationReason,
        ipAddress: transaction.ipAddress,
        originalTransactionId: transaction.originalTransactionId
      },
      
      // Related entities (if included)
      relatedEntities: includeRelated === 'true' ? {
        vault: transaction.vault ? {
          code: transaction.vault.VAULT_CD,
          name: transaction.vault.VAULT_NM,
          capacity: parseFloat(transaction.vault.VAULT_CAPACITY),
          status: transaction.vault.REC_ST
        } : null,
        drawer: transaction.drawer ? {
          id: transaction.drawer.id,
          drawerId: transaction.drawer.DRAWER_ID,
          currentBalance: parseFloat(transaction.drawer.CURRENT_BALANCE),
          status: transaction.drawer.REC_ST
        } : null
      } : null
    };

    // Get related transactions if it's a reversal
    let relatedTransactions = [];
    if (transaction.transactionType === 'REVERSAL' && transaction.originalTransactionId) {
      relatedTransactions = await VaultTransaction.findAll({
        where: {
          [Op.or]: [
            { transactionId: transaction.originalTransactionId },
            { id: transaction.originalTransactionId }
          ]
        },
        limit: 1
      });
    }

    // Get audit trail for this transaction
    const auditTrail = await AuditTrail.findAll({
      where: {
        [Op.or]: [
          { entity_id: transaction.id },
          { reference_no: referenceNo },
          { reference_no: transaction.transactionId }
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      message: 'Transaction retrieved successfully',
      data: {
        transaction: formattedTransaction,
        auditTrail: auditTrail.map(audit => ({
          id: audit.id,
          action: audit.action,
          description: audit.description,
          user: audit.user_id,
          timestamp: audit.createdAt,
          additionalInfo: audit.additional_info
        })),
        relatedTransactions: relatedTransactions.map(related => ({
          id: related.id,
          transactionId: related.transactionId,
          type: related.transactionType,
          amount: parseFloat(related.amount),
          status: related.status,
          createdAt: related.createdAt
        })),
        transactionSummary: {
          type: transaction.transactionType,
          status: transaction.status,
          netAmount: parseFloat(transaction.amount),
          isReversal: transaction.transactionType === 'REVERSAL',
          requiresApproval: transaction.approvalId ? true : false,
          isCancelled: transaction.status === 'CANCELLED',
          isReversed: transaction.status === 'REVERSED'
        }
      }
    });

  } catch (error) {
    console.error('Get transaction by reference error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction by reference',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Search transactions by multiple criteria
 */
export const searchVaultTransactionsAdvanced = asyncHandler(async (req, res) => {
  try {
    const {
      referenceNo,
      transactionId,
      userId,
      verifiedBy,
      status,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      transactionType,
      vaultCode,
      page = 1,
      limit = 20
    } = req.query;

    const whereClause = {};

    // Build search criteria
    if (referenceNo) whereClause.referenceNo = { [Op.like]: `%${referenceNo}%` };
    if (transactionId) whereClause.transactionId = { [Op.like]: `%${transactionId}%` };
    if (userId) whereClause.userId = userId;
    if (verifiedBy) whereClause.verifiedBy = verifiedBy;
    if (status) whereClause.status = status;
    if (transactionType) whereClause.transactionType = transactionType;
    if (vaultCode) whereClause.vaultCode = vaultCode;

    // Date range
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    // Amount range
    if (minAmount || maxAmount) {
      whereClause.amount = {};
      if (minAmount) whereClause.amount[Op.gte] = parseFloat(minAmount);
      if (maxAmount) whereClause.amount[Op.lte] = parseFloat(maxAmount);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: transactions } = await VaultTransaction.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Vault,
          as: 'vault',
          attributes: ['VAULT_CD', 'VAULT_NM']
        }
      ]
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      transactionId: tx.transactionId,
      referenceNo: tx.referenceNo,
      transactionType: tx.transactionType,
      amount: parseFloat(tx.amount),
      status: tx.status,
      vault: tx.vault ? {
        code: tx.vault.VAULT_CD,
        name: tx.vault.VAULT_NM
      } : null,
      userId: tx.userId,
      verifiedBy: tx.verifiedBy,
      createdAt: tx.createdAt,
      description: tx.description
    }));

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions,
        searchCriteria: {
          referenceNo,
          transactionId,
          userId,
          status,
          transactionType,
          vaultCode,
          dateRange: { startDate, endDate },
          amountRange: { minAmount, maxAmount }
        },
        pagination: {
          total: count,
          pages: totalPages,
          currentPage: parseInt(page),
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Advanced transaction search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Get transaction references by user
 */
export const getTransactionReferencesByUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, days = 30 } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - parseInt(days));

    const transactions = await VaultTransaction.findAll({
      where: {
        [Op.or]: [
          { userId: userId },
          { verifiedBy: userId },
          { approvedBy: userId }
        ],
        createdAt: {
          [Op.gte]: dateFilter
        }
      },
      attributes: [
        'transactionId',
        'referenceNo',
        'transactionType',
        'amount',
        'status',
        'createdAt',
        'vaultCode'
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    const references = transactions.map(tx => ({
      transactionId: tx.transactionId,
      referenceNo: tx.referenceNo,
      type: tx.transactionType,
      amount: parseFloat(tx.amount),
      status: tx.status,
      vaultCode: tx.vaultCode,
      date: tx.createdAt,
      canView: true,
      canReverse: tx.status === 'COMPLETED' && tx.transactionType !== 'REVERSAL'
    }));

    res.json({
      success: true,
      data: {
        userId,
        referenceCount: references.length,
        references,
        summary: {
          totalAmount: references.reduce((sum, ref) => sum + ref.amount, 0),
          byType: references.reduce((acc, ref) => {
            acc[ref.type] = (acc[ref.type] || 0) + 1;
            return acc;
          }, {}),
          byStatus: references.reduce((acc, ref) => {
            acc[ref.status] = (acc[ref.status] || 0) + 1;
            return acc;
          }, {})
        }
      }
    });

  } catch (error) {
    console.error('Get transaction references by user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction references',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Export vault transactions
 */
export const exportVaultTransactions = asyncHandler(async (req, res) => {
  try {
    const {
      vaultId,
      startDate,
      endDate,
      transactionType,
      format = 'csv'
    } = req.query;

    const whereClause = {};

    if (vaultId) {
      whereClause[Op.or] = [
        { vaultId: vaultId },
        { vaultCode: vaultId }
      ];
    }

    if (transactionType) whereClause.transactionType = transactionType;

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const transactions = await VaultTransaction.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: 1000
    });

    if (format === 'csv') {
      // Convert to CSV
      let csv = 'Transaction ID,Reference No,Type,Amount,Date,Status,User,Vault Code\n';
      
      transactions.forEach(tx => {
        csv += `"${tx.transactionId}","${tx.referenceNo || ''}","${tx.transactionType}","${parseFloat(tx.amount)}","${tx.createdAt.toISOString()}","${tx.status}","${tx.userId || ''}","${tx.vaultCode || ''}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=vault-transactions-${Date.now()}.csv`);
      return res.send(csv);
    } else {
      // Return JSON
      res.json({
        success: true,
        data: transactions,
        exportInfo: {
          count: transactions.length,
          format: 'json',
          generatedAt: new Date()
        }
      });
    }

  } catch (error) {
    console.error('Export transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Async handler for all functions
// Async handler for all functions
export default {
  vaultDeposit: asyncHandler(vaultDeposit),
  vaultWithdrawal: asyncHandler(vaultWithdrawal),
  vaultToVaultTransfer: asyncHandler(vaultToVaultTransfer),
  getVaultTransactions: asyncHandler(getVaultTransactions),
  getVaultTransactionById: asyncHandler(getVaultTransactionById),
  getVaultBalance: asyncHandler(getVaultBalance),
  getVaultDailySummary: asyncHandler(getVaultDailySummary),
  getVaultTransactionHistory: asyncHandler(getVaultTransactionHistory),
  cancelVaultTransaction: asyncHandler(cancelVaultTransaction),
  getVaultTransactionStatistics: asyncHandler(getVaultTransactionStatistics),
  searchVaultTransactions: asyncHandler(searchVaultTransactions),
  exportVaultTransactions: asyncHandler(exportVaultTransactions),
  reverseVaultTransaction: asyncHandler(reverseVaultTransaction),
  
  // Newly added functions
  validateVaultTransaction: asyncHandler(validateVaultTransaction),
  getVaultPendingTransactions: asyncHandler(getVaultPendingTransactions),
  approveVaultTransactions: asyncHandler(approveVaultTransactions),
  getVaultTransactionByReference: asyncHandler(getVaultTransactionByReference),
  searchVaultTransactionsAdvanced: asyncHandler(searchVaultTransactionsAdvanced),
  getTransactionReferencesByUser: asyncHandler(getTransactionReferencesByUser)
};