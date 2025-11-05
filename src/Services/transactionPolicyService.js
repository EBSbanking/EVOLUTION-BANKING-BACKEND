// services/transactionPolicyService.js
import TransactionPolicy from '../models/TransactionPolicy.js';

export const checkPolicy = async (role, amount, policyType, session = null) => {
  const policy = await TransactionPolicy.findOne({
    ROLE_NM: role.toUpperCase(),
    POLICY_TYPE: policyType
  }).session(session);

  if (!policy || !policy.RANGES) {
    return { requiresApproval: true, authorizedRoles: [] };
  }

  const applicableRange = policy.RANGES.find(
    range => amount >= range.MIN_AMOUNT && amount <= range.MAX_AMOUNT
  );

  if (!applicableRange) {
    return { requiresApproval: true, authorizedRoles: [] };
  }

  return {
    requiresApproval: applicableRange.REQUIRES_APPROVAL || false,
    authorizedRoles: applicableRange.AUTHORIZED_ROLES || []
  };
};
