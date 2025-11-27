import Collection from '../models/Collection.js';
import Group from '../models/Group.js';
import GroupLoan from '../models/GroupLoan.js';
import asyncHandler from 'express-async-handler';

// @desc    Create a new collection with loan repayments
// @route   POST /api/collections
// @access  Private
const createCollection = asyncHandler(async (req, res) => {
  const {
    groupId,
    groupLoanId,
    amount,
    currency,
    collectionDate,
    branch,
    relationshipManager,
    channel,
    createdBy,
    paymentMethod,
    transactionReference,
    repaymentType,
    loanRepayments,
    savingsCollections
  } = req.body;

  // Validate required fields
  if (!groupId || !amount || !collectionDate || !branch || !relationshipManager || !createdBy) {
    return res.status(400).json({
      success: false,
      message: 'Please provide groupId, amount, collectionDate, branch, relationshipManager, and createdBy'
    });
  }

  // Verify group exists
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({
      success: false,
      message: 'Group not found'
    });
  }

  // Verify group loan exists if provided
  let groupLoan = null;
  if (groupLoanId) {
    groupLoan = await GroupLoan.findById(groupLoanId);
    if (!groupLoan) {
      return res.status(404).json({
        success: false,
        message: 'Group loan not found'
      });
    }
  }

  // Create collection
  const collection = await Collection.create({
    groupId,
    groupLoanId,
    loanId: groupLoan?.loanId,
    groupCode: group.groupCode,
    amount: Number(amount),
    currency: currency || 'NGN',
    collectionDate: new Date(collectionDate),
    branch: Number(branch),
    relationshipManager: Number(relationshipManager),
    channel: Number(channel) || 6,
    createdBy,
    paymentMethod: paymentMethod || 'CASH',
    transactionReference,
    repaymentType: repaymentType || 'loan_repayment',
    loanRepayments: loanRepayments || [],
    savingsCollections: savingsCollections || [],
    status: 'pending'
  });

  // Populate with related data
  await collection.populate('groupId', 'groupName groupCode branch');
  if (groupLoanId) {
    await collection.populate('groupLoanId', 'loanId totalAmount memberCount');
  }

  res.status(201).json({
    success: true,
    message: 'Collection created successfully',
    data: collection
  });
});

// @desc    Get all collections with filtering and pagination
// @route   GET /api/collections
// @access  Private
const getCollections = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    groupId,
    groupCode,
    branch,
    status,
    relationshipManager,
    startDate,
    endDate,
    channel,
    search
  } = req.query;

  // Build filter object
  const filter = {};

  if (groupId) filter.groupId = groupId;
  if (groupCode) filter.groupCode = { $regex: groupCode, $options: 'i' };
  if (branch) filter.branch = Number(branch);
  if (status) filter.status = status;
  if (relationshipManager) filter.relationshipManager = Number(relationshipManager);
  if (channel) filter.channel = Number(channel);

  // Date range filter
  if (startDate || endDate) {
    filter.collectionDate = {};
    if (startDate) filter.collectionDate.$gte = new Date(startDate);
    if (endDate) filter.collectionDate.$lte = new Date(endDate);
  }

  // Search filter (by group name via population or collection ID)
  if (search) {
    filter.$or = [
      { collectionId: { $regex: search, $options: 'i' } },
      { groupCode: { $regex: search, $options: 'i' } }
    ];
  }

  // Execute query with pagination
  const collections = await Collection.find(filter)
    .populate('groupId', 'groupName groupCode branch unionAddress')
    .sort({ collectionDate: -1, createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  // Get total count for pagination
  const total = await Collection.countDocuments(filter);

  res.json({
    success: true,
    data: collections,
    pagination: {
      current: Number(page),
      total: Math.ceil(total / limit),
      count: collections.length,
      totalRecords: total
    }
  });
});

// @desc    Get collection by ID
// @route   GET /api/collections/:id
// @access  Private
const getCollectionById = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id)
    .populate('groupId', 'groupName groupCode branch relationshipManager unionAddress');

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  res.json({
    success: true,
    data: collection
  });
});

// @desc    Update collection
// @route   PUT /api/collections/:id
// @access  Private
const updateCollection = asyncHandler(async (req, res) => {
  const {
    amount,
    currency,
    collectionDate,
    status,
    branch,
    relationshipManager,
    channel
  } = req.body;

  const collection = await Collection.findById(req.params.id);

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  // Update fields
  if (amount !== undefined) collection.amount = Number(amount);
  if (currency) collection.currency = currency;
  if (collectionDate) collection.collectionDate = new Date(collectionDate);
  if (status) collection.status = status;
  if (branch !== undefined) collection.branch = Number(branch);
  if (relationshipManager !== undefined) collection.relationshipManager = Number(relationshipManager);
  if (channel !== undefined) collection.channel = Number(channel);

  const updatedCollection = await collection.save();
  await updatedCollection.populate('groupId', 'groupName groupCode branch');

  res.json({
    success: true,
    message: 'Collection updated successfully',
    data: updatedCollection
  });
});

// @desc    Delete collection
// @route   DELETE /api/collections/:id
// @access  Private
const deleteCollection = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id);

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  await Collection.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Collection deleted successfully'
  });
});

// @desc    Approve collection
// @route   PATCH /api/collections/:id/approve
// @access  Private
const approveCollection = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id);

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  if (collection.status === 'approved') {
    return res.status(400).json({
      success: false,
      message: 'Collection is already approved'
    });
  }

  collection.status = 'approved';
  const approvedCollection = await collection.save();
  await approvedCollection.populate('groupId', 'groupName groupCode branch');

  res.json({
    success: true,
    message: 'Collection approved successfully',
    data: approvedCollection
  });
});

// @desc    Reject collection
// @route   PATCH /api/collections/:id/reject
// @access  Private
const rejectCollection = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const collection = await Collection.findById(req.params.id);

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  if (collection.status === 'rejected') {
    return res.status(400).json({
      success: false,
      message: 'Collection is already rejected'
    });
  }

  collection.status = 'rejected';
  collection.rejectionReason = reason;
  const rejectedCollection = await collection.save();
  await rejectedCollection.populate('groupId', 'groupName groupCode branch');

  res.json({
    success: true,
    message: 'Collection rejected successfully',
    data: rejectedCollection
  });
});

// @desc    Get collections by group
// @route   GET /api/collections/group/:groupId
// @access  Private
const getCollectionsByGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { page = 1, limit = 10, status, startDate, endDate } = req.query;

  const filter = { groupId };

  if (status) filter.status = status;
  if (startDate || endDate) {
    filter.collectionDate = {};
    if (startDate) filter.collectionDate.$gte = new Date(startDate);
    if (endDate) filter.collectionDate.$lte = new Date(endDate);
  }

  const collections = await Collection.find(filter)
    .populate('groupId', 'groupName groupCode branch')
    .sort({ collectionDate: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await Collection.countDocuments(filter);

  // Get summary statistics
  const stats = await Collection.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        approvedAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0]
          }
        },
        pendingAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0]
          }
        },
        totalCount: { $sum: 1 },
        approvedCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'approved'] }, 1, 0]
          }
        },
        pendingCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
          }
        }
      }
    }
  ]);

  res.json({
    success: true,
    data: collections,
    summary: stats[0] || {
      totalAmount: 0,
      approvedAmount: 0,
      pendingAmount: 0,
      totalCount: 0,
      approvedCount: 0,
      pendingCount: 0
    },
    pagination: {
      current: Number(page),
      total: Math.ceil(total / limit),
      count: collections.length,
      totalRecords: total
    }
  });
});

// @desc    Get collection statistics
// @route   GET /api/collections/stats/overview
// @access  Private
const getCollectionStats = asyncHandler(async (req, res) => {
  const { branch, startDate, endDate, groupId } = req.query;

  const matchStage = {};
  
  if (branch) matchStage.branch = Number(branch);
  if (groupId) matchStage.groupId = groupId;
  if (startDate || endDate) {
    matchStage.collectionDate = {};
    if (startDate) matchStage.collectionDate.$gte = new Date(startDate);
    if (endDate) matchStage.collectionDate.$lte = new Date(endDate);
  }

  const stats = await Collection.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalCollections: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        approvedAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0]
          }
        },
        pendingAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0]
          }
        },
        rejectedAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'rejected'] }, '$amount', 0]
          }
        },
        averageCollection: { $avg: '$amount' }
      }
    },
    {
      $project: {
        _id: 0,
        totalCollections: 1,
        totalAmount: 1,
        approvedAmount: 1,
        pendingAmount: 1,
        rejectedAmount: 1,
        averageCollection: { $round: ['$averageCollection', 2] }
      }
    }
  ]);

  // Get collections by status
  const statusStats = await Collection.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        amount: { $sum: '$amount' }
      }
    }
  ]);

  // Get top groups by collection amount
  const topGroups = await Collection.aggregate([
    { $match: { ...matchStage, status: 'approved' } },
    {
      $group: {
        _id: '$groupId',
        totalAmount: { $sum: '$amount' },
        collectionCount: { $sum: 1 }
      }
    },
    { $sort: { totalAmount: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'groups',
        localField: '_id',
        foreignField: '_id',
        as: 'group'
      }
    },
    { $unwind: '$group' },
    {
      $project: {
        groupName: '$group.groupName',
        groupCode: '$group.groupCode',
        totalAmount: 1,
        collectionCount: 1
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      overview: stats[0] || {
        totalCollections: 0,
        totalAmount: 0,
        approvedAmount: 0,
        pendingAmount: 0,
        rejectedAmount: 0,
        averageCollection: 0
      },
      byStatus: statusStats,
      topGroups: topGroups
    }
  });
});

// @desc    Process collection (update GroupLoan and mark repayments)
// @route   PATCH /api/collections/:id/process
// @access  Private
const processCollection = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id)
    .populate('groupLoanId')
    .populate('loanRepayments.loanAccountId');

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  if (collection.status === 'processed') {
    return res.status(400).json({
      success: false,
      message: 'Collection is already processed'
    });
  }

  // Process repayments and update GroupLoan
  await collection.processRepayments();

  const updatedCollection = await Collection.findById(req.params.id)
    .populate('groupId', 'groupName groupCode branch')
    .populate('groupLoanId', 'loanId totalAmount memberCount status')
    .populate('loanRepayments.loanAccountId');

  res.json({
    success: true,
    message: 'Collection processed successfully',
    data: updatedCollection
  });
});

// @desc    Add loan repayment to collection
// @route   PATCH /api/collections/:id/repayments
// @access  Private
const addLoanRepayment = asyncHandler(async (req, res) => {
  const { repayment } = req.body;

  if (!repayment) {
    return res.status(400).json({
      success: false,
      message: 'Repayment data is required'
    });
  }

  const collection = await Collection.findById(req.params.id);
  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  await collection.addLoanRepayment(repayment);
  await collection.populate('loanRepayments.loanAccountId');

  res.json({
    success: true,
    message: 'Loan repayment added to collection',
    data: collection
  });
});

// @desc    Add savings collection
// @route   PATCH /api/collections/:id/savings
// @access  Private
const addSavingsCollection = asyncHandler(async (req, res) => {
  const { savings } = req.body;

  if (!savings) {
    return res.status(400).json({
      success: false,
      message: 'Savings data is required'
    });
  }

  const collection = await Collection.findById(req.params.id);
  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  await collection.addSavingsCollection(savings);

  res.json({
    success: true,
    message: 'Savings collection added',
    data: collection
  });
});

// @desc    Get collection repayment breakdown
// @route   GET /api/collections/:id/breakdown
// @access  Private
const getCollectionBreakdown = asyncHandler(async (req, res) => {
  const collection = await Collection.findById(req.params.id)
    .populate('loanRepayments.loanAccountId')
    .populate('groupLoanId', 'loanId totalAmount memberCount');

  if (!collection) {
    return res.status(404).json({
      success: false,
      message: 'Collection not found'
    });
  }

  const breakdown = collection.getRepaymentBreakdown();

  res.json({
    success: true,
    data: {
      collection: collection,
      breakdown: breakdown
    }
  });
});

// @desc    Get collections by group loan
// @route   GET /api/collections/loan/:groupLoanId
// @access  Private
const getCollectionsByGroupLoan = asyncHandler(async (req, res) => {
  const { groupLoanId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const collections = await Collection.find({ groupLoanId })
    .populate('groupId', 'groupName groupCode branch')
    .populate('loanRepayments.loanAccountId')
    .sort({ collectionDate: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await Collection.countDocuments({ groupLoanId });

  // Get repayment summary for this group loan
  const repaymentSummary = await Collection.getLoanRepaymentSummary(groupLoanId);

  res.json({
    success: true,
    data: collections,
    repaymentSummary: repaymentSummary[0] || null,
    pagination: {
      current: Number(page),
      total: Math.ceil(total / limit),
      count: collections.length,
      totalRecords: total
    }
  });
});

// @desc    Get loan repayment statistics
// @route   GET /api/collections/stats/repayments
// @access  Private
const getRepaymentStats = asyncHandler(async (req, res) => {
  const { branch, startDate, endDate, groupLoanId } = req.query;

  const matchStage = { 
    status: { $in: ['processed', 'partially_processed'] } 
  };
  
  if (branch) matchStage.branch = Number(branch);
  if (groupLoanId) matchStage.groupLoanId = groupLoanId;
  if (startDate || endDate) {
    matchStage.collectionDate = {};
    if (startDate) matchStage.collectionDate.$gte = new Date(startDate);
    if (endDate) matchStage.collectionDate.$lte = new Date(endDate);
  }

  const stats = await Collection.aggregate([
    { $match: matchStage },
    { $unwind: '$loanRepayments' },
    { $match: { 'loanRepayments.status': 'processed' } },
    {
      $group: {
        _id: null,
        totalCollections: { $sum: 1 },
        totalPrincipal: { $sum: '$loanRepayments.principalAmount' },
        totalInterest: { $sum: '$loanRepayments.interestAmount' },
        totalPenalty: { $sum: '$loanRepayments.penaltyAmount' },
        totalRepaid: { $sum: '$loanRepayments.totalAmount' },
        uniqueLoanAccounts: { $addToSet: '$loanRepayments.loanAccountId' },
        uniqueGroups: { $addToSet: '$groupId' },
        uniqueGroupLoans: { $addToSet: '$groupLoanId' }
      }
    },
    {
      $project: {
        _id: 0,
        totalCollections: 1,
        totalPrincipal: 1,
        totalInterest: 1,
        totalPenalty: 1,
        totalRepaid: 1,
        uniqueLoanAccountsCount: { $size: '$uniqueLoanAccounts' },
        uniqueGroupsCount: { $size: '$uniqueGroups' },
        uniqueGroupLoansCount: { $size: '$uniqueGroupLoans' },
        averageRepayment: { $divide: ['$totalRepaid', '$totalCollections'] }
      }
    }
  ]);

  // Get repayment trends by date
  const trends = await Collection.aggregate([
    { $match: matchStage },
    { $unwind: '$loanRepayments' },
    { $match: { 'loanRepayments.status': 'processed' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$collectionDate' } },
        dailyPrincipal: { $sum: '$loanRepayments.principalAmount' },
        dailyInterest: { $sum: '$loanRepayments.interestAmount' },
        dailyPenalty: { $sum: '$loanRepayments.penaltyAmount' },
        dailyTotal: { $sum: '$loanRepayments.totalAmount' },
        collectionCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    { $limit: 30 }
  ]);

  res.json({
    success: true,
    data: {
      overview: stats[0] || {
        totalCollections: 0,
        totalPrincipal: 0,
        totalInterest: 0,
        totalPenalty: 0,
        totalRepaid: 0,
        uniqueLoanAccountsCount: 0,
        uniqueGroupsCount: 0,
        uniqueGroupLoansCount: 0,
        averageRepayment: 0
      },
      trends: trends
    }
  });
});

// Export ALL functions
export {
  createCollection,
  getCollections,
  getCollectionById,
  updateCollection,
  deleteCollection,
  approveCollection,
  rejectCollection,
  getCollectionsByGroup,
  getCollectionStats,
  processCollection,
  addLoanRepayment,
  addSavingsCollection,
  getCollectionBreakdown,
  getCollectionsByGroupLoan,
  getRepaymentStats
};