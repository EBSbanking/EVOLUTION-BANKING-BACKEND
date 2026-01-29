// models/CustWorkflowRouting.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class CustWorkflowRouting extends Model {
  // Static method: Find active workflow routings
  static async findActive() {
    return this.findAll({
      where: { rec_st: 'A' },
      order: [['workflow_id', 'ASC'], ['activity_id', 'ASC'], ['path_no', 'ASC']]
    });
  }

  // Static method: Find by workflow ID
  static async findByWorkflowId(workflowId) {
    return this.findAll({
      where: { workflow_id: workflowId, rec_st: 'A' },
      order: [['activity_id', 'ASC'], ['path_no', 'ASC']]
    });
  }

  // Static method: Find by workflow and activity
  static async findByWorkflowAndActivity(workflowId, activityId) {
    return this.findAll({
      where: { 
        workflow_id: workflowId, 
        activity_id: activityId,
        rec_st: 'A' 
      },
      order: [['path_no', 'ASC']]
    });
  }

  // Static method: Get next activities for current activity
  static async getNextActivities(workflowId, activityId) {
    return this.findAll({
      where: { 
        workflow_id: workflowId, 
        activity_id: activityId,
        rec_st: 'A' 
      },
      attributes: ['next_activity_id', 'action', 'routing_cd', 'routing_desc'],
      order: [['path_no', 'ASC']]
    });
  }

  // Instance method: Check if routing is active
  isActive() {
    return this.rec_st === 'A';
  }

  // Instance method: Deactivate routing
  async deactivate() {
    this.rec_st = 'I';
    this.row_ts = new Date();
    return await this.save();
  }

  // Instance method: Get routing summary
  getRoutingSummary() {
    return {
      wfRoutingId: this.wfRoutingId,
      workflowId: this.workflow_id,
      activityId: this.activity_id,
      pathNo: this.path_no,
      nextActivityId: this.next_activity_id,
      status: this.rec_st,
      version: this.version_no,
      action: this.action,
      routingCode: this.routing_cd,
      routingDescription: this.routing_desc,
      createdBy: this.created_by,
      createDate: this.create_dt,
      lastUpdated: this.row_ts
    };
  }

  // Virtual getter: Full routing path description
  get fullRoutingPath() {
    return `Workflow ${this.workflow_id}: Activity ${this.activity_id} -> Activity ${this.next_activity_id}`;
  }
}

CustWorkflowRouting.init({
  // Primary key - added since Sequelize needs one
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  userId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'User ID associated with the workflow routing'
  },
  
  wfRoutingId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Workflow routing identifier'
  },
  
  workflow_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Workflow identifier'
  },
  
  activity_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Current activity identifier'
  },
  
  path_no: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Path number for branching'
  },
  
  next_activity_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Next activity identifier'
  },
  
  rec_st: {
    type: DataTypes.STRING(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I']] // A=Active, I=Inactive
    },
    comment: 'Record status'
  },
  
  version_no: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version number'
  },
  
  row_ts: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Row timestamp (last update)'
  },
  
  create_dt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Create date'
  },
  
  sys_create_ts: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'System create timestamp'
  },
  
  created_by: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'Created by user'
  },
  
  action: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Action associated with routing'
  },
  
  routing_cd: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Routing code'
  },
  
  routing_desc: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Routing description'
  },
  
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'CustWorkflowRouting',
  tableName: 'cust_workflow_routing',
  timestamps: true,
  hooks: {
    beforeCreate: (routing) => {
      // Ensure uppercase for record status
      if (routing.rec_st) {
        routing.rec_st = routing.rec_st.toUpperCase();
      }
      
      // Set timestamps
      const now = new Date();
      routing.create_dt = routing.create_dt || now;
      routing.sys_create_ts = routing.sys_create_ts || now;
      routing.row_ts = routing.row_ts || now;
    },
    
    beforeUpdate: (routing) => {
      // Update row timestamp on every update
      routing.row_ts = new Date();
      
      // Ensure uppercase for record status
      if (routing.changed('rec_st') && routing.rec_st) {
        routing.rec_st = routing.rec_st.toUpperCase();
      }
      
      // Increment version number on update
      if (routing.changed() && !routing.changed('version_no')) {
        routing.version_no = (routing.version_no || 0) + 1;
      }
    }
  },
  indexes: [
    // Primary indexes
    { fields: ['wfRoutingId'], unique: true },
    
    // Search indexes
    { fields: ['workflow_id'] },
    { fields: ['activity_id'] },
    { fields: ['next_activity_id'] },
    { fields: ['userId'] },
    { fields: ['rec_st'] },
    
    // Composite indexes for common queries
    { fields: ['workflow_id', 'activity_id'] },
    { fields: ['workflow_id', 'activity_id', 'rec_st'] },
    { fields: ['workflow_id', 'activity_id', 'next_activity_id'] },
    { fields: ['workflow_id', 'rec_st'] },
    { fields: ['userId', 'rec_st'] }
  ],
  scopes: {
    active: {
      where: { rec_st: 'A' }
    },
    inactive: {
      where: { rec_st: 'I' }
    },
    byWorkflow: (workflowId) => ({
      where: { workflow_id: workflowId }
    }),
    byActivity: (activityId) => ({
      where: { activity_id: activityId }
    }),
    byWorkflowAndActivity: (workflowId, activityId) => ({
      where: { 
        workflow_id: workflowId,
        activity_id: activityId
      }
    }),
    byUser: (userId) => ({
      where: { userId }
    }),
    recent: {
      order: [['row_ts', 'DESC']],
      limit: 100
    }
  }
});

export default CustWorkflowRouting;