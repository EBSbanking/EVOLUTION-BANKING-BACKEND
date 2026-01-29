import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class WF_SUB_PROCESS_POLICY extends Model {}

WF_SUB_PROCESS_POLICY.init({
    SUB_PROC_POLICY_ID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        unique: true,
        comment: 'Unique identifier for sub-process policy'
    },
    SUB_PROC_ID: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Reference to a specific subprocess'
    },
    BUS_PROC_POLICY_ID: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Reference to a business process policy'
    },
    SEQ_NO: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Sequence number for ordering purposes',
        validate: {
            min: 1
        }
    },
    REC_ST: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'A',
        comment: 'Record status (A=Active, I=Inactive, D=Deleted)'
    },
    VERSION_NO: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Version number for the policy'
    },
    ROW_TS: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Timestamp when the record was last updated'
    },
    USER_ID: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'User ID associated with the policy'
    },
    CREATE_DT: {
        type: DataTypes.DATEONLY, // Use DATEONLY for date-only or DATE for datetime
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Date when the policy was created'
    },
    CREATED_BY: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Who created the policy record'
    },
    SYS_CREATE_TS: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'System-created timestamp'
    }
}, {
    sequelize,
    modelName: 'WF_SUB_PROCESS_POLICY',
    tableName: 'WF_SUB_PROCESS_POLICY',
    timestamps: false, // Using custom timestamp fields
    comment: 'Workflow Sub Process Policy table',
    indexes: [
        {
            name: 'idx_sub_proc_policy_sub_proc_id',
            fields: ['SUB_PROC_ID']
        },
        {
            name: 'idx_sub_proc_policy_bus_proc_policy_id',
            fields: ['BUS_PROC_POLICY_ID']
        },
        {
            name: 'idx_sub_proc_policy_seq_no',
            fields: ['SEQ_NO']
        },
        {
            name: 'idx_sub_proc_policy_rec_st',
            fields: ['REC_ST']
        },
        {
            name: 'idx_sub_proc_policy_create_dt',
            fields: ['CREATE_DT']
        },
        {
            name: 'idx_sub_proc_policy_composite',
            fields: ['SUB_PROC_ID', 'BUS_PROC_POLICY_ID', 'REC_ST']
        }
    ],
    hooks: {
        beforeCreate: (policy, options) => {
            // Ensure CREATE_DT is set if not provided
            if (!policy.CREATE_DT) {
                policy.CREATE_DT = new Date();
            }
            // Ensure SYS_CREATE_TS is current
            policy.SYS_CREATE_TS = new Date();
        },
        beforeUpdate: (policy, options) => {
            // Increment version number on update
            if (policy.VERSION_NO) {
                policy.VERSION_NO += 1;
            }
            // Update ROW_TS on modification
            policy.ROW_TS = new Date();
        }
    }
});

// Add custom methods to the model
WF_SUB_PROCESS_POLICY.prototype.activate = function() {
    this.REC_ST = 'A';
    return this.save();
};

WF_SUB_PROCESS_POLICY.prototype.deactivate = function() {
    this.REC_ST = 'I';
    return this.save();
};

// Add class methods for common queries
WF_SUB_PROCESS_POLICY.findBySubProcessId = function(subProcId, options = {}) {
    const defaultOptions = {
        where: { 
            SUB_PROC_ID: subProcId,
            REC_ST: 'A'
        },
        order: [['SEQ_NO', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
};

WF_SUB_PROCESS_POLICY.findActivePoliciesByBusinessPolicy = function(busProcPolicyId) {
    return this.findAll({
        where: { 
            BUS_PROC_POLICY_ID: busProcPolicyId,
            REC_ST: 'A'
        },
        order: [['SUB_PROC_ID', 'ASC'], ['SEQ_NO', 'ASC']]
    });
};

WF_SUB_PROCESS_POLICY.findBySubProcessAndPolicy = function(subProcId, busProcPolicyId) {
    return this.findOne({
        where: { 
            SUB_PROC_ID: subProcId,
            BUS_PROC_POLICY_ID: busProcPolicyId,
            REC_ST: 'A'
        }
    });
};

// Method to get the next sequence number for a sub-process
WF_SUB_PROCESS_POLICY.getNextSequenceNumber = async function(subProcId) {
    const lastPolicy = await this.findOne({
        where: { SUB_PROC_ID: subProcId },
        order: [['SEQ_NO', 'DESC']],
        attributes: ['SEQ_NO']
    });
    
    return lastPolicy ? lastPolicy.SEQ_NO + 1 : 1;
};

export default WF_SUB_PROCESS_POLICY;