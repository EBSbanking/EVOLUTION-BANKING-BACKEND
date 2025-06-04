import CreditApplication from '../models/CreditApplication.js';
import LoanContractForm from '../models/LoanContractForm.js';
import { generateAcctNo, getLoanCycleCount } from '../utils/counterUtil.js';

// Controller to manage loan contract logic
class LoanContractController {
  /**
   * Creates a loan contract from a credit application.
   */
  static async createLoanContractFromApplication(application, { bank_name, bank_short, originatorRole, targetRole }) {
    try {
      const loan_contract_no = `LC${Date.now()}`;

      const loanContract = new LoanContractForm({
        loan_contract_no,
        customer_id: application.CUST_ID?.toString() || '',
        borrower_name: application.CUST_NM || '',
        borrower_address: application.BORROWER_ADDRESS || application.Borrower_address || '',
        loan_purpose: application.Purpose_of_Credit || '',
        loan_amount: application.APPROVED_LIMIT_AMT?.toString() || '0',
        loan_term: application.TERM_VALUE || '',
        interest_rate: 5.0,
        bank_name,
        bank_short,
        status: 'active',
      });

      await loanContract.save();

      const workflowItemId = `workflow-${loan_contract_no}`;
      return { success: true, contract: loanContract, workflowItemId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Retrieves a loan contract by loan contract number.
   */
  static async getLoanContract(loanContractNo) {
    try {
      const contract = await LoanContractForm.findOne({ loan_contract_no: loanContractNo });
      return contract;
    } catch (error) {
      console.error('Error fetching loan contract:', error);
      throw error;
    }
  }
}


// Main Credit Application Controller
class CreditApplicationController {
  // In createCreditApplication - include BORROWER_ADDRESS from req.body into new CreditApplication
  static async createCreditApplication(req, res) {
    try {
      if (!req.body || !req.body.CUST_ID) {
        return res.status(400).json({
          message: 'Missing or invalid request body. Ensure required fields like CUST_ID are provided.',
        });
      }

      const acctNo = await generateAcctNo();
      const loanCycleCount = await getLoanCycleCount(req.body.CUST_ID);

      const newApplication = new CreditApplication({
        ...req.body, // includes BORROWER_ADDRESS if present
        ACCT_NO: acctNo,
        LOAN_CYCLE: loanCycleCount,
        STATUS: 'Pending', // or remove if schema default is used
      });

      await newApplication.save();

      res.status(201).json({
        message: 'Credit application created successfully and submitted for approval',
        status: 'Pending',
        application: newApplication,
      });
    } catch (error) {
      console.error('Error creating credit application:', {
        requestData: req.body,
        error: error.message,
      });
      res.status(500).json({
        message: 'Error creating credit application',
        error: error.message,
      });
    }
  }

  // Approve a credit application and generate a loan contract using APPL_ID
static async approveCreditApplication(req, res) {
  let { applId } = req.params;
  applId = decodeURIComponent(applId); // Decode %2F to /

  console.log('Decoded applId:', applId); // Debug: Should log CRAPP/0045

  try {
    // Find by APPL_ID
    const application = await CreditApplication.findOne({ APPL_ID: applId });

    if (!application) {
      console.log('Application not found with APPL_ID:', applId); // Extra debug
      return res.status(404).json({ message: 'Credit application not found' });
    }

    // Mark as approved
    application.STATUS = 'Active';
    await application.save();

    // Generate loan contract
    const loanContractResult = await LoanContractController.createLoanContractFromApplication(application, {
      bank_name: process.env.BANK_NAME || "Your Bank Ltd",
      bank_short: process.env.BANK_SHORT || "YBL",
      originatorRole: "Supervisor",
      targetRole: "Manager",
    });

    if (!loanContractResult.success) {
      console.error('Loan contract creation failed:', loanContractResult.error);
      return res.status(500).json({
        message: 'Application approved, but loan contract creation failed',
        error: loanContractResult.error,
      });
    }

    res.status(200).json({
      message: 'Credit application approved, loan contract created and sent for approval',
      application,
      loanContract: loanContractResult.contract,
      workflowStatusUrl: `/api/workflow/${loanContractResult.workflowItemId}`,
    });

  } catch (error) {
    console.error('Error approving credit application:', error);
    res.status(500).json({
      message: 'Error approving credit application',
      error: error.message,
    });
  }
}


  // Get all credit applications
  static async getAllCreditApplications(req, res) {
    try {
      const applications = await CreditApplication.find();
      res.status(200).json(applications);
    } catch (error) {
      res.status(500).json({
        message: 'Error retrieving credit applications',
        error: error.message,
      });
    }
  }

  // Get a credit application by APPL_ID
  static async getCreditApplicationByApplId(req, res) {
    const { applId } = req.params;
    try {
      const application = await CreditApplication.findOne({ APPL_ID: applId });
      if (!application) {
        return res.status(404).json({ message: 'Credit application not found' });
      }
      res.status(200).json(application);
    } catch (error) {
      res.status(500).json({
        message: 'Error retrieving credit application by APPL_ID',
        error: error.message,
      });
    }
  }

 
  // Get raw credit application document by MongoDB ID
static async getCreditApplicationByIdRaw(req, res) {
  const { id } = req.params;
  try {
    const application = await CreditApplication.findById(id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.status(200).json({
      identifier: `${application.CUST_ID}-${application.ACCT_NO}`, // Example logic
      application,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error generating identifier',
      error: error.message,
    });
  }
}


  // Get a credit application by ACCT_NO
  static async getCreditApplicationByAcctNo(req, res) {
    const { acctNo } = req.params;
    try {
      const application = await CreditApplication.findOne({ ACCT_NO: acctNo });
      if (!application) {
        return res.status(404).json({ message: 'Credit application not found' });
      }
      res.status(200).json(application);
    } catch (error) {
      res.status(500).json({
        message: 'Error retrieving credit application by ACCT_NO',
        error: error.message,
      });
    }
  }

  // Update a credit application
 static async updateCreditApplication(req, res) {
  const { applId } = req.params;  // use applId from params
  try {
    const updatedApplication = await CreditApplication.findOneAndUpdate(
      { APPL_ID: applId },  // find by APPL_ID instead of _id
      req.body,
      { new: true }
    );

    if (!updatedApplication) {
      return res.status(404).json({ message: 'Credit application not found' });
    }

    res.status(200).json({
      message: 'Credit application updated successfully',
      application: updatedApplication,
    });
  } catch (error) {
    res.status(400).json({
      message: 'Error updating credit application',
      error: error.message,
    });
  }
}

// Delete a credit application by APPL_ID
static async deleteCreditApplication(req, res) {
  const { applId } = req.params;  // use applId from params
  try {
    const deletedApplication = await CreditApplication.findOneAndDelete({ APPL_ID: applId });

    if (!deletedApplication) {
      return res.status(404).json({ message: 'Credit application not found' });
    }

    res.status(200).json({ message: 'Credit application deleted successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error deleting credit application',
      error: error.message,
    });
  }
}

}

export default CreditApplicationController;
