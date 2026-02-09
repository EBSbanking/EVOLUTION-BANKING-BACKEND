// src/helper/fixModelFields.js
export function fixModelFields(modelDefinition) {
  const fixedFields = {};
  
  for (const [fieldName, config] of Object.entries(modelDefinition)) {
    // Convert uppercase_with_underscores to camelCase with explicit field mapping
    if (fieldName === fieldName.toUpperCase() && fieldName.includes('_')) {
      const camelCaseName = fieldName.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      fixedFields[camelCaseName] = {
        ...config,
        field: fieldName // Explicit mapping to database column
      };
    } else {
      fixedFields[fieldName] = config;
    }
  }
  
  return fixedFields;
}

// Optional: Also fix index definitions
export function fixIndexes(indexes) {
  if (!indexes) return indexes;
  
  return indexes.map(index => {
    if (index.fields && Array.isArray(index.fields)) {
      // Keep field names as-is (they should be database column names)
      // No transformation needed here
      return index;
    }
    return index;
  });
}