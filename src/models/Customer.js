// src/models/Customer.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Customer extends Model {}

Customer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },
    CUST_ID: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CUST_ID'
    },
    CUST_NO: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CUST_NO'
    },
    TITLE_ID: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'TITLE_ID'
    },
    FIRST_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'FIRST_NAME'
    },
    MIDDLE_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'MIDDLE_NAME'
    },
    LAST_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'LAST_NAME'
    },
    CUST_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CUST_NM'
    },
    HOME_ADDRESS: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'HOME_ADDRESS'
    },
    EMAIL_ADDRESS: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'EMAIL_ADDRESS'
    },
    BU_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'BU_ID'
    },
    MAIDEN_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'MAIDEN_NM'
    },
    BIRTH_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'BIRTH_DT'
    },
    CNTRY_OF_BIRTH_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CNTRY_OF_BIRTH_ID'
    },
    CUST_CAT: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CUST_CAT'
    },
    customerType: {
      type: DataTypes.ENUM(
        'NORMAL', 
        'RESTRICTED', 
        'VIP', 
        'INDIVIDUAL', 
        'STUDENT', 
        'MINOR', 
        'SME', 
        'CORPORATE', 
        'PREMIUM',
        'NON-RESIDENT',
        'FOREIGN',
        'GOVERNMENT',
        'NGO',
        'FOREIGN_DIPLOMAT'
      ),
      allowNull: false,
      defaultValue: 'NORMAL',
      field: 'customer_type'
    },
    CAMPAIGN_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CAMPAIGN_ID'
    },
    GENDER_TY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'GENDER_TY'
    },
    COUNTRY_NM: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'COUNTRY_NM'
    },
    STATE: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'STATE'
    },
    NIN: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'NIN'
    },
    BVN: {
      type: DataTypes.STRING(11),
      allowNull: true,
      field: 'BVN',
      validate: { len: [0, 11] }
    },
    BVN_VERIFIED: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      field: 'BVN_VERIFIED'
    },
    BVN_VERIFIED_AT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'BVN_VERIFIED_AT'
    },
    LOCAL_GOV: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'LOCAL_GOV'
    },
    OPENING_RSN_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'OPENING_RSN_ID'
    },
    OPENED_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'OPENED_DT'
    },
    RESIDENT_CNTRY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'RESIDENT_CNTRY_ID'
    },
    RISK_CLASS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'RISK_CLASS'
    },
    STMNT_FREQ_CD: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'STMNT_FREQ_CD'
    },
    STMNT_FREQ_VALUE: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'STMNT_FREQ_VALUE'
    },
    CREATED_BY: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CREATED_BY'
    },
    CREATED_BY_FULLNAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CREATED_BY_FULLNAME'
    },
    CREATED_BY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CREATED_BY_ID'
    },
    USER_ID: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'USER_ID'
    },
    CREATE_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'CREATE_DT'
    },
    INDUSTRY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'INDUSTRY_ID'
    },
    INDUSTRY_CD: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'INDUSTRY_CD'
    },
    TAX_STATUS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'TAX_STATUS'
    },
    MARITAL_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'MARITAL_ST'
    },
    TAX_GRP_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'TAX_GRP_ID'
    },
    OPERATIONS_CRNCY_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'OPERATIONS_CRNCY_ID'
    },
    // ============================================
    // ? EMPLOYMENT FIELDS
    // ============================================
    EMP_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'EMP_ST',
      comment: 'Employment status'
    },
    EMPLOYER_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'EMPLOYER_NAME',
      comment: 'Name of employer or business'
    },
    EMPLOYER_ADDRESS: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'EMPLOYER_ADDRESS',
      comment: 'Address of employer or business'
    },
    EMPLOYER_PHONE: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'EMPLOYER_PHONE',
      comment: 'Phone number of employer or business'
    },
    EMPLOYER_EMAIL: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'EMPLOYER_EMAIL',
      comment: 'Email address of employer or business'
    },
    JOB_TITLE: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'JOB_TITLE',
      comment: 'Job title or position'
    },
    YEARS_WORKED: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'YEARS_WORKED',
      comment: 'Number of years at current employer'
    },
    ORGANISATION_NM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'ORGANISATION_NM'
    },
    REGISTRATION_ADDRESS: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'REGISTRATION_ADDRESS'
    },
    REGISTRATION_DT: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'REGISTRATION_DT'
    },
    REGISTRATION_NO: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      field: 'REGISTRATION_NO'
    },
    ALERT_DELIVERY_METHOD: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'ALERT_DELIVERY_METHOD'
    },
    KYC_LEVEL: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'KYC_LEVEL'
    },
    PHONE_NO: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'PHONE_NO'
    },
    SMS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Enabled',
      field: 'SMS'
    },
    IS_PEP: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      field: 'IS_PEP'
    },
    SANCTION_SCORE: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 10,
      field: 'SANCTION_SCORE'
    },
    DOCUMENT_VERIFICATION_STATUS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Pending',
      field: 'DOCUMENT_VERIFICATION_STATUS'
    },
    REC_ST: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'PENDING',
      field: 'REC_ST'
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Pending',
      field: 'status'
    },
    APPROVED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'APPROVED_BY'
    },
    APPROVED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'APPROVED_DT'
    },
    SUSPENDED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'SUSPENDED_BY'
    },
    SUSPENDED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'SUSPENDED_DT'
    },
    CLOSED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'CLOSED_BY'
    },
    CLOSED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'CLOSED_DT'
    },
    REJECTED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'REJECTED_BY'
    },
    REJECTED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'REJECTED_DT'
    },
    REJECTION_REASON: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'REJECTION_REASON',
      comment: 'Stores the reason why the customer was rejected'
    },
    groupId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'group_id',
      comment: 'Stores the group code/ID like GRP001, GRP002, etc.'
    },
    groupJoinedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'group_joined_at',
      comment: 'Timestamp when customer joined the group'
    },
    // =============================================
    // ? EXTERNAL BANK TRANSFER FIELDS
    // =============================================
    customer_code: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
      field: 'customer_code',
      comment: 'Unique customer code (EVO-12345) for external bank transfers'
    },
    payment_reference: {
      type: DataTypes.STRING(30),
      allowNull: true,
      unique: true,
      field: 'payment_reference',
      comment: 'Unique payment reference (INV-2024-001) for external bank transfers'
    },
    external_account_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'external_account_number',
      comment: 'Customer\'s account number in external bank (First Bank, UBA, etc.)'
    },
    external_bank_name: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'external_bank_name',
      comment: 'Customer\'s external bank name (First Bank, UBA, GTBank, etc.)'
    },
    evolution_account_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'evolution_account_number',
      comment: 'Customer\'s Evolution Banking account number'
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
    }
  },
  {
    sequelize,
    modelName: 'Customer',
    tableName: 'customers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    freezeTableName: true,
    hooks: {
      beforeCreate: async (customer, options) => {
        // Auto-generate customer_code if not provided
        if (!customer.customer_code) {
          const random = Math.floor(10000 + Math.random() * 90000);
          customer.customer_code = `EVO-${random}`;
        }
      },
      afterCreate: async (customer, options) => {
        if (customer.groupId) {
          try {
            await Customer.assignToGroup(customer.id, customer.groupId, {
              transaction: options.transaction
            });
          } catch (error) {
            console.error('Error in afterCreate hook for group assignment:', error.message);
          }
        }
      },
      afterBulkCreate: async (customers, options) => {
        const customersWithGroups = customers.filter(c => c.groupId);
        if (customersWithGroups.length > 0) {
          for (const customer of customersWithGroups) {
            try {
              await Customer.assignToGroup(customer.id, customer.groupId, {
                transaction: options.transaction,
                skipCustomerUpdate: true
              });
            } catch (error) {
              console.error('Error in afterBulkCreate hook for group assignments:', error.message);
            }
          }
        }
      }
    }
  }
);

// ========== INSTANCE METHODS ==========
Customer.prototype.getFullName = function() {
  return [this.TITLE_ID, this.FIRST_NAME, this.MIDDLE_NAME, this.LAST_NAME]
    .filter(Boolean)
    .join(' ');
};

Customer.prototype.getAge = function() {
  if (!this.BIRTH_DT) return null;
  const today = new Date();
  const birthDate = new Date(this.BIRTH_DT);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

Customer.prototype.activate = async function(activatedBy) {
  this.REC_ST = 'ACTIVE';
  this.status = 'Active';
  this.APPROVED_BY = activatedBy;
  this.APPROVED_DT = new Date();
  return await this.save();
};

Customer.prototype.suspend = async function(suspendedBy) {
  this.REC_ST = 'SUSPENDED';
  this.status = 'Suspended';
  this.SUSPENDED_BY = suspendedBy;
  this.SUSPENDED_DT = new Date();
  return await this.save();
};

Customer.prototype.close = async function(closedBy) {
  this.REC_ST = 'CLOSED';
  this.status = 'Closed';
  this.CLOSED_BY = closedBy;
  this.CLOSED_DT = new Date();
  return await this.save();
};

Customer.prototype.reject = async function(rejectedBy, rejectionReason) {
  this.REC_ST = 'REJECTED';
  this.status = 'Rejected';
  this.REJECTED_BY = rejectedBy;
  this.REJECTED_DT = new Date();
  this.REJECTION_REASON = rejectionReason || 'No reason provided';
  return await this.save();
};

Customer.prototype.assignToGroup = async function(groupId, options = {}) {
  return Customer.assignToGroup(this.id, groupId, options);
};

Customer.prototype.removeFromGroup = async function(options = {}) {
  if (!this.groupId) return { success: false, message: 'Customer is not assigned to any group' };
  return Customer.removeFromGroup(this.id, options);
};

Customer.prototype.getGroupDetails = async function() {
  if (!this.groupId) return null;
  try {
    const Group = (await import('./Group.js')).default;
    return await Group.findOne({ where: { groupCode: this.groupId } });
  } catch (error) {
    console.error('Error fetching group details:', error.message);
    return null;
  }
};

// ? Updated getSummary to include employment and external transfer fields
Customer.prototype.getSummary = function() {
  return {
    customerId: this.CUST_ID,
    customerNo: this.CUST_NO,
    name: this.getFullName(),
    email: this.EMAIL_ADDRESS,
    phone: this.PHONE_NO,
    bvn: this.BVN,
    bvnVerified: this.BVN_VERIFIED,
    bvnVerifiedAt: this.BVN_VERIFIED_AT,
    nin: this.NIN,
    registrationNo: this.REGISTRATION_NO || null,
    status: this.status,
    recordStatus: this.REC_ST,
    businessUnit: this.BU_ID,
    kycLevel: this.KYC_LEVEL,
    isPep: this.IS_PEP,
    customerType: this.customerType,
    groupId: this.groupId,
    groupJoinedAt: this.groupJoinedAt,
    createdDate: this.CREATE_DT,
    rejectionReason: this.REJECTION_REASON || null,
    // ? Employment fields
    employmentStatus: this.EMP_ST,
    employerName: this.EMPLOYER_NAME,
    employerAddress: this.EMPLOYER_ADDRESS,
    employerPhone: this.EMPLOYER_PHONE,
    employerEmail: this.EMPLOYER_EMAIL,
    jobTitle: this.JOB_TITLE,
    yearsWorked: this.YEARS_WORKED,
    // ? External transfer fields
    customerCode: this.customer_code,
    paymentReference: this.payment_reference,
    externalAccountNumber: this.external_account_number,
    externalBankName: this.external_bank_name,
    evolutionAccountNumber: this.evolution_account_number,
    createdAt: this.created_at,
    updatedAt: this.updated_at
  };
};

Customer.prototype.isActive = function() {
  return this.REC_ST === 'ACTIVE';
};

Customer.prototype.isPending = function() {
  return this.REC_ST === 'PENDING';
};

Customer.prototype.isRejected = function() {
  return this.REC_ST === 'REJECTED';
};

Customer.prototype.hasCompleteKYC = function() {
  return this.KYC_LEVEL === 'COMPLETE' || this.KYC_LEVEL === 'FULL';
};

Customer.prototype.isBVNVerified = function() {
  return this.BVN_VERIFIED === true;
};

// ? New method to get employment info
Customer.prototype.getEmploymentInfo = function() {
  return {
    employmentStatus: this.EMP_ST,
    employerName: this.EMPLOYER_NAME,
    employerAddress: this.EMPLOYER_ADDRESS,
    employerPhone: this.EMPLOYER_PHONE,
    employerEmail: this.EMPLOYER_EMAIL,
    jobTitle: this.JOB_TITLE,
    yearsWorked: this.YEARS_WORKED
  };
};

// ? New method to get external transfer info
Customer.prototype.getExternalTransferInfo = function() {
  return {
    customerCode: this.customer_code,
    evolutionAccount: this.evolution_account_number,
    externalAccount: this.external_account_number,
    externalBank: this.external_bank_name,
    name: this.getFullName()
  };
};

// ========== STATIC METHODS ==========
Customer.assignToGroup = async function(customerId, groupCode, options = {}) {
  const transaction = options.transaction;
  const skipCustomerUpdate = options.skipCustomerUpdate || false;
  try {
    const Group = (await import('./Group.js')).default;
    const customer = await Customer.findByPk(customerId, { transaction });
    if (!customer) throw new Error(`Customer with ID ${customerId} not found`);
    const group = await Group.findOne({ where: { groupCode: groupCode.toUpperCase() } }, { transaction });
    if (!group) throw new Error(`Group with code ${groupCode} not found`);
    if (group.status !== 'active') throw new Error(`Group is not active (current status: ${group.status})`);
    if (!group.canAddMember()) throw new Error(`Group has reached maximum member limit (${group.maxMembers})`);
    if (customer.groupId === groupCode) return { success: false, message: 'Customer is already assigned to this group', customer, group };
    if (customer.groupId && customer.groupId !== groupCode) await Customer.removeFromGroup(customerId, { transaction, skipGroupUpdate: true });
    if (!skipCustomerUpdate) {
      customer.set('groupId', groupCode);
      customer.set('groupJoinedAt', new Date());
      await customer.save({ transaction });
    }
    await group.addMember(customer.CUST_ID);
    return { success: true, message: 'Customer successfully assigned to group', customer: skipCustomerUpdate ? customerId : customer, group };
  } catch (error) {
    console.error('Error in assignToGroup:', error.message);
    throw error;
  }
};

Customer.removeFromGroup = async function(customerId, options = {}) {
  const transaction = options.transaction;
  const skipGroupUpdate = options.skipGroupUpdate || false;
  try {
    const Group = (await import('./Group.js')).default;
    const customer = await Customer.findByPk(customerId, { transaction });
    if (!customer) throw new Error(`Customer with ID ${customerId} not found`);
    if (!customer.groupId) return { success: false, message: 'Customer is not assigned to any group', customer };
    const oldGroupCode = customer.groupId;
    if (!skipGroupUpdate) {
      const group = await Group.findOne({ where: { groupCode: oldGroupCode } }, { transaction });
      if (group) await group.removeMember(customer.CUST_ID);
    }
    customer.set('groupId', null);
    customer.set('groupJoinedAt', null);
    await customer.save({ transaction });
    return { success: true, message: 'Customer successfully removed from group', customer, previousGroupId: oldGroupCode };
  } catch (error) {
    console.error('Error in removeFromGroup:', error.message);
    throw error;
  }
};

Customer.bulkAssignToGroup = async function(customerIds, groupCode, options = {}) {
  const transaction = options.transaction || await sequelize.transaction();
  const results = { success: [], failed: [], total: customerIds.length, successCount: 0, failedCount: 0 };
  try {
    const Group = (await import('./Group.js')).default;
    const group = await Group.findOne({ where: { groupCode: groupCode.toUpperCase() } }, { transaction });
    if (!group) throw new Error(`Group with code ${groupCode} not found`);
    if (group.status !== 'active') throw new Error(`Group is not active (current status: ${group.status})`);
    for (const customerId of customerIds) {
      try {
        const result = await Customer.assignToGroup(customerId, groupCode, { transaction, skipCustomerUpdate: false });
        if (result.success) {
          results.success.push(customerId);
          results.successCount++;
        } else {
          results.failed.push({ id: customerId, reason: result.message });
          results.failedCount++;
        }
      } catch (error) {
        results.failed.push({ id: customerId, reason: error.message });
        results.failedCount++;
      }
    }
    if (!options.transaction) await transaction.commit();
    return results;
  } catch (error) {
    if (!options.transaction) await transaction.rollback();
    throw error;
  }
};

Customer.getByGroupCode = async function(groupCode, options = {}) {
  const { page = 1, limit = 50, status } = options;
  const offset = (page - 1) * limit;
  const where = { groupId: groupCode };
  if (status) where.REC_ST = status;
  const { count, rows } = await Customer.findAndCountAll({
    where,
    attributes: [
      'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 
      'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'NIN', 'status', 'REC_ST', 
      'REJECTION_REASON', 'groupJoinedAt', 'customer_code', 'evolution_account_number',
      'external_account_number', 'external_bank_name', 'customerType',
      // ? Employment fields
      'EMP_ST', 'EMPLOYER_NAME', 'EMPLOYER_ADDRESS', 'EMPLOYER_PHONE', 
      'EMPLOYER_EMAIL', 'JOB_TITLE', 'YEARS_WORKED'
    ],
    offset,
    limit: parseInt(limit),
    order: [['groupJoinedAt', 'DESC']]
  });
  return { customers: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / limit) } };
};

Customer.createWithGroup = async function(customerData, options = {}) {
  const transaction = options.transaction || await sequelize.transaction();
  try {
    const { groupId, ...customerFields } = customerData;
    const customer = await Customer.create(customerFields, { transaction });
    if (groupId) await Customer.assignToGroup(customer.id, groupId, { transaction });
    if (!options.transaction) await transaction.commit();
    return customer;
  } catch (error) {
    if (!options.transaction) await transaction.rollback();
    throw error;
  }
};

Customer.bulkCreateWithGroups = async function(customersData, options = {}) {
  const transaction = options.transaction || await sequelize.transaction();
  try {
    const customersWithGroups = customersData.filter(data => data.groupId);
    const customersWithoutGroups = customersData.filter(data => !data.groupId);
    const createdCustomers = [];
    if (customersWithoutGroups.length > 0) {
      const simpleCustomers = await Customer.bulkCreate(customersWithoutGroups, { transaction, returning: true });
      createdCustomers.push(...simpleCustomers);
    }
    for (const customerData of customersWithGroups) {
      const { groupId, ...fields } = customerData;
      const customer = await Customer.create(fields, { transaction });
      try {
        await Customer.assignToGroup(customer.id, groupId, { transaction, skipCustomerUpdate: false });
        createdCustomers.push(customer);
      } catch (groupError) {
        console.error(`Failed to assign customer ${customer.id} to group ${groupId}:`, groupError.message);
        createdCustomers.push(customer);
      }
    }
    if (!options.transaction) await transaction.commit();
    return createdCustomers;
  } catch (error) {
    if (!options.transaction) await transaction.rollback();
    throw error;
  }
};

Customer.getWithBVN = async function(customerId) {
  return this.findByPk(customerId, {
    attributes: [
      'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 
      'BVN', 'BVN_VERIFIED', 'BVN_VERIFIED_AT', 'PHONE_NO', 
      'EMAIL_ADDRESS', 'status', 'REC_ST', 'REJECTION_REASON', 
      'groupId', 'groupJoinedAt', 'customer_code', 'evolution_account_number',
      'customerType',
      // ? Employment fields
      'EMP_ST', 'EMPLOYER_NAME', 'EMPLOYER_ADDRESS', 'JOB_TITLE'
    ]
  });
};

Customer.getLoanDetails = async function(customerId) {
  try {
    const LoanAccount = (await import('./LoanAccount.js')).default;
    return await this.findByPk(customerId, {
      attributes: [
        'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 
        'BVN', 'BVN_VERIFIED', 'PHONE_NO', 'EMAIL_ADDRESS', 
        'REJECTION_REASON', 'groupId', 'groupJoinedAt', 
        'customer_code', 'evolution_account_number', 'customerType',
        // ? Employment fields
        'EMP_ST', 'EMPLOYER_NAME', 'EMPLOYER_ADDRESS', 'JOB_TITLE'
      ],
      include: [{ model: LoanAccount, as: 'loanAccounts', required: false, separate: true, limit: 10, order: [['created_at', 'DESC']] }]
    });
  } catch (error) {
    console.error('Error in Customer.getLoanDetails:', error.message);
    return null;
  }
};

Customer.findByBVN = async function(bvn) {
  return this.findOne({ 
    where: { BVN: bvn }, 
    attributes: [
      'id', 'CUST_ID', 'FIRST_NAME', 'LAST_NAME', 'BVN', 
      'BVN_VERIFIED', 'PHONE_NO', 'EMAIL_ADDRESS', 
      'REJECTION_REASON', 'groupId', 'customer_code', 
      'evolution_account_number', 'customerType',
      // ? Employment fields
      'EMP_ST', 'EMPLOYER_NAME', 'JOB_TITLE'
    ] 
  });
};

Customer.findByCustomerCode = async function(customerCode) {
  return this.findOne({ 
    where: { customer_code: customerCode },
    attributes: [
      'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 
      'CUST_NM', 'PHONE_NO', 'EMAIL_ADDRESS', 'customer_code', 
      'evolution_account_number', 'external_account_number', 
      'external_bank_name', 'customerType',
      // ? Employment fields
      'EMP_ST', 'EMPLOYER_NAME', 'JOB_TITLE'
    ]
  });
};

Customer.findByEvolutionAccount = async function(accountNumber) {
  return this.findOne({ 
    where: { evolution_account_number: accountNumber },
    attributes: [
      'id', 'CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 
      'CUST_NM', 'PHONE_NO', 'EMAIL_ADDRESS', 'customer_code', 
      'evolution_account_number', 'customerType',
      // ? Employment fields
      'EMP_ST', 'EMPLOYER_NAME'
    ]
  });
};

Customer.updateBVNVerification = async function(customerId, verified, verificationData = {}) {
  const customer = await this.findByPk(customerId);
  if (!customer) throw new Error('Customer not found');
  customer.BVN_VERIFIED = verified;
  customer.BVN_VERIFIED_AT = verified ? new Date() : null;
  if (verificationData.bvn) customer.BVN = verificationData.bvn;
  await customer.save();
  return customer;
};

Customer.hasActiveLoan = async function(customerId) {
  try {
    const LoanAccount = (await import('./LoanAccount.js')).default;
    const activeLoan = await LoanAccount.findOne({ where: { customer_id: customerId, status: 'ACTIVE' } });
    return !!activeLoan;
  } catch (error) {
    console.error('Error checking active loan:', error.message);
    return false;
  }
};

Customer.getFullSummary = async function(customerId) {
  const customer = await this.findByPk(customerId);
  if (!customer) return null;
  const hasActiveLoan = await this.hasActiveLoan(customerId);
  const loanDetails = await this.getLoanDetails(customerId);
  const groupDetails = customer.groupId ? await customer.getGroupDetails() : null;
  const activeLoans = loanDetails?.loanAccounts?.filter(loan => loan.status === 'ACTIVE') || [];
  const totalOutstanding = activeLoans.reduce((sum, loan) => sum + parseFloat(loan.outstanding_balance || 0), 0);
  return {
    ...customer.getSummary(),
    groupInfo: groupDetails ? {
      groupId: groupDetails.id,
      groupCode: groupDetails.groupCode,
      groupName: groupDetails.groupName,
      joinedAt: customer.groupJoinedAt
    } : null,
    loanStatus: {
      hasActiveLoan,
      activeLoanCount: activeLoans.length,
      totalOutstandingBalance: totalOutstanding,
      totalLoans: loanDetails?.loanAccounts?.length || 0
    }
  };
};

export default Customer;
