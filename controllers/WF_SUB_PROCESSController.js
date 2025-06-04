import WF_SUB_PROCESS from '../models/WF_SUB_PROCESS.js';

class WF_SUB_PROCESSController {
  // Helper function to generate a 4-digit ID
  static generate4DigitId() {
    return Math.floor(1000 + Math.random() * 9000); // Generates a random 4-digit number
  }

  // Helper function to generate a 7-digit ID
  static generate7DigitId() {
    return Math.floor(1000000 + Math.random() * 9000000); // Generates a random 7-digit number
  }

  // Create a new subprocess
  static async createSubProcess(req, res) {
    try {
      const {
        PATH_NO,
        SUB_PROC_TY,
        REC_ST,
        VERSION_NO,
        USER_ID,
        CREATED_BY,
        SUB_PROC_NM,
      } = req.body;

      // Generate unique 4-digit IDs for SUB_PROC_ID, BUS_PROC_ID, and SRC_QUEUE_ID
      const SUB_PROC_ID = WF_SUB_PROCESSController.generate4DigitId();
      const BUS_PROC_ID = WF_SUB_PROCESSController.generate4DigitId();
      const SRC_QUEUE_ID = WF_SUB_PROCESSController.generate4DigitId();

      // Generate a unique 7-digit EVENT_ID
      let EVENT_ID = WF_SUB_PROCESSController.generate7DigitId();
      let existingEvent = await WF_SUB_PROCESS.findOne({ EVENT_ID });

      while (existingEvent) {
        // Regenerate EVENT_ID if it already exists
        EVENT_ID = WF_SUB_PROCESSController.generate7DigitId();
        existingEvent = await WF_SUB_PROCESS.findOne({ EVENT_ID });
      }

      // Create the new subprocess
      const newSubProcess = new WF_SUB_PROCESS({
        SUB_PROC_ID,
        BUS_PROC_ID,
        SRC_QUEUE_ID,
        EVENT_ID,
        PATH_NO,
        SUB_PROC_TY,
        REC_ST,
        VERSION_NO,
        USER_ID,
        CREATED_BY,
        SUB_PROC_NM,
      });

      await newSubProcess.save();

      res.status(201).json({
        message: 'Subprocess created successfully.',
        data: newSubProcess,
      });
    } catch (error) {
      console.error('Error creating subprocess:', error.message);
      res.status(500).json({ message: 'Error creating subprocess', error });
    }
  }


  // Get all subprocesses
  static async getAllSubProcesses(req, res) {
    try {
      const subProcesses = await WF_SUB_PROCESS.find();
      res.status(200).json({
        message: 'Subprocesses fetched successfully.',
        data: subProcesses,
      });
    } catch (error) {
      console.error('Error fetching subprocesses:', error);
      res.status(500).json({ message: 'Error fetching subprocesses', error });
    }
  }

  // Get a subprocess by ID
  static async getSubProcessById(req, res) {
    const { id } = req.params;

    try {
      const subProcess = await WF_SUB_PROCESS.findById(id);

      if (!subProcess) {
        return res.status(404).json({ message: 'Subprocess not found.' });
      }

      res.status(200).json({
        message: 'Subprocess fetched successfully.',
        data: subProcess,
      });
    } catch (error) {
      console.error('Error fetching subprocess by ID:', error);
      res.status(500).json({ message: 'Error fetching subprocess', error });
    }
  }

  // Update a subprocess
  static async updateSubProcess(req, res) {
    const { id } = req.params;
    const updates = req.body;

    try {
      const subProcess = await WF_SUB_PROCESS.findByIdAndUpdate(id, updates, { new: true });

      if (!subProcess) {
        return res.status(404).json({ message: 'Subprocess not found.' });
      }

      res.status(200).json({
        message: 'Subprocess updated successfully.',
        data: subProcess,
      });
    } catch (error) {
      console.error('Error updating subprocess:', error);
      res.status(500).json({ message: 'Error updating subprocess', error });
    }
  }

  // Delete a subprocess
  static async deleteSubProcess(req, res) {
    const { id } = req.params;

    try {
      const subProcess = await WF_SUB_PROCESS.findByIdAndDelete(id);

      if (!subProcess) {
        return res.status(404).json({ message: 'Subprocess not found.' });
      }

      res.status(200).json({
        message: 'Subprocess deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting subprocess:', error);
      res.status(500).json({ message: 'Error deleting subprocess', error });
    }
  }
}

export default WF_SUB_PROCESSController;
