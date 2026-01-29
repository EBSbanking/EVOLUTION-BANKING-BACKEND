// models/Event.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Event extends Model {
  // Static method to find events by work item
  static async findByWorkItem(workItemId, options = {}) {
    const where = {
      WORK_ITEM_ID: workItemId
    };
    
    if (options.queueId) where.QUEUE_ID = options.queueId;
    if (options.eventId) where.EVENT_ID = options.eventId;
    
    return await this.findAll({
      where,
      order: [['EVENT_ID', 'ASC']]
    });
  }

  // Static method to find events by queue
  static async findByQueue(queueId, options = {}) {
    const where = {
      QUEUE_ID: queueId
    };
    
    if (options.workItemId) where.WORK_ITEM_ID = options.workItemId;
    if (options.eventId) where.EVENT_ID = options.eventId;
    
    return await this.findAll({
      where,
      order: [['EVENT_ID', 'ASC']]
    });
  }

  // Static method to get latest event for work item
  static async getLatestForWorkItem(workItemId) {
    return await this.findOne({
      where: {
        WORK_ITEM_ID: workItemId
      },
      order: [['EVENT_ID', 'DESC']]
    });
  }

  // Static method to count events by work item
  static async countByWorkItem(workItemId) {
    return await this.count({
      where: {
        WORK_ITEM_ID: workItemId
      }
    });
  }

  // Static method to count events by queue
  static async countByQueue(queueId) {
    return await this.count({
      where: {
        QUEUE_ID: queueId
      }
    });
  }

  // Static method to get event sequence for work item
  static async getEventSequence(workItemId) {
    return await this.findAll({
      where: {
        WORK_ITEM_ID: workItemId
      },
      attributes: ['EVENT_ID', 'QUEUE_ID', 'EVENT_TYPE', 'EVENT_TIMESTAMP', 'STATUS'],
      order: [['EVENT_ID', 'ASC']]
    });
  }

  // Static method to find events within date range
  static async findByDateRange(startDate, endDate, options = {}) {
    const where = {
      EVENT_TIMESTAMP: {
        [DataTypes.Op.between]: [startDate, endDate]
      }
    };
    
    if (options.workItemId) where.WORK_ITEM_ID = options.workItemId;
    if (options.queueId) where.QUEUE_ID = options.queueId;
    if (options.eventType) where.EVENT_TYPE = options.eventType;
    
    return await this.findAll({
      where,
      order: [['EVENT_TIMESTAMP', 'ASC']]
    });
  }

  // Static method to bulk create events
  static async bulkCreateEvents(events) {
    return await this.bulkCreate(events, {
      validate: true,
      individualHooks: false
    });
  }

  // Static method to get event statistics
  static async getEventStatistics(options = {}) {
    const where = {};
    
    if (options.queueId) where.QUEUE_ID = options.queueId;
    if (options.startDate && options.endDate) {
      where.EVENT_TIMESTAMP = {
        [DataTypes.Op.between]: [options.startDate, options.endDate]
      };
    }
    
    return await this.findAll({
      where,
      attributes: [
        'EVENT_TYPE',
        [sequelize.fn('COUNT', sequelize.col('EVENT_ID')), 'count'],
        [sequelize.fn('MIN', sequelize.col('EVENT_TIMESTAMP')), 'first_event'],
        [sequelize.fn('MAX', sequelize.col('EVENT_TIMESTAMP')), 'last_event']
      ],
      group: ['EVENT_TYPE'],
      order: [[sequelize.fn('COUNT', sequelize.col('EVENT_ID')), 'DESC']]
    });
  }

  // Instance method to get next event in sequence
  async getNextEvent() {
    return await Event.findOne({
      where: {
        WORK_ITEM_ID: this.WORK_ITEM_ID,
        EVENT_ID: {
          [DataTypes.Op.gt]: this.EVENT_ID
        }
      },
      order: [['EVENT_ID', 'ASC']]
    });
  }

  // Instance method to get previous event in sequence
  async getPreviousEvent() {
    return await Event.findOne({
      where: {
        WORK_ITEM_ID: this.WORK_ITEM_ID,
        EVENT_ID: {
          [DataTypes.Op.lt]: this.EVENT_ID
        }
      },
      order: [['EVENT_ID', 'DESC']]
    });
  }

  // Instance method to check if this is the first event for work item
  async isFirstEvent() {
    const firstEvent = await Event.findOne({
      where: {
        WORK_ITEM_ID: this.WORK_ITEM_ID
      },
      order: [['EVENT_ID', 'ASC']]
    });
    
    return firstEvent ? firstEvent.EVENT_ID === this.EVENT_ID : false;
  }

  // Instance method to check if this is the last event for work item
  async isLastEvent() {
    const lastEvent = await Event.findOne({
      where: {
        WORK_ITEM_ID: this.WORK_ITEM_ID
      },
      order: [['EVENT_ID', 'DESC']]
    });
    
    return lastEvent ? lastEvent.EVENT_ID === this.EVENT_ID : false;
  }
}

Event.init({
  WORK_ITEM_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Reference to the work item this event belongs to'
  },
  EVENT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Unique event identifier within the work item'
  },
  QUEUE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Reference to the queue this event is associated with'
  },
  EVENT_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'GENERIC',
    comment: 'Type of event (e.g., CREATE, UPDATE, COMPLETE, ERROR)'
  },
  EVENT_DESCRIPTION: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Detailed description of the event'
  },
  EVENT_TIMESTAMP: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the event occurred'
  },
  STATUS: {
    type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'PENDING',
    comment: 'Current status of the event'
  },
  PRIORITY: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
    validate: {
      min: 1,
      max: 10
    },
    comment: 'Event priority (1=highest, 10=lowest)'
  },
  PROCESSED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'System or user that processed the event'
  },
  ERROR_CODE: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Error code if event failed'
  },
  ERROR_MESSAGE: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Detailed error message'
  },
  METADATA: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional event metadata in JSON format'
  },
  RETRY_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of times event has been retried'
  },
  MAX_RETRIES: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    comment: 'Maximum number of retry attempts'
  },
  NEXT_RETRY_AT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When to retry the event if it failed'
  },
  DURATION_MS: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Event processing duration in milliseconds'
  },
  CREATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'SYSTEM',
    comment: 'Who or what created the event'
  },
  UPDATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Who or what last updated the event'
  }
}, {
  sequelize,
  modelName: 'Event',
  tableName: 'events',
  timestamps: true, // Adds createdAt and updatedAt
  underscored: false,
  hooks: {
    beforeSave: async (event, options) => {
      // Auto-increment retry count if status is changing to FAILED
      if (event.changed('STATUS') && event.STATUS === 'FAILED') {
        event.RETRY_COUNT += 1;
        
        // Calculate next retry time (exponential backoff)
        if (event.RETRY_COUNT <= event.MAX_RETRIES) {
          const backoffMs = Math.pow(2, event.RETRY_COUNT) * 1000; // 2^retryCount seconds
          const nextRetry = new Date(Date.now() + backoffMs);
          event.NEXT_RETRY_AT = nextRetry;
        }
      }
      
      // Reset retry count if status changes to COMPLETED
      if (event.changed('STATUS') && event.STATUS === 'COMPLETED') {
        event.RETRY_COUNT = 0;
        event.NEXT_RETRY_AT = null;
      }
    }
  },
  indexes: [
    {
      name: 'idx_events_work_item_event',
      fields: ['WORK_ITEM_ID', 'EVENT_ID'],
      unique: true
    },
    {
      name: 'idx_events_queue',
      fields: ['QUEUE_ID']
    },
    {
      name: 'idx_events_timestamp',
      fields: ['EVENT_TIMESTAMP']
    },
    {
      name: 'idx_events_status',
      fields: ['STATUS']
    },
    {
      name: 'idx_events_type',
      fields: ['EVENT_TYPE']
    },
    {
      name: 'idx_events_next_retry',
      fields: ['NEXT_RETRY_AT']
    },
    {
      name: 'idx_events_work_item_status',
      fields: ['WORK_ITEM_ID', 'STATUS']
    },
    {
      name: 'idx_events_composite',
      fields: ['QUEUE_ID', 'STATUS', 'EVENT_TIMESTAMP']
    }
  ]
});

export default Event;