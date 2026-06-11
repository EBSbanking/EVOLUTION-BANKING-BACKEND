// src/controllers/LoanPortfolioController.js – Corrected for explicit field mappings
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import LoanPortfolio from '../models/LoanPortfolio.js';
import LoanAccount from '../models/LoanAccount.js';
import LoanProduct from '../models/LoanProduct.js';
import LoanRepayment from '../models/LoanRepayment.js';

const LoanPortfolioController = {
  // =========================
  // CREATE & UPDATE METHODS
  // =========================
  createPortfolioRecord: async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { BRANCH_ID, PROD_ID, MONTH, YEAR, CURRENCY = 'NGN', CREATED_BY = req.user?.id || 'SYSTEM' } = req.body;
      if (!BRANCH_ID || !PROD_ID || !MONTH || !YEAR) throw new Error('BRANCH_ID, PROD_ID, MONTH, YEAR required');

      const existing = await LoanPortfolio.findOne({ where: { BRANCH_ID, PROD_ID, YEAR, MONTH }, transaction });
      if (existing) throw new Error(`Portfolio record already exists for ${YEAR}-${MONTH}`);

      const product = await LoanProduct.findByPk(PROD_ID, { transaction });
      if (!product) throw new Error(`Product not found: ${PROD_ID}`);

      const portfolioData = {
        BRANCH_ID,
        PROD_ID,
        PRODUCT_CODE: product.productCode || product.PROD_ID?.toString(),
        PRODUCT_NAME: product.name || product.PRODUCT_NAME,
        PRODUCT_TYPE: product.PRODUCT_TYPE || product.productType,
        MONTH: parseInt(MONTH),
        YEAR: parseInt(YEAR),
        CURRENCY,
        CREATED_BY,
        UPDATED_BY: CREATED_BY,
        STATUS: 'ACTIVE'
      };
      await calculatePortfolioMetrics(portfolioData, transaction);
      const record = await LoanPortfolio.create(portfolioData, { transaction });
      await transaction.commit();
      res.status(201).json({ success: true, data: record.toJSON() });
    } catch (error) {
      await transaction.rollback();
      console.error('createPortfolioRecord error:', error);
      res.status(error.status || 500).json({ success: false, message: error.message });
    }
  },

  updatePortfolioRecord: async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const updateData = req.body;
      const UPDATED_BY = req.user?.id || 'SYSTEM';
      const portfolio = await LoanPortfolio.findByPk(id, { transaction });
      if (!portfolio) throw new Error('Portfolio record not found');
      delete updateData.BRANCH_ID; delete updateData.PROD_ID; delete updateData.YEAR; delete updateData.MONTH;
      Object.assign(portfolio, { ...updateData, UPDATED_BY, UPDATED_DATE: new Date() });
      await portfolio.save({ transaction });
      await transaction.commit();
      res.json({ success: true, data: portfolio.toJSON() });
    } catch (error) {
      await transaction.rollback();
      console.error('updatePortfolioRecord error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  recalculatePortfolio: async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const portfolio = await LoanPortfolio.findByPk(id, { transaction });
      if (!portfolio) throw new Error('Portfolio record not found');
      const portfolioData = portfolio.toJSON();
      await calculatePortfolioMetrics(portfolioData, transaction);
      await portfolio.update(portfolioData, { transaction });
      await transaction.commit();
      res.json({ success: true, data: portfolio.toJSON() });
    } catch (error) {
      await transaction.rollback();
      console.error('recalculatePortfolio error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // =========================
  // READ & QUERY METHODS
  // =========================
  getPortfolioById: async (req, res) => {
    try {
      const { id } = req.params;
      const record = await LoanPortfolio.findByPk(id, { include: [{ model: LoanProduct, as: 'product', attributes: ['name', 'productCode'] }] });
      if (!record) return res.status(404).json({ success: false, message: 'Not found' });
      const data = record.toJSON();
      data.PERIOD = `${data.YEAR}-${data.MONTH.toString().padStart(2, '0')}`;
      data.COLLECTION_EFFICIENCY = data.TOTAL_REPAYMENTS > 0 ? (data.TOTAL_RECOVERED / data.TOTAL_REPAYMENTS) * 100 : 0;
      data.DEFAULT_RATE = data.NUMBER_OF_LOANS > 0 ? (data.TOTAL_DEFAULTS / data.NUMBER_OF_LOANS) * 100 : 0;
      res.json({ success: true, data });
    } catch (error) {
      console.error('getPortfolioById error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getPortfolioByPeriod: async (req, res) => {
    try {
      const { BRANCH_ID, PROD_ID, YEAR, MONTH } = req.query;
      if (!YEAR || !MONTH) return res.status(400).json({ success: false, message: 'YEAR and MONTH required' });
      const where = { YEAR: parseInt(YEAR), MONTH: parseInt(MONTH) };
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) where.PROD_ID = PROD_ID;
      const records = await LoanPortfolio.findAll({ where, include: [{ model: LoanProduct, as: 'product', attributes: ['name', 'productCode'] }] });
      const enhanced = records.map(r => ({ ...r.toJSON(), PERIOD: `${r.YEAR}-${r.MONTH.toString().padStart(2, '0')}` }));
      res.json({ success: true, data: enhanced, count: enhanced.length });
    } catch (error) {
      console.error('getPortfolioByPeriod error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getPortfolioByBranch: async (req, res) => {
    try {
      const { BRANCH_ID, YEAR, MONTH } = req.query;
      if (!BRANCH_ID) return res.status(400).json({ success: false, message: 'BRANCH_ID required' });
      const where = { BRANCH_ID };
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);
      const records = await LoanPortfolio.findAll({ where, include: [{ model: LoanProduct, as: 'product' }] });
      const grouped = {};
      records.forEach(r => {
        const d = r.toJSON();
        const period = `${d.YEAR}-${d.MONTH.toString().padStart(2, '0')}`;
        if (!grouped[period]) grouped[period] = { PERIOD: period, BRANCH_ID, TOTAL_DISBURSED: 0, OUTSTANDING_PRINCIPAL: 0, TOTAL_INTEREST_RECEIVED: 0, NUMBER_OF_LOANS: 0, ACTIVE_LOANS: 0, PORTFOLIO_AT_RISK: 0, products: [] };
        grouped[period].TOTAL_DISBURSED += d.TOTAL_DISBURSED || 0;
        grouped[period].OUTSTANDING_PRINCIPAL += d.OUTSTANDING_PRINCIPAL || 0;
        grouped[period].TOTAL_INTEREST_RECEIVED += d.TOTAL_INTEREST_RECEIVED || 0;
        grouped[period].NUMBER_OF_LOANS += d.NUMBER_OF_LOANS || 0;
        grouped[period].ACTIVE_LOANS += d.ACTIVE_LOANS || 0;
        grouped[period].PORTFOLIO_AT_RISK += d.PORTFOLIO_AT_RISK || 0;
        grouped[period].products.push({ PROD_ID: d.PROD_ID, PRODUCT_NAME: d.PRODUCT_NAME, TOTAL_DISBURSED: d.TOTAL_DISBURSED, OUTSTANDING_PRINCIPAL: d.OUTSTANDING_PRINCIPAL });
      });
      res.json({ success: true, data: Object.values(grouped).sort((a,b) => b.PERIOD.localeCompare(a.PERIOD)) });
    } catch (error) {
      console.error('getPortfolioByBranch error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getPortfolioByProductType: async (req, res) => {
    try {
      const { PRODUCT_TYPE, YEAR, MONTH } = req.query;
      if (!PRODUCT_TYPE) return res.status(400).json({ success: false, message: 'PRODUCT_TYPE required' });
      const where = { PRODUCT_TYPE };
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);
      const records = await LoanPortfolio.findAll({ where });
      const grouped = {};
      records.forEach(r => {
        const d = r.toJSON();
        const period = `${d.YEAR}-${d.MONTH.toString().padStart(2, '0')}`;
        if (!grouped[period]) grouped[period] = { PERIOD: period, PRODUCT_TYPE, TOTAL_DISBURSED: 0, OUTSTANDING_PRINCIPAL: 0, TOTAL_INTEREST_RECEIVED: 0, NUMBER_OF_LOANS: 0, ACTIVE_LOANS: 0, branches: [] };
        grouped[period].TOTAL_DISBURSED += d.TOTAL_DISBURSED || 0;
        grouped[period].OUTSTANDING_PRINCIPAL += d.OUTSTANDING_PRINCIPAL || 0;
        grouped[period].TOTAL_INTEREST_RECEIVED += d.TOTAL_INTEREST_RECEIVED || 0;
        grouped[period].NUMBER_OF_LOANS += d.NUMBER_OF_LOANS || 0;
        grouped[period].ACTIVE_LOANS += d.ACTIVE_LOANS || 0;
        let branch = grouped[period].branches.find(b => b.BRANCH_ID === d.BRANCH_ID);
        if (!branch) grouped[period].branches.push({ BRANCH_ID: d.BRANCH_ID, TOTAL_DISBURSED: d.TOTAL_DISBURSED, OUTSTANDING_PRINCIPAL: d.OUTSTANDING_PRINCIPAL });
        else { branch.TOTAL_DISBURSED += d.TOTAL_DISBURSED; branch.OUTSTANDING_PRINCIPAL += d.OUTSTANDING_PRINCIPAL; }
      });
      res.json({ success: true, data: Object.values(grouped).sort((a,b) => b.PERIOD.localeCompare(a.PERIOD)) });
    } catch (error) {
      console.error('getPortfolioByProductType error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  searchPortfolio: async (req, res) => {
    try {
      const { BRANCH_ID, PROD_ID, PRODUCT_TYPE, YEAR, MONTH, STATUS, startDate, endDate, page = 1, limit = 20 } = req.query;
      const where = {};
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) where.PROD_ID = PROD_ID;
      if (PRODUCT_TYPE) where.PRODUCT_TYPE = PRODUCT_TYPE;
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);
      if (STATUS) where.STATUS = STATUS;
      if (startDate || endDate) {
        where.CREATED_DATE = {};
        if (startDate) where.CREATED_DATE[Op.gte] = new Date(startDate);
        if (endDate) where.CREATED_DATE[Op.lte] = new Date(endDate);
      }
      const { count, rows } = await LoanPortfolio.findAndCountAll({ where, offset: (page-1)*limit, limit: parseInt(limit), order: [['YEAR','DESC'],['MONTH','DESC']] });
      res.json({ success: true, data: rows, pagination: { page, limit, total: count, pages: Math.ceil(count/limit) } });
    } catch (error) {
      console.error('searchPortfolio error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // =========================
  // AGGREGATION & ANALYTICS
  // =========================
  getPortfolioSummary: async (req, res) => {
    try {
      const { BRANCH_ID, YEAR, MONTH } = req.query;
      const where = {};
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);
      const result = await LoanPortfolio.findAll({
        where,
        attributes: [
          [sequelize.fn('SUM', sequelize.col('TOTAL_DISBURSED')), 'TOTAL_DISBURSED'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_PRINCIPAL')), 'TOTAL_PRINCIPAL'],
          [sequelize.fn('SUM', sequelize.col('OUTSTANDING_PRINCIPAL')), 'OUTSTANDING_PRINCIPAL'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_RECEIVED')), 'TOTAL_INTEREST_RECEIVED'],
          [sequelize.fn('SUM', sequelize.col('NUMBER_OF_LOANS')), 'NUMBER_OF_LOANS'],
          [sequelize.fn('SUM', sequelize.col('ACTIVE_LOANS')), 'ACTIVE_LOANS'],
          [sequelize.fn('SUM', sequelize.col('PORTFOLIO_AT_RISK')), 'PORTFOLIO_AT_RISK']
        ],
        raw: true
      });
      const summary = result[0] || {};
      Object.keys(summary).forEach(k => summary[k] = parseFloat(summary[k]) || 0);
      const nplRatio = summary.OUTSTANDING_PRINCIPAL ? (summary.PORTFOLIO_AT_RISK / summary.OUTSTANDING_PRINCIPAL) * 100 : 0;
      res.json({ success: true, data: { ...summary, NPL_RATIO: nplRatio } });
    } catch (error) {
      console.error('getPortfolioSummary error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getPortfolioTrend: async (req, res) => {
    try {
      const { BRANCH_ID, PROD_ID, PRODUCT_TYPE, months = 12 } = req.query;
      const endDate = new Date();
      const startDate = new Date(); startDate.setMonth(startDate.getMonth() - parseInt(months));
      const where = { CREATED_DATE: { [Op.between]: [startDate, endDate] } };
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) where.PROD_ID = PROD_ID;
      if (PRODUCT_TYPE) where.PRODUCT_TYPE = PRODUCT_TYPE;
      const trend = await LoanPortfolio.findAll({
        where,
        attributes: ['YEAR','MONTH', [sequelize.fn('SUM', sequelize.col('TOTAL_DISBURSED')), 'TOTAL_DISBURSED'], [sequelize.fn('SUM', sequelize.col('OUTSTANDING_PRINCIPAL')), 'OUTSTANDING_PRINCIPAL']],
        group: ['YEAR','MONTH'],
        order: [['YEAR','ASC'],['MONTH','ASC']],
        raw: true
      });
      res.json({ success: true, data: trend });
    } catch (error) {
      console.error('getPortfolioTrend error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getPortfolioHealth: async (req, res) => {
    try {
      const { BRANCH_ID, YEAR, MONTH } = req.query;
      const where = {};
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);
      const records = await LoanPortfolio.findAll({ where });
      let totalOutstanding = 0, totalPar = 0, totalProvision = 0, totalLoans = 0;
      records.forEach(r => {
        totalOutstanding += parseFloat(r.OUTSTANDING_PRINCIPAL) || 0;
        totalPar += parseFloat(r.PORTFOLIO_AT_RISK) || 0;
        totalProvision += parseFloat(r.PROVISION_AMOUNT) || 0;
        totalLoans += r.NUMBER_OF_LOANS || 0;
      });
      const nplRatio = totalOutstanding ? (totalPar / totalOutstanding) * 100 : 0;
      const riskCategory = nplRatio < 5 ? 'LOW' : nplRatio < 15 ? 'MODERATE' : nplRatio < 30 ? 'HIGH' : 'CRITICAL';
      res.json({ success: true, data: { metrics: { TOTAL_OUTSTANDING: totalOutstanding, PORTFOLIO_AT_RISK: totalPar, PROVISION_AMOUNT: totalProvision, TOTAL_LOANS: totalLoans }, ratios: { NPL_RATIO: nplRatio }, riskAssessment: { category: riskCategory, nplRatio } } });
    } catch (error) {
      console.error('getPortfolioHealth error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // =========================
  // BATCH & ADMIN
  // =========================
  generatePortfolioForPeriod: async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { YEAR, MONTH, BRANCH_ID, PROD_ID } = req.body;
      if (!YEAR || !MONTH) throw new Error('YEAR and MONTH required');
      const where = { YEAR, MONTH };
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) where.PROD_ID = PROD_ID;
      const existing = await LoanPortfolio.findAll({ where, transaction });
      if (existing.length) throw new Error('Portfolio records already exist for this period');

      let branches = BRANCH_ID ? [BRANCH_ID] : await getDistinctBranches(transaction);
      let products = PROD_ID ? [{ id: PROD_ID }] : await getDistinctProducts(transaction);
      const generated = [];
      for (const branch of branches) {
        for (const product of products) {
          const portfolioData = {
            BRANCH_ID: branch,
            PROD_ID: product.id,
            PRODUCT_CODE: product.productCode || product.PROD_ID?.toString(),
            PRODUCT_NAME: product.name || product.PRODUCT_NAME,
            PRODUCT_TYPE: product.PRODUCT_TYPE || product.productType,
            MONTH, YEAR, CURRENCY: 'NGN', CREATED_BY: 'system', UPDATED_BY: 'system', STATUS: 'ACTIVE'
          };
          await calculatePortfolioMetrics(portfolioData, transaction);
          const record = await LoanPortfolio.create(portfolioData, { transaction });
          generated.push(record);
        }
      }
      await transaction.commit();
      res.status(201).json({ success: true, generated: generated.length, data: generated.map(r => r.toJSON()) });
    } catch (error) {
      await transaction.rollback();
      console.error('generatePortfolioForPeriod error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  deletePortfolioRecord: async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const record = await LoanPortfolio.findByPk(id, { transaction });
      if (!record) throw new Error('Record not found');
      if (record.STATUS === 'ACTIVE') throw new Error('Cannot delete active records – archive first');
      await record.destroy({ transaction });
      await transaction.commit();
      res.json({ success: true, message: 'Deleted' });
    } catch (error) {
      await transaction.rollback();
      res.status(500).json({ success: false, message: error.message });
    }
  },

  archivePortfolioRecord: async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const record = await LoanPortfolio.findByPk(id, { transaction });
      if (!record) throw new Error('Record not found');
      record.STATUS = 'ARCHIVED';
      record.UPDATED_BY = req.user?.id || 'SYSTEM';
      await record.save({ transaction });
      await transaction.commit();
      res.json({ success: true, data: record.toJSON() });
    } catch (error) {
      await transaction.rollback();
      res.status(500).json({ success: false, message: error.message });
    }
  },

  exportPortfolioData: async (req, res) => {
    try {
      const { format = 'json', ...filters } = req.query;
      const where = buildPortfolioQuery(filters);
      const records = await LoanPortfolio.findAll({ where });
      if (format === 'csv') {
        const csv = convertToCSV(records.map(r => r.toJSON()));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=portfolio.csv');
        return res.send(csv);
      }
      res.json({ success: true, data: records });
    } catch (error) {
      console.error('exportPortfolioData error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// =========================
// HELPER FUNCTIONS
// =========================
async function calculatePortfolioMetrics(portfolioData, transaction) {
  const { BRANCH_ID, PROD_ID, YEAR, MONTH } = portfolioData;
  const startDate = new Date(YEAR, MONTH - 1, 1);
  const endDate = new Date(YEAR, MONTH, 0);

  const loans = await LoanAccount.findAll({
    where: {
      PROD_ID,
      BU_ID: BRANCH_ID,
      DISBURSEMENT_DATE: { [Op.between]: [startDate, endDate] }
    },
    transaction
  });

  let totalDisbursed = 0, totalPrincipal = 0, outstandingPrincipal = 0, activeLoans = 0, portfolioAtRisk = 0;
  const loanIds = [];
  for (const loan of loans) {
    totalDisbursed += parseFloat(loan.DISBURSED_AMOUNT || 0);
    totalPrincipal += parseFloat(loan.AMOUNT || 0);
    outstandingPrincipal += parseFloat(loan.OUTSTANDING_PRINCIPAL || 0);
    loanIds.push(loan.id);
    if (loan.LOAN_STATUS === 'ACTIVE') activeLoans++;
    if (loan.LOAN_STATUS === 'DELINQUENT' || loan.LOAN_STATUS === 'DEFAULT') {
      portfolioAtRisk += parseFloat(loan.OUTSTANDING_PRINCIPAL || 0);
    }
  }

  let totalRepayments = 0, totalRecovered = 0, totalInterest = 0, totalFees = 0;
  if (loanIds.length) {
    const repayments = await LoanRepayment.findAll({
      where: {
        loan_account_id: { [Op.in]: loanIds },
        repayment_date: { [Op.between]: [startDate, endDate] }
      },
      transaction
    });
    for (const r of repayments) {
      totalRepayments += parseFloat(r.total_amount || 0);
      totalRecovered += parseFloat(r.principal_amount || 0);
      totalInterest += parseFloat(r.interest_amount || 0);
      totalFees += parseFloat(r.penalty_amount || 0);
    }
  }

  portfolioData.TOTAL_DISBURSED = totalDisbursed;
  portfolioData.TOTAL_NET_DISBURSEMENT = totalDisbursed;
  portfolioData.TOTAL_PRINCIPAL = totalPrincipal;
  portfolioData.OUTSTANDING_PRINCIPAL = outstandingPrincipal;
  portfolioData.TOTAL_INTEREST_RECEIVED = totalInterest;
  portfolioData.TOTAL_FEES_RECEIVED = totalFees;
  portfolioData.NUMBER_OF_LOANS = loans.length;
  portfolioData.ACTIVE_LOANS = activeLoans;
  portfolioData.DISBURSEMENT_COUNT = loans.length;
  portfolioData.PORTFOLIO_AT_RISK = portfolioAtRisk;
  portfolioData.TOTAL_REPAYMENTS = totalRepayments;
  portfolioData.TOTAL_RECOVERED = totalRecovered;
  portfolioData.TOTAL_DEFAULTS = loans.filter(l => l.LOAN_STATUS === 'DEFAULT').length;
  portfolioData.PROVISION_AMOUNT = portfolioAtRisk * 0.1;
  portfolioData.YIELD_RATE = totalPrincipal ? (totalInterest / totalPrincipal) * 100 * 12 : 0;
  portfolioData.AVERAGE_LOAN_SIZE = loans.length ? totalPrincipal / loans.length : 0;
}

async function getDistinctBranches(transaction) {
  const branches = await LoanAccount.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('BU_ID')), 'BU_ID']],
    where: { BU_ID: { [Op.ne]: null } },
    transaction,
    raw: true
  });
  return branches.map(b => b.BU_ID);
}

async function getDistinctProducts(transaction) {
  return await LoanProduct.findAll({ transaction });
}

function buildPortfolioQuery(filters) {
  const where = {};
  if (filters.BRANCH_ID) where.BRANCH_ID = filters.BRANCH_ID;
  if (filters.PROD_ID) where.PROD_ID = filters.PROD_ID;
  if (filters.PRODUCT_TYPE) where.PRODUCT_TYPE = filters.PRODUCT_TYPE;
  if (filters.YEAR) where.YEAR = parseInt(filters.YEAR);
  if (filters.MONTH) where.MONTH = parseInt(filters.MONTH);
  if (filters.STATUS) where.STATUS = filters.STATUS;
  if (filters.startDate || filters.endDate) {
    where.CREATED_DATE = {};
    if (filters.startDate) where.CREATED_DATE[Op.gte] = new Date(filters.startDate);
    if (filters.endDate) where.CREATED_DATE[Op.lte] = new Date(filters.endDate);
  }
  return where;
}

function convertToCSV(records) {
  if (!records.length) return '';
  const headers = ['PERIOD','BRANCH_ID','PRODUCT_CODE','PRODUCT_NAME','PRODUCT_TYPE','TOTAL_DISBURSED','OUTSTANDING_PRINCIPAL','NUMBER_OF_LOANS','NPL_RATIO','STATUS'];
  const rows = records.map(r => {
    const period = `${r.YEAR}-${r.MONTH.toString().padStart(2,'0')}`;
    const npl = r.OUTSTANDING_PRINCIPAL ? (r.PORTFOLIO_AT_RISK / r.OUTSTANDING_PRINCIPAL) * 100 : 0;
    return [period, r.BRANCH_ID, r.PRODUCT_CODE, `"${r.PRODUCT_NAME}"`, r.PRODUCT_TYPE, r.TOTAL_DISBURSED||0, r.OUTSTANDING_PRINCIPAL||0, r.NUMBER_OF_LOANS||0, npl.toFixed(2), r.STATUS];
  });
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

export default LoanPortfolioController;