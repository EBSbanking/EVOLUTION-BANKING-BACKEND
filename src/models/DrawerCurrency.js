// models/DrawerCurrency.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class DrawerCurrency extends Model {
  // Virtual getter for net cash flow
  get netCashFlow() {
    const cashIn = parseFloat(this.TOTAL_CASH_IN) || 0;
    const cashOut = parseFloat(this.TOTAL_CASH_OUT) || 0;
    const cashSale = parseFloat(this.TOTAL_CASH_SALE) || 0;
    const cashBought = parseFloat(this.TOTAL_CASH_BOUGHT) || 0;
    
    return (cashIn + cashSale) - (cashOut + cashBought);
  }

  // Virtual getter for total transaction count
  get totalTransactionCount() {
    return (this.CASH_IN_COUNT || 0) + 
           (this.CASH_OUT_COUNT || 0) + 
           (this.CASH_BOUGHT_COUNT || 0) + 
           (this.CASH_SALE_COUNT || 0);
  }

  // Virtual getter for net balance change
  get netBalanceChange() {
    const curBal = parseFloat(this.CUR_BAL) || 0;
    const openBal = parseFloat(this.OPEN_BAL) || 0;
    return curBal - openBal;
  }

  // Method to update currency balance
  updateBalance(newBalance, userId) {
    this.END_BAL = this.CUR_BAL;
    this.CUR_BAL = newBalance;
    this.USER_ID = userId;
    this.VERSION_NO += 1;
  }

  // Method to add cash in transaction
  addCashIn(amount, userId) {
    const cashIn = parseFloat(this.TOTAL_CASH_IN) || 0;
    this.TOTAL_CASH_IN = cashIn + amount;
    this.CASH_IN_COUNT += 1;
    this.USER_ID = userId;
    this.VERSION_NO += 1;
  }

  // Method to add cash out transaction
  addCashOut(amount, userId) {
    const cashOut = parseFloat(this.TOTAL_CASH_OUT) || 0;
    this.TOTAL_CASH_OUT = cashOut + amount;
    this.CASH_OUT_COUNT += 1;
    this.USER_ID = userId;
    this.VERSION_NO += 1;
  }

  // Static method to find by drawer and currency
  static async findByDrawerAndCurrency(drawerId, currencyId) {
    return await this.findOne({
      where: {
        DRAWER_ID: drawerId,
        CRNCY_ID: currencyId,
        REC_ST: 'A'
      }
    });
  }

  // Static method to find all currencies for a drawer
  static async findByDrawer(drawerId) {
    return await this.findAll({
      where: {
        DRAWER_ID: drawerId,
        REC_ST: 'A'
      },
      order: [['CRNCY_ID', 'ASC']]
    });
  }

  // Static method to get drawer currency summary
  static async getDrawerCurrencySummary(drawerId) {
    const currencies = await this.findAll({
      where: {
        DRAWER_ID: drawerId,
        REC_ST: 'A'
      }
    });

    return {
      totalBalance: currencies.reduce((sum, curr) => sum + parseFloat(curr.CUR_BAL || 0), 0),
      totalCashIn: currencies.reduce((sum, curr) => sum + parseFloat(curr.TOTAL_CASH_IN || 0), 0),
      totalCashOut: currencies.reduce((sum, curr) => sum + parseFloat(curr.TOTAL_CASH_OUT || 0), 0),
      currencyCount: currencies.length
    };
  }
}

DrawerCurrency.init({
  DRAWER_CRNCY_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    unique: true,
  },
  DRAWER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    
  },
  CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
   
  },
  CUR_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  OPEN_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  END_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  REC_ST: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'C',
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
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false
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
  },
  TOTAL_CASH_IN: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_CASH_OUT: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_CASH_SALE: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_CASH_BOUGHT: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  SHORTAGE_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  OVERAGE_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  CASH_IN_COUNT: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  CASH_OUT_COUNT: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  CASH_BOUGHT_COUNT: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  CASH_SALE_COUNT: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  REFUND_AMT: {
    type: DataTypes.DECIMAL(15, 2)
  }
}, {
  sequelize,
  modelName: 'DrawerCurrency',
  tableName: 'drawer_currencies',
  timestamps: true, // Adds createdAt and updatedAt
  underscored: false,
  hooks: {
    beforeSave: async (drawerCurrency, options) => {
      if (drawerCurrency.changed()) {
        drawerCurrency.VERSION_NO += 1;
        drawerCurrency.ROW_TS = new Date();
      }
    },
    afterFind: (results) => {
      if (!results) return;
      
      const processResult = (result) => {
        if (result && result.dataValues) {
          // Convert decimal fields to numbers for consistency
          const decimalFields = [
            'CUR_BAL', 'OPEN_BAL', 'END_BAL',
            'TOTAL_CASH_IN', 'TOTAL_CASH_OUT', 'TOTAL_CASH_SALE', 'TOTAL_CASH_BOUGHT',
            'SHORTAGE_AMT', 'OVERAGE_AMT', 'REFUND_AMT'
          ];
          
          decimalFields.forEach(field => {
            if (result[field] !== null && result[field] !== undefined) {
              result.dataValues[field] = parseFloat(result[field]);
            }
          });
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
      name: 'idx_drawer_currencies_drawer_currency',
      fields: ['DRAWER_ID', 'CRNCY_ID'],
      unique: true
    },
    {
      name: 'idx_drawer_currencies_drawer',
      fields: ['DRAWER_ID']
    },
    {
      name: 'idx_drawer_currencies_currency',
      fields: ['CRNCY_ID']
    },
    {
      name: 'idx_drawer_currencies_rec_st',
      fields: ['REC_ST']
    }
  ]
});

export default DrawerCurrency;