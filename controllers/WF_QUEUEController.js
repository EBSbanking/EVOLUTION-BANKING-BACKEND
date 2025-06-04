import WF_QUEUE from '../models/WF_QUEUE.js';
import BusinessRole from '../models/BusinessRole.js'; // Import the BusinessRole model

class WFQueueController {
  // Create a new work queue item
  static async createQueueItem(req, res) {
    try {
      const {
        QUEUE_ID,
        BUS_PROC_ID,
        QUEUE_CD,
        QUEUE_DESC,
        QUEUE_TY,
        TARGET_DURATION_PD_CD,
        TARGET_DURATION_VALUE,
        MAX_DURATION_PD_CD,
        MAX_DURATION_VALUE,
        DEADLINE_PD_CD,
        DEADLINE_VALUE,
        DEADLINE_ALERT_RECIPIENT_ID,
        PRIORITY_LEVEL,
        REC_ST,
        VERSION_NO,
        ROW_TS,
        USER_ID,
        NOTIFY_ORIGINATOR_FG,
        ESCALATION_TIME_VALUE,
        ESCALATION_TIME_CD,
        ESCALATION_AUDIANCE_ID,
        PARTICIPANT_TYPE,
        ITEM_NOTIFY_REQ_FG,
        BU_PRIMARY_VISIBILITY,
        ROLE_ID, // Added ROLE_ID for validation
      } = req.body;

      // Validate if the ROLE_ID exists in the BusinessRole collection
      const roleExists = await BusinessRole.findOne({ ROLE_ID });
      if (!roleExists) {
        return res.status(400).json({
          message: `Invalid ROLE_ID: ${ROLE_ID}. The role does not exist.`,
        });
      }

      const newQueueItem = new WF_QUEUE({
        QUEUE_ID,
        BUS_PROC_ID,
        QUEUE_CD,
        QUEUE_DESC,
        QUEUE_TY,
        TARGET_DURATION_PD_CD,
        TARGET_DURATION_VALUE,
        MAX_DURATION_PD_CD,
        MAX_DURATION_VALUE,
        DEADLINE_PD_CD,
        DEADLINE_VALUE,
        DEADLINE_ALERT_RECIPIENT_ID,
        PRIORITY_LEVEL,
        REC_ST,
        VERSION_NO,
        ROW_TS,
        USER_ID,
        NOTIFY_ORIGINATOR_FG,
        ESCALATION_TIME_VALUE,
        ESCALATION_TIME_CD,
        ESCALATION_AUDIANCE_ID,
        PARTICIPANT_TYPE,
        ITEM_NOTIFY_REQ_FG,
        BU_PRIMARY_VISIBILITY,
      });

      await newQueueItem.save();

      res.status(201).json({
        message: 'Work queue item created successfully.',
        data: newQueueItem,
      });
    } catch (error) {
      console.error('Error creating work queue item:', error);
      res.status(500).json({ message: 'Error creating work queue item', error });
    }
  }

  // Get all work queue items
  static async getAllQueueItems(req, res) {
    try {
      const queueItems = await WF_QUEUE.find();
      res.status(200).json({
        message: 'Work queue items fetched successfully.',
        data: queueItems,
      });
    } catch (error) {
      console.error('Error fetching work queue items:', error);
      res.status(500).json({ message: 'Error fetching work queue items', error });
    }
  }

  // Get a single work queue item by ID
  static async getQueueItemById(req, res) {
    const { id } = req.params;

    try {
      const queueItem = await WF_QUEUE.findById(id);

      if (!queueItem) {
        return res.status(404).json({ message: 'Work queue item not found.' });
      }

      res.status(200).json({
        message: 'Work queue item fetched successfully.',
        data: queueItem,
      });
    } catch (error) {
      console.error('Error fetching work queue item by ID:', error);
      res.status(500).json({ message: 'Error fetching work queue item', error });
    }
  }

  // Update a work queue item
  static async updateQueueItem(req, res) {
    const { id } = req.params;
    const updates = req.body;

    try {
      // If ROLE_ID is being updated, validate it
      if (updates.ROLE_ID) {
        const roleExists = await BusinessRole.findOne({ ROLE_ID: updates.ROLE_ID });
        if (!roleExists) {
          return res.status(400).json({
            message: `Invalid ROLE_ID: ${updates.ROLE_ID}. The role does not exist.`,
          });
        }
      }

      const queueItem = await WF_QUEUE.findByIdAndUpdate(id, updates, { new: true });

      if (!queueItem) {
        return res.status(404).json({ message: 'Work queue item not found.' });
      }

      res.status(200).json({
        message: 'Work queue item updated successfully.',
        data: queueItem,
      });
    } catch (error) {
      console.error('Error updating work queue item:', error);
      res.status(500).json({ message: 'Error updating work queue item', error });
    }
  }

  // Delete a work queue item
  static async deleteQueueItem(req, res) {
    const { id } = req.params;

    try {
      const queueItem = await WF_QUEUE.findByIdAndDelete(id);

      if (!queueItem) {
        return res.status(404).json({ message: 'Work queue item not found.' });
      }

      res.status(200).json({
        message: 'Work queue item deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting work queue item:', error);
      res.status(500).json({ message: 'Error deleting work queue item', error });
    }
  }
}

export default WFQueueController;
