// models/DrawerCloseOut.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class DrawerCloseOut extends Model {
  // Virtual getter for net cash movement
  get netCashMovement() {
    const deposits = parseFloat(this.TOTAL_DEPOSITS) || 0;
    const withdrawals = parseFloat(this.TOTAL_WITHDRAWALS) || 0;
    const receipts = parseFloat(this.TOTAL_CASH_RECEIPTS) || 0;
    const disbursements = parseFloat(this.TOTAL_CASH_DISBURSEMENTS) || 0;
    
    return (deposits + receipts) - (withdrawals + disbursements);
  }

  // Virtual getter for total transactions
  get totalTransactions() {
    return (this.DEPOSIT_COUNT || 0) + 
           (this.WITHDRAWAL_COUNT || 0) + 
           (this.CASH_RECEIPT_COUNT || 0) + 
           (this.CASH_DISBURSEMENT_COUNT || 0);
  }

  // Method to verify closeout
  verifyCloseout(verifiedBy, notes = '') {
    this.CLOSEOUT_STATUS = 'VERIFIED';
    this.VERIFIED_BY = verifiedBy;
    this.VERIFICATION_NOTES = notes;
    this.VERSION_NO += 1;
  }

  // Method to approve closeout
  approveCloseout(approvedBy) {
    this.CLOSEOUT_STATUS = 'APPROVED';
    this.SUPERVISOR_APPROVAL = approvedBy;
    this.VERSION_NO += 1;
  }

  // Method to flag as disputed
  flagAsDisputed(reason) {
    this.CLOSEOUT_STATUS = 'DISPUTED';
    this.VERIFICATION_NOTES = reason;
    this.VERSION_NO += 1;
  }

  // Static method to find closeouts by drawer
  static async findByDrawer(drawerId, limit = 50) {
    return await this.findAll({
      where: {
        DRAWER_ID: drawerId,
        REC_ST: 'A'
      },
      order: [['SESSION_END_DT', 'DESC']],
      limit: limit
    });
  }

  // Static method to find closeouts by date range
  static async findByDateRange(startDate, endDate, businessUnitId = null) {
    const where = {
      SESSION_END_DT: {
        [DataTypes.Op.between]: [startDate, endDate]
      },
      REC_ST: 'A'
    };
    
    if (businessUnitId) {
      where.BU_ID = businessUnitId;
    }
    
    return await this.findAll({
      where,
      order: [['SESSION_END_DT', 'DESC']]
    });
  }

  // Static method to find pending closeouts
  static async findPendingCloseouts(businessUnitId = null) {
    const where = {
      CLOSEOUT_STATUS: 'PENDING',
      REC_ST: 'A'
    };
    
    if (businessUnitId) {
      where.BU_ID = businessUnitId;
    }
    
    return await this.findAll({
      where,
      order: [['SESSION_END_DT', 'DESC']]
    });
  }
}

DrawerCloseOut.init({
  // Primary Identification
  DRAWER_CLOSEOUT_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    unique: true,
  },
  
  // Drawer Reference
  DRAWER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Drawers',
      key: 'DRAWER_ID'
    }
  },
  DRAWER_NO: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  
  // Session Information
  SESSION_START_DT: {
    type: DataTypes.DATE,
    allowNull: false
  },
  SESSION_END_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  SESSION_DURATION: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Calculated duration in minutes'
  },
  
  // Financial Summary (using DECIMAL for precise financial calculations)
  OPENING_BALANCE: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  CLOSING_BALANCE: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  EXPECTED_BALANCE: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  
  // Transaction Totals
  TOTAL_DEPOSITS: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  TOTAL_WITHDRAWALS: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  TOTAL_CASH_RECEIPTS: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  TOTAL_CASH_DISBURSEMENTS: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  
  // Transaction Counts
  DEPOSIT_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  WITHDRAWAL_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  CASH_RECEIPT_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  CASH_DISBURSEMENT_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  
  // Settlement Information
  OVERAGE_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  SHORTAGE_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  DIFFERENCE_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  
  // Currency Information (using JSON for flexible denomination storage)
  CURRENCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  CURRENCY_DENOMINATIONS: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {
      OneThousandNaira: 0,
      FiveHundredNaira: 0,
      TwoHundredNaira: 0,
      OneHundredNaira: 0,
      FiftyNaira: 0,
      TwentyNaira: 0,
      TenNaira: 0,
      FiveNaira: 0,
      TOTAL_CURRENCY_COUNT: 0,
      CALCULATED_AMOUNT: 0.00
    }
  },
  
  // Verification Details
  VERIFIED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  COUNTED_BY: {
    type: DataTypes.STRING(24)
  },
  SUPERVISOR_APPROVAL: {
    type: DataTypes.STRING(24)
  },
  VERIFICATION_NOTES: {
    type: DataTypes.STRING(500)
  },
  
  // Closeout Status
  CLOSEOUT_STATUS: {
    type: DataTypes.ENUM('PENDING', 'VERIFIED', 'APPROVED', 'DISPUTED', 'ADJUSTED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  FORCE_CLOSED: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  FORCE_CLOSE_REASON: {
    type: DataTypes.STRING(200)
  },
  
  // Business Context
  BU_ID: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  CURRENT_ASSIGNEE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  
  // Audit Fields
  REC_ST: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I', 'C']]
    }
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'DrawerCloseOut',
  tableName: 'drawer_close_outs',
  timestamps: true, // Adds createdAt and updatedAt
  underscored: false,
  hooks: {
    beforeSave: async (drawerCloseOut, options) => {
      if (drawerCloseOut.changed()) {
        drawerCloseOut.VERSION_NO += 1;
        drawerCloseOut.ROW_TS = new Date();
      }
      
      // Calculate difference
      if (drawerCloseOut.CLOSING_BALANCE !== undefined && drawerCloseOut.EXPECTED_BALANCE !== undefined) {
        const closing = parseFloat(drawerCloseOut.CLOSING_BALANCE);
        const expected = parseFloat(drawerCloseOut.EXPECTED_BALANCE);
        drawerCloseOut.DIFFERENCE_AMT = parseFloat((closing - expected).toFixed(2));
      }
      
      // Calculate session duration in minutes
      if (drawerCloseOut.SESSION_START_DT && drawerCloseOut.SESSION_END_DT) {
        const durationMs = new Date(drawerCloseOut.SESSION_END_DT) - new Date(drawerCloseOut.SESSION_START_DT);
        drawerCloseOut.SESSION_DURATION = Math.floor(durationMs / (1000 * 60)); // Convert to minutes
      }
    },
    afterFind: (results) => {
      if (!results) return;
      
      const processResult = (result) => {
        // Ensure decimal values are properly converted
        if (result && result.dataValues) {
          // Convert decimal fields to numbers for consistency
          const decimalFields = [
            'OPENING_BALANCE', 'CLOSING_BALANCE', 'EXPECTED_BALANCE',
            'TOTAL_DEPOSITS', 'TOTAL_WITHDRAWALS', 'TOTAL_CASH_RECEIPTS', 'TOTAL_CASH_DISBURSEMENTS',
            'OVERAGE_AMT', 'SHORTAGE_AMT', 'DIFFERENCE_AMT'
          ];
          
          decimalFields.forEach(field => {
            if (result[field] !== null && result[field] !== undefined) {
              result.dataValues[field] = parseFloat(result[field]);
            }
          });
          
          // Process CURRENCY_DENOMINATIONS JSON
          if (result.CURRENCY_DENOMINATIONS && result.CURRENCY_DENOMINATIONS.CALCULATED_AMOUNT) {
            result.dataValues.CURRENCY_DENOMINATIONS.CALCULATED_AMOUNT = 
              parseFloat(result.CURRENCY_DENOMINATIONS.CALCULATED_AMOUNT);
          }
        }
      };
      
      if (Array.isArray(results)) {
        results.forEach(processResult);
      } else {
        processResult(results);
      }
    }
  },
  indexes: [
    {
      name: 'idx_drawer_closeouts_drawer_session',
      fields: ['DRAWER_ID', 'SESSION_END_DT']
    },
    {
      name: 'idx_drawer_closeouts_user_session',
      fields: ['USER_ID', 'SESSION_END_DT']
    },
    {
      name: 'idx_drawer_closeouts_bu_session',
      fields: ['BU_ID', 'SESSION_END_DT']
    },
    {
      name: 'idx_drawer_closeouts_session_end',
      fields: ['SESSION_END_DT']
    },
    {
      name: 'idx_drawer_closeouts_status',
      fields: ['CLOSEOUT_STATUS']
    }
  ]
});

export default DrawerCloseOut;