import CreditApplication from '../models/CreditApplication.js';
import LoanAccount from '../models/LoanAccount.js';
import Customer from '../models/Customer.js';
import DepositTransaction from '../models/DepositTransaction.js';
import CashWithdrawalTransaction from '../models/CashWithdrawalTransaction.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js'; // Import your workflow item model
import { generateNumber } from '../utils/generateNumber.js'; // Import the utility to generate customer number
import NotificationService from '../services/NotificationService.js'; // Import notification service if exists
import DepositAccountApplication from '../models/DepositAccountApplication.js'; // Import DepositAccountApplication model


class WF_WORK_ITEMController {
  // Helper function to handle moving data to the appropriate model
  static async moveToCorrectTable(workflowItem) {
    switch (workflowItem.ITEM_TYPE) {
      case 'CreditApplication':
        return await WF_WORK_ITEMController.moveToCreditApplication(workflowItem);
        case 'Customer':
        return await WF_WORK_ITEMController.moveToCustomer(workflowItem);
        case 'CashWithdrawalTransaction':
        return await WF_WORK_ITEMController.moveToCashWithdrawalTransaction(workflowItem);
        case 'DepositAccountApplication':
          return await WF_WORK_ITEMController.moveToDepositAccountApplication(workflowItem);
        case 'DepositTransaction':
          return await WF_WORK_ITEMController.moveToDepositTransaction(workflowItem);
        case 'LoanAccount':
        return await WF_WORK_ITEMController.moveToLoanAccount(workflowItem);
        
       
      default:
        throw new Error('Unknown ITEM_TYPE');
    }
  }

  static async moveToCreditApplication(workflowItem) {
    // Prepare the credit data to insert into the CreditApplication collection
    const creditData = {
      CUST_NM: workflowItem.CUST_NM,                          // Customer name
      CUST_ID: workflowItem.CUST_ID,                           // Customer ID
      PRODUCT: workflowItem.PRODUCT,                           // Product associated with the credit (if available)
      ACCT_ID: workflowItem.ACCOUNT_ID,                        // Account ID (if available)
      ACCT_NO: workflowItem.ACCOUNT_NO,                        // Account number
      APPL_DT: new Date(),                                    // Application date, set to current date
      APPL_ID: workflowItem.WORK_ITEM_ID.toString(),          // Application ID (you can use Work Item ID or another field)
      APPL_PROD_ID: workflowItem.APPL_PROD_ID || '',           // Application product ID, default to empty string if not present
      APPROVAL_DT: new Date(),                                // Approval date, set to current date
      APPROVED_CRNCY_ID: workflowItem.APPROVED_CRNCY_ID || '', // Approved currency ID
      APPROVED_CR_REQD_DT: workflowItem.APPROVED_CR_REQD_DT || null, // Approved credit required date, default to null
      APPROVED_EXPIRY_DT: workflowItem.APPROVED_EXPIRY_DT || null, // Approved expiry date, default to null
      APPROVED_LIMIT_AMT: workflowItem.APPROVED_LIMIT_AMT,      // Approved limit amount
      APPROVED_TERM_CD: workflowItem.APPROVED_TERM_CD || '',   // Approved term code, default to empty string if not available
      APPROVED_TERM_VALUE: workflowItem.APPROVED_TERM_VALUE || null, // Approved term value, default to null if not available
      BANK_OFFICER_ID: workflowItem.BANK_OFFICER_ID || '',     // Bank officer ID, default to empty string if not available
      BU_ID: workflowItem.BU_ID,                               // Business unit ID
      COMMENTS: workflowItem.COMMENTS || '',                   // Comments, default to empty string if not available
      CREATE_DT: new Date(),                                   // Record creation date
      CREATED_BY: workflowItem.USER_ID,                         // User ID of the person who created the record
      CRNCY_ID: workflowItem.CRNCY_ID || '',                   // Currency ID, default to empty string if not available
      CR_REQD_DT: workflowItem.CR_REQD_DT || null,             // Credit required date, default to null if not available
      CR_TY_ID: workflowItem.CR_TY_ID || '',                   // Credit type ID, default to empty string if not available
      CR_UTILISATION_MTHD_CD: workflowItem.CR_UTILISATION_MTHD_CD || '', // Credit utilization method code
      Credit_Type: workflowItem.Credit_Type || '',             // Credit type
      DECLINE_DT: workflowItem.DECLINE_DT || null,             // Decline date, default to null if not available
      EXPIRY_DT: workflowItem.EXPIRY_DT || null,               // Expiry date, default to null if not available
      INDUSTRY_ID: workflowItem.INDUSTRY_ID || '',             // Industry ID, default to empty string if not available
      LOAN_CYCLE: workflowItem.LOAN_CYCLE || 1,                 // Loan cycle, default to 1
      MULTI_CRNCY_FG: workflowItem.MULTI_CRNCY_FG || false,   // Multi-currency flag, default to false
      OVERDRAFT_ACCT_ID: workflowItem.OVERDRAFT_ACCT_ID || '', // Overdraft account ID, default to empty string if not available
      PORTFOLIO_ID: workflowItem.PORTFOLIO_ID || '',           // Portfolio ID, default to empty string if not available
      PRIME_LIMIT_AMT: workflowItem.PRIME_LIMIT_AMT,            // Prime limit amount
      Product_Combination: workflowItem.Product_Combination || '', // Product combination, default to empty string if not available
      PROD_COMB_OPTION: workflowItem.PROD_COMB_OPTION || '',   // Product combination option
      Purpose_of_Credit: workflowItem.Purpose_of_Credit,       // Purpose of credit
      REC_ST: 'active',                                        // Record status, set to 'active'
      REF_NO: workflowItem.REF_NO || '',                       // Reference number, default to empty string if not available
      REPAY_SRC_ACCT_ID: workflowItem.REPAY_SRC_ACCT_ID || '', // Repayment source account ID, default to empty string if not available
      ROW_TS: new Date(),                                      // Timestamp for the row
      RSN_ID: workflowItem.RSN_ID || '',                       // Reason ID, default to empty string if not available
      SECONDARY_BANK_OFFICER_ID: workflowItem.SECONDARY_BANK_OFFICER_ID || '', // Secondary bank officer ID, default to empty string if not available
      INDEX_RATE_ID: workflowItem.INDEX_RATE_ID || '',         // Index rate ID, default to empty string if not available
      SYS_CREATE_TS: new Date(),                               // System creation timestamp
      TERM_CD: workflowItem.TERM_CD || '',                     // Term code, default to empty string if not available
      TERM_VALUE: workflowItem.TERM_VALUE || null,             // Term value, default to null if not available
      USER_ID: workflowItem.USER_ID,                           // User ID associated with the application
      VALIDITY_EXPIRATION_DT: workflowItem.VALIDITY_EXPIRATION_DT || null, // Validity expiration date, default to null if not available
      VERSION_NO: workflowItem.VERSION_NO || 1,                 // Version number, default to 1
      STATUS: 'Approved',                                       // Set the status to 'Pending'
    };
  
    // Create a new CreditApplication document with the credit data
    const newCreditApplication = new CreditApplication(creditData);
  
    // Save the CreditApplication to the database
    await newCreditApplication.save();
  }
  
   // Move data to CustomerAccountApplication table
   static async moveToCustomer(workflowItem) {
    const customerData = {
      CUST_ID: workflowItem.CUST_ID,
      CUST_NO: generateNumber(7),  // Generate customer number if needed
      TITLE_ID: workflowItem.TITLE_ID || '',
      CUST_NM: workflowItem.CUST_NM,
      HOME_ADDRESS: workflowItem.HOME_ADDRESS,
      EMAIL_ADDRESS: workflowItem.EMAIL_ADDRESS || '',
      BU_ID: workflowItem.BU_ID,
      MAIDEN_NM: workflowItem.MAIDEN_NM,
      BIRTH_DT: workflowItem.BIRTH_DT,
      CNTRY_OF_BIRTH_ID: workflowItem.CNTRY_OF_BIRTH_ID || '',
      CUST_CAT: workflowItem.CUST_CAT || '',
      CAMPAIGN_ID: workflowItem.CAMPAIGN_ID || '',
      GENDER_TY: workflowItem.GENDER_TY || '',
      NATIONALITY_NO: workflowItem.NATIONALITY_NO || '',
      STATE: workflowItem.STATE || '',
      OPENING_RSN_ID: workflowItem.OPENING_RSN_ID,
      OPENED_DT: new Date(),
      RESIDENT_CNTRY_ID: workflowItem.RESIDENT_CNTRY_ID || '',
      RISK_CLASS: workflowItem.RISK_CLASS || '',
      STMNT_FREQ_CD: workflowItem.STMNT_FREQ_CD || '',
      STMNT_FREQ_VALUE: workflowItem.STMNT_FREQ_VALUE || null,
      REC_ST: 'Approved',
      CREATED_BY: workflowItem.USER_ID,
      USER_ID: workflowItem.USER_ID,
      CREATE_DT: new Date(),
      INDUSTRY_ID: workflowItem.INDUSTRY_ID || '',
      INDUSTRY_CD: workflowItem.INDUSTRY_CD || '',
      TAX_STATUS: workflowItem.TAX_STATUS || '',
      MARITAL_ST: workflowItem.MARITAL_ST,
      TAX_GRP_ID: workflowItem.TAX_GRP_ID || '',
      OPERATIONS_CRNCY_ID: workflowItem.OPERATIONS_CRNCY_ID || '',
      EMP_ST: workflowItem.EMP_ST || '',
      ORGANISATION_NM: workflowItem.ORGANISATION_NM || '',
      REGISTRATION_ADDRESS: workflowItem.REGISTRATION_ADDRESS || '',
      REGISTRATION_DT: workflowItem.REGISTRATION_DT || null,
      ALERT_DELIVERY_METHOD: workflowItem.ALERT_DELIVERY_METHOD || '',
      KYC_LEVEL: workflowItem.KYC_LEVEL || '',
      PHONE_NO: workflowItem.PHONE_NO,
      SMS: workflowItem.SMS || '',
      EVENT_ID: workflowItem.EVENT_ID || null,
    };

    const newCustomer = new Customer(customerData);
    await newCustomer.save();
  }
   // Move data to LoanAccount table
   static async moveToLoanAccount(workflowItem) {
    const loanAccountData = {
      JOURNAL_ID: Date.now(), // Auto-generated Journal ID based on timestamp
      CUST_ID: workflowItem.CUST_ID,
      ACCT_NM: workflowItem.ACCT_NM,
      ACCT_NO: workflowItem.ACCT_NO,
      APPL_ID: workflowItem.APPL_ID,
      CRNCY_ID: workflowItem.CRNCY_ID,
      BU_ID: workflowItem.BU_ID,
      PRIMARY_OFFICER_ID: workflowItem.PRIMARY_OFFICER_ID,
      SECONDARY_OFFICER_ID: workflowItem.SECONDARY_OFFICER_ID || '',
      DISBURSEMENT_LIMIT: workflowItem.DISBURSEMENT_LIMIT,
      START_DT: workflowItem.START_DT,
      TERM_CD: workflowItem.TERM_CD,
      TERM_VALUE: workflowItem.TERM_VALUE,
      MATURITY_DT: workflowItem.MATURITY_DT,
      TRANSACTION_TYPE: workflowItem.TRANSACTION_TYPE,
      CHART_OF_ACCT_ID: workflowItem.CHART_OF_ACCT_ID || null,
      CLEARED_BALANCE: workflowItem.CLEARED_BALANCE || 0.0,
      AVAILABLE_BALANCE: workflowItem.AVAILABLE_BALANCE || 0.0,
      LEDGER_BALANCE: workflowItem.LEDGER_BALANCE || 0.0,
      ACCT_DESC: workflowItem.ACCT_DESC || '',
      LEDGER_NO: workflowItem.LEDGER_NO || null,
      PROD_ID: workflowItem.PROD_ID,
    };

    const newLoanAccount = new LoanAccount(loanAccountData);
    await newLoanAccount.save();
  }

  // Move data to DepositAccountApplication table
static async moveToDepositAccountApplication(workflowItem) {
  // Prepare the deposit account application data
  const depositData = {
    CUST_ID: workflowItem.CUST_ID,                             // Customer ID
    ACCT_ID: workflowItem.ACCT_ID,                             // Account ID
    ACCT_NO: workflowItem.ACCT_NO,                             // Account Number (Unique and required)
    ACCT_NM: workflowItem.ACCT_NM,                             // Account Name
    CRNCY_ID: workflowItem.CRNCY_ID || 'NGN',                  // Currency ID (Default to 'NGN' if not provided)
    PROD_ID: workflowItem.PROD_ID || '',                       // Product ID (Optional)
    BU_ID: workflowItem.BU_ID,                                 // Business Unit ID
    AVAIL_DT: workflowItem.AVAIL_DT,                           // Availability Date
    OPENED_DT: new Date(),                                     // Opened Date (Set to current date)
    NATIONALITY_NO: workflowItem.NATIONALITY_NO || '',         // Nationality Number (Optional)
    CREATED_BY: workflowItem.USER_ID,                           // Created By (User ID)
    BVN_NO: workflowItem.BVN_NO,                               // BVN Number (Required)
    CREATED_AT: new Date(),                                    // Record creation date (Set to current date)
    IMAGE: workflowItem.IMAGE || '',                           // Image URL (Optional)
    DOCUMENT: workflowItem.DOCUMENT || '',                     // Document URL (Optional)
    DOCUMENT_TYPE: workflowItem.DOCUMENT_TYPE || '',           // Document Type (Optional)
    DOCUMENT_NUMBER: workflowItem.DOCUMENT_NUMBER || '',       // Document Number (Optional)
    BANK_MANDATE: workflowItem.BANK_MANDATE || '',             // Bank Mandate URL (Optional)
    STATUS: 'Approved'                                          // Default status is 'pending'
  };

  // Create a new DepositAccountApplication document with the depositData
  const newDepositAccountApplication = new DepositAccountApplication(depositData);

  // Save the DepositAccountApplication to the database
  await newDepositAccountApplication.save();
}

 // Move data to DepositTransaction table
 static async moveToDepositTransaction(workflowItem) {
  const depositData = {
    ACCT_ID: workflowItem.ACCT_ID,
    ACCT_NO: workflowItem.ACCT_NO,
    RECIPIENT_PHONE_NUMBER: workflowItem.RECIPIENT_PHONE_NUMBER,
    ACCT_NM: workflowItem.ACCT_NM,
    GL_ACCT_NO: workflowItem.GL_ACCT_NO || '',
    TRANSACTION_TYPE: 'Deposit', // Assuming it's always a deposit
    AMOUNT: workflowItem.AMOUNT,
    TOTAL_CHARGES: workflowItem.TOTAL_CHARGES || 0,
    TRANSACTION_DATE: new Date(),
    DESCRIPTION: workflowItem.DESCRIPTION || '',
    BALANCE_AFTER_TRANSACTION: workflowItem.BALANCE_AFTER_TRANSACTION,
    VALUE_DATE: workflowItem.VALUE_DATE,
    TRANSACTION_REF_NO: generateTransactionRefNo(),
    DEPOSITOR_NAME: workflowItem.DEPOSITOR_NAME,
    BUSINESS_UNIT: workflowItem.BUSINESS_UNIT,
    CURRENCY_COUNT: workflowItem.CURRENCY_COUNT || {},
    TOTAL_CURRENCY_COUNT: workflowItem.TOTAL_CURRENCY_COUNT || 0
  };

  const newDepositTransaction = new DepositTransaction(depositData);
  await newDepositTransaction.save();
}

  // Move data to CashWithdrawalTransaction table
  static async moveToCashWithdrawalTransaction(workflowItem) {
    const withdrawalData = {
      CUST_ID: workflowItem.CUST_ID,
      ACCT_ID: workflowItem.ACCOUNT_ID,
      ACCT_NO: workflowItem.ACCOUNT_NO,
      ACCT_NM: workflowItem.ACCOUNT_NAME,
      amount: workflowItem.ITEM_VALUE,
      VALUE_DATE: new Date(),
      WITHDRAWER_NAME: workflowItem.USER_ID,
      BUSINESS_UNIT: workflowItem.BUSINESS_UNIT,
      DESCRIPTION: workflowItem.ITEM_DESC || '',
      SOURCE_OF_FUNDS: workflowItem.SOURCE_OF_FUNDS,
      CURRENCY_COUNT: workflowItem.CURRENCY_COUNT || {},
      TOTAL_CURRENCY_COUNT: workflowItem.TOTAL_CURRENCY_COUNT || 0,
      TRANSACTION_REF_NO: workflowItem.WORK_ITEM_ID.toString(),
      BALANCE_BEFORE_TRANSACTION: workflowItem.BALANCE_BEFORE_TRANSACTION,
      BALANCE_AFTER_TRANSACTION: workflowItem.BALANCE_AFTER_TRANSACTION,
      WORK_ITEM_ID: workflowItem.WORK_ITEM_ID,
      transactionStatus: 'Approved',
    };

    const newWithdrawal = new CashWithdrawalTransaction(withdrawalData);
    await newWithdrawal.save();
  }

  // Other existing methods...

 

    // Static helper function to calculate the age of a work item based on created_at timestamp
    static calculateAge(createdAt) {
      if (!createdAt || isNaN(new Date(createdAt).getTime())) {
        return 0;  // Return 0 if created_at is invalid or unavailable
      }
  
      const createdDate = new Date(createdAt);
      const currentDate = new Date();
  
      const ageInMilliseconds = currentDate - createdDate;
      const ageInDays = Math.floor(ageInMilliseconds / (1000 * 60 * 60 * 24));  // Convert to days
  
      return ageInDays;  // Return the age in days
    }
  
    
   
    static async approveWorkflow(req, res) {
      const { WORK_ITEM_ID } = req.params;
    
      try {
        // Find the workflow item using WORK_ITEM_ID
        const workflowItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID });
    
        if (!workflowItem) {
          return res.status(404).json({ message: 'Workflow item not found.' });
        }
    
        // Check if ITEM_TYPE exists
        if (!workflowItem.ITEM_TYPE) {
          return res.status(400).json({ message: 'ITEM_TYPE is missing for this workflow item.' });
        }
    
        // Ensure that the workflow item is in 'Pending' status before approval
        if (workflowItem.WAIT_ST !== 'Pending') {
          return res.status(400).json({ message: 'This workflow item is not pending approval.' });
        }
    
        // Move the data to the correct table based on ITEM_TYPE
        await WF_WORK_ITEMController.moveToCorrectTable(workflowItem);  // Pass the entire workflowItem here
    
        // Mark the workflow item as approved and completed
        workflowItem.REC_ST = 'Completed';
        workflowItem.WAIT_ST = 'Approved';
        await workflowItem.save();
    
        // Optionally, delete the workflow item after successful approval
        await WF_WORK_ITEM.deleteOne({ WORK_ITEM_ID });
    
        // Send notification after successful approval
        await NotificationService.send({
          ROLE_ID: workflowItem.TARGET_USER_ROLE_ID,
          message: `Workflow item ${workflowItem.ITEM_DESC} has been approved.`,
          WORK_ITEM_ID,
          EVENT_ID: workflowItem.EVENT_ID,
          status: 'Approved',
        });
    
        res.status(200).json({
          message: 'Workflow item approved and moved to appropriate table successfully.',
        });
    
      } catch (error) {
        console.error('Error approving workflow item:', error);
        res.status(500).json({
          message: 'Error approving workflow item',
          error: error.message,
        });
      }
    }

      // Move the workflow item to the correct table based on ITEM_TYPE
      static async moveToCorrectTable(workflowItem) {
        switch (workflowItem.ITEM_TYPE) {
          case 'CreditApplication':
            return await WF_WORK_ITEMController.moveToCreditApplication(workflowItem);
          case 'Customer':
            return await WF_WORK_ITEMController.moveToCustomer(workflowItem);
          case 'CashWithdrawalTransaction':
            return await WF_WORK_ITEMController.moveToCashWithdrawalTransaction(workflowItem);
          case 'DepositAccountApplication':
            return await WF_WORK_ITEMController.moveToDepositAccountApplication(workflowItem);
          case 'DepositTransaction':
            return await WF_WORK_ITEMController.moveToDepositTransaction(workflowItem);
          case 'LoanAccount':
            return await WF_WORK_ITEMController.moveToLoanAccount(workflowItem);
          default:
            throw new Error('Unsupported ITEM_TYPE: ' + workflowItem.ITEM_TYPE); // This error helps to pinpoint unsupported types
        }
      }
    
      // Define the methods for moving to specific tables as shown previously...

    
 
    
  
    // Create a new work item and send notification
    static async submitTransaction(req, res) {
      try {
        const {
          ITEM_VALUE,
          ITEM_DESC,
          ITEM_CLASS_NM,
          CUST_ID,
          REC_ST,
          VERSION,
          ROW_TS,
          USER_ID,
          BU_ID,
          CREATE_DT,
          SYS_CREATE_TS,
          WAIT_ST,
          MAX_DELAY_TM,
          DEADLINE_TM,
          ORIGINATOR_USER_ROLE_ID,
          TARGET_DUR_HOURS,  // input in hours
          ESCALATION_MINUTES, // input in minutes
          ITEM_BU_ID,
          ITEM_TYPE,
          TARGET_USER_ROLE_ID,
        } = req.body;
  
        // Ensure correct values for TARGET_DUR_TM and ESCALATION_TM
        const TARGET_DUR_TM = TARGET_DUR_HOURS ? TARGET_DUR_HOURS * 3600 : 0; // Convert to seconds or default to 0
        const ESCALATION_TM = ESCALATION_MINUTES ? ESCALATION_MINUTES * 60 : 0; // Convert to seconds or default to 0
  
        // Generate unique IDs for required fields
        const WORK_ITEM_ID = generateNumber(6); // 6-digit number
        const BUS_PROC_ID = generateNumber(4); // 4-digit number
        const SUB_PROC_ID = generateNumber(4); // 4-digit number
        const QUEUE_ID = generateNumber(4); // 4-digit number
        const ITEM_ID = generateNumber(4); // 4-digit number
        const EVENT_ID = generateNumber(7); // 7-digit number
        const WORK_ITEM_SESSION_ID = generateNumber(8); // 8-digit number
        const ITEM_REF_NO = generateNumber(4); // 4-digit number
  
        // Check if EVENT_ID already exists in the database
        const existingEvent = await WF_WORK_ITEM.findOne({ EVENT_ID });
        if (existingEvent) {
          return res.status(400).json({
            message: 'Event ID already exists. Please try again.',
          });
        }
  
        // Create a new work item
        const newWorkItem = new WF_WORK_ITEM({
          WORK_ITEM_ID,
          BUS_PROC_ID,
          SUB_PROC_ID,
          QUEUE_ID,
          ITEM_VALUE,
          ITEM_DESC,
          ITEM_CLASS_NM,
          EVENT_ID,
          CUST_ID,
          REC_ST,
          VERSION,
          ROW_TS,
          USER_ID,
          BU_ID,
          CREATE_DT,
          SYS_CREATE_TS,
          WAIT_ST,
          MAX_DELAY_TM,
          DEADLINE_TM,
          ORIGINATOR_USER_ROLE_ID,
          WORK_ITEM_SESSION_ID,
          ITEM_REF_NO,
          TARGET_DUR_TM, // Calculated duration
          ESCALATION_TM, // Calculated escalation time
          ITEM_BU_ID,
          ITEM_TYPE,
          ITEM_ID,
          TARGET_USER_ROLE_ID,
        });
  
        await newWorkItem.save();
  
        // Trigger notification for the assigned role
        await NotificationService.send({
          ROLE_ID: TARGET_USER_ROLE_ID, // Notify the target role
          message: `New work item created: ${ITEM_DESC}`,
          WORK_ITEM_ID,
          EVENT_ID,
          status: 'Pending',
        });
  
        res.status(201).json({
          message: 'Work item created and notification sent successfully.',
          data: newWorkItem,
        });
      } catch (error) {
        console.error('Error creating work item:', error);
        res.status(500).json({ message: 'Error creating work item', error });
      }
    }
  
    // Controller function to get all work items
    static async getAllWorkItems(req, res) {
      try {
        console.log('Fetching work items from database...');
        const workItems = await WF_WORK_ITEM.find();
  
        if (!workItems || workItems.length === 0) {
          return res.status(404).json({ message: 'No work items found' });
        }
  
        // Map over the work items and add the 'age' field
        const workItemsWithAge = workItems.map(item => {
          const itemAge = WF_WORK_ITEMController.calculateAge(item.created_at);  // Use the static method
          return { ...item.toObject(), age: itemAge };  // Add the 'age' to the item
        });
  
        res.status(200).json({
          message: 'Work items fetched successfully.',
          data: workItemsWithAge,
        });
      } catch (error) {
        console.error('Error fetching work items:', error);
        res.status(500).json({
          message: 'Error fetching work items',
          error: error.message || error,  // Include the error message for debugging
        });
      }
    }
    static async deleteWorkItem(req, res) {
      const { WORK_ITEM_ID } = req.params; // Expecting WORK_ITEM_ID from URL parameter
  
      try {
        // Find the work item using WORK_ITEM_ID and delete it
        const workItem = await WF_WORK_ITEM.findOneAndDelete({ WORK_ITEM_ID });
  
        if (!workItem) {
          return res.status(404).json({ message: 'Work item not found.' });
        }
  
        res.status(200).json({
          message: 'Work item deleted successfully.',
        });
      } catch (error) {
        console.error('Error deleting work item:', error);
        res.status(500).json({ message: 'Error deleting work item', error });
      }
    }
   
      // Controller method to get a work item by WORK_ITEM_ID
      static async getWorkItemById(req, res) {
        const { workItemId } = req.params; // Expecting workItemId from the URL parameter
    
        try {
          // Find the work item using WORK_ITEM_ID
          const workItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId });
    
          if (!workItem) {
            return res.status(404).json({ message: 'Work item not found.' });
          }
    
          res.status(200).json({
            message: 'Work item fetched successfully.',
            data: workItem,
          });
        } catch (error) {
          console.error('Error fetching work item:', error);
          res.status(500).json({ message: 'Error fetching work item', error });
        }
      }
    }
    
  
  
  export default WF_WORK_ITEMController;
  