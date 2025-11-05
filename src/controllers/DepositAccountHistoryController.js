import DepositAccountHistory from '../models/DepositAccountHistory.js';

// Create a new deposit account history record
export const createDepositAccountHistory = async (req, res) => {
  try {
    const newHistory = new DepositAccountHistory(req.body);

    // Save to the database
    const savedHistory = await newHistory.save();
    res.status(201).json({ message: 'Deposit account history created successfully', data: savedHistory });
  } catch (error) {
    console.error('Error creating deposit account history:', error);
    res.status(500).json({ message: 'Error creating deposit account history', error: error.message });
  }
};

// Get all deposit account history records
export const getDepositAccountHistories = async (req, res) => {
  try {
    const { ACCT_NO } = req.query;  // Capture ACCT_NO from query parameters

    let histories;
    if (ACCT_NO) {
      // If ACCT_NO is provided in the query, find records with that ACCT_NO
      histories = await DepositAccountHistory.find({ ACCT_NO });
    } else {
      // Otherwise, fetch all records
      histories = await DepositAccountHistory.find();
    }

    res.status(200).json({ message: 'Deposit account histories retrieved successfully', data: histories });
  } catch (error) {
    console.error('Error fetching deposit account histories:', error);
    res.status(500).json({ message: 'Error fetching deposit account histories', error: error.message });
  }
};

// Get a specific deposit account history by its ID
export const getDepositAccountHistoryById = async (req, res) => {
  try {
    const history = await DepositAccountHistory.findById(req.params.id);

    if (!history) {
      return res.status(404).json({ message: 'Deposit account history not found' });
    }

    res.status(200).json({ message: 'Deposit account history retrieved successfully', data: history });
  } catch (error) {
    console.error('Error fetching deposit account history by ID:', error);
    res.status(500).json({ message: 'Error fetching deposit account history', error: error.message });
  }
};

// Update a specific deposit account history record by its ID
export const updateDepositAccountHistory = async (req, res) => {
  try {
    const updatedHistory = await DepositAccountHistory.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!updatedHistory) {
      return res.status(404).json({ message: 'Deposit account history not found' });
    }

    res.status(200).json({ message: 'Deposit account history updated successfully', data: updatedHistory });
  } catch (error) {
    console.error('Error updating deposit account history:', error);
    res.status(500).json({ message: 'Error updating deposit account history', error: error.message });
  }
};

// Delete a specific deposit account history record by its ID
export const deleteDepositAccountHistory = async (req, res) => {
  try {
    const deletedHistory = await DepositAccountHistory.findByIdAndDelete(req.params.id);

    if (!deletedHistory) {
      return res.status(404).json({ message: 'Deposit account history not found' });
    }

    res.status(200).json({ message: 'Deposit account history deleted successfully' });
  } catch (error) {
    console.error('Error deleting deposit account history:', error);
    res.status(500).json({ message: 'Error deleting deposit account history', error: error.message });
  }
};

// Get deposit account histories with pagination (optional)
export const getDepositAccountHistoriesPaginated = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const histories = await DepositAccountHistory.find()
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalRecords = await DepositAccountHistory.countDocuments();
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      message: 'Deposit account histories retrieved successfully',
      data: histories,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        recordsPerPage: limit,
      },
    });
  } catch (error) {
    console.error('Error fetching deposit account histories with pagination:', error);
    res.status(500).json({ message: 'Error fetching deposit account histories', error: error.message });
  }
};
