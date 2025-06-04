// utils.js
export const generateCustomerNumber = () => {
    const paddedCUST_ID = `0001${Math.floor(Math.random() * 10).toString().padStart(2, '0')}`;
    const paddedCUST_NO = `0001${Math.floor(Math.random() * 10000).toString().padStart(3, '0')}`;
    return { paddedCUST_ID, paddedCUST_NO };
  };
  