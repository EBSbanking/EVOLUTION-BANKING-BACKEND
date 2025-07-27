import LoanContractForm from '../models/LoanContractForm.js';
import LoanAccount from '../models/LoanAccount.js';
import NotificationService from '../services/NotificationService.js';
import moment from 'moment';

class LoanContractController {
  static generateId(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  static async createLoanContractFromApplication(application, userContext = {}) {
    try {
      console.log('Application received for contract creation:', application);

      const requiredFields = [
        'APPL_ID',
        'CUST_ID',
        'CREATED_BY',
        'borrower_name',
        'bank_name',
        'bank_short',
        'INTEREST_RATE',
        'TERM_VALUE',
        'AMOUNT',
        'PROD_ID',
        'FUNDING_ACCT',
        'PROCESSING_FEE'
      ];

      for (const field of requiredFields) {
        if (!application[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      const loanContractNo = `LCN-${LoanContractController.generateId(8)}`;

      const newContract = new LoanContractForm({
        applicationId: application.APPL_ID.trim(),
        loan_contract_no: loanContractNo,
        customer_id: application.CUST_ID,
        USER_ID: application.CREATED_BY,
        bank_name: application.bank_name || userContext.bank_name || "Default Bank",
        bank_short: application.bank_short || userContext.bank_short || "DB",
        borrower_name: application.borrower_name.trim(),
        borrower_address: application.borrower_address?.trim() || "Address Not Provided",
        loan_purpose: application.PROD_ID || 'General Purpose',
        loan_amount: application.AMOUNT,
        loan_term: application.TERM_VALUE,
        interest_rate: application.INTEREST_RATE,
        loanAccountNo: application.ACCT_NO || `LA-${LoanContractController.generateId(6)}`,
        fundingAccountNo: application.FUNDING_ACCT || `FA-${LoanContractController.generateId(6)}`,
        fees: {
          processingFee: application.PROCESSING_FEE,
          latePaymentFee: application.LATE_FEE || 0,
          earlyRepaymentFee: application.EARLY_REPAYMENT_FEE || 0
        },
        metadata: {
          productId: application.PROD_ID || '',
          applicationSource: application.applicationSource || userContext.source || 'BRANCH'
        }
      });

      await newContract.save();

      await NotificationService.send({
        role: userContext.targetRole || "Manager",
        message: `Loan Contract ${loanContractNo} has been created.`,
      });

      return {
        success: true,
        contract: newContract
      };

    } catch (err) {
      console.error('Failed to create loan contract from application:', err.message);
      return {
        success: false,
        error: err.message,
        message: "Failed to process loan disbursement"
      };
    }
  }

  static async getLoanContract(req, res) {
    try {
      const { id } = req.params;
      const contract = await LoanContractForm.findOne({ loan_contract_no: id });

      if (!contract) {
        return res.status(404).json({ message: 'Loan contract not found' });
      }

      return res.status(200).json({ contract });
    } catch (error) {
      console.error('Error fetching loan contract:', error);
      return res.status(500).json({
        message: 'Error fetching loan contract',
        error: error.message,
      });
    }
  }

  static async createLoanContract(req, res) {
    try {
      const loanContractNo = `LCN-${LoanContractController.generateId(8)}`;

      const newContract = new LoanContractForm({
        ...req.body,
        loan_contract_no: loanContractNo,
      });

      await newContract.save();

      const {
        USER_ID,
        BU_ID,
        ORIGINATOR_USER_ROLE_ID = "Credit Support Officer",
        TARGET_USER_ROLE_ID = "Manager",
      } = req.body;

      const allowedRoles = ['Credit Support Officer', 'Supervisor', 'Manager', 'Branch Head'];
      if (!allowedRoles.includes(ORIGINATOR_USER_ROLE_ID) || !allowedRoles.includes(TARGET_USER_ROLE_ID)) {
        return res.status(400).json({ message: 'Invalid role specified' });
      }

      await NotificationService.send({
        role: TARGET_USER_ROLE_ID,
        message: `Loan Contract ${loanContractNo} has been created.`,
      });

      const contractText = LoanContractController.generateDefaultContractText(newContract);

      return res.status(201).json({
        message: 'Loan contract created successfully.',
        loan_contract_no: loanContractNo,
        contractText,
      });

    } catch (error) {
      console.error('Error creating loan contract:', error);
      return res.status(500).json({
        message: 'Error occurred while creating loan contract.',
        error: error.message,
      });
    }
  }

  static async getLoanContractsByCustomerId(req, res) {
    try {
      const { cust_id } = req.params;

      if (!cust_id) {
        return res.status(400).json({ message: 'Customer ID is required' });
      }

      const contracts = await LoanContractForm.find({ customer_id: cust_id });

      if (!contracts || contracts.length === 0) {
        return res.status(404).json({
          message: 'No loan contracts found for this customer',
          customer_id: cust_id
        });
      }

      return res.status(200).json({
        count: contracts.length,
        contracts
      });

    } catch (error) {
      console.error('Error fetching loan contracts by customer ID:', error);
      return res.status(500).json({
        message: 'Error fetching loan contracts',
        error: error.message,
      });
    }
  }

  static async getLoanContractByAcctNo(req, res) {
    try {
      const { acct_no } = req.params;

      const loanAccount = await LoanAccount.findOne({ ACCT_NO: acct_no });

      if (!loanAccount) {
        return res.status(404).json({ message: 'Loan account not found' });
      }

      const customerId = loanAccount.CUST_ID || loanAccount.USER_ID;

      if (!customerId) {
        return res.status(400).json({ message: 'Loan account does not have a valid customer ID or USER ID' });
      }

      const loanContract = await LoanContractForm.findOne({
        $or: [
          { customer_id: customerId },
          { USER_ID: customerId }
        ]
      });

      if (!loanContract) {
        return res.status(404).json({ message: 'Loan contract not found for this account' });
      }

      return res.status(200).json({ contract: loanContract });

    } catch (error) {
      console.error('Error fetching contract by account number:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }

  static generateDefaultContractText(data) {
    const {
      loan_contract_no = `LC-${Date.now()}`,
      customer_id = '',
      bank_name = process.env.BANK_NAME || 'Our Bank',
      bank_short = process.env.BANK_SHORT_CODE || 'OB',
      borrower_name = 'Customer Name',
      co_signatory_name = '',
      borrower_address = 'Customer Address',
      loan_purpose = 'General Business Purpose',
      loan_amount = 0,
      loan_term = 0,
      interest_rate = 0,
      guarantor_name = ''
    } = data;

    return `
Individual Loan Contract  
Loan Contract No.: ${loan_contract_no}  
Customer ID No.: ${customer_id}

This loan contract is between ${bank_name}, a body corporate incorporated under the Laws of the Federal Republic of Nigeria (hereinafter referred to as "${bank_short}") of the one part, and ${borrower_name} (hereinafter referred to as "the Borrower") and  
${co_signatory_name} (hereinafter referred to as "the Co-signatory") of the other part, both residing at:  
${borrower_address}

...[Contract content continues in full as user provided]...
`;  
  }
}

export default LoanContractController;
