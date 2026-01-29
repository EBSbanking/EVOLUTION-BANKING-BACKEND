import { DataTypes, Model } from 'sequelize';
import {sequelize} from '../../config/db.js';

class WF_SUB_PROCESS extends Model {}

WF_SUB_PROCESS.init({
    SUB_PROC_ID: {
        type: DataTypes.STRING(50),
        primaryKey: true,
        allowNull: false,
        unique: true,
        comment: 'Unique ID for the subprocess'
    },
    BUS_PROC_ID: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'ID of the parent business process'
    },
    SRC_QUEUE_ID: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Source queue ID'
    },
    EVENT_ID: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Event ID triggering the subprocess'
    },
    PATH_NO: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Path number within the process',
        validate: {
            min: 1
        }
    },
    SUB_PROC_TY: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Type of the subprocess (e.g., REUSABLE, EMBEDDED, STANDALONE)'
    },
    REC_ST: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'A',
        comment: 'Record status (A=Active, I=Inactive, D=Deleted)'
    },
    VERSION_NO: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '1.0',
        comment: 'Version of the subprocess'
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
        comment: 'User ID associated with the subprocess'
    },
    CREATED_BY: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'User or system that created the subprocess'
    },
    CREATED_DT: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'Date the subprocess was created'
    },
    SYS_CREATE_TS: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: 'System-created timestamp'
    },
    SUB_PROC_NM: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Name of the subprocess'
    }
}, {
    sequelize,
    modelName: 'WF_SUB_PROCESS',
    tableName: 'WF_SUB_PROCESS',
    timestamps: false,
    comment: 'Workflow Sub Process table',
    indexes: [
        {
            name: 'idx_sub_proc_bus_proc_id',
            fields: ['BUS_PROC_ID']
        },
        {
            name: 'idx_sub_proc_src_queue_id',
            fields: ['SRC_QUEUE_ID']
        },
        {
            name: 'idx_sub_proc_event_id',
            fields: ['EVENT_ID']
        },
        {
            name: 'idx_sub_proc_path_no',
            fields: ['PATH_NO']
        },
        {
            name: 'idx_sub_proc_sub_proc_ty',
            fields: ['SUB_PROC_TY']
        },
        {
            name: 'idx_sub_proc_rec_st',
            fields: ['REC_ST']
        },
        {
            name: 'idx_sub_proc_created_dt',
            fields: ['CREATED_DT']
        },
        {
            name: 'idx_sub_proc_composite_bus_path',
            fields: ['BUS_PROC_ID', 'PATH_NO', 'REC_ST']
        }
    ],
    hooks: {
        beforeCreate: (subProcess, options) => {
            // Set default dates if not provided
            if (!subProcess.CREATED_DT) {
                subProcess.CREATED_DT = new Date();
            }
            if (!subProcess.SYS_CREATE_TS) {
                subProcess.SYS_CREATE_TS = new Date();
            }
        },
        beforeUpdate: (subProcess, options) => {
            // Update ROW_TS on modification
            subProcess.ROW_TS = new Date();
        }
    }
});

// Instance methods
WF_SUB_PROCESS.prototype.activate = function() {
    this.REC_ST = 'A';
    return this.save();
};

WF_SUB_PROCESS.prototype.deactivate = function() {
    this.REC_ST = 'I';
    return this.save();
};

// Class methods for common queries
WF_SUB_PROCESS.findByBusinessProcessId = function(busProcId, options = {}) {
    const defaultOptions = {
        where: { 
            BUS_PROC_ID: busProcId,
            REC_ST: 'A'
        },
        order: [['PATH_NO', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
};

WF_SUB_PROCESS.findActiveByType = function(subProcType) {
    return this.findAll({
        where: { 
            SUB_PROC_TY: subProcType,
            REC_ST: 'A'
        },
        order: [['BUS_PROC_ID', 'ASC'], ['PATH_NO', 'ASC']]
    });
};

WF_SUB_PROCESS.findBySourceQueue = function(srcQueueId) {
    return this.findAll({
        where: { 
            SRC_QUEUE_ID: srcQueueId,
            REC_ST: 'A'
        },
        order: [['PATH_NO', 'ASC']]
    });
};

WF_SUB_PROCESS.findByEvent = function(eventId) {
    return this.findAll({
        where: { 
            EVENT_ID: eventId,
            REC_ST: 'A'
        }
    });
};

// Get next available path number for a business process
WF_SUB_PROCESS.getNextPathNumber = async function(busProcId) {
    const result = await this.findOne({
        where: { BUS_PROC_ID: busProcId },
        attributes: [
            [sequelize.fn('MAX', sequelize.col('PATH_NO')), 'maxPathNo']
        ],
        raw: true
    });
    
    return result?.maxPathNo ? result.maxPathNo + 1 : 1;
};

// Check if subprocess name already exists
WF_SUB_PROCESS.isNameUnique = async function(subProcName, excludeId = null) {
    const whereClause = {
        SUB_PROC_NM: subProcName,
        REC_ST: 'A'
    };
    
    if (excludeId) {
        whereClause.SUB_PROC_ID = { [DataTypes.Op.ne]: excludeId };
    }
    
    const existing = await this.findOne({
        where: whereClause
    });
    
    return !existing;
};

// Get all subprocesses with their latest version
WF_SUB_PROCESS.findLatestVersions = function() {
    const subquery = `SELECT SUB_PROC_NM, MAX(CREATED_DT) as latest_date 
                     FROM WF_SUB_PROCESS 
                     WHERE REC_ST = 'A' 
                     GROUP BY SUB_PROC_NM`;
    
    return sequelize.query(
        `SELECT sp.* FROM WF_SUB_PROCESS sp 
         INNER JOIN (${subquery}) latest 
         ON sp.SUB_PROC_NM = latest.SUB_PROC_NM 
         AND sp.CREATED_DT = latest.latest_date 
         WHERE sp.REC_ST = 'A' 
         ORDER BY sp.SUB_PROC_NM`,
        {
            type: sequelize.QueryTypes.SELECT,
            model: WF_SUB_PROCESS
        }
    );
};

export default WF_SUB_PROCESS;