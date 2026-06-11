// src/utils/helpers.js
export const toDecimal = (value) => {
  if (value === null || value === undefined || value === '') return 0.00;
  const num = parseFloat(value);
  return isNaN(num) ? 0.00 : parseFloat(num.toFixed(2));
};