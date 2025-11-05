import WF_BusinessRoleQueue from '../models/WF_BusinessRoleQueue.js';

class WF_BusinessRoleQueueController {
  // Helper function to generate a 4-digit ID
  static generate4DigitId() {
    return Math.floor(1000 + Math.random() * 9000); // Generates a random 4-digit number
  }

  // Create a new business role queue
  static async createBusinessRoleQueue(req, res) {
    try {
      const {
        ROLE_ID,
        REC_ST,
        VERSION,
        ROW_TS,
        USER_ID,
        CREATE_DT,
        CREATED_BY,
        SYS_CREATE_TS,
        ITEM_ACCESS_RIGHT,
      } = req.body;

      // Generate unique 4-digit IDs
      let BUS_ROLE_QUEUE_ID = WF_BusinessRoleQueueController.generate4DigitId();
      let QUEUE_ID = WF_BusinessRoleQueueController.generate4DigitId();

      // Ensure the generated IDs are unique by checking the database
      let existingQueue = await WF_BusinessRoleQueue.findOne({
        $or: [{ BUS_ROLE_QUEUE_ID }, { QUEUE_ID }],
      });

      while (existingQueue) {
        // Regenerate IDs if they already exist
        BUS_ROLE_QUEUE_ID = WF_BusinessRoleQueueController.generate4DigitId();
        QUEUE_ID = WF_BusinessRoleQueueController.generate4DigitId();
        existingQueue = await WF_BusinessRoleQueue.findOne({
          $or: [{ BUS_ROLE_QUEUE_ID }, { QUEUE_ID }],
        });
      }

      // Create the new business role queue
      const newBusinessRoleQueue = new WF_BusinessRoleQueue({
        BUS_ROLE_QUEUE_ID,
        ROLE_ID,
        QUEUE_ID,
        REC_ST,
        VERSION,
        ROW_TS,
        USER_ID,
        CREATE_DT,
        CREATED_BY,
        SYS_CREATE_TS,
        ITEM_ACCESS_RIGHT,
      });

      await newBusinessRoleQueue.save();

      res.status(201).json({
        message: 'Business role queue created successfully.',
        data: newBusinessRoleQueue,
      });
    } catch (error) {
      console.error('Error creating business role queue:', error);
      res.status(500).json({ message: 'Error creating business role queue', error });
    }
  }

  // Other methods (getAllBusinessRoleQueues, getBusinessRoleQueueById, etc.) remain unchanged


  // Get all business role queues
  static async getAllBusinessRoleQueues(req, res) {
    try {
      const businessRoleQueues = await WF_BusinessRoleQueue.find();
      res.status(200).json({
        message: 'Business role queues fetched successfully.',
        data: businessRoleQueues,
      });
    } catch (error) {
      console.error('Error fetching business role queues:', error);
      res.status(500).json({ message: 'Error fetching business role queues', error });
    }
  }

  // Get a business role queue by ID
  static async getBusinessRoleQueueById(req, res) {
    const { id } = req.params;

    try {
      const businessRoleQueue = await WF_BusinessRoleQueue.findById(id);

      if (!businessRoleQueue) {
        return res.status(404).json({ message: 'Business role queue not found.' });
      }

      res.status(200).json({
        message: 'Business role queue fetched successfully.',
        data: businessRoleQueue,
      });
    } catch (error) {
      console.error('Error fetching business role queue by ID:', error);
      res.status(500).json({ message: 'Error fetching business role queue', error });
    }
  }

  // Update a business role queue
  static async updateBusinessRoleQueue(req, res) {
    const { id } = req.params;
    const updates = req.body;

    try {
      const businessRoleQueue = await WF_BusinessRoleQueue.findByIdAndUpdate(id, updates, { new: true });

      if (!businessRoleQueue) {
        return res.status(404).json({ message: 'Business role queue not found.' });
      }

      res.status(200).json({
        message: 'Business role queue updated successfully.',
        data: businessRoleQueue,
      });
    } catch (error) {
      console.error('Error updating business role queue:', error);
      res.status(500).json({ message: 'Error updating business role queue', error });
    }
  }

  // Delete a business role queue
  static async deleteBusinessRoleQueue(req, res) {
    const { id } = req.params;

    try {
      const businessRoleQueue = await WF_BusinessRoleQueue.findByIdAndDelete(id);

      if (!businessRoleQueue) {
        return res.status(404).json({ message: 'Business role queue not found.' });
      }

      res.status(200).json({
        message: 'Business role queue deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting business role queue:', error);
      res.status(500).json({ message: 'Error deleting business role queue', error });
    }
  }
}

export default WF_BusinessRoleQueueController;
