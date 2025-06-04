import DepositSearch from '../models/DepositSearch.js';

// Create a new DepositSearch entry
export const createDepositSearch = async (req, res) => {
  try {
    const { ACCT_NO, ACCT_NM, PROD_CD, OPENED_DT, LEDGER_BAL, BU_CD, PRIMARY_CUST_ID } = req.body;

    const newDepositSearch = new DepositSearch({
      ACCT_NO,
      ACCT_NM,
      PROD_CD,
      OPENED_DT,
      LEDGER_BAL,
      BU_CD,
      PRIMARY_CUST_ID
    });

    await newDepositSearch.save();
    res.status(201).json(newDepositSearch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating Deposit Search entry', error: error.message });
  }
};

// Get all DepositSearch entries
export const getAllDepositSearches = async (req, res) => {
  try {
    const depositSearches = await DepositSearch.find();
    res.status(200).json(depositSearches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Deposit Search entries', error: error.message });
  }
};

// Get a specific DepositSearch entry by account number
export const getDepositSearchByAccount = async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const depositSearch = await DepositSearch.findOne({ ACCT_NO });

    if (!depositSearch) {
      return res.status(404).json({ message: 'Deposit Search entry not found' });
    }

    res.status(200).json(depositSearch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error retrieving Deposit Search entry', error: error.message });
  }
};

// Update a DepositSearch entry by account number
export const updateDepositSearch = async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const updatedDepositSearch = await DepositSearch.findOneAndUpdate({ ACCT_NO }, req.body, { new: true });

    if (!updatedDepositSearch) {
      return res.status(404).json({ message: 'Deposit Search entry not found' });
    }

    res.status(200).json(updatedDepositSearch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating Deposit Search entry', error: error.message });
  }
};

// Delete a DepositSearch entry by account number
export const deleteDepositSearch = async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const deletedDepositSearch = await DepositSearch.findOneAndDelete({ ACCT_NO });

    if (!deletedDepositSearch) {
      return res.status(404).json({ message: 'Deposit Search entry not found' });
    }

    res.status(200).json({ message: 'Deposit Search entry deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting Deposit Search entry', error: error.message });
  }
};
