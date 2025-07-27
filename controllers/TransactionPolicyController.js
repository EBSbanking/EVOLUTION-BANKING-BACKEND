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

export const setTransactionPolicy = async (req, res) => {
  try {
    const { ROLE_NM, RANGES } = req.body;

    if (!ROLE_NM || !Array.isArray(RANGES) || RANGES.length === 0) {
      return res.status(400).json({ message: 'ROLE_NM and at least one range in RANGES are required.' });
    }

    // ✅ Check in UserRole not BusinessRole
    const userRoleExists = await UserRole.findOne({ USER_ROLE_ID: ROLE_NM });

    if (!userRoleExists) {
      return res.status(403).json({ message: `ROLE_NM "${ROLE_NM}" is not a valid user role.` });
    }

    // ✅ Optional: only Supervisors or Def Role can set
    if (userRoleExists.SUPERVISOR_FG !== 'Y') {
      return res.status(403).json({ message: `ROLE_NM "${ROLE_NM}" is not authorized to set policies.` });
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
        range.AUTHORIZED_ROLES = [];
      }
    }

    let existingPolicy = await TransactionPolicy.findOne({ ROLE_NM });

    if (existingPolicy) {
      existingPolicy.RANGES = RANGES;
      await existingPolicy.save();
      return res.status(200).json({ message: 'Policy updated successfully.', policy: existingPolicy });
    } else {
      const newPolicy = new TransactionPolicy({
        POLICY_ID: await generatePolicyId(),
        ROLE_NM,
        RANGES
      });
      await newPolicy.save();
      return res.status(201).json({ message: 'Policy created successfully.', policy: newPolicy });
    }
  } catch (error) {
    console.error('❌ Error setting policy:', error.message);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
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

      if (MAX_AMOUNT == null || MIN_AMOUNT == null || requiresApproval == null) {
        return res.status(400).json({ message: 'Each range must include MIN_AMOUNT, MAX_AMOUNT, and requiresApproval.' });
      }

      if (requiresApproval && (!AUTHORIZED_ROLES || !Array.isArray(AUTHORIZED_ROLES) || AUTHORIZED_ROLES.length === 0)) {
        return res.status(400).json({ message: 'AUTHORIZED_ROLES must be provided for ranges that require approval.' });
      }

      if (!requiresApproval && (!AUTHORIZED_ROLES || AUTHORIZED_ROLES.length > 0)) {
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

    return res.status(200).json({
      message: `Transaction requires approval from: ${matchedRange.AUTHORIZED_ROLES.join(', ')}`,
      requiresApproval: matchedRange.AUTHORIZED_ROLES.length > 0,
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
