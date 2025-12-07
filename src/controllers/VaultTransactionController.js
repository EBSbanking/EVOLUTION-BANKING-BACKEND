import mongoose from 'mongoose';
import Vault from '../models/Vault.js';
import Drawer from '../models/Drawer.js';
import VaultTransaction from '../models/VaultTransaction.js';
import AuditTrail from '../models/AuditTrail.js';

// =============================================
// VAULT TRANSACTION CONTROLLERS
// =============================================

/**
 * Deposit cash into vault
 */
export const vaultDeposit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

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
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Find vault and drawer
    const vault = await Vault.findOne({
      $or: [
        { _id: vaultId },
        { VAULT_ID: parseInt(vaultId) },
        { VAULT_CD: vaultId }
      ]
    }).populate('DRAWER_REF').session(session);

    if (!vault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const drawer = await Drawer.findOne({
      $or: [
        { _id: drawerId },
        { DRAWER_ID: parseInt(drawerId) }
      ]
    }).session(session);

    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }

    // Check vault capacity
    const vaultCapacity = parseFloat(vault.VAULT_CAPACITY.toString());
    const currentVaultBalance = parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString());
    
    if (currentVaultBalance + amount > vaultCapacity) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Deposit would exceed vault capacity',
        currentBalance: currentVaultBalance,
        capacity: vaultCapacity,
        wouldBe: currentVaultBalance + amount
      });
    }

    // Check drawer balance (if source is drawer)
    if (sourceType === 'DRAWER') {
      const drawerBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
      if (drawerBalance < amount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Insufficient drawer balance',
          available: drawerBalance,
          required: amount
        });
      }
    }

    // Update balances
    if (sourceType === 'DRAWER') {
      // Debit drawer, credit vault
      drawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(
        (parseFloat(drawer.CURRENT_BALANCE.toString()) - amount).toFixed(2)
      );
    }

    // Credit vault
    vault.DRAWER_REF.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(
      (currentVaultBalance + amount).toFixed(2)
    );

    await drawer.save({ session });
    await vault.DRAWER_REF.save({ session });

    // Create transaction record
    const transaction = new VaultTransaction({
      transactionId: `VTRX-${Date.now()}`,
      vaultId: vault._id,
      vaultCode: vault.VAULT_CD,
      drawerId: drawer._id,
      transactionType,
      amount: mongoose.Types.Decimal128.fromString(amount.toString()),
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
      newBalance: currentVaultBalance + amount,
      ipAddress: req.ip
    });

    await transaction.save({ session });

    // Create audit trail
    const auditTrail = new AuditTrail({
      event_id: Date.now(),
      user_id: userId,
      event_type: 'VAULT_TRANSACTION',
      action: `Vault ${transactionType}`,
      entity_type: 'Vault',
      entity_id: vault._id,
      description: description || `Vault ${transactionType.toLowerCase()}`,
      reference_no: referenceNo,
      additional_info: {
        vault_code: vault.VAULT_CD,
        amount: amount,
        transaction_type: transactionType,
        source_type: sourceType,
        source_id: sourceId,
        currency_breakdown: currencyBreakdown,
        verified_by: verifiedBy
      },
      ip_address: req.ip
    });

    await auditTrail.save({ session, ordered: true });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Vault ${transactionType.toLowerCase()} completed successfully`,
      data: {
        transaction: {
          transactionId: transaction.transactionId,
          referenceNo: transaction.referenceNo,
          amount: amount,
          type: transactionType,
          status: 'COMPLETED',
          timestamp: new Date()
        },
        vault: {
          code: vault.VAULT_CD,
          previousBalance: currentVaultBalance,
          newBalance: currentVaultBalance + amount,
          netChange: amount
        },
        source: sourceType === 'DRAWER' ? {
          type: 'Drawer',
          id: drawerId,
          previousBalance: parseFloat(drawer.CURRENT_BALANCE.toString()) + amount,
          newBalance: parseFloat(drawer.CURRENT_BALANCE.toString()),
          netChange: -amount
        } : null
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Vault transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process vault transaction',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * Withdraw cash from vault
 */
export const vaultWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

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
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: vaultId, drawerId, amount, userId, destinationId'
      });
    }

    // Find vault and drawer
    const vault = await Vault.findOne({
      $or: [
        { _id: vaultId },
        { VAULT_ID: parseInt(vaultId) },
        { VAULT_CD: vaultId }
      ]
    }).populate('DRAWER_REF').session(session);

    if (!vault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const drawer = await Drawer.findOne({
      $or: [
        { _id: drawerId },
        { DRAWER_ID: parseInt(drawerId) }
      ]
    }).session(session);

    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Drawer not found'
      });
    }

    // Check vault balance
    const currentVaultBalance = parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString());
    if (currentVaultBalance < amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Insufficient vault balance',
        available: currentVaultBalance,
        required: amount
      });
    }

    // Update balances
    // Debit vault
    vault.DRAWER_REF.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(
      (currentVaultBalance - amount).toFixed(2)
    );

    // Credit destination drawer if applicable
    if (destinationType === 'DRAWER') {
      const destinationDrawer = await Drawer.findOne({
        $or: [
          { _id: destinationId },
          { DRAWER_ID: parseInt(destinationId) }
        ]
      }).session(session);

      if (!destinationDrawer) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Destination drawer not found'
        });
      }

      destinationDrawer.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(
        (parseFloat(destinationDrawer.CURRENT_BALANCE.toString()) + amount).toFixed(2)
      );
      await destinationDrawer.save({ session });
    }

    await vault.DRAWER_REF.save({ session });

    // Create transaction record
    const transaction = new VaultTransaction({
      transactionId: `VTRX-${Date.now()}`,
      vaultId: vault._id,
      vaultCode: vault.VAULT_CD,
      drawerId: drawer._id,
      transactionType,
      amount: mongoose.Types.Decimal128.fromString(amount.toString()),
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
      newBalance: currentVaultBalance - amount,
      ipAddress: req.ip
    });

    await transaction.save({ session });

    // Create audit trail
    const auditTrail = new AuditTrail({
      event_id: Date.now(),
      user_id: userId,
      event_type: 'VAULT_TRANSACTION',
      action: `Vault ${transactionType}`,
      entity_type: 'Vault',
      entity_id: vault._id,
      description: description || `Vault ${transactionType.toLowerCase()}`,
      reference_no: referenceNo,
      additional_info: {
        vault_code: vault.VAULT_CD,
        amount: amount,
        transaction_type: transactionType,
        destination_type: destinationType,
        destination_id: destinationId,
        purpose: purpose,
        currency_breakdown: currencyBreakdown,
        verified_by: verifiedBy
      },
      ip_address: req.ip
    });

    await auditTrail.save({ session, ordered: true });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Vault ${transactionType.toLowerCase()} completed successfully`,
      data: {
        transaction: {
          transactionId: transaction.transactionId,
          referenceNo: transaction.referenceNo,
          amount: amount,
          type: transactionType,
          status: 'COMPLETED',
          timestamp: new Date()
        },
        vault: {
          code: vault.VAULT_CD,
          previousBalance: currentVaultBalance,
          newBalance: currentVaultBalance - amount,
          netChange: -amount
        },
        destination: destinationType === 'DRAWER' ? {
          type: 'Drawer',
          id: destinationId,
          netChange: amount
        } : null
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Vault withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process vault withdrawal',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * Vault to Vault Transfer
 */
export const vaultToVaultTransfer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      sourceVaultId,
      targetVaultId,
      sourceDrawerId,
      targetDrawerId,
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
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Find source vault and drawer
    const sourceVault = await Vault.findOne({
      $or: [
        { _id: sourceVaultId },
        { VAULT_ID: parseInt(sourceVaultId) },
        { VAULT_CD: sourceVaultId }
      ]
    }).populate('DRAWER_REF').session(session);

    if (!sourceVault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Source vault not found'
      });
    }

    // Find target vault and drawer
    const targetVault = await Vault.findOne({
      $or: [
        { _id: targetVaultId },
        { VAULT_ID: parseInt(targetVaultId) },
        { VAULT_CD: targetVaultId }
      ]
    }).populate('DRAWER_REF').session(session);

    if (!targetVault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Target vault not found'
      });
    }

    // Check source vault balance
    const sourceBalance = parseFloat(sourceVault.DRAWER_REF.CURRENT_BALANCE.toString());
    if (sourceBalance < amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Insufficient source vault balance',
        available: sourceBalance,
        required: amount
      });
    }

    // Check target vault capacity
    const targetCapacity = parseFloat(targetVault.VAULT_CAPACITY.toString());
    const targetBalance = parseFloat(targetVault.DRAWER_REF.CURRENT_BALANCE.toString());
    
    if (targetBalance + amount > targetCapacity) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Transfer would exceed target vault capacity',
        currentBalance: targetBalance,
        capacity: targetCapacity,
        wouldBe: targetBalance + amount
      });
    }

    // Update balances
    // Debit source vault
    sourceVault.DRAWER_REF.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(
      (sourceBalance - amount).toFixed(2)
    );

    // Credit target vault
    targetVault.DRAWER_REF.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(
      (targetBalance + amount).toFixed(2)
    );

    await sourceVault.DRAWER_REF.save({ session });
    await targetVault.DRAWER_REF.save({ session });

    // Create transaction record
    const transaction = new VaultTransaction({
      transactionId: `V2V-${Date.now()}`,
      sourceVaultId: sourceVault._id,
      sourceVaultCode: sourceVault.VAULT_CD,
      targetVaultId: targetVault._id,
      targetVaultCode: targetVault.VAULT_CD,
      transactionType,
      amount: mongoose.Types.Decimal128.fromString(amount.toString()),
      currencyBreakdown,
      referenceNo,
      description,
      userId,
      verifiedBy,
      approvalId,
      transferReason,
      status: 'COMPLETED',
      sourcePreviousBalance: sourceBalance,
      sourceNewBalance: sourceBalance - amount,
      targetPreviousBalance: targetBalance,
      targetNewBalance: targetBalance + amount,
      ipAddress: req.ip
    });

    await transaction.save({ session });

    // Create audit trails for both vaults
    const auditTrails = [
      {
        event_id: Date.now(),
        user_id: userId,
        event_type: 'VAULT_TRANSFER',
        action: 'Vault to Vault Transfer - DEBIT',
        entity_type: 'Vault',
        entity_id: sourceVault._id,
        description: `Transfer to vault ${targetVault.VAULT_CD}: ${description || 'Vault transfer'}`,
        reference_no: referenceNo,
        additional_info: {
          source_vault_code: sourceVault.VAULT_CD,
          target_vault_code: targetVault.VAULT_CD,
          amount: amount,
          transfer_reason: transferReason,
          currency_breakdown: currencyBreakdown,
          verified_by: verifiedBy,
          previous_balance: sourceBalance,
          new_balance: sourceBalance - amount,
          net_change: -amount
        },
        ip_address: req.ip
      },
      {
        event_id: Date.now() + 1,
        user_id: userId,
        event_type: 'VAULT_TRANSFER',
        action: 'Vault to Vault Transfer - CREDIT',
        entity_type: 'Vault',
        entity_id: targetVault._id,
        description: `Transfer from vault ${sourceVault.VAULT_CD}: ${description || 'Vault transfer'}`,
        reference_no: referenceNo,
        additional_info: {
          source_vault_code: sourceVault.VAULT_CD,
          target_vault_code: targetVault.VAULT_CD,
          amount: amount,
          transfer_reason: transferReason,
          currency_breakdown: currencyBreakdown,
          verified_by: verifiedBy,
          previous_balance: targetBalance,
          new_balance: targetBalance + amount,
          net_change: amount
        },
        ip_address: req.ip
      }
    ];

    await AuditTrail.create(auditTrails, { session, ordered: true });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Vault to vault transfer completed successfully',
      data: {
        transaction: {
          transactionId: transaction.transactionId,
          referenceNo: transaction.referenceNo,
          amount: amount,
          type: transactionType,
          status: 'COMPLETED',
          timestamp: new Date()
        },
        sourceVault: {
          code: sourceVault.VAULT_CD,
          previousBalance: sourceBalance,
          newBalance: sourceBalance - amount,
          netChange: -amount
        },
        targetVault: {
          code: targetVault.VAULT_CD,
          previousBalance: targetBalance,
          newBalance: targetBalance + amount,
          netChange: amount
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Vault to vault transfer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process vault to vault transfer',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * Get vault transactions with filters
 */
export const getVaultTransactions = async (req, res) => {
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

    const filter = {};

    // Apply filters
    if (vaultId) {
      filter.$or = [
        { vaultId: vaultId },
        { vaultCode: vaultId },
        { sourceVaultId: vaultId },
        { targetVaultId: vaultId }
      ];
    }

    if (transactionType) filter.transactionType = transactionType;
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) filter.amount.$gte = parseFloat(minAmount);
      if (maxAmount) filter.amount.$lte = parseFloat(maxAmount);
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };

    const transactions = await VaultTransaction.paginate(filter, options);

    res.json({
      success: true,
      data: transactions
    });

  } catch (error) {
    console.error('Get vault transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vault transactions',
      error: error.message
    });
  }
};

/**
 * Get vault transaction by ID
 */
export const getVaultTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await VaultTransaction.findOne({
      $or: [
        { _id: transactionId },
        { transactionId: transactionId },
        { referenceNo: transactionId }
      ]
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
      error: error.message
    });
  }
};

/**
 * Get vault balance
 */
export const getVaultBalance = async (req, res) => {
  try {
    const { vaultId } = req.params;

    const vault = await Vault.findOne({
      $or: [
        { _id: vaultId },
        { VAULT_ID: parseInt(vaultId) },
        { VAULT_CD: vaultId }
      ]
    }).populate('DRAWER_REF');

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const balance = parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString());
    const capacity = parseFloat(vault.VAULT_CAPACITY.toString());
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
        lastUpdated: vault.DRAWER_REF.UPDATED_AT
      }
    });

  } catch (error) {
    console.error('Get vault balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vault balance',
      error: error.message
    });
  }
};

/**
 * Get vault daily summary
 */
export const getVaultDailySummary = async (req, res) => {
  try {
    const { vaultId, date } = req.params;
    
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const vault = await Vault.findOne({
      $or: [
        { _id: vaultId },
        { VAULT_ID: parseInt(vaultId) },
        { VAULT_CD: vaultId }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Get transactions for the day
    const transactions = await VaultTransaction.find({
      $or: [
        { vaultId: vault._id },
        { sourceVaultId: vault._id },
        { targetVaultId: vault._id }
      ],
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: 'COMPLETED'
    }).sort({ createdAt: 1 });

    // Calculate totals
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalTransfersOut = 0;
    let totalTransfersIn = 0;
    
    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount.toString());
      
      if (tx.transactionType === 'DEPOSIT') {
        totalDeposits += amount;
      } else if (tx.transactionType === 'WITHDRAWAL') {
        totalWithdrawals += amount;
      } else if (tx.transactionType === 'VAULT_TRANSFER') {
        if (tx.sourceVaultId.toString() === vault._id.toString()) {
          totalTransfersOut += amount;
        } else if (tx.targetVaultId.toString() === vault._id.toString()) {
          totalTransfersIn += amount;
        }
      }
    });

    const netChange = (totalDeposits + totalTransfersIn) - (totalWithdrawals + totalTransfersOut);

    res.json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        vaultCode: vault.VAULT_CD,
        vaultName: vault.VAULT_NM,
        summary: {
          totalTransactions: transactions.length,
          totalDeposits,
          totalWithdrawals,
          totalTransfersIn,
          totalTransfersOut,
          netChange,
          openingBalance: parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString()) - netChange,
          closingBalance: parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString())
        },
        transactions: transactions.slice(0, 50) // Limit to last 50 transactions
      }
    });

  } catch (error) {
    console.error('Get vault daily summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily summary',
      error: error.message
    });
  }
};

/**
 * Get vault transaction history
 */
export const getVaultTransactionHistory = async (req, res) => {
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
      $or: [
        { _id: vaultId },
        { VAULT_ID: parseInt(vaultId) },
        { VAULT_CD: vaultId }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const filter = {
      $or: [
        { vaultId: vault._id },
        { sourceVaultId: vault._id },
        { targetVaultId: vault._id }
      ]
    };

    if (transactionType) filter.transactionType = transactionType;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };

    const transactions = await VaultTransaction.paginate(filter, options);

    res.json({
      success: true,
      data: {
        vaultCode: vault.VAULT_CD,
        vaultName: vault.VAULT_NM,
        transactions
      }
    });

  } catch (error) {
    console.error('Get vault transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history',
      error: error.message
    });
  }
};

/**
 * Search vault transactions
 */
export const searchVaultTransactions = async (req, res) => {
  try {
    const { q, field = 'referenceNo' } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const filter = {
      [field]: { $regex: q, $options: 'i' }
    };

    const transactions = await VaultTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

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
      error: error.message
    });
  }
};

/**
 * Cancel vault transaction
 */
export const cancelVaultTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.params;
    const { cancelledBy, reason } = req.body;

    if (!cancelledBy || !reason) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'cancelledBy and reason are required'
      });
    }

    const transaction = await VaultTransaction.findOne({
      $or: [
        { _id: transactionId },
        { transactionId: transactionId }
      ]
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.status !== 'PENDING') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Only pending transactions can be cancelled'
      });
    }

    // Update transaction status
    transaction.status = 'CANCELLED';
    transaction.cancelledBy = cancelledBy;
    transaction.cancellationReason = reason;
    transaction.cancelledAt = new Date();

    await transaction.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Transaction cancelled successfully',
      data: transaction
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Cancel transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel transaction',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * Reverse vault transaction
 */
export const reverseVaultTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.params;
    const { reversedBy, reason } = req.body;

    if (!reversedBy || !reason) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'reversedBy and reason are required'
      });
    }

    const originalTransaction = await VaultTransaction.findOne({
      $or: [
        { _id: transactionId },
        { transactionId: transactionId }
      ]
    }).session(session);

    if (!originalTransaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (originalTransaction.status !== 'COMPLETED') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Only completed transactions can be reversed'
      });
    }

    // Reverse the transaction based on type
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
        // Reverse deposit: withdraw from vault
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
        // Reverse withdrawal: deposit back to vault
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
        // Reverse transfer: transfer back
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

    const reverseTransaction = new VaultTransaction(reverseTransactionData);
    await reverseTransaction.save({ session });

    // Update original transaction
    originalTransaction.status = 'REVERSED';
    originalTransaction.reversedBy = reversedBy;
    originalTransaction.reversalReason = reason;
    originalTransaction.reversedAt = new Date();
    await originalTransaction.save({ session });

    // Create audit trail
    const auditTrail = new AuditTrail({
      event_id: Date.now(),
      user_id: reversedBy,
      event_type: 'VAULT_TRANSACTION_REVERSAL',
      action: 'Transaction Reversal',
      entity_type: 'VaultTransaction',
      entity_id: originalTransaction._id,
      description: `Reversal: ${reason}`,
      reference_no: reverseTransaction.transactionId,
      additional_info: {
        original_transaction: originalTransaction.transactionId,
        original_type: originalTransaction.transactionType,
        amount: parseFloat(originalTransaction.amount.toString()),
        reason: reason
      },
      ip_address: req.ip
    });

    await auditTrail.save({ session, ordered: true });

    await session.commitTransaction();

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
    await session.abortTransaction();
    console.error('Reverse transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reverse transaction',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * Get pending vault transactions
 */
export const getVaultPendingTransactions = async (req, res) => {
  try {
    const { vaultId } = req.query;
    
    const filter = {
      status: 'PENDING'
    };

    if (vaultId) {
      filter.$or = [
        { vaultId: vaultId },
        { vaultCode: vaultId }
      ];
    }

    const transactions = await VaultTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: {
        count: transactions.length,
        transactions
      }
    });

  } catch (error) {
    console.error('Get pending transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending transactions',
      error: error.message
    });
  }
};

/**
 * Validate vault transaction
 */
export const validateVaultTransaction = async (req, res) => {
  try {
    const {
      vaultId,
      transactionType,
      amount,
      sourceType,
      sourceId,
      destinationType,
      destinationId
    } = req.body;

    // Validate required fields
    if (!vaultId || !transactionType || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const vault = await Vault.findOne({
      $or: [
        { _id: vaultId },
        { VAULT_ID: parseInt(vaultId) },
        { VAULT_CD: vaultId }
      ]
    }).populate('DRAWER_REF');

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const validation = {
      isValid: true,
      messages: [],
      requirements: {}
    };

    const vaultBalance = parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString());
    const vaultCapacity = parseFloat(vault.VAULT_CAPACITY.toString());

    switch (transactionType) {
      case 'DEPOSIT':
        // Check if deposit would exceed capacity
        if (vaultBalance + amount > vaultCapacity) {
          validation.isValid = false;
          validation.messages.push('Deposit would exceed vault capacity');
        }
        
        // Check source balance if source is drawer
        if (sourceType === 'DRAWER' && sourceId) {
          const sourceDrawer = await Drawer.findOne({
            $or: [
              { _id: sourceId },
              { DRAWER_ID: parseInt(sourceId) }
            ]
          });
          
          if (!sourceDrawer) {
            validation.isValid = false;
            validation.messages.push('Source drawer not found');
          } else if (parseFloat(sourceDrawer.CURRENT_BALANCE.toString()) < amount) {
            validation.isValid = false;
            validation.messages.push('Insufficient source drawer balance');
          }
        }
        break;

      case 'WITHDRAWAL':
        // Check if vault has sufficient balance
        if (vaultBalance < amount) {
          validation.isValid = false;
          validation.messages.push('Insufficient vault balance');
        }
        
        // Check destination drawer capacity if applicable
        if (destinationType === 'DRAWER' && destinationId) {
          const destDrawer = await Drawer.findOne({
            $or: [
              { _id: destinationId },
              { DRAWER_ID: parseInt(destinationId) }
            ]
          });
          
          if (!destDrawer) {
            validation.isValid = false;
            validation.messages.push('Destination drawer not found');
          } else {
            const destBalance = parseFloat(destDrawer.CURRENT_BALANCE.toString());
            const destMaxBalance = parseFloat(destDrawer.MAX_BAL.toString());
            
            if (destBalance + amount > destMaxBalance) {
              validation.isValid = false;
              validation.messages.push('Withdrawal would exceed destination drawer maximum balance');
            }
          }
        }
        break;

      case 'VAULT_TRANSFER':
        // For vault transfers, you need both source and target vaults
        validation.isValid = false;
        validation.messages.push('For vault transfers, use the vault-to-vault endpoint');
        break;
    }

    // Check approval requirements
    if (amount > 1000000) { // Example threshold
      validation.requiresApproval = true;
      validation.approvalLevel = 'MANAGER';
      validation.messages.push('Transaction requires manager approval');
    }

    res.json({
      success: true,
      data: validation
    });

  } catch (error) {
    console.error('Validate transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate transaction',
      error: error.message
    });
  }
};

/**
 * Get vault transaction by reference
 */
export const getVaultTransactionByReference = async (req, res) => {
  try {
    const { referenceNo } = req.params;

    const transaction = await VaultTransaction.findOne({
      referenceNo: referenceNo
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
    console.error('Get transaction by reference error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: error.message
    });
  }
};

/**
 * Get vault transaction statistics
 */
export const getVaultTransactionStatistics = async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { startDate, endDate } = req.query;

    const vault = await Vault.findOne({
      $or: [
        { _id: vaultId },
        { VAULT_ID: parseInt(vaultId) },
        { VAULT_CD: vaultId }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const filter = {
      $or: [
        { vaultId: vault._id },
        { sourceVaultId: vault._id },
        { targetVaultId: vault._id }
      ],
      status: 'COMPLETED'
    };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const transactions = await VaultTransaction.find(filter);

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
      dailyAverages: {},
      approvalStats: {
        requiresApproval: 0,
        approved: 0,
        rejected: 0,
        pending: 0
      }
    };

    transactions.forEach(tx => {
      const amount = parseFloat(tx.amount.toString());
      const type = tx.transactionType;
      
      // Count by type
      statistics.byType[type] = (statistics.byType[type] || 0) + 1;
      
      // Sum amounts by type
      if (type === 'DEPOSIT') {
        statistics.totalAmount.DEPOSIT += amount;
      } else if (type === 'WITHDRAWAL') {
        statistics.totalAmount.WITHDRAWAL += amount;
      } else if (type === 'VAULT_TRANSFER') {
        if (tx.sourceVaultId.toString() === vault._id.toString()) {
          statistics.totalAmount.VAULT_TRANSFER_OUT += amount;
        } else if (tx.targetVaultId.toString() === vault._id.toString()) {
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
      error: error.message
    });
  }
};

/**
 * Export vault transactions
 */
export const exportVaultTransactions = async (req, res) => {
  try {
    const {
      vaultId,
      startDate,
      endDate,
      transactionType,
      format = 'csv'
    } = req.query;

    const filter = {};

    if (vaultId) {
      filter.$or = [
        { vaultId: vaultId },
        { vaultCode: vaultId }
      ];
    }

    if (transactionType) filter.transactionType = transactionType;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const transactions = await VaultTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(1000);

    if (format === 'csv') {
      // Convert to CSV
      let csv = 'Transaction ID,Reference No,Type,Amount,Date,Status,User,Vault Code\n';
      
      transactions.forEach(tx => {
        csv += `"${tx.transactionId}","${tx.referenceNo || ''}","${tx.transactionType}","${parseFloat(tx.amount.toString())}","${tx.createdAt.toISOString()}","${tx.status}","${tx.userId || ''}","${tx.vaultCode || ''}"\n`;
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
      error: error.message
    });
  }
};

// Add placeholder functions for routes you might not need yet
export const processBulkVaultTransactions = async (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Bulk transaction processing not implemented yet'
  });
};

export default {
  vaultDeposit,
  vaultWithdrawal,
  vaultToVaultTransfer,
  getVaultTransactions,
  getVaultTransactionById,
  getVaultBalance,
  getVaultDailySummary,
  getVaultTransactionHistory,
  cancelVaultTransaction,
  getVaultTransactionStatistics,
  searchVaultTransactions,
  exportVaultTransactions,
  reverseVaultTransaction,
  getVaultPendingTransactions,
  processBulkVaultTransactions,
  validateVaultTransaction,
  getVaultTransactionByReference
};