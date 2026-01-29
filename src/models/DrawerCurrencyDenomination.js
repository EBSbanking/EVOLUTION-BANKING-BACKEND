// models/DrawerCurrencyDenomination.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class DrawerCurrencyDenomination extends Model {
  // Method to calculate totals for a specific denomination
  calculateDenominationTotal(denomId, count) {
    return denomId * count;
  }

  // Method to update denomination count
  updateDenominationCount(denomId, newCount) {
    const denomIndex = this.denomCount.findIndex(d => d.denomId === denomId);
    
    if (denomIndex !== -1) {
      this.denomCount[denomIndex].count = newCount;
      this.denomCount[denomIndex].amount = denomId * newCount;
      this.denomCount[denomIndex].Total = denomId * newCount;
    } else {
      this.denomCount.push({
        denomId,
        count: newCount,
        amount: denomId * newCount,
        Total: denomId * newCount
      });
    }
    
    this.recalculateTotalAmount();
  }

  // Method to recalculate total amount
  recalculateTotalAmount() {
    let totalAmount = 0;
    
    this.denomCount.forEach(denom => {
      denom.amount = denom.denomId * denom.count;
      denom.Total = denom.amount;
      totalAmount += denom.amount;
    });
    
    this.totalAmount = totalAmount;
    this.versionNo += 1;
  }

  // Method to get total count of all denominations
  getTotalDenominationCount() {
    return this.denomCount.reduce((total, denom) => total + denom.count, 0);
  }

  // Method to get breakdown by denomination
  getDenominationBreakdown() {
    return this.denomCount.map(denom => ({
      denomination: denom.denomId,
      count: denom.count,
      amount: denom.amount,
      percentage: this.totalAmount > 0 ? (denom.amount / this.totalAmount) * 100 : 0
    }));
  }

  // Static method to find by drawer currency ID
  static async findByDrawerCurrencyId(drawerCrncyId) {
    return await this.findAll({
      where: {
        drawerCrncyId,
        recSt: 'A'
      },
      order: [['createDt', 'DESC']]
    });
  }

  // Static method to find by drawer ID
  static async findByDrawerId(drawerId) {
    return await this.findAll({
      where: {
        drawerId,
        recSt: 'A'
      },
      order: [['createDt', 'DESC']]
    });
  }

  // Static method to get latest denomination for drawer currency
  static async getLatestForDrawerCurrency(drawerCrncyId) {
    return await this.findOne({
      where: {
        drawerCrncyId,
        recSt: 'A'
      },
      order: [['createDt', 'DESC']]
    });
  }

  // Static method to create from denomination array
  static async createFromDenominations(drawerCrncyDenomId, drawerCrncyId, drawerId, userId, denominations) {
    const denomCount = denominations.map(denom => ({
      denomId: denom.denomId,
      count: denom.count,
      amount: denom.denomId * denom.count,
      Total: denom.denomId * denom.count
    }));

    const totalAmount = denomCount.reduce((sum, denom) => sum + denom.amount, 0);

    return await this.create({
      drawerCrncyDenomId,
      drawerCrncyId,
      drawerId,
      userId,
      createdBy: userId,
      denomCount,
      totalAmount,
      denomCountType: 'T',
      recSt: 'A',
      versionNo: 1
    });
  }
}

DrawerCurrencyDenomination.init({
  drawerCrncyDenomId: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: 'Drawer Currency Denomination ID (e.g., "D12345")'
  },
  denomCount: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    validate: {
      isValidDenominationArray(value) {
        if (!Array.isArray(value)) {
          throw new Error('denomCount must be an array');
        }
        value.forEach(item => {
          if (typeof item.denomId !== 'number') {
            throw new Error('Each denomination must have a numeric denomId');
          }
          if (typeof item.count !== 'number') {
            throw new Error('Each denomination must have a numeric count');
          }
        });
      }
    }
  },
  totalAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  denomCountType: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'T',
    validate: {
      isIn: [['T', 'S', 'O']] // T=Total, S=Start, O=Other
    }
  },
  recSt: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I', 'C']] // A=Active, I=Inactive, C=Cancelled
    }
  },
  versionNo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  rowTs: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  userId: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  createDt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  sysCreateTs: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  createdBy: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  drawerCrncyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'drawer_currencies',
      key: 'DRAWER_CRNCY_ID'
    },
    comment: 'Reference to Drawer Currency'
  },
  drawerId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Drawer ID'
  }
}, {
  sequelize,
  modelName: 'DrawerCurrencyDenomination',
  tableName: 'drawer_currency_denominations',
  timestamps: false, // We're using custom timestamp fields
  underscored: false,
  hooks: {
    beforeSave: async (denomination, options) => {
      if (denomination.changed()) {
        denomination.versionNo += 1;
        denomination.rowTs = new Date();
      }

      // Calculate total amount before saving
      if (denomination.denomCount && Array.isArray(denomination.denomCount)) {
        let totalAmount = 0;
        
        // Process each denomination
        denomination.denomCount.forEach(denom => {
          if (denom.denomId && denom.count) {
            denom.amount = denom.denomId * denom.count;
            denom.Total = denom.amount;
            totalAmount += denom.amount;
          }
        });
        
        denomination.totalAmount = parseFloat(totalAmount.toFixed(2));
      }
    },
    afterFind: (results) => {
      if (!results) return;
      
      const processResult = (result) => {
        if (result && result.dataValues) {
          // Convert totalAmount to number
          if (result.totalAmount !== null && result.totalAmount !== undefined) {
            result.dataValues.totalAmount = parseFloat(result.totalAmount);
          }
          
          // Process denomCount array to ensure amounts are numbers
          if (result.denomCount && Array.isArray(result.denomCount)) {
            result.dataValues.denomCount = result.denomCount.map(denom => ({
              ...denom,
              amount: denom.amount ? parseFloat(denom.amount) : denom.denomId * denom.count,
              Total: denom.Total ? parseFloat(denom.Total) : denom.denomId * denom.count
            }));
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
      name: 'idx_drawer_crncy_denom_id',
      fields: ['drawerCrncyDenomId'],
      unique: true
    },
    {
      name: 'idx_drawer_crncy_denom_drawer_crncy',
      fields: ['drawerCrncyId']
    },
    {
      name: 'idx_drawer_crncy_denom_drawer',
      fields: ['drawerId']
    },
    {
      name: 'idx_drawer_crncy_denom_type',
      fields: ['denomCountType']
    },
    {
      name: 'idx_drawer_crncy_denom_rec_st',
      fields: ['recSt']
    },
    {
      name: 'idx_drawer_crncy_denom_user',
      fields: ['userId']
    },
    {
      name: 'idx_drawer_crncy_denom_create_dt',
      fields: ['createDt']
    }
  ]
});

export default DrawerCurrencyDenomination;