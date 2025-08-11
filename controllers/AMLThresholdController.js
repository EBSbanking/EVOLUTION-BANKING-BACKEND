import AMLThreshold from '../models/AMLThreshold.js';
import { generateEventID, logAuditTrail } from '../utils/AuditLogger.js';
import { GENERAL_TX_TYPES } from '../constants/transactionTypes.js';
import { generateTransactionIds } from '../utils/generateAccountNumber.js';

export const createThreshold = async (req, res) => {
  try {
    const { transaction_type, threshold_amount, currency, active, USER_ID } = req.body;

    if (!GENERAL_TX_TYPES.includes(transaction_type)) {
      return res.status(400).json({ message: 'Invalid transaction type.' });
    }

    const existing = await AMLThreshold.findOne({ transaction_type });
    if (existing) {
      return res.status(400).json({ message: 'Threshold rule already exists for this transaction type.' });
    }

    const rule = new AMLThreshold({
      transaction_type,
      threshold_amount,
      currency,
      active,
      threshold_id: generateTransactionIds('THRESHOLD')
    });

    await rule.save();

    const EVENT_ID = await generateEventID();

    await logAuditTrail(
      'THRESHOLD_RULE',
      EVENT_ID,
      USER_ID,
      'CREATE',
      null,
      rule.toObject(),
      req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    );

    return res.status(201).json({ message: 'Threshold rule created successfully', data: rule });

  } catch (err) {
    console.error('Error in createThreshold:', err);
    return res.status(500).json({ message: 'Failed to create threshold rule', error: err.message });
  }
};


// Get all threshold rules (optionally filter by active status)
export const getAllThresholds = async (req, res) => {
  try {
    const rules = await AMLThreshold.find().sort({ created_at: -1 });
    res.status(200).json(rules);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve thresholds', error: err.message });
  }
};

// Get threshold by transaction type
export const getThresholdByType = async (req, res) => {
  try {
    const { type } = req.params;

    const rule = await AMLThreshold.findOne({ transaction_type: type });
    if (!rule) return res.status(404).json({ message: 'No threshold found for this type' });

    res.status(200).json(rule);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving threshold', error: err.message });
  }
};

// Update a threshold rule
export const updateThreshold = async (req, res) => {
  try {
    const { transaction_type } = req.params;
    const updates = req.body;

    // Optional: Validate required fields
    if (!transaction_type) {
      return res.status(400).json({ message: 'transaction_type is required in URL' });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ message: 'Update payload is required' });
    }

    // Perform update
    const rule = await AMLThreshold.findOneAndUpdate(
      { transaction_type },
      {
        $set: {
          ...updates,
          updated_at: new Date()
        }
      },
      { new: true }
    );

    if (!rule) {
      return res.status(404).json({ message: `No threshold rule found for transaction_type: ${transaction_type}` });
    }

    // Optional: Log audit trail here
    // await logAuditTrail(req.user.id, `Updated threshold for ${transaction_type}`, req.body);

    return res.status(200).json({
      message: 'Threshold successfully updated',
      data: rule
    });
  } catch (error) {
    console.error('Update Threshold Error:', error);
    return res.status(500).json({
      message: 'An error occurred while updating the threshold',
      error: error.message
    });
  }
};



// Delete a threshold rule (optional: implement soft delete)
export const deleteThreshold = async (req, res) => {
  try {
    const { transaction_type } = req.params;

    const rule = await AMLThreshold.findOneAndDelete({ transaction_type });

    if (!rule) {
      return res.status(404).json({ message: 'Threshold not found for this transaction_type' });
    }

    res.status(200).json({ message: 'Threshold rule deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete threshold', error: err.message });
  }
};
