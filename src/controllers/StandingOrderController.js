// controllers/standingOrderController.js
import mongoose from 'mongoose';
import StandingOrder from '../models/StandingOrder.js';
import StandingOrderExecution from '../models/StandingOrderExecution.js';
import CustomerAccount from '../models/CustomerAccount.js';
import logger from '../utils/logger.js';

// -----------------------------------------------------------------------------
// Utility: Safe calculation of nextExecutionDate
// -----------------------------------------------------------------------------
function calculateNextExecutionDate(options) {
  const {
    frequency,
    interval = 1,
    dayOfWeek,
    dayOfMonth,
    weekOfMonth,
    startDate,
    currentDate = new Date()
  } = options;

  const start = new Date(startDate);
  const now = new Date(currentDate);

  // Validate startDate
  if (isNaN(start.getTime())) {
    throw new Error('Invalid startDate');
  }

  // Normalize times
  start.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  if (start > now) return start;

  let next;

  switch (frequency) {
    case 'daily': {
      const periodDays = interval;
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysPassed = Math.floor((now - start) / msPerDay);
      const numPeriods = Math.floor(daysPassed / periodDays);
      next = new Date(start.getTime() + (numPeriods + 1) * periodDays * msPerDay);
      break;
    }

    case 'weekly': {
      const periodDays = 7 * interval;
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysPassed = Math.floor((now - start) / msPerDay);
      const numPeriods = Math.floor(daysPassed / periodDays);
      next = new Date(start.getTime() + (numPeriods + 1) * periodDays * msPerDay);

      // Optional dayOfWeek alignment
      if (dayOfWeek !== undefined && next.getDay() !== ((dayOfWeek % 7) || 7)) {
        console.warn('Weekly alignment: startDate may not match intended dayOfWeek');
      }
      break;
    }

    case 'monthly': {
      if (!dayOfMonth && !(weekOfMonth && dayOfWeek)) {
        throw new Error('Monthly frequency requires dayOfMonth or weekOfMonth + dayOfWeek');
      }

      const monthsPassed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
      const numPeriods = Math.floor(monthsPassed / interval);
      let nextMonth = start.getMonth() + (numPeriods + 1) * interval;
      let nextYear = start.getFullYear() + Math.floor(nextMonth / 12);
      nextMonth %= 12;

      // Clamp to valid date in that month
      const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
      const day = Math.min(dayOfMonth || start.getDate(), daysInNextMonth);
      next = new Date(nextYear, nextMonth, day);
      break;
    }

    case 'yearly': {
      const yearsPassed = now.getFullYear() - start.getFullYear();
      const numPeriods = Math.floor(yearsPassed / interval);
      const nextYear = start.getFullYear() + (numPeriods + 1) * interval;
      next = new Date(nextYear, start.getMonth(), start.getDate());
      break;
    }

    default:
      throw new Error('Invalid frequency specified');
  }

  // Validate computed date
  if (!next || isNaN(next.getTime())) {
    throw new Error('Invalid nextExecutionDate computed');
  }

  next.setHours(0, 0, 0, 0);
  return next;
}

// -----------------------------------------------------------------------------
// Helper: Validate and fetch Standing Order by ID
// -----------------------------------------------------------------------------
async function findByIdAndCheckOwner(id, customerAcctNo) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid standing order ID');
  }
  const order = await StandingOrder.findById(id);
  if (!order) throw new Error('Standing order not found');
  if (order.customerAcctNo !== customerAcctNo) {
    throw new Error('Standing order does not belong to this customer account');
  }
  return order;
}

// -----------------------------------------------------------------------------
// Helper: Debit Customer Account
// -----------------------------------------------------------------------------
async function debitCustomerAccount(acctNo, amount, currency = 'NGN') {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const account = await CustomerAccount.findOne({ ACCT_NO: acctNo }).session(session);
    if (!account) throw new Error(`Customer account ${acctNo} not found`);
    if (!account.DR_ALLOWED) throw new Error(`Debits not allowed on account ${acctNo}`);
    if (parseFloat(account.AVAILABLE_BALANCE) < amount) {
      throw new Error(`Insufficient balance in account ${acctNo}. Available: ${account.AVAILABLE_BALANCE}, Required: ${amount}`);
    }

    // Debit balances
    const newLedger = (parseFloat(account.LEDGER_BAL) - amount).toFixed(2);
    const newCleared = (parseFloat(account.CLEARED_BAL) - amount).toFixed(2);
    const newAvailable = (parseFloat(account.AVAILABLE_BALANCE) - amount).toFixed(2);

    account.LEDGER_BAL = mongoose.Types.Decimal128.fromString(newLedger);
    account.CLEARED_BAL = mongoose.Types.Decimal128.fromString(newCleared);
    account.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(newAvailable);
    account.lastActivityDate = new Date();

    await account.save({ session });
    await session.commitTransaction();

    return account;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// -----------------------------------------------------------------------------
// CREATE: Create a new Standing Order
// -----------------------------------------------------------------------------
export const createStandingOrder = async (req, res) => {
  try {
    const { customerAcctNo } = req.params;
    const { 
      beneficiaryAcctNo, amount, currency = 'NGN', frequency, interval = 1,
      dayOfWeek, dayOfMonth, weekOfMonth, startDate, endDate, maxExecutions
    } = req.body;

    // Determine effective customer account
    const finalCustomerAcctNo = req.body.customerAcctNo || customerAcctNo;

    // Validate customer account
    const customerAccount = await CustomerAccount.findOne({ ACCT_NO: finalCustomerAcctNo });
    if (!customerAccount) {
      return res.status(404).json({ error: `Customer account ${finalCustomerAcctNo} not found` });
    }
    if (!customerAccount.DR_ALLOWED) {
      return res.status(400).json({ error: `Debits not allowed on account ${finalCustomerAcctNo}` });
    }

    // Compute next execution date safely
    let nextExecutionDate = null;
    try {
      const computedDate = calculateNextExecutionDate({ 
        frequency, interval, dayOfWeek, dayOfMonth, weekOfMonth, startDate,
        currentDate: new Date()
      });
      if (computedDate && !isNaN(new Date(computedDate).getTime())) {
        nextExecutionDate = new Date(computedDate);
      }
    } catch (calcErr) {
      logger.warn(`Could not compute nextExecutionDate: ${calcErr.message}`);
    }

    // Create standing order with pending status (requires approval to activate)
    const standingOrder = new StandingOrder({
      customerAcctNo: finalCustomerAcctNo,
      beneficiaryAcctNo,
      amount,
      currency,
      frequency,
      interval,
      dayOfWeek,
      dayOfMonth,
      weekOfMonth,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      maxExecutions,
      nextExecutionDate,
      isActive: false, // Initially inactive until approved
      status: 'PENDING_APPROVAL' // NEW: Explicit status for approval workflow
    });

    await standingOrder.save();

    // TODO: Trigger approval workflow (e.g., notify managers via email/queue, create approval record)
    logger.info('Standing order created and sent for approval', {
      standingOrderId: standingOrder._id,
      customerAcctNo: finalCustomerAcctNo
    });

    res.status(201).json({
      success: true,
      data: standingOrder,
      message: 'Standing order created successfully and sent for approval. It will be activated upon manager approval.'
    });

  } catch (error) {
    logger.error('Error creating standing order', { 
      error: error.message, 
      params: req.params, 
      body: req.body 
    });
    res.status(400).json({ error: error.message });
  }
};





export const approveStandingOrder = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    const { customerAcctNo } = req.params;
    const { approvedBy = req.user?.id || 'SYSTEM', comments = 'Approved by manager' } = req.body;

    // Validate user
    if (!req.user || !req.user.id) {
      throw { code: 'UNAUTHORIZED', message: 'Unauthorized: Manager required', status: 401 };
    }

    // Validate customerAcctNo
    if (!customerAcctNo) {
      throw { code: 'MISSING_PARAM', message: 'customerAcctNo is required', status: 400 };
    }

    // Find ALL pending standing orders for this customer
    const pendingOrders = await StandingOrder.find({ 
      customerAcctNo,
      status: 'PENDING_APPROVAL'
    }).session(session);

    if (pendingOrders.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: `No pending standing orders found for customer ${customerAcctNo}.`,
        count: 0
      });
    }

    // Bulk update all pending orders
    const updatedOrders = [];
    for (const standingOrder of pendingOrders) {
      standingOrder.status = 'APPROVED';
      standingOrder.isActive = true;
      standingOrder.approvedBy = approvedBy;
      standingOrder.approvedAt = new Date();
      standingOrder.comments = comments;

      // Recompute nextExecutionDate
      try {
        const computedNextDate = calculateNextExecutionDate({ 
          frequency: standingOrder.frequency, 
          interval: standingOrder.interval, 
          dayOfMonth: standingOrder.dayOfMonth, 
          startDate: standingOrder.startDate,
          currentDate: new Date()
        });
        standingOrder.nextExecutionDate = new Date(computedNextDate);
      } catch (calcErr) {
        logger.warn(`Could not recompute nextExecutionDate for order ${standingOrder._id}: ${calcErr.message}`);
      }

      await standingOrder.save({ session });
      updatedOrders.push(standingOrder);
    }

    await session.commitTransaction();
    transactionCompleted = true;

    logger.info('Bulk standing orders approved', {
      customerAcctNo,
      approvedBy,
      count: updatedOrders.length
    });

    res.status(200).json({
      success: true,
      data: updatedOrders,
      message: `Approved ${updatedOrders.length} standing order(s) for ${customerAcctNo}. They are now active.`,
      count: updatedOrders.length
    });

  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Bulk approval error', { error: error.message, params: req.params });
    res.status(error.status || 500).json({ 
      success: false,
      error: error.message || 'Bulk approval failed',
      code: error.code || 'APPROVAL_ERROR'
    });
  } finally {
    await session.endSession();
  }
};

// -----------------------------------------------------------------------------
// REJECT: Bulk Reject ALL Pending Standing Orders for a Customer (by customerAcctNo only)
// -----------------------------------------------------------------------------
export const rejectStandingOrder = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    // --- Extract customerAcctNo from BOTH URL params and request body ---
    const CUSTOMER_ACCT_NO = String(
      req.params.customerAcctNo ||  // From URL: /reject/2000001025
      req.body.customerAcctNo ||    // From body: { "customerAcctNo": "2000001025" }
      ''
    ).trim();

    const REJECTED_BY = String(req.body.rejectedBy || '').trim();

    console.log('🔍 FULL REQUEST ANALYSIS for Standing Order Rejection:', {
      'req.params': req.params,
      'req.body': req.body,
      'req.originalUrl': req.originalUrl,
      finalCustomerAcctNo: CUSTOMER_ACCT_NO,
      rejectedBy: REJECTED_BY
    });

    // --- Validation ---
    if (!CUSTOMER_ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'customerAcctNo is required',
        help: 'Provide it in URL (/reject/2000001025) OR request body ({ "customerAcctNo": "2000001025" })',
        received: {
          params: req.params,
          body: req.body
        }
      });
    }

    if (!REJECTED_BY) {
      return res.status(400).json({
        success: false,
        message: 'rejectedBy is required in request body',
        example: { "rejectedBy": "PCO06" }
      });
    }

    console.log('🔍 Processing bulk rejection for customerAcctNo:', CUSTOMER_ACCT_NO);

    // --- Find the customer account ---
    const customerAccount = await CustomerAccount.findOne({ ACCT_NO: CUSTOMER_ACCT_NO });
    if (!customerAccount) {
      console.log('❌ Customer account not found:', CUSTOMER_ACCT_NO);
      return res.status(404).json({
        success: false,
        message: `Customer account not found: ${CUSTOMER_ACCT_NO}`
      });
    }

    console.log('🔍 FOUND CUSTOMER ACCOUNT:', {
      ACCT_NO: customerAccount.ACCT_NO,
      _id: customerAccount._id
    });

    // --- Find ALL pending standing orders for this customer ---
    const pendingOrders = await StandingOrder.find({ 
      customerAcctNo: CUSTOMER_ACCT_NO,
      status: 'PENDING_APPROVAL'
    }).session(session);

    if (pendingOrders.length === 0) {
      console.log('❌ No pending standing orders for:', CUSTOMER_ACCT_NO);
      return res.status(200).json({
        success: true,
        data: [],
        message: `No pending standing orders found for customer account ${CUSTOMER_ACCT_NO}.`,
        count: 0
      });
    }

    console.log('🔍 FOUND PENDING ORDERS:', {
      count: pendingOrders.length,
      ids: pendingOrders.map(o => o._id)
    });

    // --- Bulk REJECT the standing orders ---
    const updatedOrders = [];
    for (const standingOrder of pendingOrders) {
      console.log('🔍 Rejecting standing order:', standingOrder._id);

      // Update to rejected and inactive
      standingOrder.status = 'REJECTED';
      standingOrder.isActive = false;
      standingOrder.rejectedBy = REJECTED_BY;
      standingOrder.rejectedAt = new Date();
      standingOrder.comments = comments;

      const updated = await standingOrder.save({ session });
      updatedOrders.push(updated);
      console.log('✅ Standing order rejected:', updated._id);
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // --- Audit trail via logger ---
    logger.info('Audit Event', {
      entity_type: 'STANDING_ORDER_REJECT',
      entity_id: updatedOrders.map(o => o._id),
      user_id: REJECTED_BY,
      action: `Bulk rejected ${updatedOrders.length} standing orders for customer ${CUSTOMER_ACCT_NO}`,
      old_value: 'PENDING_APPROVAL',
      new_value: 'REJECTED',
      ip_address: ipAddress,
      event_type: 'STANDING_ORDER_REJECT',
      outcome: 'success'
    });

    // --- Success response ---
    return res.status(200).json({
      success: true,
      message: `Bulk rejected ${updatedOrders.length} standing order(s) for customer account ${CUSTOMER_ACCT_NO}.`,
      data: {
        customerAcctNo: CUSTOMER_ACCT_NO,
        previousStatus: 'PENDING_APPROVAL',
        newStatus: 'REJECTED',
        rejectedBy: REJECTED_BY,
        rejectedAt: new Date(),
        count: updatedOrders.length,
        orders: updatedOrders.map(o => ({
          _id: o._id,
          status: o.status,
          isActive: o.isActive,
          rejectedBy: o.rejectedBy,
          customerAcctNo: o.customerAcctNo
        }))
      }
    });

  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    console.error('❌ BULK REJECTION ERROR:', error);
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    logger.error('Audit Event', {
      entity_type: 'STANDING_ORDER_REJECT',
      entity_id: req.params.customerAcctNo || null,
      user_id: req.body.rejectedBy || 'SYSTEM',
      action: 'bulk_reject_standing_order',
      old_value: null,
      new_value: null,
      ip_address: ipAddress,
      event_type: 'STANDING_ORDER_REJECT_ERROR',
      outcome: 'failure',
      error: error.message
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error during bulk rejection',
      error: error.message
    });
  }
};

// READ: Get standing orders for a customer (unchanged, uses param)
export const getStandingOrders = async (req, res) => {
  try {
    const { customerAcctNo } = req.params;
    const { page = 1, limit = 10, isActive } = req.query;

    const query = { customerAcctNo };
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const standingOrders = await StandingOrder.find(query)
      .populate({ 
        path: 'customerAcctNo', 
        select: 'ACCT_NO ACCT_NM LEDGER_BAL REC_ST', 
        match: { ACCT_NO: customerAcctNo }  // Extra safety
      })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await StandingOrder.countDocuments(query);

    res.json({
      success: true,
      data: standingOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching standing orders', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
};

// UPDATE: Update a standing order (now scoped to customerAcctNo)
export const updateStandingOrder = async (req, res) => {
  try {
    const { customerAcctNo, id } = req.params;
    const updates = req.body;

    const standingOrder = await findByIdAndCheckOwner(id, customerAcctNo);  // Validates ownership

    // Re-validate customer account if updating acctNo
    if (updates.customerAcctNo && updates.customerAcctNo !== standingOrder.customerAcctNo) {
      const newAccount = await CustomerAccount.findOne({ ACCT_NO: updates.customerAcctNo });
      if (!newAccount || !newAccount.DR_ALLOWED) {
        return res.status(400).json({ error: `Invalid customer account for debits` });
      }
    }

    // Recalculate nextExecutionDate if recurrence fields change
    if (updates.frequency || updates.interval || updates.dayOfWeek || updates.dayOfMonth || updates.weekOfMonth) {
      const nextDate = calculateNextExecutionDate({
        frequency: updates.frequency || standingOrder.frequency,
        interval: updates.interval || standingOrder.interval,
        dayOfWeek: updates.dayOfWeek !== undefined ? updates.dayOfWeek : standingOrder.dayOfWeek,
        dayOfMonth: updates.dayOfMonth !== undefined ? updates.dayOfMonth : standingOrder.dayOfMonth,
        weekOfMonth: updates.weekOfMonth !== undefined ? updates.weekOfMonth : standingOrder.weekOfMonth,
        startDate: standingOrder.startDate,
        currentDate: new Date()  // Add this for consistency
      });
      updates.nextExecutionDate = nextDate;
    }

    Object.assign(standingOrder, updates);
    await standingOrder.save();

    logger.info(`Standing order updated`, { standingOrderId: id, customerAcctNo });

    res.json({
      success: true,
      data: standingOrder,
      message: 'Standing order updated successfully'
    });
  } catch (error) {
    logger.error('Error updating standing order', { error: error.message, params: req.params });
    res.status(400).json({ error: error.message });
  }
};

// DELETE: Delete a standing order (now scoped to customerAcctNo)
export const deleteStandingOrder = async (req, res) => {
  try {
    const { customerAcctNo, id } = req.params;

    const standingOrder = await findByIdAndCheckOwner(id, customerAcctNo);  // Validates ownership

    await standingOrder.deleteOne();

    // Optional: Delete related executions
    await StandingOrderExecution.deleteMany({ standingOrderId: standingOrder._id });

    logger.info(`Standing order deleted`, { standingOrderId: id, customerAcctNo });

    res.json({
      success: true,
      message: 'Standing order deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting standing order', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
};

// PROCESS: Manually trigger execution (now scoped to customerAcctNo)
export const processStandingOrderExecution = async (req, res) => {
  try {
    const { customerAcctNo, id } = req.params;
    const now = new Date();  // Current date: October 27, 2025

    const standingOrder = await findByIdAndCheckOwner(id, customerAcctNo);  // Validates ownership
    if (!standingOrder.isActive) {
      return res.status(400).json({ error: 'Standing order is not active' });
    }

    if (standingOrder.nextExecutionDate > now) {
      return res.status(400).json({ error: 'Next execution date not reached yet' });
    }

    // Check bounds (unchanged)
    if (standingOrder.endDate && standingOrder.endDate < now) {
      standingOrder.isActive = false;
      await standingOrder.save();
      return res.status(400).json({ error: 'Standing order has expired' });
    }

    if (standingOrder.maxExecutions) {
      const executionCount = await StandingOrderExecution.countDocuments({ standingOrderId: id });
      if (executionCount >= standingOrder.maxExecutions) {
        standingOrder.isActive = false;
        await standingOrder.save();
        return res.status(400).json({ error: 'Maximum executions reached' });
      }
    }

    // Debit customer account
    try {
      await debitCustomerAccount(standingOrder.customerAcctNo, standingOrder.amount, standingOrder.currency);

      // Credit beneficiary (implement if needed)
      // await creditBeneficiaryAccount(standingOrder.beneficiaryAcctNo, standingOrder.amount);

      // Create success execution
      const execution = new StandingOrderExecution({
        standingOrderId: standingOrder._id,
        executionDate: now,
        amount: standingOrder.amount,
        currency: standingOrder.currency,
        status: 'success'
      });
      await execution.save();

      // Update next execution date
      const nextDate = calculateNextExecutionDate({
        frequency: standingOrder.frequency,
        interval: standingOrder.interval,
        dayOfWeek: standingOrder.dayOfWeek,
        dayOfMonth: standingOrder.dayOfMonth,
        weekOfMonth: standingOrder.weekOfMonth,
        startDate: standingOrder.startDate,
        currentDate: now  // For calculation offset after execution
      });
      standingOrder.nextExecutionDate = nextDate;
      await standingOrder.save();

      logger.info(`Standing order executed successfully`, { standingOrderId: id, customerAcctNo, executionId: execution._id });

      res.json({
        success: true,
        data: { execution, updatedStandingOrder: standingOrder },
        message: 'Standing order executed successfully'
      });
    } catch (debitError) {
      // Create failed execution
      const execution = new StandingOrderExecution({
        standingOrderId: standingOrder._id,
        executionDate: now,
        amount: standingOrder.amount,
        currency: standingOrder.currency,
        status: 'failed',
        failureReason: debitError.message
      });
      await execution.save();

      logger.error(`Standing order execution failed`, { standingOrderId: id, customerAcctNo, error: debitError.message });

      res.status(400).json({
        success: false,
        error: debitError.message,
        data: { execution }
      });
    }
  } catch (error) {
    logger.error('Error processing standing order execution', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
};

// GET EXECUTIONS: Get executions for a standing order (now scoped to customerAcctNo)
export const getStandingOrderExecutions = async (req, res) => {
  try {
    const { customerAcctNo, id } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    await findByIdAndCheckOwner(id, customerAcctNo);  // Validates ownership (no populate needed)

    const query = { standingOrderId: id };
    if (status) {
      query.status = status;
    }

    const executions = await StandingOrderExecution.find(query)
      .sort({ executionDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await StandingOrderExecution.countDocuments(query);

    res.json({
      success: true,
      data: executions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching standing order executions', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
};