import BusinessUnit from "../models/BusinessUnit.js";

// Returns a list of BusinessUnit docs the user can access based on permissions & userBU
export async function getAccessibleBusinessUnits(userPermissions, userBU) {
  // Admin access: return all business units
  if (
    userPermissions &&
    typeof userPermissions === "object" &&
    userPermissions.BU_ROLE_ID === 1
  ) {
    return await BusinessUnit.find().lean();
  }

  if (
    Array.isArray(userPermissions) &&
    (userPermissions.includes("Administrator") || userPermissions.includes("ALL BUSINESS UNIT"))
  ) {
    return await BusinessUnit.find().lean();
  }

  // 'OWN BUSINESS UNIT' or direct business unit access
  if (
    (Array.isArray(userPermissions) && userPermissions.includes("OWN BUSINESS UNIT")) ||
    userBU
  ) {
    const buDoc = await BusinessUnit.findOne({ BUSINESS_UNIT: userBU }).lean();
    return buDoc ? [buDoc] : [];
  }

  // No access by default
  return [];
}

// Checks if requestedBU is accessible by user permissions and BU
export async function isBUAccessible(userPermissions, userBU, requestedBU) {
  console.log("Permissions:", userPermissions);
  console.log("User BU:", userBU);
  console.log("Requested BU:", requestedBU);

  // Shortcut: Admin by BU_ROLE_ID
  if (
    userPermissions &&
    typeof userPermissions === "object" &&
    userPermissions.BU_ROLE_ID === 1
  ) {
    console.log("Access granted: BU_ROLE_ID === 1 (administrator)");
    return true;
  }

  // Shortcut: Admin or ALL BUSINESS UNIT in permissions array
  if (
    Array.isArray(userPermissions) &&
    (userPermissions.includes("Administrator") || userPermissions.includes("ALL BUSINESS UNIT"))
  ) {
    console.log("Access granted: userPermissions includes Administrator or ALL BUSINESS UNIT");
    return true;
  }

  // Shortcut: direct match with user BU
  if (userBU === requestedBU) {
    console.log("Access granted: userBU matches requestedBU");
    return true;
  }

  // Check requestedBU against accessible BUs
  const accessible = await getAccessibleBusinessUnits(userPermissions, userBU);
  const allowed = accessible.some(bu => bu.BUSINESS_UNIT === requestedBU);

  console.log("Accessible BUs:", accessible.map(bu => bu.BUSINESS_UNIT));
  console.log("Is allowed:", allowed);

  return allowed;
}
