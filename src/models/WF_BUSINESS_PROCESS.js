// models/WF_BUSINESS_PROCESS.js
import { DataTypes } from 'sequelize';

/**
 * MySQL/Sequelize WF_BUSINESS_PROCESS Model
 * Workflow Business Process Management
 */
export default function createWfBusinessProcessModel(sequelize) {
  const WF_BUSINESS_PROCESS = sequelize.define('WF_BUSINESS_PROCESS', {
    // Primary identifier
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Primary key'
    },
    
    // Business Process ID (unique business identifier)
    BUS_PROC_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      comment: 'Business Process Identifier',
      validate: {
        notNull: {
          msg: 'Business Process ID is required'
        },
        isInt: {
          msg: 'Business Process ID must be an integer'
        }
      }
    },
    
    // Business Process Code
    BUS_PROC_CD: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Business Process Code',
      validate: {
        notNull: {
          msg: 'Business Process Code is required'
        },
        notEmpty: {
          msg: 'Business Process Code cannot be empty'
        },
        len: {
          args: [1, 50],
          msg: 'Business Process Code must be between 1 and 50 characters'
        }
      }
    },
    
    // Business Process Description
    BUS_PROC_DESC: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Business Process Description',
      validate: {
        notNull: {
          msg: 'Business Process Description is required'
        },
        notEmpty: {
          msg: 'Business Process Description cannot be empty'
        }
      }
    },
    
    // Workflow Application Category Code
    WF_APPL_CAT_CD: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Workflow Application Category Code',
      validate: {
        notNull: {
          msg: 'Workflow Application Category Code is required'
        },
        notEmpty: {
          msg: 'Workflow Application Category Code cannot be empty'
        }
      }
    },
    
    // Record Status
    REC_ST: {
      type: DataTypes.ENUM('Active', 'Inactive', 'Suspended', 'Archived', 'Draft'),
      allowNull: false,
      defaultValue: 'Active',
      comment: 'Record Status',
      validate: {
        notNull: {
          msg: 'Record Status is required'
        },
        isIn: {
          args: [['Active', 'Inactive', 'Suspended', 'Archived', 'Draft']],
          msg: 'Invalid Record Status'
        }
      }
    },
    
    // Version
    VERSION: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '1.0',
      comment: 'Process Version',
      validate: {
        notNull: {
          msg: 'Version is required'
        },
        notEmpty: {
          msg: 'Version cannot be empty'
        }
      }
    },
    
    // Row Timestamp
    ROW_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Row Timestamp'
    },
    
    // User ID
    USER_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'User ID associated with the process',
      validate: {
        notNull: {
          msg: 'User ID is required'
        },
        notEmpty: {
          msg: 'User ID cannot be empty'
        }
      }
    },
    
    // Created By
    CREATED_BY: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'User who created the process record',
      validate: {
        notNull: {
          msg: 'Created By is required'
        },
        notEmpty: {
          msg: 'Created By cannot be empty'
        }
      }
    },
    
    // System Create Timestamp
    SYS_CREATE_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'System Created Timestamp'
    },
    
    // Graphical Data (could be JSON, BLOB, or text)
    GRAPHICAL_DATA: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      comment: 'Graphical representation data (JSON, XML, etc.)'
    },
    
    // Workflow Expiry Option
    WF_EXPIRY_OPT: {
      type: DataTypes.ENUM('NONE', 'DATE_BASED', 'DURATION_BASED', 'EVENT_BASED'),
      allowNull: true,
      defaultValue: null,
      comment: 'Workflow Expiry Option'
    },
    
    // Workflow Auto Expiry Frequency Code
    WF_AUTO_EXP_FREQ_CD: {
      type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'),
      allowNull: true,
      defaultValue: null,
      comment: 'Auto Expiry Frequency Code'
    },
    
    // Workflow Auto Expiry Frequency Value
    WF_AUTO_EXP_FREQ_VAL: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: null,
      comment: 'Auto Expiry Frequency Value (e.g., number of days)'
    },
    
    // Additional metadata
    IS_DEFAULT_PROCESS: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Is this the default process for the category?'
    },
    
    PRIORITY_LEVEL: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
      comment: 'Process priority level (1=lowest, 5=highest)',
      validate: {
        min: {
          args: [1],
          msg: 'Priority level must be at least 1'
        },
        max: {
          args: [5],
          msg: 'Priority level must be at most 5'
        }
      }
    },
    
    MAX_PROCESSING_TIME: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum processing time in hours'
    },
    
    // Audit Fields
    AUDIT_ACTION: {
      type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'DEACTIVATE'),
      allowNull: true,
      comment: 'Audit action performed'
    },
    
    AUDIT_TS: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Audit timestamp'
    },
    
    AUDIT_USER: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'User who performed the audit action'
    },
    
    // Additional tracking fields
    LAST_MODIFIED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'User who last modified the record'
    },
    
    LAST_MODIFIED_TS: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last modification timestamp'
    },
    
    APPROVAL_REQUIRED: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Does this process require approval?'
    },
    
    MIN_APPROVALS_REQUIRED: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
      comment: 'Minimum number of approvals required'
    },
    
    ESCALATION_ENABLED: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Is escalation enabled for this process?'
    },
    
    ESCALATION_TIME: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Escalation time in hours'
    },
    
    // Categorization
    PROCESS_CATEGORY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Process category for grouping'
    },
    
    PROCESS_SUBCATEGORY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Process subcategory'
    },
    
    // Integration fields
    EXTERNAL_SYSTEM_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'External system identifier'
    },
    
    API_ENDPOINT: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'API endpoint for integration'
    },
    
    // Version control
    PARENT_PROC_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Parent process ID for versioning'
    },
    
    IS_LATEST_VERSION: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Is this the latest version of the process?'
    },
    
    VERSION_NOTES: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Version release notes'
    }

  }, {
    tableName: 'wf_business_process',
    timestamps: true,
    createdAt: 'SYS_CREATE_TS',
    updatedAt: 'LAST_MODIFIED_TS',
    underscored: false,
    
    // Hooks
    hooks: {
      beforeCreate: async (process) => {
        // Auto-generate BUS_PROC_ID if not provided
        if (!process.BUS_PROC_ID) {
          const maxProc = await WF_BUSINESS_PROCESS.max('BUS_PROC_ID');
          process.BUS_PROC_ID = (maxProc || 0) + 1;
        }
        
        // Set audit fields on creation
        process.AUDIT_ACTION = 'CREATE';
        process.AUDIT_TS = new Date();
        process.AUDIT_USER = process.CREATED_BY;
        
        // Set last modified fields
        process.LAST_MODIFIED_BY = process.CREATED_BY;
        process.LAST_MODIFIED_TS = new Date();
      },
      
      beforeUpdate: async (process) => {
        // Set audit fields on update
        process.AUDIT_ACTION = 'UPDATE';
        process.AUDIT_TS = new Date();
        process.AUDIT_USER = process.LAST_MODIFIED_BY || 'SYSTEM';
        
        // Update row timestamp
        process.ROW_TS = new Date();
        
        // If changing version, mark old version as not latest
        if (process.changed('VERSION') && process.previous('VERSION')) {
          // You might want to update the previous version's IS_LATEST_VERSION flag
          // This would require a separate query
        }
      },
      
      beforeDestroy: async (process) => {
        // Set audit fields on delete
        process.AUDIT_ACTION = 'DELETE';
        process.AUDIT_TS = new Date();
        process.AUDIT_USER = process.LAST_MODIFIED_BY || 'SYSTEM';
        
        // Instead of actually deleting, you might want to soft delete
        // process.REC_ST = 'Archived';
        // await process.save({ hooks: false });
        // throw new Error('Soft delete implemented - use deactivation instead');
      }
    },
    
    // Default scope
    defaultScope: {
      where: {
        REC_ST: {
          [Op.ne]: 'Archived' // Exclude archived records by default
        }
      }
    },
    
    // Scopes
    scopes: {
      active: {
        where: {
          REC_ST: 'Active'
        }
      },
      inactive: {
        where: {
          REC_ST: 'Inactive'
        }
      },
      draft: {
        where: {
          REC_ST: 'Draft'
        }
      },
      byCategory: (categoryCode) => ({
        where: { WF_APPL_CAT_CD: categoryCode }
      }),
      byUser: (userId) => ({
        where: { USER_ID: userId }
      }),
      latestVersions: {
        where: {
          IS_LATEST_VERSION: true
        }
      },
      requiringApproval: {
        where: {
          APPROVAL_REQUIRED: true
        }
      },
      withEscalation: {
        where: {
          ESCALATION_ENABLED: true
        }
      },
      defaultProcesses: {
        where: {
          IS_DEFAULT_PROCESS: true
        }
      },
      highPriority: {
        where: {
          PRIORITY_LEVEL: {
            [Op.gte]: 4
          }
        }
      },
      search: (searchTerm) => ({
        where: {
          [Op.or]: [
            { BUS_PROC_CD: { [Op.like]: `%${searchTerm}%` } },
            { BUS_PROC_DESC: { [Op.like]: `%${searchTerm}%` } },
            { PROCESS_CATEGORY: { [Op.like]: `%${searchTerm}%` } }
          ]
        }
      })
    },
    
    // Indexes
    indexes: [
      // Basic indexes
      {
        unique: true,
        fields: ['BUS_PROC_ID']
      },
      {
        fields: ['BUS_PROC_CD']
      },
      {
        fields: ['WF_APPL_CAT_CD']
      },
      {
        fields: ['REC_ST']
      },
      {
        fields: ['USER_ID']
      },
      {
        fields: ['CREATED_BY']
      },
      {
        fields: ['SYS_CREATE_TS']
      },
      {
        fields: ['LAST_MODIFIED_TS']
      },
      {
        fields: ['VERSION']
      },
      {
        fields: ['IS_LATEST_VERSION']
      },
      {
        fields: ['IS_DEFAULT_PROCESS']
      },
      {
        fields: ['PRIORITY_LEVEL']
      },
      {
        fields: ['PROCESS_CATEGORY']
      },
      {
        fields: ['APPROVAL_REQUIRED']
      },
      
      // Compound indexes for common queries
      {
        fields: ['WF_APPL_CAT_CD', 'REC_ST']
      },
      {
        fields: ['USER_ID', 'REC_ST']
      },
      {
        fields: ['BUS_PROC_CD', 'VERSION']
      },
      {
        fields: ['REC_ST', 'PRIORITY_LEVEL']
      },
      {
        fields: ['SYS_CREATE_TS', 'WF_APPL_CAT_CD']
      },
      {
        fields: ['IS_DEFAULT_PROCESS', 'WF_APPL_CAT_CD']
      }
    ]
  });

  // Instance Methods
  WF_BUSINESS_PROCESS.prototype.activate = function(activatedBy) {
    this.REC_ST = 'Active';
    this.LAST_MODIFIED_BY = activatedBy;
    this.LAST_MODIFIED_TS = new Date();
    this.AUDIT_ACTION = 'ACTIVATE';
    this.AUDIT_USER = activatedBy;
    this.AUDIT_TS = new Date();
    
    return this.save();
  };

  WF_BUSINESS_PROCESS.prototype.deactivate = function(deactivatedBy, reason = null) {
    this.REC_ST = 'Inactive';
    this.LAST_MODIFIED_BY = deactivatedBy;
    this.LAST_MODIFIED_TS = new Date();
    this.AUDIT_ACTION = 'DEACTIVATE';
    this.AUDIT_USER = deactivatedBy;
    this.AUDIT_TS = new Date();
    
    if (reason) {
      this.VERSION_NOTES = this.VERSION_NOTES 
        ? `${this.VERSION_NOTES}\nDeactivated: ${reason}` 
        : `Deactivated: ${reason}`;
    }
    
    return this.save();
  };

  WF_BUSINESS_PROCESS.prototype.archive = function(archivedBy) {
    this.REC_ST = 'Archived';
    this.LAST_MODIFIED_BY = archivedBy;
    this.LAST_MODIFIED_TS = new Date();
    this.AUDIT_ACTION = 'UPDATE';
    this.AUDIT_USER = archivedBy;
    this.AUDIT_TS = new Date();
    
    return this.save();
  };

  WF_BUSINESS_PROCESS.prototype.createNewVersion = async function(newVersion, createdBy, notes = null) {
    // Mark current version as not latest
    this.IS_LATEST_VERSION = false;
    await this.save();
    
    // Create new version
    const newProcess = await WF_BUSINESS_PROCESS.create({
      ...this.toJSON(),
      id: undefined, // Let MySQL auto-generate new ID
      BUS_PROC_ID: this.BUS_PROC_ID, // Same business process ID
      VERSION: newVersion,
      CREATED_BY: createdBy,
      USER_ID: createdBy,
      IS_LATEST_VERSION: true,
      VERSION_NOTES: notes,
      PARENT_PROC_ID: this.id, // Reference to parent version
      SYS_CREATE_TS: new Date(),
      LAST_MODIFIED_BY: createdBy,
      LAST_MODIFIED_TS: new Date()
    });
    
    return newProcess;
  };

  WF_BUSINESS_PROCESS.prototype.getProcessInfo = function() {
    return {
      processId: this.BUS_PROC_ID,
      processCode: this.BUS_PROC_CD,
      processDescription: this.BUS_PROC_DESC,
      category: this.WF_APPL_CAT_CD,
      status: this.REC_ST,
      version: this.VERSION,
      isLatest: this.IS_LATEST_VERSION,
      priority: this.PRIORITY_LEVEL,
      requiresApproval: this.APPROVAL_REQUIRED,
      createdBy: this.CREATED_BY,
      createdAt: this.SYS_CREATE_TS,
      lastModified: this.LAST_MODIFIED_TS,
      expiryOption: this.WF_EXPIRY_OPT,
      escalationEnabled: this.ESCALATION_ENABLED
    };
  };

  // Static Methods
  WF_BUSINESS_PROCESS.findByProcessCode = function(processCode, includeInactive = false) {
    const where = { BUS_PROC_CD: processCode };
    
    if (!includeInactive) {
      where.REC_ST = 'Active';
    }
    
    return this.findOne({
      where,
      order: [['VERSION', 'DESC']]
    });
  };

  WF_BUSINESS_PROCESS.findAllByCategory = function(categoryCode, options = {}) {
    const where = { WF_APPL_CAT_CD: categoryCode };
    
    if (options.onlyActive) {
      where.REC_ST = 'Active';
    }
    
    if (options.onlyLatest) {
      where.IS_LATEST_VERSION = true;
    }
    
    return this.findAll({
      where,
      order: [['PRIORITY_LEVEL', 'DESC'], ['BUS_PROC_CD', 'ASC']]
    });
  };

  WF_BUSINESS_PROCESS.getProcessHistory = function(processId) {
    return this.findAll({
      where: {
        BUS_PROC_ID: processId
      },
      order: [['VERSION', 'DESC']]
    });
  };

  WF_BUSINESS_PROCESS.getDefaultProcess = function(categoryCode) {
    return this.findOne({
      where: {
        WF_APPL_CAT_CD: categoryCode,
        IS_DEFAULT_PROCESS: true,
        REC_ST: 'Active',
        IS_LATEST_VERSION: true
      }
    });
  };

  WF_BUSINESS_PROCESS.searchProcesses = function(searchTerm, options = {}) {
    const where = {
      [Op.or]: [
        { BUS_PROC_CD: { [Op.like]: `%${searchTerm}%` } },
        { BUS_PROC_DESC: { [Op.like]: `%${searchTerm}%` } },
        { PROCESS_CATEGORY: { [Op.like]: `%${searchTerm}%` } },
        { PROCESS_SUBCATEGORY: { [Op.like]: `%${searchTerm}%` } }
      ]
    };
    
    if (options.onlyActive) {
      where.REC_ST = 'Active';
    }
    
    if (options.category) {
      where.WF_APPL_CAT_CD = options.category;
    }
    
    return this.findAll({
      where,
      order: [['PRIORITY_LEVEL', 'DESC'], ['BUS_PROC_CD', 'ASC']],
      limit: options.limit || 50
    });
  };

  // Define associations
  WF_BUSINESS_PROCESS.associate = function(models) {
    // Self-referential for versioning
    WF_BUSINESS_PROCESS.belongsTo(models.WF_BUSINESS_PROCESS, {
      foreignKey: 'PARENT_PROC_ID',
      as: 'parentProcess'
    });
    
    WF_BUSINESS_PROCESS.hasMany(models.WF_BUSINESS_PROCESS, {
      foreignKey: 'PARENT_PROC_ID',
      as: 'childVersions'
    });
    
    // Association with User (creator)
    WF_BUSINESS_PROCESS.belongsTo(models.User, {
      foreignKey: 'CREATED_BY',
      targetKey: 'user_name',
      as: 'creator'
    });
    
    // Association with User (last modifier)
    WF_BUSINESS_PROCESS.belongsTo(models.User, {
      foreignKey: 'LAST_MODIFIED_BY',
      targetKey: 'user_name',
      as: 'lastModifier'
    });
    
    // Association with workflow steps/tasks
    // Assuming you have a WF_PROCESS_STEP model
    WF_BUSINESS_PROCESS.hasMany(models.WF_PROCESS_STEP, {
      foreignKey: 'BUS_PROC_ID',
      sourceKey: 'BUS_PROC_ID',
      as: 'processSteps'
    });
  };

  return WF_BUSINESS_PROCESS;
}
