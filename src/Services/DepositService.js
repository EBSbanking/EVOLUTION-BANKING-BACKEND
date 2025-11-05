import Deposit from '../models/Deposit.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';

export const processDeposit = async (req, res) => {
  try {
    const { ACCT_NO, amount } = req.body;

    // Find the approved deposit account application
    const application = await DepositAccountApplication.findOne({ ACCT_NO });

    if (!application) {
      return res.status(404).json({ message: 'Deposit account application not found' });
    }

    // Create a deposit record for this account
    const deposit = new Deposit({
      ACCT_ID: application.ACCT_ID,
      ACCT_NO: application.ACCT_NO,
      amount,
      LEDGER_BAL: amount, // Initial balance after deposit
      CRNCY_ID: application.CRNCY_ID,
      PROD_ID: application.PROD_ID,
      BU_ID: application.BU_ID,
      AVAIL_DT: application.AVAIL_DT,
      OPENED_DT: application.OPENED_DT,
      CUST_ID: application.CUST_ID
    });

    await deposit.save();

    res.status(201).json({ message: 'Deposit created successfully', data: deposit });
  } catch (error) {
    console.error('Error processing deposit:', error);
    res.status(500).json({ message: 'Error processing deposit', error: error.message });
  }
};
