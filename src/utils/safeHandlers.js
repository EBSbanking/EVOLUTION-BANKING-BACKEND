// utils/safeHandlers.js
export const safeToString = (value, defaultValue = '') => {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'string') return value.trim();
  if (typeof value.toString === 'function') {
    try {
      return value.toString().trim();
    } catch (error) {
      return defaultValue;
    }
  }
  return defaultValue;
};

export const safeNumber = (value, defaultValue = 0) => {
  if (value === null || value === undefined) return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

export const safeBoolean = (value, defaultValue = false) => {
  if (value === null || value === undefined) return defaultValue;
  return Boolean(value);
};