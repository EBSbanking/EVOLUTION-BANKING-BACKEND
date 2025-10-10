import TransactionPolicy from '../models/TransactionPolicy.js';
import UserRole from '../models/UserRole.js';

const generatePolicyId = async () => {
  let policyId;
  let exists = true;
  while (exists) {
    policyId = Math.floor(1000000 + Math.random() * 9000000).toString();
    exists = await TransactionPolicy.findOne({ POLICY_ID: policyId });
  }
  return policyId;
};

// ✅ Create or update transaction policies
export const setTransactionPolicy = async (req, res) => {
  try {
    const { POLICIES } = req.body;
    if (!Array.isArray(POLICIES) || POLICIES.length === 0) {
      return res.status(400).json({ message: "At least one policy is required." });
    }

    for (const policy of POLICIES) {
      if (!Array.isArray(policy.ROLES) || policy.ROLES.length === 0) {
        return res.status(400).json({ message: "Each policy must include at least one role." });
      }

      for (const role of policy.ROLES) {
        const { ROLE_NM, RANGES, POLICY_TYPE } = role;

        if (!ROLE_NM || !POLICY_TYPE || !Array.isArray(RANGES) || RANGES.length === 0) {
          return res.status(400).json({ message: "ROLE_NM, POLICY_TYPE and at least one range in RANGES are required." });
        }

        // ✅ validate role against UserRole
        const targetRole = await UserRole.findOne({
          ROLE_NM: { $regex: `^${ROLE_NM}$`, $options: "i" }
        });

        if (!targetRole) {
          return res.status(403).json({ message: `ROLE_NM "${ROLE_NM}" is not a valid user role.` });
        }

        // Validate each range
        for (const range of RANGES) {
          const { MIN_AMOUNT, MAX_AMOUNT, requiresApproval, AUTHORIZED_ROLES } = range;

          if (MIN_AMOUNT == null || MAX_AMOUNT == null || requiresApproval == null) {
            return res.status(400).json({ message: "Each range must include MIN_AMOUNT, MAX_AMOUNT, and requiresApproval." });
          }

          if (requiresApproval && (!AUTHORIZED_ROLES || AUTHORIZED_ROLES.length === 0)) {
            return res.status(400).json({ message: "AUTHORIZED_ROLES must be provided for ranges that require approval." });
          }

          if (!requiresApproval) {
            range.AUTHORIZED_ROLES = [];
          }
        }

        // Create new or update existing policy
        const policyId = await generatePolicyId();
        await TransactionPolicy.findOneAndUpdate(
          { ROLE_NM: ROLE_NM.toUpperCase(), POLICY_TYPE },
          { ROLE_NM: ROLE_NM.toUpperCase(), POLICY_TYPE, RANGES: RANGES, POLICY_ID: policyId },
          { upsert: true, new: true }
        );
      }
    }

    return res.status(201).json({ message: "Policies processed successfully." });
  } catch (error) {
    console.error("❌ Error setting policy:", error.message);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// ✅ Update a policy by POLICY_ID
export const updatePolicy = async (req, res) => {
  try {
    const { id } = req.params; // POLICY_ID
    const { RANGES } = req.body;

    if (!Array.isArray(RANGES) || RANGES.length === 0) {
      return res.status(400).json({ message: 'At least one range in RANGES is required.' });
    }

    for (let range of RANGES) {
      const { MIN_AMOUNT, MAX_AMOUNT, requiresApproval, AUTHORIZED_ROLES } = range;

      if (MIN_AMOUNT == null || MAX_AMOUNT == null || requiresApproval == null) {
        return res.status(400).json({ message: 'Each range must include MIN_AMOUNT, MAX_AMOUNT, and requiresApproval.' });
      }

      if (requiresApproval && (!AUTHORIZED_ROLES || !Array.isArray(AUTHORIZED_ROLES) || AUTHORIZED_ROLES.length === 0)) {
        return res.status(400).json({ message: 'AUTHORIZED_ROLES must be provided for ranges that require approval.' });
      }

      if (!requiresApproval) {
        range.AUTHORIZED_ROLES = [];
      }
    }

    const policy = await TransactionPolicy.findOneAndUpdate(
      { POLICY_ID: id },
      { RANGES },
      { new: true }
    );

    if (!policy) {
      return res.status(404).json({ message: `No policy found with POLICY_ID ${id}` });
    }

    return res.status(200).json({ message: 'Policy updated successfully.', policy });
  } catch (error) {
    console.error('❌ Error updating policy:', error.message);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// ✅ Validate transaction based on amount and role
export const validateTransaction = async (req, res) => {
  try {
    const { ROLE_NM, AMOUNT, POLICY_TYPE } = req.body;

    if (!ROLE_NM || AMOUNT == null || !POLICY_TYPE) {
      return res.status(400).json({ message: 'ROLE_NM, POLICY_TYPE and AMOUNT are required.' });
    }

    const policy = await TransactionPolicy.findOne({ ROLE_NM: ROLE_NM.toUpperCase(), POLICY_TYPE });

    if (!policy || !policy.RANGES || policy.RANGES.length === 0) {
      return res.status(404).json({ message: `No policy ranges found for role ${ROLE_NM} and type ${POLICY_TYPE}` });
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

    return res.status(200).json({
      message: matchedRange.requiresApproval
        ? `Transaction requires approval from: ${matchedRange.AUTHORIZED_ROLES.join(', ')}`
        : "Transaction can be auto-approved.",
      requiresApproval: matchedRange.requiresApproval,
      authorizedRoles: matchedRange.AUTHORIZED_ROLES
    });

  } catch (error) {
    console.error('❌ Error validating transaction:', error.message);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// ✅ Get all or role-specific policies
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
