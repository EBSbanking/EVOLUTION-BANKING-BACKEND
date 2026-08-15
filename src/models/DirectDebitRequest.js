// models/DirectDebitRequest.js - Normalised version
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DirectDebitRequest extends Model {
  // Static methods – using camelCase attribute names
  static async findById(requestId, options = {}) {
    return this.findOne({ where: { directDrReqId: requestId }, ...options });
  }

  static async findBySourceAccount(accountId, options = {}) {
    return this.findAll({
      where: { fromAcctId: accountId },
      order: [['nextReqDt', 'ASC']],
      ...options
    });
  }

  static async findByPayeeAccount(accountNumber, options = {}) {
    return this.findAll({
      where: { payeeAcctNo: accountNumber },
      order: [['nextReqDt', 'ASC']],
      ...options
    });
  }

  static async findByPayeeName(payeeName, options = {}) {
    return this.findAll({
      where: { payeeNm: { [Op.like]: `%${payeeName}%` } },
      order: [['payeeNm', 'ASC'], ['nextReqDt', 'ASC']],
      ...options
    });
  }

  static async findDueForProcessing(date = new Date(), options = {}) {
    return this.findAll({
      where: {
        recSt: 'A',
        nextReqDt: { [Op.lte]: date },
        [Op.or]: [
          { expiryDt: null },
          { expiryDt: { [Op.gt]: date } }
        ]
      },
      order: [['nextReqDt', 'ASC']],
      limit: options.limit || 100,
      ...options
    });
  }

  static async findForAutoCollection(loanAccountNo, date = new Date(), options = {}) {
    return this.findAll({
      where: {
        loanAccountNo,
        autoCollectionEnabled: true,
        recSt: { [Op.in]: ['A', 'P'] },
        nextReqDt: { [Op.lte]: date },
        [Op.or]: [
          { expiryDt: null },
          { expiryDt: { [Op.gt]: date } }
        ]
      },
      order: [['collectionPriority', 'ASC'], ['nextReqDt', 'ASC']],
      limit: options.limit || 10,
      ...options
    });
  }

  static async getSummaryByStatus() {
    const results = await this.findAll({
      attributes: [
        'recSt',
        [sequelize.fn('COUNT', sequelize.col('directDrReqId')), 'count'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN regularPayAmt IS NOT NULL THEN regularPayAmt ELSE 0 END')), 'totalRegularAmount'],
        [sequelize.fn('AVG', sequelize.literal('CASE WHEN regularPayAmt IS NOT NULL THEN regularPayAmt ELSE 0 END')), 'averageRegularAmount']
      ],
      group: ['recSt'],
      raw: true
    });
    const summary = { active: { count: 0, totalRegularAmount: 0, averageRegularAmount: 0 },
                      inactive: { count: 0, totalRegularAmount: 0, averageRegularAmount: 0 },
                      pending: { count: 0, totalRegularAmount: 0, averageRegularAmount: 0 } };
    results.forEach(result => {
      let status;
      switch (result.recSt) {
        case 'A': status = 'active'; break;
        case 'I': status = 'inactive'; break;
        case 'P': status = 'pending'; break;
        default: status = 'other';
      }
      if (summary[status]) {
        summary[status] = {
          count: parseInt(result.count) || 0,
          totalRegularAmount: parseFloat(result.totalRegularAmount) || 0,
          averageRegularAmount: parseFloat(result.averageRegularAmount) || 0
        };
      }
    });
    return summary;
  }

  static async calculateNextRequests(requestId) {
    const request = await this.findByPk(requestId);
    if (!request) throw new Error('Direct debit request not found');
    const requestSchedule = [];
    let currentDate = new Date(request.nextReqDt);
    for (let i = 0; i < (request.noOfPayments || 12); i++) {
      let paymentAmount;
      if (i === 0 && request.firstPayAmt) paymentAmount = parseFloat(request.firstPayAmt);
      else if (i === (request.noOfPayments - 1) && request.lastPayAmt) paymentAmount = parseFloat(request.lastPayAmt);
      else paymentAmount = parseFloat(request.regularPayAmt) || 0;
      requestSchedule.push({
        requestNumber: i + 1,
        requestDate: new Date(currentDate),
        amount: paymentAmount,
        currency: i === 0 ? request.firstPayCrncyId :
                 i === (request.noOfPayments - 1) ? request.lastPayCrncyId : request.regularPayCrncyId,
        status: currentDate <= new Date() ? 'Due' : 'Upcoming'
      });
      if (request.noOfPayments > 0 && i >= request.noOfPayments - 1) break;
      if (request.expiryDt && currentDate > request.expiryDt) break;
      switch (request.payFreqCd) {
        case 'DAILY': currentDate.setDate(currentDate.getDate() + request.payFreqValue); break;
        case 'WEEKLY': currentDate.setDate(currentDate.getDate() + (7 * request.payFreqValue)); break;
        case 'MONTHLY': currentDate.setMonth(currentDate.getMonth() + request.payFreqValue); break;
        case 'QUARTERLY': currentDate.setMonth(currentDate.getMonth() + (3 * request.payFreqValue)); break;
        case 'YEARLY': currentDate.setFullYear(currentDate.getFullYear() + request.payFreqValue); break;
        default: currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }
    return { requestId: request.directDrReqId, totalPayments: request.noOfPayments || 'Unlimited',
             nextRequestDate: request.nextReqDt, expiryDate: request.expiryDt, requestSchedule };
  }

  static async processRequest(requestId, userId) {
    const request = await this.findByPk(requestId);
    if (!request) throw new Error('Direct debit request not found');
    if (request.recSt !== 'A') throw new Error('Request is not active');
    const now = new Date();
    if (request.nextReqDt > now) throw new Error('Request not due yet');
    if (request.expiryDt && request.expiryDt < now) throw new Error('Request expired');
    let paymentAmount, paymentCurrency, isFirstPayment = false, isLastPayment = false;
    if (request.firstPayAmt && request.nextReqDt.toDateString() === request.createDt.toDateString()) {
      paymentAmount = parseFloat(request.firstPayAmt);
      paymentCurrency = request.firstPayCrncyId;
      isFirstPayment = true;
    } else if (request.noOfPayments > 0 && request.lastPayAmt) {
      paymentAmount = parseFloat(request.lastPayAmt);
      paymentCurrency = request.lastPayCrncyId;
      isLastPayment = true;
    } else {
      paymentAmount = parseFloat(request.regularPayAmt) || 0;
      paymentCurrency = request.regularPayCrncyId;
    }
    if (paymentAmount <= 0) throw new Error('Invalid payment amount');
    let nextRequestDate = new Date(request.nextReqDt);
    switch (request.payFreqCd) {
      case 'DAILY': nextRequestDate.setDate(nextRequestDate.getDate() + request.payFreqValue); break;
      case 'WEEKLY': nextRequestDate.setDate(nextRequestDate.getDate() + (7 * request.payFreqValue)); break;
      case 'MONTHLY': nextRequestDate.setMonth(nextRequestDate.getMonth() + request.payFreqValue); break;
      case 'QUARTERLY': nextRequestDate.setMonth(nextRequestDate.getMonth() + (3 * request.payFreqValue)); break;
      case 'YEARLY': nextRequestDate.setFullYear(nextRequestDate.getFullYear() + request.payFreqValue); break;
      default: nextRequestDate.setMonth(nextRequestDate.getMonth() + 1);
    }
    let newStatus = request.recSt;
    if (isLastPayment) newStatus = 'I';
    await request.update({ nextReqDt: nextRequestDate, rowTs: now, recSt: newStatus, versionNo: request.versionNo + 1 });
    return { success: true, requestId: request.directDrReqId, paymentAmount, paymentCurrency,
             fromAccountId: request.fromAcctId, payeeAccount: request.payeeAcctNo, payeeName: request.payeeNm,
             bankName: request.bankNm, branchName: request.branchNm, processedDate: now, nextRequestDate,
             isFirstPayment, isLastPayment, statusAfterProcessing: newStatus };
  }

  static async createDirectDebitFromRequest(requestId, userId) {
    const request = await this.findByPk(requestId);
    if (!request) throw new Error('Direct debit request not found');
    const processResult = await this.processRequest(requestId, userId);
    if (!processResult.success) throw new Error('Failed to process request');
    const { default: DirectDebit } = await import('./DirectDebit.js');
    const directDebitData = {
      directDrId: `DD_${request.directDrReqId}_${Date.now()}`,
      fromDepositAcctNo: request.fromAcctId.toString(),
      directDrDesc: request.directDrReqDesc || `Direct debit from request ${request.directDrReqId}`,
      directDrMandateTyCd: request.directDrMandateTyCd || 'STANDARD',
      xferMthdCd: 'AUTO',
      payCrncyId: processResult.paymentCurrency,
      payAmt: processResult.paymentAmount,
      toDepositAcctNo: request.payeeAcctNo,
      maxPayAmt: processResult.paymentAmount,
      schedTyCd: request.schedTyCd || 'FIXED',
      nextPayDt: request.nextReqDt,
      noOfPayments: 1,
      payFreqCd: 'ONCE',
      payFreqValue: 0,
      expiryDt: request.expiryDt,
      nonBusDueDtOptnCd: request.nonBusDtOptnCd,
      refTxt: `Request: ${request.directDrReqId}`,
      supplementaryRefTxt: request.supplementaryInstr,
      payRsnId: 1,
      svceProviderId: request.bankCd,
      beneficiaryId: request.payeeAcctId || request.payeeAcctNo,
      supplementaryInstruction: request.supplementaryInstr,
      loanAccountNo: request.loanAccountNo,
      loanId: request.loanId,
      recSt: 'Y',
      versionNo: 1,
      rowTs: new Date(),
      userId: userId,
      createDt: new Date(),
      createdBy: userId,
      sysCreateTs: new Date()
    };
    const directDebit = await DirectDebit.create(directDebitData);
    return { success: true, requestProcessed: processResult, directDebit, message: 'Direct debit created successfully' };
  }

  async processForAutoCollection(userId = 'SYSTEM', transaction) {
    try {
      const validation = this.validateForProcessing();
      if (!validation.isValid) return { success: false, errors: validation.errors };
      let paymentAmount = this.currentPaymentAmount;
      let paymentCurrency = this.currentPaymentCurrency;
      if (paymentAmount <= 0) return { success: false, error: 'Invalid payment amount' };
      const { default: DirectDebit } = await import('./DirectDebit.js');
      const directDebitData = {
        directDrId: `DD_${this.directDrReqId}_${Date.now()}`,
        fromDepositAcctNo: this.fromAcctId.toString(),
        directDrDesc: this.directDrReqDesc || `Auto-collection for loan ${this.loanAccountNo}`,
        directDrMandateTyCd: this.directDrMandateTyCd || 'STANDARD',
        xferMthdCd: 'AUTO',
        payCrncyId: paymentCurrency,
        payAmt: paymentAmount,
        toDepositAcctNo: this.payeeAcctNo,
        maxPayAmt: paymentAmount,
        schedTyCd: this.schedTyCd || 'FIXED',
        nextPayDt: this.nextReqDt,
        noOfPayments: 1,
        payFreqCd: 'ONCE',
        payFreqValue: 0,
        expiryDt: this.expiryDt,
        nonBusDueDtOptnCd: this.nonBusDtOptnCd,
        refTxt: `Loan: ${this.loanAccountNo}`,
        supplementaryRefTxt: this.supplementaryInstr,
        payRsnId: 1,
        svceProviderId: this.bankCd,
        beneficiaryId: this.payeeAcctNo,
        supplementaryInstruction: this.supplementaryInstr,
        loanAccountNo: this.loanAccountNo,
        loanId: this.loanId,
        recSt: 'Y',
        versionNo: 1,
        rowTs: new Date(),
        userId: userId,
        createDt: new Date(),
        createdBy: userId,
        sysCreateTs: new Date()
      };
      const directDebit = await DirectDebit.create(directDebitData, { transaction });
      const now = new Date();
      const updates = {
        processedRequests: (this.processedRequests || 0) + 1,
        lastProcessedDate: now,
        lastProcessedAmount: paymentAmount,
        rowTs: now
      };
      if (this.noOfPayments === 0 || (this.processedRequests || 0) < this.noOfPayments - 1) {
        let nextDate = new Date(this.nextReqDt);
        switch (this.payFreqCd) {
          case 'DAILY': nextDate.setDate(nextDate.getDate() + this.payFreqValue); break;
          case 'WEEKLY': nextDate.setDate(nextDate.getDate() + (7 * this.payFreqValue)); break;
          case 'MONTHLY': nextDate.setMonth(nextDate.getMonth() + this.payFreqValue); break;
          case 'QUARTERLY': nextDate.setMonth(nextDate.getMonth() + (3 * this.payFreqValue)); break;
          case 'YEARLY': nextDate.setFullYear(nextDate.getFullYear() + this.payFreqValue); break;
          default: nextDate.setMonth(nextDate.getMonth() + 1);
        }
        updates.nextReqDt = nextDate;
      } else {
        updates.recSt = 'I';
      }
      await this.update(updates, { transaction });
      return { success: true, directDebit, paymentAmount, paymentCurrency,
               requestNumber: this.processedRequests, nextRequestDate: updates.nextReqDt };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getRequestDetails() {
    return {
      requestId: this.directDrReqId,
      description: this.directDrReqDesc,
      accounts: {
        fromAccountId: this.fromAcctId,
        payeeAccountNumber: this.payeeAcctNo,
        payeeAccountId: this.payeeAcctId,
        payeeName: this.payeeNm
      },
      mandate: { mandateType: this.directDrMandateTyCd, scheduleType: this.schedTyCd, requestMethod: this.requestMthdCd },
      loanDetails: {
        loanAccountNo: this.loanAccountNo, loanId: this.loanId, customerId: this.customerId,
        autoCollectionEnabled: this.autoCollectionEnabled, collectionPriority: this.collectionPriority
      },
      paymentDetails: {
        firstPayment: { currency: this.firstPayCrncyId, amount: parseFloat(this.firstPayAmt) || null },
        regularPayment: { currency: this.regularPayCrncyId, amount: parseFloat(this.regularPayAmt) || null },
        lastPayment: { currency: this.lastPayCrncyId, amount: parseFloat(this.lastPayAmt) || null }
      },
      schedule: {
        nextRequestDate: this.nextReqDt, numberOfPayments: this.noOfPayments,
        paymentFrequency: this.payFreqCd, paymentFrequencyValue: this.payFreqValue,
        expiryDate: this.expiryDt, nonBusinessDayOption: this.nonBusDtOptnCd
      },
      bankDetails: { bicId: this.bicId, bankCode: this.bankCd, bankName: this.bankNm,
                     branchName: this.branchNm, branchCity: this.branchCity, branchCountryId: this.branchCntryId },
      instructions: { supplementaryInstruction: this.supplementaryInstr },
      processingHistory: {
        processedRequests: this.processedRequests || 0,
        lastProcessedDate: this.lastProcessedDate,
        lastProcessedAmount: this.lastProcessedAmount ? parseFloat(this.lastProcessedAmount) : null
      },
      status: {
        recordStatus: this.recSt, version: this.versionNo,
        isActive: this.recSt === 'A', isPending: this.recSt === 'P',
        isInactive: this.recSt === 'I', isExpired: this.expiryDt && new Date(this.expiryDt) < new Date()
      },
      metadata: {
        userId: this.userId, createdBy: this.createdBy, createdDate: this.createDt,
        systemCreateTimestamp: this.sysCreateTs, rowTimestamp: this.rowTs
      }
    };
  }

  isRequestDue(date = new Date()) {
    return (this.recSt === 'A' || this.recSt === 'P') && new Date(this.nextReqDt) <= date &&
           (!this.expiryDt || new Date(this.expiryDt) >= date);
  }

  validateForProcessing() {
    const errors = [];
    if (this.recSt !== 'A' && this.recSt !== 'P') errors.push('Request status must be Active or Pending');
    if (!this.nextReqDt) errors.push('Next request date is required');
    if (this.expiryDt && new Date(this.expiryDt) < new Date()) errors.push('Request has expired');
    if (!this.firstPayAmt && !this.regularPayAmt && !this.lastPayAmt) errors.push('At least one payment amount must be specified');
    if (!this.bankCd || !this.bankNm || !this.branchNm) errors.push('Bank code, name, and branch name are required');
    if (!this.payeeNm || !this.payeeAcctNo) errors.push('Payee name and account number are required');
    return { isValid: errors.length === 0, errors };
  }

  getFormattedPaymentAmount(paymentType = 'regular') {
    let amount, currency;
    switch (paymentType.toLowerCase()) {
      case 'first': amount = parseFloat(this.firstPayAmt); currency = this.firstPayCrncyId; break;
      case 'last': amount = parseFloat(this.lastPayAmt); currency = this.lastPayCrncyId; break;
      default: amount = parseFloat(this.regularPayAmt); currency = this.regularPayCrncyId;
    }
    if (!amount || isNaN(amount)) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2 }).format(amount);
  }

  getFrequencyDescription() {
    const freqMap = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly', BIWEEKLY: 'Bi-weekly', BIMONTHLY: 'Bi-monthly' };
    const desc = freqMap[this.payFreqCd] || this.payFreqCd;
    return this.payFreqValue > 1 ? `Every ${this.payFreqValue} ${desc.toLowerCase()}s` : desc;
  }

  get daysUntilNextRequest() {
    return Math.ceil((new Date(this.nextReqDt) - new Date()) / (1000 * 60 * 60 * 24));
  }
  get isActive() { return this.recSt === 'A'; }
  get isPending() { return this.recSt === 'P'; }
  get hasExpired() { return this.expiryDt && new Date(this.expiryDt) < new Date(); }
  get currentPaymentAmount() {
    const now = new Date();
    const createDt = new Date(this.createDt);
    if (this.firstPayAmt && now.toDateString() === createDt.toDateString()) return parseFloat(this.firstPayAmt);
    return parseFloat(this.regularPayAmt) || 0;
  }
  get currentPaymentCurrency() {
    const now = new Date();
    const createDt = new Date(this.createDt);
    if (this.firstPayCrncyId && now.toDateString() === createDt.toDateString()) return this.firstPayCrncyId;
    return this.regularPayCrncyId || 'USD';
  }
  get autoCollectionStatus() {
    if (!this.autoCollectionEnabled) return 'Disabled';
    if (this.hasExpired) return 'Expired';
    if (this.recSt === 'I') return 'Inactive';
    if (this.recSt === 'P') return 'Pending Approval';
    return 'Active';
  }
  get progressPercentage() {
    if (!this.noOfPayments || this.noOfPayments === 0) return null;
    return Math.round(((this.processedRequests || 0) / this.noOfPayments) * 100);
  }
}

DirectDebitRequest.init({
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  directDrReqId: { type: DataTypes.INTEGER, allowNull: false, unique: true, comment: 'Direct debit request identifier' },
  directDrReqDesc: { type: DataTypes.STRING(100), allowNull: true },
  fromAcctId: { type: DataTypes.INTEGER, allowNull: false },
  directDrMandateTyCd: { type: DataTypes.STRING(10), allowNull: false },
  schedTyCd: { type: DataTypes.STRING(10), allowNull: false },
  firstPayCrncyId: { type: DataTypes.STRING(3), allowNull: true },
  lastPayCrncyId: { type: DataTypes.STRING(3), allowNull: true },
  regularPayCrncyId: { type: DataTypes.STRING(3), allowNull: true },
  firstPayAmt: { type: DataTypes.DECIMAL(20,2), allowNull: true },
  regularPayAmt: { type: DataTypes.DECIMAL(20,2), allowNull: true },
  lastPayAmt: { type: DataTypes.DECIMAL(20,2), allowNull: true },
  nextReqDt: { type: DataTypes.DATE, allowNull: false },
  noOfPayments: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  payFreqCd: { type: DataTypes.STRING(10), allowNull: false },
  payFreqValue: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  expiryDt: { type: DataTypes.DATE, allowNull: true },
  nonBusDtOptnCd: { type: DataTypes.STRING(10), allowNull: true },
  requestMthdCd: { type: DataTypes.STRING(10), allowNull: true },
  bicId: { type: DataTypes.INTEGER, allowNull: true },
  bankCd: { type: DataTypes.STRING(10), allowNull: false },
  bankNm: { type: DataTypes.STRING(50), allowNull: false },
  branchNm: { type: DataTypes.STRING(50), allowNull: false },
  branchCity: { type: DataTypes.STRING(60), allowNull: true },
  branchCntryId: { type: DataTypes.INTEGER, allowNull: true },
  supplementaryInstr: { type: DataTypes.STRING(255), allowNull: true },
  payeeNm: { type: DataTypes.STRING(100), allowNull: false },
  payeeAcctNo: { type: DataTypes.STRING(60), allowNull: false },
  payeeAcctId: { type: DataTypes.INTEGER, allowNull: true },
  loanAccountNo: { type: DataTypes.STRING(50), allowNull: true },
  loanId: { type: DataTypes.STRING(50), allowNull: true },
  customerId: { type: DataTypes.INTEGER, allowNull: true },
  autoCollectionEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  collectionPriority: { type: DataTypes.INTEGER, defaultValue: 1, validate: { min: 1, max: 5 } },
  processedRequests: { type: DataTypes.INTEGER, defaultValue: 0 },
  lastProcessedDate: { type: DataTypes.DATE, allowNull: true },
  lastProcessedAmount: { type: DataTypes.DECIMAL(20,2), allowNull: true },
  recSt: { type: DataTypes.STRING(1), allowNull: false, validate: { isIn: [['A','I','P']] } },
  versionNo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  rowTs: { type: DataTypes.DATE, allowNull: false },
  userId: { type: DataTypes.STRING(24), allowNull: false },
  createDt: { type: DataTypes.DATE, allowNull: false },
  createdBy: { type: DataTypes.STRING(24), allowNull: false },
  sysCreateTs: { type: DataTypes.DATE, allowNull: false }
}, {
  sequelize,
  modelName: 'DirectDebitRequest',
  tableName: 'direct_debit_request',
  timestamps: true,
  createdAt: 'createDt',      // map to existing column
  updatedAt: 'rowTs',         // map to existing column
  underscored: false,         // No automatic snake_case conversion
  hooks: {
    beforeValidate: (req) => {
      const strFields = ['directDrReqDesc','directDrMandateTyCd','schedTyCd','firstPayCrncyId','lastPayCrncyId',
                         'regularPayCrncyId','payFreqCd','nonBusDtOptnCd','requestMthdCd','bankCd','bankNm',
                         'branchNm','branchCity','supplementaryInstr','payeeNm','payeeAcctNo','userId','createdBy',
                         'loanAccountNo','loanId'];
      strFields.forEach(f => { if (req[f]) req[f] = req[f].trim(); });
      ['recSt','firstPayCrncyId','lastPayCrncyId','regularPayCrncyId','payFreqCd','schedTyCd',
       'directDrMandateTyCd','bankCd'].forEach(f => { if (req[f]) req[f] = req[f].toUpperCase(); });
      ['firstPayCrncyId','lastPayCrncyId','regularPayCrncyId'].forEach(f => {
        if (req[f] && req[f].length !== 3) throw new Error(`${f} must be 3-character currency code`);
      });
    },
    beforeCreate: (req) => {
      const now = new Date();
      if (!req.createDt) req.createDt = now;
      if (!req.sysCreateTs) req.sysCreateTs = now;
      if (!req.rowTs) req.rowTs = now;
      if (req.nextReqDt) {
        if (req.nextReqDt < now) throw new Error('NEXT_REQ_DT cannot be in the past');
        if (req.expiryDt && req.nextReqDt > req.expiryDt) throw new Error('NEXT_REQ_DT cannot be after EXPIRY_DT');
      }
      if (!req.recSt) req.recSt = 'P';
      if (!req.firstPayAmt && !req.regularPayAmt && !req.lastPayAmt)
        throw new Error('At least one payment amount must be specified');
      const validFreq = ['DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY','BIWEEKLY','BIMONTHLY'];
      if (req.payFreqCd && !validFreq.includes(req.payFreqCd.toUpperCase()))
        throw new Error(`Invalid PAY_FREQ_CD: ${req.payFreqCd}`);
      if (req.autoCollectionEnabled === undefined) req.autoCollectionEnabled = true;
      if (!req.collectionPriority) req.collectionPriority = 1;
      if (!req.processedRequests) req.processedRequests = 0;
    },
    beforeUpdate: (req) => {
      req.rowTs = new Date();
      if (req.changed() && !req.changed('versionNo')) req.versionNo = (req.versionNo || 0) + 1;
      if ((req.changed('nextReqDt') || req.changed('expiryDt')) && req.nextReqDt && req.expiryDt && req.nextReqDt > req.expiryDt)
        throw new Error('NEXT_REQ_DT cannot be after EXPIRY_DT');
    }
  },
 
  scopes: {
    active: { where: { recSt: 'A' } }, inactive: { where: { recSt: 'I' } }, pending: { where: { recSt: 'P' } },
    expired: { where: { expiryDt: { [Op.lt]: new Date() } } },
    activeAndNotExpired: { where: { recSt: 'A', [Op.or]: [{ expiryDt: null }, { expiryDt: { [Op.gt]: new Date() } }] } },
    dueForProcessing: { where: { recSt: { [Op.in]: ['A','P'] }, nextReqDt: { [Op.lte]: new Date() },
                                 [Op.or]: [{ expiryDt: null }, { expiryDt: { [Op.gt]: new Date() } }] } },
    forAutoCollection: { where: { autoCollectionEnabled: true, recSt: { [Op.in]: ['A','P'] } } },
    forLoan: (loanAccountNo) => ({ where: { loanAccountNo } }),
    byPriority: { order: [['collectionPriority', 'ASC']] },
    activeForLoan: (loanAccountNo) => ({ where: { loanAccountNo, autoCollectionEnabled: true, recSt: { [Op.in]: ['A','P'] },
                                                   [Op.or]: [{ expiryDt: null }, { expiryDt: { [Op.gt]: new Date() } }] } }),
    withProcessingHistory: { where: { processedRequests: { [Op.gt]: 0 } } },
    bySourceAccount: (accountId) => ({ where: { fromAcctId: accountId } }),
    byPayeeAccount: (accountNumber) => ({ where: { payeeAcctNo: accountNumber } }),
    byPayeeName: (payeeName) => ({ where: { payeeNm: { [Op.like]: `%${payeeName}%` } } }),
    byBank: (bankCode) => ({ where: { bankCd: bankCode } }),
    byCurrency: (currency) => ({ where: { [Op.or]: [{ firstPayCrncyId: currency }, { regularPayCrncyId: currency }, { lastPayCrncyId: currency }] } }),
    byFrequency: (frequency) => ({ where: { payFreqCd: frequency } }),
    withFirstPayment: { where: { firstPayAmt: { [Op.ne]: null } } },
    withLastPayment: { where: { lastPayAmt: { [Op.ne]: null } } },
    unlimitedPayments: { where: { noOfPayments: 0 } },
    limitedPayments: { where: { noOfPayments: { [Op.gt]: 0 } } },
    dateRange: (start, end) => ({ where: { createDt: { [Op.between]: [start, end] } } }),
    requestDateRange: (start, end) => ({ where: { nextReqDt: { [Op.between]: [start, end] } } }),
    sortedByNextRequest: { order: [['nextReqDt', 'ASC']] },
    sortedByCreation: { order: [['createDt', 'DESC']] },
    sortedByAmount: { order: [[sequelize.literal('COALESCE(regularPayAmt, firstPayAmt, lastPayAmt)'), 'DESC']] },
    highValue: { where: { [Op.or]: [{ regularPayAmt: { [Op.gte]: 10000 } }, { firstPayAmt: { [Op.gte]: 10000 } }, { lastPayAmt: { [Op.gte]: 10000 } }] } },
    withPagination: (page, pageSize) => ({ offset: (page - 1) * pageSize, limit: pageSize })
  }
});

export default DirectDebitRequest;
