import CashWithdrawalTransaction from '../models/CashWithdrawalTransaction.js';
import { validationResult } from 'express-validator';
import AuditTrail from '../models/AuditTrail.js';

export const withdraw = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { ACCT_NO, ACCT_NM, CUST_ID, amount, DESCRIPTION, SOURCE_OF_FUNDS } = req.body;

    try {
        const withdrawal = new CashWithdrawalTransaction({
            ACCT_NO,
            ACCT_NM,
            CUST_ID,
            amount,
            DESCRIPTION,
            SOURCE_OF_FUNDS
        });

        await withdrawal.save();

        // 📝 Audit Logging
        const userId = req.user?.id || 'system';
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        await AuditTrail.create({
            event_id: Date.now(), // or use uuidv4() for better uniqueness
            user_id: userId,
            event_type: 'CashWithdrawal',
            action: 'Create Withdrawal',
            old_value: null,
            new_value: {
                ACCT_NO,
                ACCT_NM,
                CUST_ID,
                amount,
                DESCRIPTION,
                SOURCE_OF_FUNDS
            },
            ip_address: ipAddress,
            timestamp: new Date()
        });

        res.status(201).json({
            message: "Cash Withdrawal Transaction created successfully",
            transaction: withdrawal
        });

    } catch (error) {
        res.status(500).json({ message: "Failed to create withdrawal transaction", error: error.message });
    }
};


export const getHistory = async (req, res) => {
    try {
        const history = await CashWithdrawalTransaction.find({}).sort({ createdAt: -1 }); // Example sorting by most recent
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch withdrawal history", error: error.message });
    }
};
