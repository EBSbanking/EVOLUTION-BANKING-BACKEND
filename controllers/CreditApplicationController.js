import CreditApplication from '../models/CreditApplication.js';
import LoanContractForm from '../models/LoanContractForm.js';
import { generateAcctNo, getLoanCycleCount, generateNumber } from '../utils/counterUtil.js';
import AuditTrail from '../models/AuditTrail.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import NotificationService from '../services/NotificationService.js';
import moment from 'moment';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';

// Controller to manage loan contract logic
class LoanContractController {
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

  static async getLoanContract(loanContractNo) {
    try {
      return await LoanContractForm.findOne({ loan_contract_no: loanContractNo });
    } catch (error) {
      console.error('Error fetching loan contract:', error);
      throw error;
    }
  }
}

// Main Credit Application Controller
class CreditApplicationController {
  static async createCreditApplication(req, res) {
    try {
      if (!req.body?.CUST_ID) {
        return res.status(400).json({
          message: 'Missing or invalid request body. Ensure required fields like CUST_ID are provided.',
        });
      }

      const acctNo = await generateAcctNo();
      const loanCycleCount = await getLoanCycleCount(req.body.CUST_ID);

      const newApplication = new CreditApplication({
        ...req.body,
        ACCT_NO: acctNo,
        LOAN_CYCLE: loanCycleCount,
        STATUS: 'Pending',
      });

      await newApplication.save();

      // ✅ Submit to Workflow for Approval
      const {
        WORK_ITEM_ID,
        QUEUE_ID,
        SUB_PROC_ID,
        BUS_PROC_ID
      } = generateWorkflowIdentifiers();

      const workflowItem = new WF_WORK_ITEM({
        WORK_ITEM_ID,
        ITEM_VALUE: Buffer.from(newApplication.CUST_ID.toString()),
        ITEM_DESC: `Credit Application for ${newApplication.CUST_NM || newApplication.FIRST_NAME}`,
        ITEM_CLASS_NM: 'CreditApplication',
        ITEM_TYPE: 'CreditApplication',
        EVENT_ID: generateNumber(7),
        CUST_ID: parseInt(newApplication.CUST_ID),
        REC_ST: 'Active',
        VERSION: 1,
        USER_ID: req.user?.id || 'system',
        BU_ID: newApplication.BU_ID || '0001',
        CREATE_DT: moment().toISOString(),
        WAIT_ST: 'Pending',
        ITEM_ID: generateNumber(4),
        ITEM_REF_NO: generateNumber(4),
        ORIGINATOR_USER_ROLE_ID: req.user?.role || 'Creator',
        QUEUE_ID,
        SUB_PROC_ID,
        BUS_PROC_ID,
      });

      await workflowItem.save();

      return res.status(201).json({
        message: 'Credit application created and submitted to workflow for approval',
        status: 'Pending',
        application: newApplication,
        workflow: {
          workItemId: WORK_ITEM_ID,
          workflowStatusUrl: `/api/workflow/${WORK_ITEM_ID}`,
        },
      });
    } catch (error) {
      console.error('Error creating credit application:', {
        requestData: req.body,
        error: error.message,
      });
      return res.status(500).json({
        message: 'Error creating credit application',
        error: error.message,
      });
    }
  }

  static async approveCreditApplication(req, res) {
    let { applId } = req.params;
    applId = decodeURIComponent(applId);

    const { status, reason } = req.body;
    const userId = req.user?.id || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const validStatuses = ['Pending', 'Approved', 'Rejected'];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    if (status === 'Rejected' && !reason) {
      return res.status(400).json({ message: 'Rejection reason is required when status is Rejected.' });
    }

    try {
      const application = await CreditApplication.findOne({ APPL_ID: applId });
      if (!application) {
        return res.status(404).json({ message: 'Credit application not found' });
      }

      const oldStatus = application.STATUS;
      application.STATUS = status;
      if (status === 'Rejected') application.rejectionReason = reason;
      await application.save();

      // Handle rejection
      if (status === 'Rejected') {
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: userId,
          event_type: 'CreditApplication',
          action: 'Reject Application',
          old_value: { status: oldStatus },
          new_value: { status: 'Rejected', reason },
          ip_address: ipAddress,
          timestamp: new Date(),
        });

        return res.status(200).json({
          message: 'Credit application rejected successfully',
          application,
        });
      }

      // Handle approval
      if (status === 'Approved') {
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: userId,
          event_type: 'CreditApplication',
          action: 'Approve Application',
          old_value: { status: oldStatus },
          new_value: { status: 'Approved' },
          ip_address: ipAddress,
          timestamp: new Date(),
        });

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

        // Audit loan contract creation
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: userId,
          event_type: 'LoanContract',
          action: 'Loan Contract Created',
          old_value: null,
          new_value: { loan_contract_no: loanContractResult.contract.loan_contract_no },
          ip_address: ipAddress,
          timestamp: new Date(),
        });

        const { loan_contract_no, customer_id } = loanContractResult.contract;
        const { WORK_ITEM_ID, QUEUE_ID, SUB_PROC_ID, BUS_PROC_ID } = generateWorkflowIdentifiers();
        const workflowItemData = new WF_WORK_ITEM({
          WORK_ITEM_ID,
          ITEM_VALUE: Buffer.from(customer_id.toString()),
          ITEM_DESC: `Loan Contract Approval for ${application.CUST_NM || application.FIRST_NAME}`,
          ITEM_CLASS_NM: "LoanContract",
          ITEM_TYPE: "LoanContract",
          EVENT_ID: generateNumber(7),
          CUST_ID: parseInt(customer_id),
          REC_ST: "Active",
          VERSION: 1,
          USER_ID: userId,
          BU_ID: application.BU_ID || "0001",
          CREATE_DT: moment().toISOString(),
          WAIT_ST: "Pending",
          ITEM_ID: generateNumber(4),
          ITEM_REF_NO: generateNumber(4),
          ORIGINATOR_USER_ROLE_ID: userId,
          QUEUE_ID,
          SUB_PROC_ID,
          BUS_PROC_ID,
        });

        await workflowItemData.save();

        // Send notifications
        const roles = ['Manager', 'Compliance Officer'];
        const message = `New loan contract (ID: ${WORK_ITEM_ID}) requires your approval.`;
        for (const role of roles) {
          await NotificationService.send({
            ROLE_ID: role,
            message,
            WORK_ITEM_ID,
          });
        }

        return res.status(200).json({
          message: 'Credit application approved, loan contract created and submitted for approval',
          application,
          loanContract: loanContractResult.contract,
          workflowItem: workflowItemData,
          workflowStatusUrl: `/api/workflow/${WORK_ITEM_ID}`,
        });
      }

      return res.status(200).json({
        message: 'Credit application status updated',
        application,
      });
    } catch (error) {
      console.error('Error approving credit application:', error);
      return res.status(500).json({
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
static async getCreditApplicationByCustId(req, res) {
  const { custId } = req.params;

  try {
    const applications = await CreditApplication.find({ CUST_ID: custId });

    if (!applications || applications.length === 0) {
      return res.status(404).json({ message: 'No credit applications found for the given CUST_ID' });
    }

    res.status(200).json(applications);
  } catch (error) {
    res.status(500).json({
      message: 'Error retrieving credit applications by CUST_ID',
      error: error.message,
    });
  }
}


}

export default CreditApplicationController;
