import TransactionPolicy from '../models/TransactionPolicy.js';


// Accept multiple policy ranges for a role
export const setTransactionPolicy = async (req, res) => {
  try {
    const { ROLE_NM, RANGES } = req.body;

    console.log("Incoming policy payload:", { ROLE_NM, RANGES });

    if (!ROLE_NM || !Array.isArray(RANGES) || RANGES.length === 0) {
      return res.status(400).json({ message: 'ROLE_NM and at least one range in RANGES are required.' });
    }

    for (let range of RANGES) {
      const { MIN_AMOUNT, MAX_AMOUNT, requiresApproval, AUTHORIZED_ROLES } = range;

      if (MAX_AMOUNT == null || MIN_AMOUNT == null || requiresApproval == null) {
        return res.status(400).json({ message: 'Each range must include MIN_AMOUNT, MAX_AMOUNT, and requiresApproval.' });
      }

      if (requiresApproval && (!AUTHORIZED_ROLES || !Array.isArray(AUTHORIZED_ROLES) || AUTHORIZED_ROLES.length === 0)) {
        return res.status(400).json({ message: 'AUTHORIZED_ROLES must be provided for ranges that require approval.' });
      }

      if (!requiresApproval && (!AUTHORIZED_ROLES || AUTHORIZED_ROLES.length > 0)) {
        // Optionally enforce empty authorized roles if no approval needed
        range.AUTHORIZED_ROLES = [];
      }
    }

    const policy = await TransactionPolicy.findOneAndUpdate(
      { ROLE_NM },
      { $set: { RANGES } },
      { new: true, upsert: true }
    );

    console.log("✅ Policy ranges set:", policy);
    return res.status(200).json({ message: 'Policy ranges set successfully.', policy });
  } catch (error) {
    console.error('❌ Error setting policy:', error.message);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};



// Validate a transaction based on the role and amount
export const validateTransaction = async (req, res) => {
  try {
    const { ROLE_NM, AMOUNT } = req.body;

    if (!ROLE_NM || AMOUNT == null) {
      return res.status(400).json({ message: 'ROLE_NM and AMOUNT are required.' });
    }

    const policy = await TransactionPolicy.findOne({ ROLE_NM });

    if (!policy || !policy.RANGES || policy.RANGES.length === 0) {
      return res.status(404).json({ message: `No policy ranges found for role ${ROLE_NM}` });
    }

    const matchedRange = policy.RANGES.find(range =>
      AMOUNT >= range.MIN_AMOUNT && AMOUNT <= range.MAX_AMOUNT
    );

    if (!matchedRange) {
      return res.status(400).json({
        message: `No matching policy range found for amount ${AMOUNT} under role ${ROLE_NM}.`,
        requiresApproval: true
      });
    }

    // Transaction falls within allowed range
    return res.status(200).json({
      message: `Transaction requires approval from: ${matchedRange.AUTHORIZED_ROLES.join(', ')}`,
      requiresApproval: matchedRange.AUTHORIZED_ROLES.length > 0,
      authorizedRoles: matchedRange.AUTHORIZED_ROLES
    });

  } catch (error) {
    console.error('❌ Error validating transaction:', error.message);
    console.error(error.stack);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Get all transaction policies or a specific one by role
export const getTransactionPolicies = async (req, res) => {
  try {
    const { role } = req.query;

    let policies;
    if (role) {
      policies = await TransactionPolicy.find({ ROLE_NM: role.toUpperCase() });
    } else {
      policies = await TransactionPolicy.find();
    }

    return res.status(200).json({ policies });
  } catch (error) {
    console.error('Error fetching policies:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
