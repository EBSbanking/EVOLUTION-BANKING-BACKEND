import { Op } from 'sequelize';
import asyncHandler from 'express-async-handler';
import sequelize from '../../config/db.js';          // ← add this
import Collection, { LoanRepayment, SavingsCollection, ProcessingSummary } from '../models/Collection.js';
import Group from '../models/Group.js';
import GroupLoan from '../models/GroupLoan.js';


// Helper to get include options for Group and GroupLoan
const getIncludes = (includeGroup = true, includeGroupLoan = true) => {
  const includes = [];
  if (includeGroup) includes.push({ model: Group, as: 'group', attributes: ['id', 'groupName', 'groupCode', 'branch', 'unionAddress'] });
  if (includeGroupLoan) includes.push({ model: GroupLoan, as: 'groupLoan', attributes: ['id', 'loanId', 'totalAmount', 'memberCount', 'status'] });
  return includes;
};

// @desc    Create a new collection
// @route   POST /api/collections
export const createCollection = asyncHandler(async (req, res) => {
  const {
    groupId, groupLoanId, amount, currency, collectionDate, branch, relationshipManager,
    channel, createdBy, paymentMethod, transactionReference, repaymentType,
    loanRepayments = [], savingsCollections = []
  } = req.body;

  if (!groupId || !amount || !collectionDate || !branch || !relationshipManager || !createdBy) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const group = await Group.findByPk(groupId);
  if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

  let groupLoan = null;
  if (groupLoanId) {
    groupLoan = await GroupLoan.findByPk(groupLoanId);
    if (!groupLoan) return res.status(404).json({ success: false, message: 'Group loan not found' });
  }

  const collection = await Collection.create({
    groupId, groupLoanId, loanId: groupLoan?.loanId, groupCode: group.groupCode,
    amount: Number(amount), currency: currency || 'NGN', collectionDate: new Date(collectionDate),
    branch: Number(branch), relationshipManager: Number(relationshipManager),
    channel: Number(channel) || 6, createdBy, paymentMethod: paymentMethod || 'CASH',
    transactionReference, repaymentType: repaymentType || 'loan_repayment', status: 'pending'
  });

  // Create associated loan repayments and savings collections if any
  for (const rep of loanRepayments) {
    await LoanRepayment.create({ ...rep, collectionId: collection.id, status: 'pending' });
  }
  for (const sav of savingsCollections) {
    await SavingsCollection.create({ ...sav, collectionId: collection.id, status: 'pending' });
  }

  const fullCollection = await Collection.findByPk(collection.id, { include: getIncludes(true, !!groupLoanId) });
  res.status(201).json({ success: true, data: fullCollection });
});

// @desc    Get all collections with filtering & pagination
export const getCollections = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 10, groupId, groupCode, branch, status, relationshipManager,
    startDate, endDate, channel, search
  } = req.query;

  const where = {};
  if (groupId) where.groupId = groupId;
  if (branch) where.branch = Number(branch);
  if (status) where.status = status;
  if (relationshipManager) where.relationshipManager = Number(relationshipManager);
  if (channel) where.channel = Number(channel);
  if (groupCode) where.groupCode = { [Op.like]: `%${groupCode}%` };
  if (startDate || endDate) {
    where.collectionDate = {};
    if (startDate) where.collectionDate[Op.gte] = new Date(startDate);
    if (endDate) where.collectionDate[Op.lte] = new Date(endDate);
  }
  if (search) {
    where[Op.or] = [
      { collectionId: { [Op.like]: `%${search}%` } },
      { groupCode: { [Op.like]: `%${search}%` } }
    ];
  }

  const offset = (Number(page) - 1) * Number(limit);
  const { count, rows: collections } = await Collection.findAndCountAll({
    where,
    include: getIncludes(true, false),
    order: [['collectionDate', 'DESC'], ['createdAt', 'DESC']],
    limit: Number(limit),
    offset,
    distinct: true
  });

  res.json({
    success: true,
    data: collections,
    pagination: {
      current: Number(page),
      total: Math.ceil(count / limit),
      count: collections.length,
      totalRecords: count
    }
  });
});

// @desc    Get collection by ID
export const getCollectionById = asyncHandler(async (req, res) => {
  const collection = await Collection.findByPk(req.params.id, {
    include: getIncludes(true, true)
  });
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  res.json({ success: true, data: collection });
});

// @desc    Update collection
export const updateCollection = asyncHandler(async (req, res) => {
  const { amount, currency, collectionDate, status, branch, relationshipManager, channel } = req.body;
  const collection = await Collection.findByPk(req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });

  if (amount !== undefined) collection.amount = Number(amount);
  if (currency) collection.currency = currency;
  if (collectionDate) collection.collectionDate = new Date(collectionDate);
  if (status) collection.status = status;
  if (branch !== undefined) collection.branch = Number(branch);
  if (relationshipManager !== undefined) collection.relationshipManager = Number(relationshipManager);
  if (channel !== undefined) collection.channel = Number(channel);

  await collection.save();
  const updated = await Collection.findByPk(collection.id, { include: getIncludes(true, false) });
  res.json({ success: true, data: updated });
});

// @desc    Delete collection
export const deleteCollection = asyncHandler(async (req, res) => {
  const collection = await Collection.findByPk(req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  await Collection.destroy({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Collection deleted' });
});

// @desc    Approve collection
export const approveCollection = asyncHandler(async (req, res) => {
  const collection = await Collection.findByPk(req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  if (collection.status === 'approved') return res.status(400).json({ success: false, message: 'Already approved' });
  collection.status = 'approved';
  await collection.save();
  const updated = await Collection.findByPk(collection.id, { include: getIncludes(true, false) });
  res.json({ success: true, data: updated });
});

// @desc    Reject collection
export const rejectCollection = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const collection = await Collection.findByPk(req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  if (collection.status === 'rejected') return res.status(400).json({ success: false, message: 'Already rejected' });
  collection.status = 'rejected';
  collection.rejectionReason = reason || null;
  await collection.save();
  const updated = await Collection.findByPk(collection.id, { include: getIncludes(true, false) });
  res.json({ success: true, data: updated });
});

// @desc    Get collections by group
export const getCollectionsByGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { page = 1, limit = 10, status, startDate, endDate } = req.query;
  const where = { groupId };
  if (status) where.status = status;
  if (startDate || endDate) {
    where.collectionDate = {};
    if (startDate) where.collectionDate[Op.gte] = new Date(startDate);
    if (endDate) where.collectionDate[Op.lte] = new Date(endDate);
  }
  const offset = (Number(page) - 1) * Number(limit);
  const { count, rows: collections } = await Collection.findAndCountAll({
    where,
    include: getIncludes(true, false),
    order: [['collectionDate', 'DESC']],
    limit: Number(limit),
    offset,
    distinct: true
  });

  // Summary statistics using sequelize aggregation
  const stats = await Collection.findOne({
    where,
    attributes: [
      [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
      [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'approved' THEN amount ELSE 0 END`)), 'approvedAmount'],
      [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'pending' THEN amount ELSE 0 END`)), 'pendingAmount'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalCount'],
      [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'approved' THEN 1 ELSE 0 END`)), 'approvedCount'],
      [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'pending' THEN 1 ELSE 0 END`)), 'pendingCount']
    ],
    raw: true
  });

  res.json({
    success: true,
    data: collections,
    summary: stats || { totalAmount:0, approvedAmount:0, pendingAmount:0, totalCount:0, approvedCount:0, pendingCount:0 },
    pagination: { current: Number(page), total: Math.ceil(count / limit), count: collections.length, totalRecords: count }
  });
});

// @desc    Get collection statistics (overview)
export const getCollectionStats = asyncHandler(async (req, res) => {
  const { branch, startDate, endDate, groupId } = req.query;
  const where = {};
  if (branch) where.branch = Number(branch);
  if (groupId) where.groupId = groupId;
  if (startDate || endDate) {
    where.collectionDate = {};
    if (startDate) where.collectionDate[Op.gte] = new Date(startDate);
    if (endDate) where.collectionDate[Op.lte] = new Date(endDate);
  }

  // Overview stats
  const overview = await Collection.findOne({
    where,
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalCollections'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
      [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'approved' THEN amount ELSE 0 END`)), 'approvedAmount'],
      [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'pending' THEN amount ELSE 0 END`)), 'pendingAmount'],
      [sequelize.fn('SUM', sequelize.literal(`CASE WHEN status = 'rejected' THEN amount ELSE 0 END`)), 'rejectedAmount'],
      [sequelize.fn('AVG', sequelize.col('amount')), 'averageCollection']
    ],
    raw: true
  });

  // Status breakdown
  const statusStats = await Collection.findAll({
    where,
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'amount']
    ],
    group: ['status'],
    raw: true
  });

  // Top groups by collection amount (approved only)
  const topGroups = await Collection.findAll({
    where: { ...where, status: 'approved' },
    attributes: [
      'groupId',
      [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'collectionCount']
    ],
    group: ['groupId'],
    order: [[sequelize.literal('totalAmount'), 'DESC']],
    limit: 5,
    raw: true
  });
  // Manually fetch group names
  const groupIds = topGroups.map(g => g.groupId);
  const groups = await Group.findAll({ where: { id: groupIds }, attributes: ['id', 'groupName', 'groupCode'], raw: true });
  const groupMap = Object.fromEntries(groups.map(g => [g.id, g]));
  const enrichedTopGroups = topGroups.map(g => ({
    groupName: groupMap[g.groupId]?.groupName,
    groupCode: groupMap[g.groupId]?.groupCode,
    totalAmount: parseFloat(g.totalAmount),
    collectionCount: parseInt(g.collectionCount)
  }));

  res.json({
    success: true,
    data: {
      overview: {
        totalCollections: parseInt(overview.totalCollections) || 0,
        totalAmount: parseFloat(overview.totalAmount) || 0,
        approvedAmount: parseFloat(overview.approvedAmount) || 0,
        pendingAmount: parseFloat(overview.pendingAmount) || 0,
        rejectedAmount: parseFloat(overview.rejectedAmount) || 0,
        averageCollection: parseFloat(overview.averageCollection) || 0
      },
      byStatus: statusStats.map(s => ({ _id: s.status, count: parseInt(s.count), amount: parseFloat(s.amount) })),
      topGroups: enrichedTopGroups
    }
  });
});

// @desc    Process collection (run repayments)
export const processCollection = asyncHandler(async (req, res) => {
  const collection = await Collection.findByPk(req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  if (collection.status === 'processed') return res.status(400).json({ success: false, message: 'Already processed' });

  await collection.processRepayments();
  const updated = await Collection.findByPk(collection.id, {
    include: getIncludes(true, true).concat([{ model: LoanRepayment, as: 'loanRepayments' }])
  });
  res.json({ success: true, data: updated });
});

// @desc    Add loan repayment to collection
export const addLoanRepayment = asyncHandler(async (req, res) => {
  const { repayment } = req.body;
  if (!repayment) return res.status(400).json({ success: false, message: 'Repayment data required' });
  const collection = await Collection.findByPk(req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  await collection.addLoanRepayment(repayment);
  const updated = await Collection.findByPk(collection.id, { include: [{ model: LoanRepayment, as: 'loanRepayments' }] });
  res.json({ success: true, data: updated });
});

// @desc    Add savings collection
export const addSavingsCollection = asyncHandler(async (req, res) => {
  const { savings } = req.body;
  if (!savings) return res.status(400).json({ success: false, message: 'Savings data required' });
  const collection = await Collection.findByPk(req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  await collection.addSavingsCollection(savings);
  const updated = await Collection.findByPk(collection.id, { include: [{ model: SavingsCollection, as: 'savingsCollections' }] });
  res.json({ success: true, data: updated });
});

// @desc    Get collection repayment breakdown
export const getCollectionBreakdown = asyncHandler(async (req, res) => {
  const collection = await Collection.findByPk(req.params.id);
  if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });
  const breakdown = await collection.getRepaymentBreakdown();
  res.json({ success: true, data: { collection, breakdown } });
});

// @desc    Get collections by group loan
export const getCollectionsByGroupLoan = asyncHandler(async (req, res) => {
  const { groupLoanId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const where = { groupLoanId };
  const offset = (Number(page) - 1) * Number(limit);
  const { count, rows: collections } = await Collection.findAndCountAll({
    where,
    include: getIncludes(true, false).concat([{ model: LoanRepayment, as: 'loanRepayments' }]),
    order: [['collectionDate', 'DESC']],
    limit: Number(limit),
    offset,
    distinct: true
  });
  const repaymentSummary = await Collection.getLoanRepaymentSummary(groupLoanId);
  res.json({
    success: true,
    data: collections,
    repaymentSummary: repaymentSummary[0] || null,
    pagination: { current: Number(page), total: Math.ceil(count / limit), count: collections.length, totalRecords: count }
  });
});

// @desc    Get loan repayment statistics
// @desc    Get loan repayment statistics
export const getRepaymentStats = asyncHandler(async (req, res) => {
  const { branch, startDate, endDate, groupLoanId } = req.query;

  // Build WHERE clause for collections
  const collectionWhere = { status: { [Op.in]: ['processed', 'partially_processed'] } };
  if (branch) collectionWhere.branch = Number(branch);
  if (groupLoanId) collectionWhere.groupLoanId = groupLoanId;
  if (startDate) collectionWhere.collectionDate = { [Op.gte]: new Date(startDate) };
  if (endDate) collectionWhere.collectionDate = { ...collectionWhere.collectionDate, [Op.lte]: new Date(endDate) };

  // Use a simple parameterized query
  const [overview] = await sequelize.query(`
    SELECT
      COUNT(DISTINCT c.id) AS totalCollections,
      SUM(lr.principalAmount) AS totalPrincipal,
      SUM(lr.interestAmount) AS totalInterest,
      SUM(lr.penaltyAmount) AS totalPenalty,
      SUM(lr.totalAmount) AS totalRepaid,
      COUNT(DISTINCT lr.loanAccountId) AS uniqueLoanAccountsCount,
      COUNT(DISTINCT c.groupId) AS uniqueGroupsCount,
      COUNT(DISTINCT c.groupLoanId) AS uniqueGroupLoansCount,
      AVG(lr.totalAmount) AS averageRepayment
    FROM collections c
    JOIN loan_repayments lr ON lr.collectionId = c.id
    WHERE lr.status = 'processed'
      AND c.status IN ('processed', 'partially_processed')
      ${branch ? 'AND c.branch = :branch' : ''}
      ${groupLoanId ? 'AND c.groupLoanId = :groupLoanId' : ''}
      ${startDate ? 'AND c.collectionDate >= :startDate' : ''}
      ${endDate ? 'AND c.collectionDate <= :endDate' : ''}
  `, {
    replacements: {
      branch: branch ? Number(branch) : undefined,
      groupLoanId: groupLoanId ? Number(groupLoanId) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
    type: sequelize.QueryTypes.SELECT,
  });

  // Trends query – same pattern
  const trends = await sequelize.query(`
    SELECT
      DATE(c.collectionDate) AS _id,
      SUM(lr.principalAmount) AS dailyPrincipal,
      SUM(lr.interestAmount) AS dailyInterest,
      SUM(lr.penaltyAmount) AS dailyPenalty,
      SUM(lr.totalAmount) AS dailyTotal,
      COUNT(DISTINCT c.id) AS collectionCount
    FROM collections c
    JOIN loan_repayments lr ON lr.collectionId = c.id
    WHERE lr.status = 'processed'
      AND c.status IN ('processed', 'partially_processed')
      ${branch ? 'AND c.branch = :branch' : ''}
      ${groupLoanId ? 'AND c.groupLoanId = :groupLoanId' : ''}
      AND c.collectionDate BETWEEN COALESCE(:startDate, '1970-01-01') AND COALESCE(:endDate, NOW())
    GROUP BY DATE(c.collectionDate)
    ORDER BY _id DESC
    LIMIT 30
  `, {
    replacements: {
      branch: branch ? Number(branch) : undefined,
      groupLoanId: groupLoanId ? Number(groupLoanId) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
    type: sequelize.QueryTypes.SELECT,
  });

  res.json({
    success: true,
    data: {
      overview: overview || {
        totalCollections: 0, totalPrincipal: 0, totalInterest: 0, totalPenalty: 0, totalRepaid: 0,
        uniqueLoanAccountsCount: 0, uniqueGroupsCount: 0, uniqueGroupLoansCount: 0, averageRepayment: 0
      },
      trends: trends.map(t => ({ ...t, _id: t._id }))
    }
  });
});