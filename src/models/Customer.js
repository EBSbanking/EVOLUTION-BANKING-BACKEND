// models/Customer.js - CORRECTED VERSION (ONLY ACTUAL FIELDS)
import { DataTypes, Op } from 'sequelize';

const Customer = (sequelize) => {
  const CustomerModel = sequelize.define('Customer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },
    
    CUST_ID: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Customer ID',
      field: 'CUST_ID'
    },
    
    CUST_NO: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Customer number',
      field: 'CUST_NO'
    },
    
    TITLE_ID: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Title (Mr, Mrs, Dr, etc.)',
      field: 'TITLE_ID'
    },
    
    FIRST_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'First name',
      field: 'FIRST_NAME'
    },
    
    MIDDLE_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Middle name',
      field: 'MIDDLE_NAME'
    },
    
    LAST_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Last name',
      field: 'LAST_NAME'
    },
    
    CUST_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Customer full name',
      field: 'CUST_NM'
    },
    
    HOME_ADDRESS: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Home address',
      field: 'HOME_ADDRESS'
    },
    
    EMAIL_ADDRESS: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      },
      comment: 'Email address',
      field: 'EMAIL_ADDRESS'
    },
    
    BU_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Business unit ID',
      field: 'BU_ID'
    },
    
    MAIDEN_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Maiden name',
      field: 'MAIDEN_NM'
    },
    
    BIRTH_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Birth date',
      field: 'BIRTH_DT'
    },
    
    CNTRY_OF_BIRTH_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Country of birth ID',
      field: 'CNTRY_OF_BIRTH_ID'
    },
    
    CUST_CAT: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Customer category',
      field: 'CUST_CAT'
    },
    
    CAMPAIGN_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Campaign ID',
      field: 'CAMPAIGN_ID'
    },
    
    GENDER_TY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Gender type',
      field: 'GENDER_TY'
    },
    
    COUNTRY_NM: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Country name',
      field: 'COUNTRY_NM'
    },
    
    STATE: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'State',
      field: 'STATE'
    },
    
    NIN: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'National Identity Number',
      field: 'NIN'
    },
    
    BVN: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Bank Verification Number',
      field: 'BVN'
    },
    
    LOCAL_GOV: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Local government',
      field: 'LOCAL_GOV'
    },
    
    OPENING_RSN_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Opening reason ID',
      field: 'OPENING_RSN_ID'
    },
    
    OPENED_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Account opened date',
      field: 'OPENED_DT'
    },
    
    RESIDENT_CNTRY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Resident country ID',
      field: 'RESIDENT_CNTRY_ID'
    },
    
    RISK_CLASS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Risk class',
      field: 'RISK_CLASS'
    },
    
    STMNT_FREQ_CD: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Statement frequency code',
      field: 'STMNT_FREQ_CD'
    },
    
    STMNT_FREQ_VALUE: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Statement frequency value',
      field: 'STMNT_FREQ_VALUE'
    },
    
    CREATED_BY: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Created by user',
      field: 'CREATED_BY'
    },
    
    USER_ID: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'User ID',
      field: 'USER_ID'
    },
    
    CREATE_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Create date',
      field: 'CREATE_DT'
    },
    
    INDUSTRY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Industry ID',
      field: 'INDUSTRY_ID'
    },
    
    INDUSTRY_CD: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Industry code',
      field: 'INDUSTRY_CD'
    },
    
    TAX_STATUS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Tax status',
      field: 'TAX_STATUS'
    },
    
    MARITAL_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Marital status',
      field: 'MARITAL_ST'
    },
    
    TAX_GRP_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Tax group ID',
      field: 'TAX_GRP_ID'
    },
    
    OPERATIONS_CRNCY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Operations currency ID',
      field: 'OPERATIONS_CRNCY_ID'
    },
    
    EMP_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Employment status',
      field: 'EMP_ST'
    },
    
    ORGANISATION_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Organization name',
      field: 'ORGANISATION_NM'
    },
    
    REGISTRATION_ADDRESS: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Registration address',
      field: 'REGISTRATION_ADDRESS'
    },
    
    REGISTRATION_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Registration date',
      field: 'REGISTRATION_DT'
    },
    
    ALERT_DELIVERY_METHOD: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Alert delivery method',
      field: 'ALERT_DELIVERY_METHOD'
    },
    
    KYC_LEVEL: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'KYC level',
      field: 'KYC_LEVEL'
    },
    
    PHONE_NO: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Phone number',
      field: 'PHONE_NO'
    },
    
    SMS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Enabled',
      comment: 'SMS status',
      field: 'SMS'
    },
    
    IS_PEP: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: 'Is Politically Exposed Person',
      field: 'IS_PEP'
    },
    
    SANCTION_SCORE: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 10,
      comment: 'Sanction score',
      field: 'SANCTION_SCORE'
    },
    
    DOCUMENT_VERIFICATION_STATUS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Pending',
      comment: 'Document verification status',
      field: 'DOCUMENT_VERIFICATION_STATUS'
    },
    
    REC_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'PENDING',
      comment: 'Record status',
      field: 'REC_ST'
    },
    
    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Pending',
      comment: 'Status',
      field: 'status'
    },
    
    APPROVED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Approved by user',
      field: 'APPROVED_BY'
    },
    
    APPROVED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Approval date',
      field: 'APPROVED_DT'
    },
    
    SUSPENDED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Suspended by user',
      field: 'SUSPENDED_BY'
    },
    
    SUSPENDED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Suspension date',
      field: 'SUSPENDED_DT'
    },
    
    CLOSED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Closed by user',
      field: 'CLOSED_BY'
    },
    
    CLOSED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Closure date',
      field: 'CLOSED_DT'
    },
    
    REJECTED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Rejected by user',
      field: 'REJECTED_BY'
    },
    
    REJECTED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Rejection date',
      field: 'REJECTED_DT'
    },
    
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    },
    
    // ⚠️ THESE COLUMNS DON'T EXIST IN YOUR DATABASE - REMOVE THEM:
    // customer_type_id: {
    //   type: DataTypes.INTEGER,
    //   allowNull: true,
    //   comment: 'Customer type ID',
    //   field: 'customer_type_id'
    // },
    
    // relationship_officer_id: {
    //   type: DataTypes.INTEGER,
    //   allowNull: true,
    //   comment: 'Relationship officer ID',
    //   field: 'relationship_officer_id'
    // },
  }, {
    tableName: 'customers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    freezeTableName: true,
    define: {
      underscored: false,
      freezeTableName: true
    },
    defaultScope: {
      attributes: {
        // Exclude non-existent fields from all queries
        exclude: ['customer_type_id', 'relationship_officer_id']
      }
    },
    hooks: {
      beforeCreate: async (customer) => {
        // Ensure email is lowercase
        if (customer.EMAIL_ADDRESS) {
          customer.EMAIL_ADDRESS = customer.EMAIL_ADDRESS.toLowerCase().trim();
        }
        
        // Ensure CUST_NM is set if not provided
        if (!customer.CUST_NM) {
          customer.CUST_NM = [customer.TITLE_ID, customer.FIRST_NAME, customer.LAST_NAME]
            .filter(Boolean)
            .join(' ');
        }
        
        // Set defaults if not provided
        if (!customer.REC_ST) customer.REC_ST = 'PENDING';
        if (!customer.status) customer.status = 'Pending';
        if (!customer.SMS) customer.SMS = 'Enabled';
        if (!customer.IS_PEP) customer.IS_PEP = false;
        if (!customer.SANCTION_SCORE) customer.SANCTION_SCORE = 10;
        if (!customer.DOCUMENT_VERIFICATION_STATUS) customer.DOCUMENT_VERIFICATION_STATUS = 'Pending';
        if (!customer.CREATE_DT) customer.CREATE_DT = new Date();
      },
      
      beforeSave: (customer) => {
        // Sync status and REC_ST fields
        if (customer.changed('REC_ST')) {
          switch(customer.REC_ST?.toUpperCase()) {
            case 'PENDING': customer.status = 'Pending'; break;
            case 'ACTIVE': customer.status = 'Active'; break;
            case 'APPROVED': customer.status = 'Approved'; break;
            case 'INACTIVE': customer.status = 'Inactive'; break;
            case 'CLOSED': customer.status = 'Closed'; break;
            case 'SUSPENDED': customer.status = 'Suspended'; break;
            case 'CANCELLED': customer.status = 'Cancelled'; break;
            case 'REJECTED': customer.status = 'Rejected'; break;
            default: customer.status = 'Pending';
          }
        }
        
        if (customer.changed('status')) {
          switch(customer.status?.toLowerCase()) {
            case 'pending': customer.REC_ST = 'PENDING'; break;
            case 'active': customer.REC_ST = 'ACTIVE'; break;
            case 'approved': customer.REC_ST = 'APPROVED'; break;
            case 'inactive': customer.REC_ST = 'INACTIVE'; break;
            case 'closed': customer.REC_ST = 'CLOSED'; break;
            case 'suspended': customer.REC_ST = 'SUSPENDED'; break;
            case 'cancelled': customer.REC_ST = 'CANCELLED'; break;
            case 'rejected': customer.REC_ST = 'REJECTED'; break;
            default: customer.REC_ST = 'PENDING';
          }
        }
      },
    },
    indexes: [
      { fields: ['CUST_ID'] },
      { fields: ['CUST_NO'] },
      { fields: ['BVN'] },
      { fields: ['NIN'] },
      { fields: ['EMAIL_ADDRESS'] },
      { fields: ['PHONE_NO'] },
      { fields: ['FIRST_NAME'] },
      { fields: ['LAST_NAME'] },
      { fields: ['CUST_NM'] },
      { fields: ['REC_ST'] },
      { fields: ['status'] },
      { fields: ['BU_ID'] },
      { fields: ['REC_ST', 'CREATE_DT'] },
      { fields: ['BU_ID', 'REC_ST'] },
      { fields: ['KYC_LEVEL', 'REC_ST'] },
      { fields: ['IS_PEP', 'REC_ST'] },
      { fields: ['created_at'] },
      { fields: ['updated_at'] }
    ]
  });

  // ========== ASSOCIATIONS ==========
  CustomerModel.associate = (models) => {
    // Remove or comment out associations that reference non-existent fields
    /*
    CustomerModel.hasMany(models.NextOfKin, {
      foreignKey: 'customerId',
      as: 'nextOfKin',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
    */
  };

  // ========== STATIC METHODS ==========
  // ... keep your static methods but remove references to non-existent fields

  // ========== INSTANCE METHODS ==========
  CustomerModel.prototype.getFullName = function() {
    return [this.TITLE_ID, this.FIRST_NAME, this.MIDDLE_NAME, this.LAST_NAME]
      .filter(Boolean)
      .join(' ');
  };

  CustomerModel.prototype.getAge = function() {
    if (!this.BIRTH_DT) return null;
    const today = new Date();
    const birthDate = new Date(this.BIRTH_DT);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  CustomerModel.prototype.activate = async function(activatedBy) {
    this.REC_ST = 'ACTIVE';
    this.status = 'Active';
    this.APPROVED_BY = activatedBy;
    this.APPROVED_DT = new Date();
    return await this.save();
  };

  CustomerModel.prototype.suspend = async function(suspendedBy) {
    this.REC_ST = 'SUSPENDED';
    this.status = 'Suspended';
    this.SUSPENDED_BY = suspendedBy;
    this.SUSPENDED_DT = new Date();
    return await this.save();
  };

  CustomerModel.prototype.close = async function(closedBy) {
    this.REC_ST = 'CLOSED';
    this.status = 'Closed';
    this.CLOSED_BY = closedBy;
    this.CLOSED_DT = new Date();
    return await this.save();
  };

  CustomerModel.prototype.getSummary = function() {
    return {
      customerId: this.CUST_ID,
      customerNo: this.CUST_NO,
      name: this.getFullName(),
      email: this.EMAIL_ADDRESS,
      phone: this.PHONE_NO,
      bvn: this.BVN,
      nin: this.NIN,
      status: this.status,
      recordStatus: this.REC_ST,
      businessUnit: this.BU_ID,
      kycLevel: this.KYC_LEVEL,
      isPep: this.IS_PEP,
      createdDate: this.CREATE_DT,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  };

  CustomerModel.prototype.isActive = function() {
    return this.REC_ST === 'ACTIVE';
  };

  CustomerModel.prototype.isPending = function() {
    return this.REC_ST === 'PENDING';
  };

  CustomerModel.prototype.hasCompleteKYC = function() {
    return this.KYC_LEVEL === 'COMPLETE' || this.KYC_LEVEL === 'FULL';
  };

  return CustomerModel;
};

export default Customer;