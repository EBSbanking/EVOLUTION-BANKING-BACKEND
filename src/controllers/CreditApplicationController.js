// CreditApplicationController.js - COMPLETE MYSQL/SEQUELIZE VERSION
import CreditApplication from '../models/CreditApplication.js';
import { generateAcctNo, getLoanCycleCount, generateNumber } from '../utils/counterUtil.js';
import AuditTrail from '../models/AuditTrail.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import NotificationService from '../Services/NotificationService.js';
import moment from 'moment';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import LoanContractForm from '../models/LoanContractForm.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import Guarantor from '../models/Guarantor.js';

// Controller to manage loan contract logic
class LoanContractController {
  static async createLoanContractFromApplication(application, { bank_name, bank_short, originatorRole, targetRole }) {
    try {
      const loan_contract_no = `LC${Date.now()}`;

      const loanContract = await LoanContractForm.create({
        loan_contract_no,
        customer_id: application.CUST_ID?.toString() || '',
        borrower_name: application.ACCT_NM || '',
        borrower_address: application.Borrower_address || '',
        loan_purpose: application.Purpose_of_Credit || '',
        loan_amount: application.APPROVED_LIMIT_AMT?.toString() || '0',
        loan_term: application.TERM_VALUE || '',
        interest_rate: application.INTEREST_RATE || '',
        bank_name,
        bank_short,
        status: 'active',
      });

      const workflowItemId = `workflow-${loan_contract_no}`;
      return { success: true, contract: loanContract, workflowItemId };
    } catch (error) {
      console.error('Error creating loan contract:', error);
      return { success: false, error: error.message };
    }
  }

  static async getLoanContract(loanContractNo) {
    try {
      return await LoanContractForm.findOne({ where: { loan_contract_no: loanContractNo } });
    } catch (error) {
      console.error('Error fetching loan contract:', error);
      throw error;
    }
  }
}

// Main Credit Application Controller - MySQL/Sequelize Version
class CreditApplicationController {
  
  // ==================== CREATE ====================


// ==================== CREATE ====================
  static async createCreditApplication(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      if (!req.body?.CUST_ID) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Missing or invalid request body. Ensure required fields like CUST_ID are provided.',
        });
      }

      // Generate account number and loan cycle count
      const acctNo = await generateAcctNo();
      const loanCycleCount = await getLoanCycleCount(req.body.CUST_ID);

      // ✅ Get guarantor info if provided
      let guarantorId = null;
      let guarantorData = null;
      if (req.body.GUARANTOR_ID) {
        try {
          // Find guarantor by business ID (guarantor_id) or internal ID
          guarantorData = await Guarantor.findOne({
            where: {
              [Op.or]: [
                { guarantor_id: req.body.GUARANTOR_ID },
                { id: req.body.GUARANTOR_ID }
              ]
            },
            transaction
          });
          
          if (guarantorData) {
            // Use the business guarantor_id (e.g., "1000000") not the internal id
            guarantorId = guarantorData.guarantor_id;
            console.log(`✅ Found guarantor: Business ID = ${guarantorId}, Internal ID = ${guarantorData.id}`);
          } else {
            console.warn(`⚠️ Guarantor not found with ID: ${req.body.GUARANTOR_ID}`);
            // If guarantor not found, still use the provided ID
            guarantorId = req.body.GUARANTOR_ID;
          }
        } catch (error) {
          console.warn('⚠️ Error fetching guarantor:', error.message);
          // Fallback: use the provided ID
          guarantorId = req.body.GUARANTOR_ID;
        }
      }

      // Create and save the credit application
      const newApplication = await CreditApplication.create({
        ...req.body,
        ACCT_NO: acctNo,
        LOAN_CYCLE: loanCycleCount,
        STATUS: 'Pending',
        REC_ST: 'Active',
        // ✅ Store the guarantor business ID
        guarantorId: guarantorId
      }, { transaction });

      // Generate workflow IDs
      const {
        WORK_ITEM_ID,
        QUEUE_ID,
        SUB_PROC_ID,
        BUS_PROC_ID
      } = generateWorkflowIdentifiers();

      // Create the workflow item
      const workflowItem = await WF_WORK_ITEM.create({
        WORK_ITEM_ID,
        ITEM_VALUE: newApplication.CUST_ID.toString(),
        ITEM_DESC: `Credit Application for ${newApplication.ACCT_NM || newApplication.CUST_ID}`,
        ITEM_CLASS_NM: 'CreditApplication',
        ITEM_TYPE: 'CreditApplication',
        EVENT_ID: generateNumber(7),
        CUST_ID: parseInt(newApplication.CUST_ID),
        REC_ST: 'Pending',
        VERSION: 1,
        USER_ID: req.user?.id || 'SYSTEM',
        BU_ID: newApplication.BU_ID || '0001',
        CREATE_DT: moment().toISOString(),
        WAIT_ST: 'Pending',
        ITEM_ID: newApplication.id,
        ITEM_REF_NO: generateNumber(4),
        ORIGINATOR_USER_ROLE_ID: req.user?.role || 'Creator',
        QUEUE_ID,
        SUB_PROC_ID,
        BUS_PROC_ID,
        // ✅ Store guarantor info in workflow too
        GUARANTOR_ID: guarantorId,
        GUARANTOR_NAME: guarantorData?.full_name || req.body.GUARANTOR_NAME || null
      }, { transaction });

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: 'Credit application created and submitted to workflow for approval',
        status: 'Pending',
        application: {
          ...newApplication.toJSON(),
          // ✅ Include guarantor info in response
          guarantorInfo: guarantorData ? {
            id: guarantorData.guarantor_id,
            name: guarantorData.full_name,
            phone: guarantorData.phone_number,
            relationship: guarantorData.relationship_to_borrower
          } : {
            id: guarantorId,
            name: req.body.GUARANTOR_NAME || 'Unknown'
          }
        },
        workflow: {
          workItemId: WORK_ITEM_ID,
          workflowStatusUrl: `/api/workflow/${WORK_ITEM_ID}`,
        },
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error creating credit application:', {
        requestData: req.body,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Error creating credit application',
        error: error.message,
      });
    }
  }

  // ==================== APPROVE ====================
  static async approveCreditApplication(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { WORK_ITEM_ID, APPROVED_BY, CUST_ID, comments, APPL_ID } = req.body;

      if ((!WORK_ITEM_ID && !APPL_ID) || !APPROVED_BY || !CUST_ID) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'WORK_ITEM_ID or APPL_ID, and APPROVED_BY and CUST_ID are required'
        });
      }

      const parsedCustId = parseInt(CUST_ID);
      let workItem = null;
      let application = null;

      // Step 1: Try to find work item by WORK_ITEM_ID
      if (WORK_ITEM_ID) {
        workItem = await WF_WORK_ITEM.findOne({
          where: {
            WORK_ITEM_ID: parseInt(WORK_ITEM_ID),
            CUST_ID: parsedCustId
          },
          transaction
        });

        if (workItem) {
          application = await CreditApplication.findByPk(workItem.ITEM_ID, { transaction });
          
          if (application && application.STATUS === 'Approved') {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              message: 'Credit application already approved',
              APPL_ID: application.APPL_ID,
              CUST_ID: parsedCustId,
              approvedDate: application.APPROVED_DATE
            });
          }
        }
      }

      // Step 2: If not found via WORK_ITEM_ID, try via APPL_ID
      if (!workItem && APPL_ID) {
        application = await CreditApplication.findOne({
          where: {
            APPL_ID: APPL_ID,
            CUST_ID: parsedCustId
          },
          transaction
        });

        if (!application) {
          await transaction.rollback();
          return res.status(404).json({ 
            success: false,
            message: 'Credit application not found for APPL_ID',
            APPL_ID,
            CUST_ID: parsedCustId
          });
        }

        if (application.STATUS === 'Approved') {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Credit application already approved',
            APPL_ID,
            CUST_ID: parsedCustId,
            approvedDate: application.APPROVED_DATE
          });
        }

        workItem = await WF_WORK_ITEM.findOne({
          where: {
            ITEM_ID: application.id,
            CUST_ID: parsedCustId
          },
          transaction
        });

        if (!workItem) {
          await transaction.rollback();
          return res.status(404).json({
            success: false,
            message: 'No work item exists for this credit application',
            APPL_ID,
            CUST_ID: parsedCustId,
            applicationId: application.id
          });
        }
      }

      if (!workItem || !application) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Work item or application not found',
          WORK_ITEM_ID: WORK_ITEM_ID ? parseInt(WORK_ITEM_ID) : null,
          CUST_ID: parsedCustId,
          APPL_ID
        });
      }

      // Update credit application
      await application.update({
        STATUS: 'Approved',
        REC_ST: 'Active',
        APPROVED_BY: APPROVED_BY,
        APPROVED_DATE: new Date()
      }, { transaction });

      // Update work item
      await workItem.update({
        REC_ST: 'Active',
        APPROVED_BY: APPROVED_BY,
        APPROVED_DATE: new Date(),
        WAIT_ST: 'Completed',
        COMMENTS: comments || null
      }, { transaction });

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
        await transaction.rollback();
        return res.status(500).json({
          success: false,
          message: 'Loan contract creation failed after approval',
          error: result.error
        });
      }

      // Send notification
      try {
        await NotificationService.send({
          ROLE_ID: 'Manager',
          message: `Loan contract ${result.contract.loan_contract_no} created for ${application.ACCT_NM}`,
          WORK_ITEM_ID: workItem.WORK_ITEM_ID,
          CUST_ID: parsedCustId
        });
      } catch (notifyError) {
        console.warn('Notification failed:', notifyError.message);
        // Don't fail the transaction for notification errors
      }

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: 'Credit application approved and loan contract created successfully',
        application,
        loanContract: result.contract
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Approval error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error approving credit application',
        error: error.message,
      });
    }
  }

  // ==================== REJECT ====================
  static async rejectCreditApplication(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { WORK_ITEM_ID, REJECTED_BY, CUST_ID, comments, APPL_ID } = req.body;

      if ((!WORK_ITEM_ID && !APPL_ID) || !REJECTED_BY || !CUST_ID) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'WORK_ITEM_ID or APPL_ID, and REJECTED_BY and CUST_ID are required'
        });
      }

      const parsedCustId = parseInt(CUST_ID);
      let workItem = null;
      let application = null;

      // Step 1: Try to find work item by WORK_ITEM_ID
      if (WORK_ITEM_ID) {
        workItem = await WF_WORK_ITEM.findOne({
          where: {
            WORK_ITEM_ID: parseInt(WORK_ITEM_ID),
            CUST_ID: parsedCustId,
            REC_ST: 'Pending'
          },
          transaction
        });

        if (workItem) {
          application = await CreditApplication.findByPk(workItem.ITEM_ID, { transaction });

          if (application && application.STATUS === 'Rejected') {
            await transaction.rollback();
            return res.status(400).json({
              success: false,
              message: 'Credit application already rejected',
              APPL_ID: application.APPL_ID,
              CUST_ID: parsedCustId,
              rejectedDate: application.REJECTED_DATE
            });
          }
        }
      }

      // Step 2: If not found via WORK_ITEM_ID, try via APPL_ID
      if (!workItem && APPL_ID) {
        application = await CreditApplication.findOne({
          where: {
            APPL_ID: APPL_ID,
            CUST_ID: parsedCustId,
            STATUS: 'Pending'
          },
          transaction
        });

        if (!application) {
          await transaction.rollback();
          return res.status(404).json({
            success: false,
            message: 'Credit application not found or already rejected',
            APPL_ID,
            CUST_ID: parsedCustId
          });
        }

        workItem = await WF_WORK_ITEM.findOne({
          where: {
            ITEM_ID: application.id,
            CUST_ID: parsedCustId,
            REC_ST: 'Pending'
          },
          transaction
        });

        if (!workItem) {
          await transaction.rollback();
          return res.status(404).json({
            success: false,
            message: 'No work item found for this credit application',
            APPL_ID,
            CUST_ID: parsedCustId
          });
        }
      }

      if (!workItem || !application) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Work item or application not found',
          WORK_ITEM_ID: WORK_ITEM_ID ? parseInt(WORK_ITEM_ID) : null,
          CUST_ID: parsedCustId,
          APPL_ID
        });
      }

      // Update Credit Application
      await application.update({
        STATUS: 'Rejected',
        REC_ST: 'Inactive',
        REJECTED_BY: REJECTED_BY,
        REJECTED_DATE: new Date(),
        REJECTION_REASON: comments || null
      }, { transaction });

      // Update Workflow Item
      await workItem.update({
        REC_ST: 'Rejected',
        REJECTED_BY: REJECTED_BY,
        REJECTED_DATE: new Date(),
        WAIT_ST: 'Completed',
        COMMENTS: comments || null
      }, { transaction });

      // Complete the workflow item
      await WF_WORK_ITEMController.completeWorkItem(workItem.WORK_ITEM_ID, 'Rejected', REJECTED_BY);

      // Send notification
      try {
        await NotificationService.send({
          ROLE_ID: workItem.ORIGINATOR_USER_ROLE_ID,
          message: `Credit application for ${application.ACCT_NM || application.CUST_ID} was rejected`,
          WORK_ITEM_ID: workItem.WORK_ITEM_ID,
          CUST_ID: parsedCustId
        });
      } catch (notifyError) {
        console.warn('Notification failed:', notifyError.message);
      }

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: 'Credit application rejected successfully',
        application
      });

    } catch (error) {
      await transaction.rollback();
      console.error('Rejection error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error rejecting credit application',
        error: error.message,
      });
    }
  }

  // ==================== GET ALL WITH WORK ITEMS ====================
  static async getAllCreditApplicationsWithWorkItems(req, res) {
    try {
      const creditApplications = await CreditApplication.findAll({
        order: [['createdAt', 'DESC']],
        raw: true
      });

      // Get work items
      const workItems = await WF_WORK_ITEM.findAll({
        where: { ITEM_TYPE: 'CreditApplication' },
        attributes: ['WORK_ITEM_ID', 'ITEM_ID'],
        raw: true
      });

      const workItemMap = new Map(workItems.map(w => [w.ITEM_ID, w.WORK_ITEM_ID]));

      const enrichedApps = creditApplications.map(app => ({
        ...app,
        WORK_ITEM_ID: workItemMap.get(app.id) || null
      }));

      return res.status(200).json({
        success: true,
        data: enrichedApps,
        count: enrichedApps.length
      });
    } catch (error) {
      console.error('Error fetching credit applications with work items:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve credit applications',
        error: error.message
      });
    }
  }

  // ==================== GET BY APPL_ID ====================
  static async getCreditApplicationByApplId(req, res) {
    const { applId } = req.params;
    
    console.log('🔍 Searching for credit application with APPL_ID:', applId);
    
    try {
      const application = await CreditApplication.findOne({
        where: { APPL_ID: applId }
      });
      
      if (!application) {
        console.log('⚠️ No application found for APPL_ID:', applId);
        
        // Get recent applications for debugging
        const recentApps = await CreditApplication.findAll({
          order: [['createdAt', 'DESC']],
          limit: 5,
          attributes: ['APPL_ID', 'createdAt'],
          raw: true
        });
        
        return res.status(404).json({ 
          success: false,
          message: 'Credit application not found',
          suggestion: 'Check the application ID format (e.g., CRAPP/0098)',
          recentApplications: recentApps
        });
      }
      
      console.log('✅ Found application:', application.APPL_ID);
      
      return res.status(200).json({
        success: true,
        message: 'Credit application found',
        data: application
      });
      
    } catch (error) {
      console.error('❌ Error retrieving credit application:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving credit application',
        error: error.message
      });
    }
  }

  // ==================== GET BY ACCT_NO ====================
  static async getCreditApplicationByAcctNo(req, res) {
    const { acctNo } = req.params;
    
    try {
      const application = await CreditApplication.findOne({
        where: { ACCT_NO: acctNo }
      });
      
      if (!application) {
        return res.status(404).json({ 
          success: false,
          message: 'Credit application not found' 
        });
      }
      
      return res.status(200).json({
        success: true,
        data: application
      });
    } catch (error) {
      console.error('Error retrieving credit application by ACCT_NO:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving credit application',
        error: error.message
      });
    }
  }

  // ==================== SEARCH ====================
  static async searchCreditApplications(req, res) {
    const { applId, custId, status } = req.query;
    
    try {
      const where = {};
      
      if (applId) where.APPL_ID = applId;
      if (custId) where.CUST_ID = custId;
      if (status) where.STATUS = status;
      
      const applications = await CreditApplication.findAll({ where });
      
      return res.status(200).json({
        success: true,
        count: applications.length,
        data: applications
      });
      
    } catch (error) {
      console.error('Search error:', error);
      return res.status(500).json({
        success: false,
        message: 'Search failed',
        error: error.message
      });
    }
  }

  // ==================== UPDATE ====================
  static async updateCreditApplication(req, res) {
    const { applId } = req.params;
    
    try {
      const application = await CreditApplication.findOne({
        where: { APPL_ID: applId }
      });

      if (!application) {
        return res.status(404).json({ 
          success: false,
          message: 'Credit application not found' 
        });
      }

      await application.update(req.body);

      return res.status(200).json({
        success: true,
        message: 'Credit application updated successfully',
        data: application
      });
    } catch (error) {
      console.error('Error updating credit application:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating credit application',
        error: error.message
      });
    }
  }

  // ==================== DELETE ====================
  static async deleteCreditApplication(req, res) {
    const { applId } = req.params;
    
    try {
      const deleted = await CreditApplication.destroy({
        where: { APPL_ID: applId }
      });

      if (!deleted) {
        return res.status(404).json({ 
          success: false,
          message: 'Credit application not found' 
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Credit application deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting credit application:', error);
      return res.status(500).json({
        success: false,
        message: 'Error deleting credit application',
        error: error.message
      });
    }
  }

  // ==================== GET BY CUST_ID ====================
  static async getCreditApplicationByCustId(req, res) {
    const { custId } = req.params;

    try {
      const applications = await CreditApplication.findAll({
        where: { CUST_ID: custId },
        order: [['createdAt', 'DESC']]
      });

      if (!applications || applications.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No credit applications found for the given CUST_ID'
        });
      }

      return res.status(200).json({
        success: true,
        data: applications,
        count: applications.length
      });
    } catch (error) {
      console.error('Error retrieving credit applications by CUST_ID:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving credit applications',
        error: error.message
      });
    }
  }

  // ==================== GET BY ID (Raw) ====================
  static async getCreditApplicationByIdRaw(req, res) {
    const { id } = req.params;
    
    try {
      const application = await CreditApplication.findByPk(id);
      
      if (!application) {
        return res.status(404).json({ 
          success: false,
          message: 'Application not found' 
        });
      }

      return res.status(200).json({
        success: true,
        identifier: `${application.CUST_ID}-${application.ACCT_NO}`,
        data: application
      });
      
    } catch (error) {
      console.error('Error in getCreditApplicationByIdRaw:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving application',
        error: error.message
      });
    }
  }
}

export default CreditApplicationController;