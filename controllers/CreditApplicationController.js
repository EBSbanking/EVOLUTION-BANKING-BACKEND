import CreditApplication from '../models/CreditApplication.js';
import { generateAcctNo, getLoanCycleCount, generateNumber } from '../utils/counterUtil.js';
import AuditTrail from '../models/AuditTrail.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import NotificationService from '../services/NotificationService.js';
import moment from 'moment';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import LoanContractForm from '../models/LoanContractForm.js';

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
        interest_rate: "",
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

      // Generate account number and loan cycle count
      const acctNo = await generateAcctNo();
      const loanCycleCount = await getLoanCycleCount(req.body.CUST_ID);

      // Create and save the credit application with default 'Pending' status
      const newApplication = new CreditApplication({
        ...req.body,
        ACCT_NO: acctNo,
        LOAN_CYCLE: loanCycleCount,
        STATUS: 'Pending', // Set to valid enum value instead of empty string
        REC_ST: 'Active'  // Ensure record status is also set properly
      });

      await newApplication.save();

      // Generate workflow IDs
      const {
        WORK_ITEM_ID,
        QUEUE_ID,
        SUB_PROC_ID,
        BUS_PROC_ID
      } = generateWorkflowIdentifiers();

      // Create the workflow item, referencing the MongoDB ObjectId
      const workflowItem = new WF_WORK_ITEM({
        WORK_ITEM_ID,
        ITEM_VALUE: Buffer.from(newApplication.CUST_ID.toString()),
        ITEM_DESC: `Credit Application for ${newApplication.CUST_NM || newApplication.FIRST_NAME}`,
        ITEM_CLASS_NM: 'CreditApplication',
        ITEM_TYPE: 'CreditApplication',
        EVENT_ID: generateNumber(7),
        CUST_ID: parseInt(newApplication.CUST_ID),
        REC_ST: 'Pending', // Workflow items should start as Pending
        VERSION: 1,
        USER_ID: req.user?.id || userId,
        BU_ID: newApplication.BU_ID || '0001',
        CREATE_DT: moment().toISOString(),
        WAIT_ST: 'Pending',
        ITEM_ID: newApplication._id,
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
    const { WORK_ITEM_ID, APPROVED_BY, CUST_ID, comments, APPL_ID } = req.body;

    if ((!WORK_ITEM_ID && !APPL_ID) || !APPROVED_BY || !CUST_ID) {
      return res.status(400).json({
        message: 'WORK_ITEM_ID or APPL_ID, and APPROVED_BY and CUST_ID are required'
      });
    }

    try {
      const parsedCustId = parseInt(CUST_ID);
      const parsedWorkItemId = WORK_ITEM_ID ? parseInt(WORK_ITEM_ID) : null;

      let workItem = null;
      let application = null;

      // Step 1: Try to find work item by WORK_ITEM_ID (if provided)
      if (WORK_ITEM_ID) {
        workItem = await WF_WORK_ITEM.findOne({
          WORK_ITEM_ID: parsedWorkItemId,
          CUST_ID: parsedCustId
        });

        if (workItem) {
          application = await CreditApplication.findById(workItem.ITEM_ID);
          
          // Check if already approved
          if (application && application.STATUS === 'Approved') {
            return res.status(400).json({
              message: 'Credit application already approved',
              APPL_ID: application.APPL_ID,
              CUST_ID: parsedCustId,
              approvedDate: application.APPROVED_DATE
            });
          }
        }
      }

      // Step 2: If not found via WORK_ITEM_ID, try to find via APPL_ID
      if (!workItem && APPL_ID) {
        application = await CreditApplication.findOne({
          APPL_ID: APPL_ID,
          CUST_ID: parsedCustId
        });

        if (!application) {
          return res.status(404).json({ 
            message: 'Credit application not found for APPL_ID',
            APPL_ID,
            CUST_ID: parsedCustId
          });
        }

        if (application.STATUS === 'Approved') {
          return res.status(400).json({
            message: 'Credit application already approved',
            APPL_ID,
            CUST_ID: parsedCustId,
            approvedDate: application.APPROVED_DATE
          });
        }

        workItem = await WF_WORK_ITEM.findOne({
          ITEM_ID: application._id,
          CUST_ID: parsedCustId
        });

        if (!workItem) {
          return res.status(404).json({
            message: 'No work item exists for this credit application',
            APPL_ID,
            CUST_ID: parsedCustId,
            applicationId: application._id
          });
        }
      }

      // Final validation
      if (!workItem || !application) {
        return res.status(404).json({
          message: 'Work item or application not found',
          WORK_ITEM_ID: parsedWorkItemId,
          CUST_ID: parsedCustId,
          APPL_ID
        });
      }

      // Update credit application
      application.STATUS = 'Approved';
      application.REC_ST = 'Active';
      application.APPROVED_BY = APPROVED_BY;
      application.APPROVED_DATE = new Date();
      await application.save();

      // Update work item
      workItem.REC_ST = 'Active';
      workItem.APPROVED_BY = APPROVED_BY;
      workItem.APPROVED_DATE = new Date();
      workItem.WAIT_ST = 'Completed';
      workItem.COMMENTS = comments;
      await workItem.save();

      // Complete the workflow item
      await WF_WORK_ITEMController.completeWorkItem(workItem.WORK_ITEM_ID, 'Approved', APPROVED_BY);

      // Create loan contract
      const result = await LoanContractController.createLoanContractFromApplication(application, {
        bank_name: process.env.BANK_NAME || 'Default Bank',
        bank_short: process.env.BANK_SHORT || 'DBL',
        originatorRole: 'Supervisor',
        targetRole: 'Manager'
      });

      if (!result.success) {
        return res.status(500).json({
          message: 'Loan contract creation failed after approval',
          error: result.error
        });
      }

      // Send notification
      await NotificationService.send({
        ROLE_ID: 'Manager',
        message: `Loan contract ${result.contract.loan_contract_no} created for ${application.CUST_NM}`,
        WORK_ITEM_ID: workItem.WORK_ITEM_ID,
        CUST_ID: parsedCustId
      });

      return res.status(200).json({
        message: 'Credit application approved and loan contract created successfully',
        application,
        loanContract: result.contract
      });

    } catch (error) {
      console.error('Approval error:', error);
      return res.status(500).json({
        message: 'Error approving credit application',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }



static async rejectCreditApplication(req, res) {
  const { WORK_ITEM_ID, REJECTED_BY, CUST_ID, comments, APPL_ID } = req.body;

  if ((!WORK_ITEM_ID && !APPL_ID) || !REJECTED_BY || !CUST_ID) {
    return res.status(400).json({
      message: 'WORK_ITEM_ID or APPL_ID, and REJECTED_BY and CUST_ID are required'
    });
  }

  try {
    const parsedCustId = parseInt(CUST_ID);
    const parsedWorkItemId = WORK_ITEM_ID ? parseInt(WORK_ITEM_ID) : null;

    let workItem = null;
    let application = null;

    // Step 1: Try to find work item by WORK_ITEM_ID (if provided)
    if (WORK_ITEM_ID) {
      workItem = await WF_WORK_ITEM.findOne({
        WORK_ITEM_ID: parsedWorkItemId,
        CUST_ID: parsedCustId,
        REC_ST: 'Pending'
      });

      if (workItem) {
        application = await CreditApplication.findById(workItem.ITEM_ID);

        if (application && application.STATUS === 'Rejected') {
          return res.status(400).json({
            message: 'Credit application already rejected',
            APPL_ID: application.APPL_ID,
            CUST_ID: parsedCustId,
            rejectedDate: application.REJECTED_DATE
          });
        }
      }
    }

    // Step 2: If not found via WORK_ITEM_ID, try to find via APPL_ID
    if (!workItem && APPL_ID) {
      application = await CreditApplication.findOne({
        APPL_ID: APPL_ID,
        CUST_ID: parsedCustId,
        STATUS: 'Pending'
      });

      if (!application) {
        return res.status(404).json({
          message: 'Credit application not found or already rejected',
          APPL_ID,
          CUST_ID: parsedCustId
        });
      }

      workItem = await WF_WORK_ITEM.findOne({
        ITEM_ID: application._id,
        CUST_ID: parsedCustId,
        REC_ST: 'Pending'
      });

      if (!workItem) {
        return res.status(404).json({
          message: 'No work item found for this credit application',
          APPL_ID,
          CUST_ID: parsedCustId
        });
      }
    }

    // Final check
    if (!workItem || !application) {
      return res.status(404).json({
        message: 'Work item or application not found',
        WORK_ITEM_ID: parsedWorkItemId,
        CUST_ID: parsedCustId,
        APPL_ID
      });
    }

    // Update Credit Application
    application.STATUS = 'Rejected';
    application.REC_ST = 'Inactive';
    application.REJECTED_BY = REJECTED_BY;
    application.REJECTED_DATE = new Date();
    application.REJECTION_REASON = comments || '';
    await application.save();

    // Update Workflow Item
    workItem.REC_ST = 'Rejected';
    workItem.REJECTED_BY = REJECTED_BY;
    workItem.REJECTED_DATE = new Date();
    workItem.WAIT_ST = 'Completed';
    workItem.COMMENTS = comments || '';
    await workItem.save();

    // Complete the workflow item
    await WF_WORK_ITEMController.completeWorkItem(workItem.WORK_ITEM_ID, 'Rejected', REJECTED_BY);

    // Send notification
    await NotificationService.send({
      ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
      message: `Credit application for ${application.CUST_NM || application.CUST_ID} was rejected`,
      WORK_ITEM_ID: workItem.WORK_ITEM_ID,
      CUST_ID: parsedCustId
    });

    return res.status(200).json({
      message: 'Credit application rejected successfully',
      application
    });

  } catch (error) {
    console.error('Rejection error:', error);
    return res.status(500).json({
      message: 'Error rejecting credit application',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}



  // ✅ NEW: Get all credit applications and map each to its WORK_ITEM_ID
  static async getAllCreditApplicationsWithWorkItems(req, res) {
    try {
      const creditApplications = await CreditApplication.find().lean();

      const workItems = await WF_WORK_ITEM.find({
        ITEM_TYPE: 'CreditApplication',
      }).select('WORK_ITEM_ID ITEM_ID').lean();

      const workItemMap = new Map(workItems.map(w => [w.ITEM_ID.toString(), w.WORK_ITEM_ID]));

      const enrichedApps = creditApplications.map(app => ({
        ...app,
        WORK_ITEM_ID: workItemMap.get(app._id.toString()) || null
      }));

      return res.status(200).json(enrichedApps);
    } catch (error) {
      console.error('Error fetching credit applications with work items:', error);
      return res.status(500).json({
        message: 'Failed to retrieve credit applications',
        error: error.message
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
