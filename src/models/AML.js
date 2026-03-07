// src/models/AML.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class AML extends Model {}

AML.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    CUST_ID: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      field: 'cust_id', // Map to database column
    },
    BVN: {
      type: DataTypes.STRING(11),
      unique: true,
      allowNull: false,
      validate: {
        len: [11, 11],
        isNumeric: true,
      },
    },
    NIN: {
      type: DataTypes.STRING(11),
      unique: true,
      allowNull: false,
      validate: {
        len: [11, 11],
        isNumeric: true,
      },
    },
    IS_PEP: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_pep',
    },
    IS_RCA: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_rca',
    },
    SANCTION_SCORE: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'sanction_score',
      validate: {
        min: 0,
        max: 100,
      },
    },
    SANCTION_MATCH: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'sanction_match',
    },
    CUSTOMER_RISK_RATING: {
      type: DataTypes.ENUM('Low', 'Medium', 'High'),
      defaultValue: 'Low',
      field: 'customer_risk_rating',
    },
    AML_STATUS: {
      type: DataTypes.ENUM('Pending', 'Approved', 'Rejected', 'Suspended', 'Deleted'),
      defaultValue: 'Pending',
      field: 'aml_status',
    },
    NEXT_REVIEW_DATE: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'next_review_date',
    },
  },
  {
    sequelize,
    modelName: 'AML',
    tableName: 'amls',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    hooks: {
      beforeValidate: (aml) => {
        // Generate UUID if not provided
        if (!aml.id) {
          aml.id = require('crypto').randomUUID();
        }
        
        // Validate BVN format
        if (aml.BVN && !/^\d{11}$/.test(aml.BVN)) {
          throw new Error('BVN must be exactly 11 digits');
        }
        
        // Validate NIN format
        if (aml.NIN && !/^\d{11}$/.test(aml.NIN)) {
          throw new Error('NIN must be exactly 11 digits');
        }
        
        // Ensure risk rating is valid
        if (aml.CUSTOMER_RISK_RATING && 
            !['Low', 'Medium', 'High'].includes(aml.CUSTOMER_RISK_RATING)) {
          aml.CUSTOMER_RISK_RATING = 'Low';
        }
      },
    },
  }
);

// Static method to find by customer ID
AML.findByCustomerId = async function(custId) {
  return await this.findOne({
    where: { CUST_ID: custId },
  });
};

// Static method to find by BVN
AML.findByBVN = async function(bvn) {
  return await this.findOne({
    where: { BVN: bvn },
  });
};

// Static method to find by NIN
AML.findByNIN = async function(nin) {
  return await this.findOne({
    where: { NIN: nin },
  });
};

// Static method to get high-risk customers
AML.getHighRiskCustomers = async function() {
  return await this.findAll({
    where: {
      CUSTOMER_RISK_RATING: 'High',
      AML_STATUS: 'Approved',
    },
    order: [['SANCTION_SCORE', 'DESC']],
  });
};

// Static method to get pending reviews
AML.getPendingReviews = async function() {
  const today = new Date();
  return await this.findAll({
    where: {
      NEXT_REVIEW_DATE: {
        [sequelize.Sequelize.Op.lte]: today,
      },
      AML_STATUS: 'Approved',
    },
    order: [['NEXT_REVIEW_DATE', 'ASC']],
  });
};

// Static method to check for sanction matches
AML.checkSanctionMatch = async function(bvn, nin) {
  const whereClause = {};
  
  if (bvn) {
    whereClause.BVN = bvn;
  }
  
  if (nin) {
    whereClause.NIN = nin;
  }
  
  const existing = await this.findOne({
    where: whereClause,
  });
  
  if (existing && existing.SANCTION_MATCH) {
    return {
      match: true,
      score: existing.SANCTION_SCORE,
      record: existing.getBasicInfo(),
    };
  }
  
  return { match: false, score: 0 };
};

// Instance method to update risk rating
AML.prototype.updateRiskRating = async function() {
  // Calculate risk based on various factors
  let riskScore = 0;
  
  // Sanction match increases risk
  if (this.SANCTION_MATCH) {
    riskScore += this.SANCTION_SCORE || 50;
  }
  
  // PEP increases risk
  if (this.IS_PEP) {
    riskScore += 30;
  }
  
  // RCA increases risk
  if (this.IS_RCA) {
    riskScore += 20;
  }
  
  // Determine risk rating
  let newRating = 'Low';
  if (riskScore >= 70) {
    newRating = 'High';
  } else if (riskScore >= 30) {
    newRating = 'Medium';
  }
  
  this.CUSTOMER_RISK_RATING = newRating;
  await this.save();
  
  return newRating;
};

// Instance method to get basic info
AML.prototype.getBasicInfo = function() {
  return {
    id: this.id,
    custId: this.CUST_ID,
    bvn: this.BVN,
    nin: this.NIN,
    isPep: this.IS_PEP,
    isRca: this.IS_RCA,
    riskRating: this.CUSTOMER_RISK_RATING,
    status: this.AML_STATUS,
    nextReview: this.NEXT_REVIEW_DATE,
  };
};

// Static method to get statistics
AML.getStatistics = async function() {
  const total = await this.count();
  const byStatus = {
    pending: await this.count({ where: { AML_STATUS: 'Pending' } }),
    approved: await this.count({ where: { AML_STATUS: 'Approved' } }),
    rejected: await this.count({ where: { AML_STATUS: 'Rejected' } }),
    suspended: await this.count({ where: { AML_STATUS: 'Suspended' } }),
    deleted: await this.count({ where: { AML_STATUS: 'Deleted' } }),
  };
  
  const byRisk = {
    low: await this.count({ where: { CUSTOMER_RISK_RATING: 'Low' } }),
    medium: await this.count({ where: { CUSTOMER_RISK_RATING: 'Medium' } }),
    high: await this.count({ where: { CUSTOMER_RISK_RATING: 'High' } }),
  };
  
  const sanctionMatches = await this.count({ where: { SANCTION_MATCH: true } });
  const pepCount = await this.count({ where: { IS_PEP: true } });
  const rcaCount = await this.count({ where: { IS_RCA: true } });
  
  const pendingReviews = await this.count({
    where: {
      NEXT_REVIEW_DATE: {
        [sequelize.Sequelize.Op.lte]: new Date(),
      },
      AML_STATUS: 'Approved',
    },
  });
  
  return {
    total,
    byStatus,
    byRisk,
    sanctionMatches,
    pepCount,
    rcaCount,
    pendingReviews,
  };
};

export default AML;