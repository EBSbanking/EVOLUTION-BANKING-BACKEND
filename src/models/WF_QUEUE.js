import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class WF_QUEUE extends Model {}

WF_QUEUE.init({
    QUEUE_ID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        comment: 'Primary key for the queue'
    },
    BUS_PROC_ID: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Business process identifier'
    },
    QUEUE_CD: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Queue code'
    },
    QUEUE_DESC: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Queue description'
    },
    QUEUE_TY: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Queue type'
    },
    TARGET_DURATION_PD_CD: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Target duration period code'
    },
    TARGET_DURATION_VALUE: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Target duration value'
    },
    MAX_DURATION_PD_CD: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Maximum duration period code'
    },
    MAX_DURATION_VALUE: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Maximum duration value'
    },
    DEADLINE_PD_CD: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Deadline period code'
    },
    DEADLINE_VALUE: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Deadline value'
    },
    DEADLINE_ALERT_RECIPIENT_ID: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Deadline alert recipient ID'
    },
    PRIORITY_LEVEL: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Priority level'
    },
    REC_ST: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'A',
        comment: 'Record status (A=Active, I=Inactive)'
    },
    VERSION_NO: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: 'Version number for optimistic locking'
    },
    ROW_TS: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Row timestamp'
    },
    USER_ID: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'User who created/modified the record'
    },
    NOTIFY_ORIGINATOR_FG: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'N',
        comment: 'Notify originator flag (Y/N)'
    },
    ESCALATION_TIME_VALUE: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Escalation time value'
    },
    ESCALATION_TIME_CD: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Escalation time code'
    },
    ESCALATION_AUDIANCE_ID: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Escalation audience ID'
    },
    PARTICIPANT_TYPE: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Participant type'
    },
    ITEM_NOTIFY_REQ_FG: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        comment: 'Item notification required flag'
    },
    BU_PRIMARY_VISIBILITY: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Business unit primary visibility'
    }
}, {
    sequelize,
    modelName: 'WF_QUEUE',
    tableName: 'WF_QUEUE',
    timestamps: false, // Using ROW_TS instead of createdAt/updatedAt
    comment: 'Workflow Queue table',
    indexes: [
        {
            name: 'idx_wf_queue_bus_proc_id',
            fields: ['BUS_PROC_ID']
        },
        {
            name: 'idx_wf_queue_queue_cd',
            fields: ['QUEUE_CD']
        },
        {
            name: 'idx_wf_queue_rec_st',
            fields: ['REC_ST']
        },
        {
            name: 'idx_wf_queue_row_ts',
            fields: ['ROW_TS']
        },
        {
            name: 'idx_wf_queue_queue_ty',
            fields: ['QUEUE_TY']
        }
    ],
    hooks: {
        beforeUpdate: (queue, options) => {
            // Increment version number on update
            if (queue.VERSION_NO) {
                queue.VERSION_NO += 1;
            }
            // Update ROW_TS on modification
            queue.ROW_TS = new Date();
        }
    }
});

// Sync the model (use carefully in production)
// WF_QUEUE.sync({ alter: false }).catch(console.error);

export default WF_QUEUE;
