// src/middleware/csvParser.js
import csv from 'csvtojson';

const csvParser = async (req, res, next) => {
  if (req.is('text/csv') || req.is('csv')) {
    try {
      const csvString = req.body.toString();
      const jsonArray = await csv().fromString(csvString);
      
      // Convert CSV rows to transfer objects
      req.body = jsonArray.map(row => ({
        xferRef: row.Reference || row.reference,
        xferAmt: parseFloat(row.Amount || row.amount),
        beneficiary: {
          name: row.BeneficiaryName || row.beneficiaryName,
          account: row.BeneficiaryAccount || row.beneficiaryAccount
        },
        remitter: {
          name: row.RemitterName || row.remitterName,
          accountNo: row.RemitterAccount || row.remitterAccount
        }
        // Map other fields as needed
      }));
      
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
};

export default csvParser;