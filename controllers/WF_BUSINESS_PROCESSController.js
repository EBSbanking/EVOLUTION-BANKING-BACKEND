import WF_BUSINESS_PROCESS from '../models/WF_BUSINESS_PROCESS.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import Transaction from '../models/Transaction.js';
import UserRole from '../models/UserRole.js';
import DepositTransaction from '../models/DepositTransaction.js';

class WF_BUSINESS_PROCESSController {
  // Create a new workflow process
  static async createWorkflow(req, res) {
    try {
      const {
        BUS_PROC_ID,
        BUS_PROC_CD,
        BUS_PROC_DESC,
        WF_APPL_CAT_CD,
        REC_ST,
        VERSION,
        USER_ID,
        CREATED_BY,
        GRAPHICAL_DATA,
        WF_EXPIRY_OPT,
        WF_AUTO_EXP_FREQ_CD,
        WF_AUTO_EXP_FREQ_VAL,
      } = req.body;

      const newWorkflow = new WF_BUSINESS_PROCESS({
        BUS_PROC_ID,
        BUS_PROC_CD,
        BUS_PROC_DESC,
        WF_APPL_CAT_CD,
        REC_ST,
        VERSION,
        USER_ID,
        CREATED_BY,
        GRAPHICAL_DATA,
        WF_EXPIRY_OPT,
        WF_AUTO_EXP_FREQ_CD,
        WF_AUTO_EXP_FREQ_VAL,
        // AUDIT FIELDS
        AUDIT_ACTION: 'CREATE',
        AUDIT_TS: Date.now(),
        AUDIT_USER: USER_ID,
      });

      await newWorkflow.save();

      res.status(201).json({
        message: 'Workflow process created successfully.',
        data: newWorkflow,
      });
    } catch (error) {
      console.error('Error creating workflow:', error);
      res.status(500).json({ message: 'Error creating workflow', error });
    }
  }

  // Apply the workflow to an operation (e.g., DepositAccountApplication, Transaction, etc.)
  static async applyWorkflow(req, res) {
    const { operationType, payload, USER_ID } = req.body; // operationType can be 'DepositAccountApplication', 'Transaction', etc.

    try {
      // Fetch workflow for the given operation type
      const workflow = await WF_BUSINESS_PROCESS.findOne({
        WF_APPL_CAT_CD: operationType,
        REC_ST: 'Active',
      });

      if (!workflow) {
        return res.status(404).json({ message: 'No active workflow found for this operation.' });
      }

      // Log workflow initiation
      console.log(`Workflow initiated for ${operationType}:`, workflow);

      let result;

      // Handle specific operation types
      switch (operationType) {
        case 'DepositAccountApplication':
          result = await DepositAccountApplication.create(payload); // Process DepositAccountApplication
          break;
        case 'Transaction':
          result = await Transaction.create(payload); // Process Transaction
          break;
        case 'UserRole':
          result = await UserRole.create(payload); // Process UserRole
          break;
        case 'DepositTransaction':
          result = await DepositTransaction.create(payload); // Process DepositTransaction
          break;
        default:
          return res.status(400).json({ message: 'Invalid operation type.' });
      }

      // Log audit action for workflow application
      await WF_BUSINESS_PROCESS.findByIdAndUpdate(workflow._id, {
        AUDIT_ACTION: 'APPLY',
        AUDIT_TS: Date.now(),
        AUDIT_USER: USER_ID,
      });

      // Workflow success response
      res.status(200).json({
        message: `${operationType} processed successfully through workflow.`,
        workflow,
        result,
      });
    } catch (error) {
      console.error('Error processing workflow:', error);
      res.status(500).json({ message: 'Error processing workflow', error });
    }
  }

  // Get all workflows
  static async getAllWorkflows(req, res) {
    try {
      const workflows = await WF_BUSINESS_PROCESS.find();
      res.status(200).json({
        message: 'Workflows fetched successfully.',
        data: workflows,
      });
    } catch (error) {
      console.error('Error fetching workflows:', error);
      res.status(500).json({ message: 'Error fetching workflows', error });
    }
  }

  // Get workflow by ID
  static async getWorkflowById(req, res) {
    const { id } = req.params;
    try {
      const workflow = await WF_BUSINESS_PROCESS.findById(id);

      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found.' });
      }

      res.status(200).json({
        message: 'Workflow fetched successfully.',
        data: workflow,
      });
    } catch (error) {
      console.error('Error fetching workflow by ID:', error);
      res.status(500).json({ message: 'Error fetching workflow', error });
    }
  }

 // Update a workflow
static async updateWorkflow(req, res) {
  const { BU_PROC_ID } = req.body; // Assuming BU_PROC_ID is provided for updating
  const updates = req.body;
  const { USER_ID } = req.body; // Assuming USER_ID is passed for auditing

  try {
    // Find the workflow based on BU_PROC_ID (or any other criteria you prefer)
    const workflow = await WF_BUSINESS_PROCESS.findOneAndUpdate(
      { BU_PROC_ID },  // Search based on BU_PROC_ID
      updates,         // The updates to apply
      { new: true }    // Return the updated document
    );

    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found.' });
    }

    // Log audit action for workflow update
    await WF_BUSINESS_PROCESS.findByIdAndUpdate(workflow._id, {
      AUDIT_ACTION: 'UPDATE',
      AUDIT_TS: Date.now(),
      AUDIT_USER: USER_ID,
    });

    res.status(200).json({
      message: 'Workflow updated successfully.',
      data: workflow,
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ message: 'Error updating workflow', error });
  }
}

  // Delete a workflow
  static async deleteWorkflow(req, res) {
    const { id } = req.params;
    const { USER_ID } = req.body; // Assuming USER_ID is passed for auditing

    try {
      const workflow = await WF_BUSINESS_PROCESS.findByIdAndDelete(id);

      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found.' });
      }

      // Log audit action for workflow deletion
      await WF_BUSINESS_PROCESS.findByIdAndUpdate(workflow._id, {
        AUDIT_ACTION: 'DELETE',
        AUDIT_TS: Date.now(),
        AUDIT_USER: USER_ID,
      });

      res.status(200).json({
        message: 'Workflow deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting workflow:', error);
      res.status(500).json({ message: 'Error deleting workflow', error });
    }
  }
}

export default WF_BUSINESS_PROCESSController;
