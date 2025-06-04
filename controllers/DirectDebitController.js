// DirectDebitController.js

import DirectDebit from '../models/DirectDebit.js';

// Create a new Direct Debit entry
export const createDirectDebit = async (req, res) => {
    const {
      DIRECT_DR_ID,
      FROM_DEPOSIT_ACCT_NO,  // Updated to FROM_DEPOSIT_ACCT_NO
      TO_DEPOSIT_ACCT_NO,    // Updated to TO_DEPOSIT_ACCT_NO
      DIRECT_DR_DESC,
      DIRECT_DR_MANDATE_TY_CD,
      XFER_MTHD_CD,
      PAY_CRNCY_ID,
      PAY_AMT,
      MAX_PAY_AMT,
      SCHED_TY_CD,
      NEXT_PAY_DT,
      NO_OF_PAYMENTS,
      PAY_FREQ_CD,
      PAY_FREQ_VALUE,
      EXPIRY_DT,
      NON_BUS_DUE_DT_OPTN_CD,
      REF_TXT,
      SUPPLEMENTARY_REF_TXT,
      PAY_RSN_ID,
      SVCE_PROVIDER_ID,
      BENEFICIARY_ID,
      SUPPLEMENTARY_INSTRUCTION,
      REC_ST,
      VERSION_NO,
      ROW_TS,
      USER_ID,
      CREATE_DT,
      CREATED_BY,
      SYS_CREATE_TS
    } = req.body;
  
    try {
      // Validate required fields
      if (!DIRECT_DR_ID || !FROM_DEPOSIT_ACCT_NO || !TO_DEPOSIT_ACCT_NO || !DIRECT_DR_DESC || !DIRECT_DR_MANDATE_TY_CD || !XFER_MTHD_CD ||
          !PAY_CRNCY_ID || !PAY_AMT || !MAX_PAY_AMT || !SCHED_TY_CD || !NEXT_PAY_DT ||
          !NO_OF_PAYMENTS || !PAY_FREQ_CD || !PAY_FREQ_VALUE || !EXPIRY_DT || !NON_BUS_DUE_DT_OPTN_CD || 
          !REF_TXT || !SUPPLEMENTARY_REF_TXT || !PAY_RSN_ID || !SVCE_PROVIDER_ID || !BENEFICIARY_ID || 
          !SUPPLEMENTARY_INSTRUCTION || !REC_ST || !VERSION_NO || !ROW_TS || !USER_ID || !CREATE_DT || !CREATED_BY ||
          !SYS_CREATE_TS) {
        return res.status(400).json({ message: 'All required fields must be provided.' });
      }
  
      // Create a new Direct Debit entry
      const newDirectDebit = new DirectDebit({
        DIRECT_DR_ID,
        FROM_DEPOSIT_ACCT_NO,  // Use the updated field
        TO_DEPOSIT_ACCT_NO,    // Use the updated field
        DIRECT_DR_DESC,
        DIRECT_DR_MANDATE_TY_CD,
        XFER_MTHD_CD,
        PAY_CRNCY_ID,
        PAY_AMT,
        MAX_PAY_AMT,
        SCHED_TY_CD,
        NEXT_PAY_DT: new Date(NEXT_PAY_DT),
        NO_OF_PAYMENTS,
        PAY_FREQ_CD,
        PAY_FREQ_VALUE,
        EXPIRY_DT: new Date(EXPIRY_DT),
        NON_BUS_DUE_DT_OPTN_CD,
        REF_TXT,
        SUPPLEMENTARY_REF_TXT,
        PAY_RSN_ID,
        SVCE_PROVIDER_ID,
        BENEFICIARY_ID,
        SUPPLEMENTARY_INSTRUCTION,
        REC_ST,
        VERSION_NO,
        ROW_TS: new Date(ROW_TS),
        USER_ID,
        CREATE_DT: new Date(CREATE_DT),
        CREATED_BY,
        SYS_CREATE_TS: new Date(SYS_CREATE_TS)
      });
  
      // Save the new Direct Debit entry to the database
      await newDirectDebit.save();
  
      res.status(201).json({
        message: 'Direct Debit created successfully.',
        directDebit: newDirectDebit
      });
    } catch (error) {
      console.error('Error creating Direct Debit:', error);
      res.status(500).json({ message: 'Error creating Direct Debit.', error: error.message });
    }
  };
  
  // Get all Direct Debit entries
  export const getAllDirectDebits = async (req, res) => {
    try {
      const directDebits = await DirectDebit.find();
  
      if (directDebits.length > 0) {
        res.status(200).json(directDebits);
      } else {
        res.status(404).json({ message: 'No direct debits found.' });
      }
    } catch (error) {
      console.error('Error fetching Direct Debits:', error);
      res.status(500).json({ message: 'Error fetching Direct Debits.', error: error.message });
    }
  };
  
  // Get a Direct Debit by its ID
  export const getDirectDebitById = async (req, res) => {
    const { id } = req.params;
  
    try {
      const directDebit = await DirectDebit.findById(id);
  
      if (directDebit) {
        res.status(200).json(directDebit);
      } else {
        res.status(404).json({ message: 'Direct Debit not found.' });
      }
    } catch (error) {
      console.error('Error fetching Direct Debit:', error);
      res.status(500).json({ message: 'Error fetching Direct Debit.', error: error.message });
    }
  };
  
  // Update a Direct Debit entry by its ID
  export const updateDirectDebit = async (req, res) => {
    const { id } = req.params;
    const updatedData = req.body;
  
    try {
      const updatedDirectDebit = await DirectDebit.findByIdAndUpdate(id, updatedData, { new: true });
  
      if (updatedDirectDebit) {
        res.status(200).json({
          message: 'Direct Debit updated successfully.',
          directDebit: updatedDirectDebit
        });
      } else {
        res.status(404).json({ message: 'Direct Debit not found.' });
      }
    } catch (error) {
      console.error('Error updating Direct Debit:', error);
      res.status(500).json({ message: 'Error updating Direct Debit.', error: error.message });
    }
  };
  
  // Delete a Direct Debit entry by its ID
  export const deleteDirectDebit = async (req, res) => {
    const { id } = req.params;
  
    try {
      const deletedDirectDebit = await DirectDebit.findByIdAndDelete(id);
  
      if (deletedDirectDebit) {
        res.status(200).json({
          message: 'Direct Debit deleted successfully.',
          directDebit: deletedDirectDebit
        });
      } else {
        res.status(404).json({ message: 'Direct Debit not found.' });
      }
    } catch (error) {
      console.error('Error deleting Direct Debit:', error);
      res.status(500).json({ message: 'Error deleting Direct Debit.', error: error.message });
    }
  };