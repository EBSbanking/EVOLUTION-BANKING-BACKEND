import DirectDebitScheduler from '../models/DirectDebitScheduler.js';

// Create a new Direct Debit Scheduler entry
export const createDirectDebitScheduler = async (req, res) => {
  const {
    SCHED_ID,
    DIRECT_DR_ID,
    PAY_DT,
    PAY_AMT,
    USER_ID,
    CREATE_DT,
    CREATED_BY
  } = req.body;

  try {
    // Validate required fields
    if (!SCHED_ID || !DIRECT_DR_ID || !PAY_DT || !PAY_AMT || !USER_ID || !CREATE_DT || !CREATED_BY) {
      return res.status(400).json({ message: 'All required fields must be provided.' });
    }

    // Create a new Direct Debit Scheduler entry
    const newDirectDebitScheduler = new DirectDebitScheduler({
      SCHED_ID,
      DIRECT_DR_ID,
      PAY_DT: new Date(PAY_DT),
      PAY_AMT,
      USER_ID,
      CREATE_DT: new Date(CREATE_DT),
      CREATED_BY
      // SKIP_PAY_FG, REC_ST, VERSION_NO, ROW_TS, and SYS_CREATE_TS will be automatically set by default
    });

    // Save to the database
    await newDirectDebitScheduler.save();

    res.status(201).json({
      message: 'Direct Debit Scheduler created successfully.',
      directDebitScheduler: newDirectDebitScheduler
    });
  } catch (error) {
    console.error('Error creating Direct Debit Scheduler:', error);
    res.status(500).json({ message: 'Error creating Direct Debit Scheduler.', error: error.message });
  }
};

// Get all Direct Debit Scheduler entries
export const getAllDirectDebitSchedulers = async (req, res) => {
  try {
    const directDebitSchedulers = await DirectDebitScheduler.find();
    if (directDebitSchedulers.length > 0) {
      res.status(200).json(directDebitSchedulers);
    } else {
      res.status(404).json({ message: 'No Direct Debit Schedulers found.' });
    }
  } catch (error) {
    console.error('Error fetching Direct Debit Schedulers:', error);
    res.status(500).json({ message: 'Error fetching Direct Debit Schedulers.', error: error.message });
  }
};

// Get a Direct Debit Scheduler entry by ID
export const getDirectDebitSchedulerById = async (req, res) => {
  const { id } = req.params;

  try {
    const directDebitScheduler = await DirectDebitScheduler.findById(id);
    if (directDebitScheduler) {
      res.status(200).json(directDebitScheduler);
    } else {
      res.status(404).json({ message: 'Direct Debit Scheduler not found.' });
    }
  } catch (error) {
    console.error('Error fetching Direct Debit Scheduler:', error);
    res.status(500).json({ message: 'Error fetching Direct Debit Scheduler.', error: error.message });
  }
};

// Update a Direct Debit Scheduler entry by ID
export const updateDirectDebitScheduler = async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  try {
    // Update Direct Debit Scheduler entry
    const updatedDirectDebitScheduler = await DirectDebitScheduler.findByIdAndUpdate(id, updatedData, { new: true });
    if (updatedDirectDebitScheduler) {
      res.status(200).json({
        message: 'Direct Debit Scheduler updated successfully.',
        directDebitScheduler: updatedDirectDebitScheduler
      });
    } else {
      res.status(404).json({ message: 'Direct Debit Scheduler not found.' });
    }
  } catch (error) {
    console.error('Error updating Direct Debit Scheduler:', error);
    res.status(500).json({ message: 'Error updating Direct Debit Scheduler.', error: error.message });
  }
};

// Delete a Direct Debit Scheduler entry by ID
export const deleteDirectDebitScheduler = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedDirectDebitScheduler = await DirectDebitScheduler.findByIdAndDelete(id);
    if (deletedDirectDebitScheduler) {
      res.status(200).json({
        message: 'Direct Debit Scheduler deleted successfully.',
        directDebitScheduler: deletedDirectDebitScheduler
      });
    } else {
      res.status(404).json({ message: 'Direct Debit Scheduler not found.' });
    }
  } catch (error) {
    console.error('Error deleting Direct Debit Scheduler:', error);
    res.status(500).json({ message: 'Error deleting Direct Debit Scheduler.', error: error.message });
  }
};
