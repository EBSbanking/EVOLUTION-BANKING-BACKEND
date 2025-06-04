import WF_SUB_PROCESS_POLICY from '../models/WF_SUB_PROCESS_POLICY.js';

class WFSubProcessPolicyController {
  // Create a new sub-process policy
  static async createPolicy(req, res) {
    try {
      const {
        SUB_PROC_POLICY_ID,
        SUB_PROC_ID,
        BUS_PROC_POLICY_ID,
        SEQ_NO,
        REC_ST,
        VERSION_NO,
        USER_ID,
        CREATED_BY,
      } = req.body;

      const newPolicy = new WF_SUB_PROCESS_POLICY({
        SUB_PROC_POLICY_ID,
        SUB_PROC_ID,
        BUS_PROC_POLICY_ID,
        SEQ_NO,
        REC_ST,
        VERSION_NO,
        USER_ID,
        CREATED_BY,
      });

      await newPolicy.save();

      res.status(201).json({
        message: 'Sub-process policy created successfully.',
        data: newPolicy,
      });
    } catch (error) {
      console.error('Error creating sub-process policy:', error);
      res.status(500).json({ message: 'Error creating sub-process policy', error });
    }
  }

  // Get all sub-process policies
  static async getAllPolicies(req, res) {
    try {
      const policies = await WF_SUB_PROCESS_POLICY.find();
      res.status(200).json({
        message: 'Sub-process policies fetched successfully.',
        data: policies,
      });
    } catch (error) {
      console.error('Error fetching sub-process policies:', error);
      res.status(500).json({ message: 'Error fetching sub-process policies', error });
    }
  }

  // Get a sub-process policy by ID
  static async getPolicyById(req, res) {
    const { id } = req.params;

    try {
      const policy = await WF_SUB_PROCESS_POLICY.findById(id);

      if (!policy) {
        return res.status(404).json({ message: 'Sub-process policy not found.' });
      }

      res.status(200).json({
        message: 'Sub-process policy fetched successfully.',
        data: policy,
      });
    } catch (error) {
      console.error('Error fetching sub-process policy by ID:', error);
      res.status(500).json({ message: 'Error fetching sub-process policy', error });
    }
  }

  // Update a sub-process policy
  static async updatePolicy(req, res) {
    const { id } = req.params;
    const updates = req.body;

    try {
      const policy = await WF_SUB_PROCESS_POLICY.findByIdAndUpdate(id, updates, { new: true });

      if (!policy) {
        return res.status(404).json({ message: 'Sub-process policy not found.' });
      }

      res.status(200).json({
        message: 'Sub-process policy updated successfully.',
        data: policy,
      });
    } catch (error) {
      console.error('Error updating sub-process policy:', error);
      res.status(500).json({ message: 'Error updating sub-process policy', error });
    }
  }

  // Delete a sub-process policy
  static async deletePolicy(req, res) {
    const { id } = req.params;

    try {
      const policy = await WF_SUB_PROCESS_POLICY.findByIdAndDelete(id);

      if (!policy) {
        return res.status(404).json({ message: 'Sub-process policy not found.' });
      }

      res.status(200).json({
        message: 'Sub-process policy deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting sub-process policy:', error);
      res.status(500).json({ message: 'Error deleting sub-process policy', error });
    }
  }
}

export default WFSubProcessPolicyController;
