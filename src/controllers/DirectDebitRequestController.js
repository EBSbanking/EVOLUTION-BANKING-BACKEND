// controllers/DirectDebitRequestController.js
import DirectDebitRequest from '../models/DirectDebitRequest.js';


// Create a new Direct Debit Request entry
export const createDirectDebitRequest = async (req, res) => {
    const {
      SCHED_ID,
      DIRECT_DR_ID,
      PAY_DT,
      PAY_AMT,
      USER_ID,
      CREATE_DT,
      CREATED_BY,
      VERSION_NO,
      REC_ST,
      PAYEE_ACCT_NO,
      PAYEE_NM,
      BRANCH_NM,
      BANK_NM,
      BANK_CD,
      PAY_FREQ_CD,
      NEXT_REQ_DT,
      SCHED_TY_CD,
      DIRECT_DR_MANDATE_TY_CD,
      FROM_ACCT_ID,
      DIRECT_DR_REQ_ID
    } = req.body;
  
    try {
      // Validate required fields
      if (!SCHED_ID || !DIRECT_DR_ID || !PAY_DT || !PAY_AMT || !USER_ID || !CREATE_DT || !CREATED_BY || 
          !VERSION_NO || !REC_ST || !PAYEE_ACCT_NO || !PAYEE_NM || !BRANCH_NM || !BANK_NM || !BANK_CD || 
          !PAY_FREQ_CD || !NEXT_REQ_DT || !SCHED_TY_CD || !DIRECT_DR_MANDATE_TY_CD || !FROM_ACCT_ID || 
          !DIRECT_DR_REQ_ID) {
        return res.status(400).json({ message: 'All required fields must be provided.' });
      }
  
      // Create a new Direct Debit Request entry
      const newDirectDebitRequest = new DirectDebitRequest({
        SCHED_ID,
        DIRECT_DR_ID,
        PAY_DT: new Date(PAY_DT),
        PAY_AMT,
        USER_ID,
        CREATE_DT: new Date(CREATE_DT),
        CREATED_BY,
        VERSION_NO,
        REC_ST,
        PAYEE_ACCT_NO,
        PAYEE_NM,
        BRANCH_NM,
        BANK_NM,
        BANK_CD,
        PAY_FREQ_CD,
        NEXT_REQ_DT: new Date(NEXT_REQ_DT),
        SCHED_TY_CD,
        DIRECT_DR_MANDATE_TY_CD,
        FROM_ACCT_ID,
        DIRECT_DR_REQ_ID
        // Additional fields like SYS_CREATE_TS, ROW_TS will be automatically set by default if configured in schema
      });
  
      // Save to the database
      await newDirectDebitRequest.save();
  
      res.status(201).json({
        message: 'Direct Debit Request created successfully.',
        directDebitRequest: newDirectDebitRequest
      });
    } catch (error) {
      console.error('Error creating Direct Debit Request:', error);
      res.status(500).json({ message: 'Error creating Direct Debit Request.', error: error.message });
    }
  };

// Get all Direct Debit Request entries
export const getAllDirectDebitRequests = async (req, res) => {
  try {
    const directDebitRequests = await DirectDebitRequest.find();
    if (directDebitRequests.length > 0) {
      res.status(200).json(directDebitRequests);
    } else {
      res.status(404).json({ message: 'No Direct Debit Requests found.' });
    }
  } catch (error) {
    console.error('Error fetching Direct Debit Requests:', error);
    res.status(500).json({ message: 'Error fetching Direct Debit Requests.', error: error.message });
  }
};

// Delete a Direct Debit Request entry by ID
export const deleteDirectDebitRequest = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedDirectDebitRequest = await DirectDebitRequest.findByIdAndDelete(id);
    if (deletedDirectDebitRequest) {
      res.status(200).json({
        message: 'Direct Debit Request deleted successfully.',
        directDebitRequest: deletedDirectDebitRequest
      });
    } else {
      res.status(404).json({ message: 'Direct Debit Request not found.' });
    }
  } catch (error) {
    console.error('Error deleting Direct Debit Request:', error);
    res.status(500).json({ message: 'Error deleting Direct Debit Request.', error: error.message });
  }
};
