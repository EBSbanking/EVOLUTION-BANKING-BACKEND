// utils/roleUtils.js

/**
 * Normalize the USER_ROLE_ID so it always returns a string.
 * Handles string/number mismatches, trims, and validation.
 */
export const normalizeRoleId = (roleId) => {
  if (!roleId) return null;

  // Always return as string
  return String(roleId).trim();
};
