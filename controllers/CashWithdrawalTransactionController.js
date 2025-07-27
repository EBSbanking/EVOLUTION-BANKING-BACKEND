import CashWithdrawalTransaction from '../models/CashWithdrawalTransaction.js';
import AuditTrail from '../models/AuditTrail.js';
import { verifyAndDecryptTransaction } from '../utils/verifyAndDecryptTransaction.js'; // ✅ Fixed import

export const withdraw = async (req, res) => {
  try {
    // 🔐 Decrypt and verify payload
    const transactionData = verifyAndDecryptTransaction(req.body); // ✅ Fixed usage

    const {
      ACCT_NO,
      ACCT_NM,
      CUST_ID,
      amount,
      DESCRIPTION,
      SOURCE_OF_FUNDS
    } = transactionData;

    if (!ACCT_NO || !ACCT_NM || !CUST_ID || !amount || !DESCRIPTION || !SOURCE_OF_FUNDS) {
      return res.status(400).json({ message: 'Missing required fields in transaction data.' });
    }

    const withdrawal = new CashWithdrawalTransaction({
      ACCT_NO,
      ACCT_NM,
      CUST_ID,
      amount,
      DESCRIPTION,
      SOURCE_OF_FUNDS
    });

    await withdrawal.save();

    const userId = req.user?.id || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    await AuditTrail.create({
      event_id: Date.now(),
      user_id: userId,
      event_type: 'CashWithdrawal',
      action: 'Create Withdrawal',
      old_value: null,
      new_value: transactionData,
      ip_address: ipAddress,
      timestamp: new Date()
    });

    res.status(201).json({
      message: 'Cash Withdrawal Transaction created successfully',
      transaction: withdrawal
    });

  } catch (error) {
    console.error('Withdrawal Error:', error.message);
    res.status(400).json({
      message: error.message || 'Failed to process withdrawal transaction',
    });
  }
};


export const getHistory = async (req, res) => {
  try {
    const history = await CashWithdrawalTransaction.find({}).sort({ createdAt: -1 });
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch withdrawal history',
      error: error.message
    });
  }
};
