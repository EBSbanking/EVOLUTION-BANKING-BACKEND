// src/controllers/cardSettlementConfigController.js
import CardSettlementConfig from '../models/CardSettlementConfig.js';
import { sequelize } from '../../config/db.js';

/**
 * Get or create settlement configuration (singleton).
 * Auto-creates a default record if none exists.
 */
export const getConfig = async (req, res) => {
  try {
    let config = await CardSettlementConfig.findOne();
    if (!config) {
      config = await CardSettlementConfig.create({
        account_number: '9999999999',
        account_name: 'Card Settlement Account',
        available_balance: 0,
        ledger_balance: 0,
        cleared_balance: 0,
        currency: 'NGN',
        updated_by: req.user?.username || req.user?.id || 'SYSTEM'
      });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching settlement config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Update settlement account details (name, number, currency).
 * Admin only.
 */
export const updateConfig = async (req, res) => {
  const { account_number, account_name, currency } = req.body;
  try {
    let config = await CardSettlementConfig.findOne();
    if (!config) {
      config = await CardSettlementConfig.create({});
    }
    if (account_number) config.account_number = account_number;
    if (account_name) config.account_name = account_name;
    if (currency) config.currency = currency;
    config.updated_by = req.user?.username || req.user?.id || 'ADMIN';
    await config.save();
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error updating settlement config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Fund the settlement account (increase balance).
 * Admin only.
 */
export const fundAccount = async (req, res) => {
  const { amount, sourceReference } = req.body; // sourceReference optional
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be positive' });
  }
  const transaction = await sequelize.transaction();
  try {
    let config = await CardSettlementConfig.findOne({ transaction, lock: true });
    if (!config) {
      config = await CardSettlementConfig.create({}, { transaction });
    }
    const addAmount = parseFloat(amount);
    const newAvailable = parseFloat(config.available_balance) + addAmount;
    const newLedger = parseFloat(config.ledger_balance) + addAmount;
    const newCleared = parseFloat(config.cleared_balance) + addAmount;

    await config.update({
      available_balance: newAvailable,
      ledger_balance: newLedger,
      cleared_balance: newCleared,
      updated_by: req.user?.username || req.user?.id || 'ADMIN'
    }, { transaction });

    // Optional: log the funding transaction in a separate ledger table
    // await FundingLog.create({ amount, sourceReference, newBalance: newAvailable });

    await transaction.commit();
    res.json({
      success: true,
      message: `Settlement account funded with ${config.currency} ${addAmount.toFixed(2)}`,
      newBalance: newAvailable,
      data: config
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Funding error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Withdraw from settlement account (reduce balance).
 * Admin only – use with caution.
 */
export const withdrawFromAccount = async (req, res) => {
  const { amount, reason } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Amount must be positive' });
  }
  const transaction = await sequelize.transaction();
  try {
    let config = await CardSettlementConfig.findOne({ transaction, lock: true });
    if (!config) {
      return res.status(404).json({ success: false, error: 'Settlement configuration not found' });
    }
    const subtractAmount = parseFloat(amount);
    if (parseFloat(config.available_balance) < subtractAmount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }
    const newAvailable = parseFloat(config.available_balance) - subtractAmount;
    const newLedger = parseFloat(config.ledger_balance) - subtractAmount;
    const newCleared = parseFloat(config.cleared_balance) - subtractAmount;

    await config.update({
      available_balance: newAvailable,
      ledger_balance: newLedger,
      cleared_balance: newCleared,
      updated_by: req.user?.username || req.user?.id || 'ADMIN'
    }, { transaction });

    // Optional: log withdrawal
    await transaction.commit();
    res.json({
      success: true,
      message: `Withdrew ${config.currency} ${subtractAmount.toFixed(2)} from settlement account`,
      newBalance: newAvailable,
      data: config
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Withdrawal error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get only the balance (convenience endpoint)
 */
export const getBalance = async (req, res) => {
  try {
    let config = await CardSettlementConfig.findOne();
    if (!config) {
      config = await CardSettlementConfig.create({});
    }
    res.json({
      success: true,
      balance: config.available_balance,
      currency: config.currency,
      account_name: config.account_name
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};