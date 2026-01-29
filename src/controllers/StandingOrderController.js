// controllers/standingOrderController.js
import { Sequelize, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import StandingOrder from '../models/StandingOrder.js';
import StandingOrderExecution from '../models/StandingOrderExecution.js';
import CustomerAccount from '../models/CustomerAccount.js';
import logger from '../utils/logger.js';

// -----------------------------------------------------------------------------
// Utility: Safe calculation of nextExecutionDate (unchanged - pure JavaScript)
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
// Helper: Validate and fetch Standing Order by ID with ownership check
// -----------------------------------------------------------------------------
async function findByIdAndCheckOwner(id, customerAcctNo) {
  const standingOrder = await StandingOrder.findByPk(id);
  
  if (!standingOrder) {
    throw new Error('Standing order not found');
  }
  
  if (standingOrder.customerAcctNo !== customerAcctNo) {
    throw new Error('Standing order does not belong to this customer account');
  }
  
  return standingOrder;
}

// -----------------------------------------------------------------------------
// Helper: Debit Customer Account using Sequelize transaction
// -----------------------------------------------------------------------------
async function debitCustomerAccount(acctNo, amount, currency = 'NGN') {
  const transaction = await sequelize.transaction();

  try {
    // Find account with row lock for concurrency control
    const account = await CustomerAccount.findOne({
      where: { ACCT_NO: acctNo },
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!account) {
      throw new Error(`Customer account ${acctNo} not found`);
    }
    if (!account.DR_ALLOWED) {
      throw new Error(`Debits not allowed on account ${acctNo}`);
    }

    // Convert to numbers for comparison
    const availableBalance = parseFloat(account.AVAILABLE_BALANCE);
    if (availableBalance < amount) {
      throw new Error(`Insufficient balance in account ${acctNo}. Available: ${availableBalance}, Required: ${amount}`);
    }

    // Debit balances
    const newLedger = (parseFloat(account.LEDGER_BAL) - amount).toFixed(2);
    const newCleared = (parseFloat(account.CLEARED_BAL) - amount).toFixed(2);
    const newAvailable = (availableBalance - amount).toFixed(2);

    await account.update({
      LEDGER_BAL: newLedger,
      CLEARED_BAL: newCleared,
      AVAILABLE_BALANCE: newAvailable,
      lastActivityDate: new Date()
    }, { transaction });

    await transaction.commit();
    return account;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// -----------------------------------------------------------------------------
// CREATE: Create a new Standing Order
// -----------------------------------------------------------------------------
export const createStandingOrder = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { customerAcctNo } = req.params;
    const { 
      beneficiaryAcctNo, amount, currency = 'NGN', frequency, interval = 1,
      dayOfWeek, dayOfMonth, weekOfMonth, startDate, endDate, maxExecutions
    } = req.body;

    // Determine effective customer account
    const finalCustomerAcctNo = req.body.customerAcctNo || customerAcctNo;

    // Validate customer account
    const customerAccount = await CustomerAccount.findOne({ 
      where: { ACCT_NO: finalCustomerAcctNo },
      transaction
    });

    if (!customerAccount) {
      await transaction.rollback();
      return res.status(404).json({ error: `Customer account ${finalCustomerAcctNo} not found` });
    }

    if (!customerAccount.DR_ALLOWED) {
      await transaction.rollback();
      return res.status(400).json({ error: `Debits not allowed on account ${finalCustomerAcctNo}` });
    }

    // Validate startDate
    const startDateObj = new Date(startDate);
    if (isNaN(startDateObj.getTime())) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Invalid startDate' });
    }

    // Compute next execution date safely
    let nextExecutionDate = null;
    try {
      const computedDate = calculateNextExecutionDate({ 
        frequency, interval, dayOfWeek, dayOfMonth, weekOfMonth, 
        startDate: startDateObj,
        currentDate: new Date()
      });
      if (computedDate && !isNaN(new Date(computedDate).getTime())) {
        nextExecutionDate = new Date(computedDate);
      }
    } catch (calcErr) {
      logger.warn(`Could not compute nextExecutionDate: ${calcErr.message}`);
    }

    // Create standing order with pending status
    const standingOrder = await StandingOrder.create({
      customerAcctNo: finalCustomerAcctNo,
      beneficiaryAcctNo,
      amount,
      currency,
      frequency,
      interval,
      dayOfWeek,
      dayOfMonth,
      weekOfMonth,
      startDate: startDateObj,
      endDate: endDate ? new Date(endDate) : null,
      maxExecutions,
      nextExecutionDate,
      isActive: false,
      status: 'PENDING_APPROVAL',
      createdAt: new Date(),
      updatedAt: new Date()
    }, { transaction });

    await transaction.commit();

    logger.info('Standing order created and sent for approval', {
      standingOrderId: standingOrder.id,
      customerAcctNo: finalCustomerAcctNo
    });

    res.status(201).json({
      success: true,
      data: standingOrder,
      message: 'Standing order created successfully and sent for approval.'
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error creating standing order', { 
      error: error.message, 
      params: req.params, 
      body: req.body 
    });
    res.status(400).json({ error: error.message });
  }
};

// -----------------------------------------------------------------------------
// APPROVE: Bulk Approve ALL Pending Standing Orders for a Customer
// -----------------------------------------------------------------------------
export const approveStandingOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  let transactionCompleted = false;

  try {
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
    const pendingOrders = await StandingOrder.findAll({ 
      where: { 
        customerAcctNo,
        status: 'PENDING_APPROVAL'
      },
      transaction
    });

    if (pendingOrders.length === 0) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        data: [],
        message: `No pending standing orders found for customer ${customerAcctNo}.`,
        count: 0
      });
    }

    // Bulk update all pending orders
    const updatedOrders = [];
    const updatePromises = [];

    for (const standingOrder of pendingOrders) {
      const nextExecutionDate = calculateNextExecutionDate({ 
        frequency: standingOrder.frequency, 
        interval: standingOrder.interval, 
        dayOfMonth: standingOrder.dayOfMonth, 
        startDate: standingOrder.startDate,
        currentDate: new Date()
      });

      const updatePromise = standingOrder.update({
        status: 'APPROVED',
        isActive: true,
        approvedBy,
        approvedAt: new Date(),
        comments,
        nextExecutionDate: new Date(nextExecutionDate),
        updatedAt: new Date()
      }, { transaction });

      updatePromises.push(updatePromise);
    }

    const results = await Promise.all(updatePromises);
    updatedOrders.push(...results);

    await transaction.commit();
    transactionCompleted = true;

    logger.info('Bulk standing orders approved', {
      customerAcctNo,
      approvedBy,
      count: updatedOrders.length
    });

    res.status(200).json({
      success: true,
      data: updatedOrders,
      message: `Approved ${updatedOrders.length} standing order(s) for ${customerAcctNo}.`,
      count: updatedOrders.length
    });

  } catch (error) {
    if (!transactionCompleted) {
      await transaction.rollback();
    }
    logger.error('Bulk approval error', { error: error.message, params: req.params });
    res.status(error.status || 500).json({ 
      success: false,
      error: error.message || 'Bulk approval failed',
      code: error.code || 'APPROVAL_ERROR'
    });
  }
};

// -----------------------------------------------------------------------------
// REJECT: Bulk Reject ALL Pending Standing Orders for a Customer
// -----------------------------------------------------------------------------
export const rejectStandingOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  let transactionCompleted = false;

  try {
    // Extract customerAcctNo from both URL params and request body
    const CUSTOMER_ACCT_NO = String(
      req.params.customerAcctNo || 
      req.body.customerAcctNo || 
      ''
    ).trim();

    const REJECTED_BY = String(req.body.rejectedBy || '').trim();
    const comments = req.body.comments || 'Rejected by manager';

    // Validation
    if (!CUSTOMER_ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'customerAcctNo is required',
        help: 'Provide it in URL or request body'
      });
    }

    if (!REJECTED_BY) {
      return res.status(400).json({
        success: false,
        message: 'rejectedBy is required in request body'
      });
    }

    // Find the customer account
    const customerAccount = await CustomerAccount.findOne({ 
      where: { ACCT_NO: CUSTOMER_ACCT_NO },
      transaction
    });

    if (!customerAccount) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Customer account not found: ${CUSTOMER_ACCT_NO}`
      });
    }

    // Find ALL pending standing orders for this customer
    const pendingOrders = await StandingOrder.findAll({ 
      where: { 
        customerAcctNo: CUSTOMER_ACCT_NO,
        status: 'PENDING_APPROVAL'
      },
      transaction
    });

    if (pendingOrders.length === 0) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        data: [],
        message: `No pending standing orders found for customer account ${CUSTOMER_ACCT_NO}.`,
        count: 0
      });
    }

    // Bulk REJECT the standing orders
    const updatedOrders = [];
    const updatePromises = [];

    for (const standingOrder of pendingOrders) {
      const updatePromise = standingOrder.update({
        status: 'REJECTED',
        isActive: false,
        rejectedBy: REJECTED_BY,
        rejectedAt: new Date(),
        comments,
        updatedAt: new Date()
      }, { transaction });

      updatePromises.push(updatePromise);
    }

    const results = await Promise.all(updatePromises);
    updatedOrders.push(...results);

    await transaction.commit();
    transactionCompleted = true;

    // Audit trail via logger
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    logger.info('Audit Event', {
      entity_type: 'STANDING_ORDER_REJECT',
      entity_id: updatedOrders.map(o => o.id),
      user_id: REJECTED_BY,
      action: `Bulk rejected ${updatedOrders.length} standing orders`,
      old_value: 'PENDING_APPROVAL',
      new_value: 'REJECTED',
      ip_address: ipAddress,
      outcome: 'success'
    });

    res.status(200).json({
      success: true,
      message: `Bulk rejected ${updatedOrders.length} standing order(s) for customer account ${CUSTOMER_ACCT_NO}.`,
      data: {
        customerAcctNo: CUSTOMER_ACCT_NO,
        rejectedBy: REJECTED_BY,
        rejectedAt: new Date(),
        count: updatedOrders.length,
        orders: updatedOrders.map(o => ({
          id: o.id,
          status: o.status,
          isActive: o.isActive,
          rejectedBy: o.rejectedBy,
          customerAcctNo: o.customerAcctNo
        }))
      }
    });

  } catch (error) {
    if (!transactionCompleted) {
      await transaction.rollback();
    }
    
    logger.error('BULK REJECTION ERROR:', error);
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    logger.error('Audit Event', {
      entity_type: 'STANDING_ORDER_REJECT',
      user_id: req.body.rejectedBy || 'SYSTEM',
      action: 'bulk_reject_standing_order',
      ip_address: ipAddress,
      outcome: 'failure',
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during bulk rejection',
      error: error.message
    });
  }
};

// -----------------------------------------------------------------------------
// READ: Get standing orders for a customer
// -----------------------------------------------------------------------------
export const getStandingOrders = async (req, res) => {
  try {
    const { customerAcctNo } = req.params;
    const { page = 1, limit = 10, isActive } = req.query;

    const where = { customerAcctNo };
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const offset = (page - 1) * limit;

    const { count, rows: standingOrders } = await StandingOrder.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: [{
        model: CustomerAccount,
        as: 'customerAccount',
        where: { ACCT_NO: customerAcctNo },
        attributes: ['ACCT_NO', 'ACCT_NM', 'LEDGER_BAL', 'REC_ST'],
        required: true
      }]
    });

    res.json({
      success: true,
      data: standingOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching standing orders', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
};

// -----------------------------------------------------------------------------
// UPDATE: Update a standing order
// -----------------------------------------------------------------------------
export const updateStandingOrder = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { customerAcctNo, id } = req.params;
    const updates = req.body;

    const standingOrder = await findByIdAndCheckOwner(id, customerAcctNo);

    // Re-validate customer account if updating acctNo
    if (updates.customerAcctNo && updates.customerAcctNo !== standingOrder.customerAcctNo) {
      const newAccount = await CustomerAccount.findOne({ 
        where: { ACCT_NO: updates.customerAcctNo },
        transaction
      });
      
      if (!newAccount || !newAccount.DR_ALLOWED) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Invalid customer account for debits' });
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
        currentDate: new Date()
      });
      updates.nextExecutionDate = nextDate;
    }

    updates.updatedAt = new Date();

    await standingOrder.update(updates, { transaction });
    await transaction.commit();

    logger.info('Standing order updated', { standingOrderId: id, customerAcctNo });

    res.json({
      success: true,
      data: standingOrder,
      message: 'Standing order updated successfully'
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating standing order', { error: error.message, params: req.params });
    res.status(400).json({ error: error.message });
  }
};

// -----------------------------------------------------------------------------
// DELETE: Delete a standing order
// -----------------------------------------------------------------------------
export const deleteStandingOrder = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { customerAcctNo, id } = req.params;

    const standingOrder = await findByIdAndCheckOwner(id, customerAcctNo);

    // Delete related executions first
    await StandingOrderExecution.destroy({
      where: { standingOrderId: id },
      transaction
    });

    // Delete the standing order
    await standingOrder.destroy({ transaction });
    await transaction.commit();

    logger.info('Standing order deleted', { standingOrderId: id, customerAcctNo });

    res.json({
      success: true,
      message: 'Standing order deleted successfully'
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting standing order', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
};

// -----------------------------------------------------------------------------
// PROCESS: Manually trigger execution
// -----------------------------------------------------------------------------
export const processStandingOrderExecution = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { customerAcctNo, id } = req.params;
    const now = new Date();

    const standingOrder = await findByIdAndCheckOwner(id, customerAcctNo);
    
    if (!standingOrder.isActive) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Standing order is not active' });
    }

    if (standingOrder.nextExecutionDate > now) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Next execution date not reached yet' });
    }

    // Check bounds
    if (standingOrder.endDate && standingOrder.endDate < now) {
      await standingOrder.update({ isActive: false }, { transaction });
      await transaction.commit();
      return res.status(400).json({ error: 'Standing order has expired' });
    }

    if (standingOrder.maxExecutions) {
      const executionCount = await StandingOrderExecution.count({
        where: { standingOrderId: id },
        transaction
      });
      
      if (executionCount >= standingOrder.maxExecutions) {
        await standingOrder.update({ isActive: false }, { transaction });
        await transaction.commit();
        return res.status(400).json({ error: 'Maximum executions reached' });
      }
    }

    // Debit customer account
    try {
      await debitCustomerAccount(standingOrder.customerAcctNo, standingOrder.amount, standingOrder.currency);

      // Create success execution
      const execution = await StandingOrderExecution.create({
        standingOrderId: standingOrder.id,
        executionDate: now,
        amount: standingOrder.amount,
        currency: standingOrder.currency,
        status: 'success'
      }, { transaction });

      // Update next execution date
      const nextDate = calculateNextExecutionDate({
        frequency: standingOrder.frequency,
        interval: standingOrder.interval,
        dayOfWeek: standingOrder.dayOfWeek,
        dayOfMonth: standingOrder.dayOfMonth,
        weekOfMonth: standingOrder.weekOfMonth,
        startDate: standingOrder.startDate,
        currentDate: now
      });

      await standingOrder.update({
        nextExecutionDate: new Date(nextDate),
        updatedAt: new Date()
      }, { transaction });

      await transaction.commit();

      logger.info('Standing order executed successfully', { 
        standingOrderId: id, 
        customerAcctNo, 
        executionId: execution.id 
      });

      res.json({
        success: true,
        data: { execution, updatedStandingOrder: standingOrder },
        message: 'Standing order executed successfully'
      });

    } catch (debitError) {
      // Create failed execution
      const execution = await StandingOrderExecution.create({
        standingOrderId: standingOrder.id,
        executionDate: now,
        amount: standingOrder.amount,
        currency: standingOrder.currency,
        status: 'failed',
        failureReason: debitError.message
      }, { transaction });

      await transaction.commit();

      logger.error('Standing order execution failed', { 
        standingOrderId: id, 
        customerAcctNo, 
        error: debitError.message 
      });

      res.status(400).json({
        success: false,
        error: debitError.message,
        data: { execution }
      });
    }

  } catch (error) {
    await transaction.rollback();
    logger.error('Error processing standing order execution', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
};

// -----------------------------------------------------------------------------
// GET EXECUTIONS: Get executions for a standing order
// -----------------------------------------------------------------------------
export const getStandingOrderExecutions = async (req, res) => {
  try {
    const { customerAcctNo, id } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    await findByIdAndCheckOwner(id, customerAcctNo);

    const where = { standingOrderId: id };
    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows: executions } = await StandingOrderExecution.findAndCountAll({
      where,
      order: [['executionDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: executions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching standing order executions', { error: error.message, params: req.params });
    res.status(500).json({ error: error.message });
  }
};

// -----------------------------------------------------------------------------
// ADDITIONAL HELPER: Process due standing orders (cron job)
// -----------------------------------------------------------------------------
export const processDueStandingOrders = async () => {
  const transaction = await sequelize.transaction();
  
  try {
    const now = new Date();
    
    // Find all active standing orders due for execution
    const dueOrders = await StandingOrder.findAll({
      where: {
        isActive: true,
        status: 'APPROVED',
        nextExecutionDate: {
          [Op.lte]: now
        }
      },
      transaction
    });

    const results = {
      successful: 0,
      failed: 0,
      processed: [],
      errors: []
    };

    for (const order of dueOrders) {
      try {
        // Check if order has expired
        if (order.endDate && order.endDate < now) {
          await order.update({ isActive: false }, { transaction });
          continue;
        }

        // Check max executions
        if (order.maxExecutions) {
          const executionCount = await StandingOrderExecution.count({
            where: { standingOrderId: order.id },
            transaction
          });
          
          if (executionCount >= order.maxExecutions) {
            await order.update({ isActive: false }, { transaction });
            continue;
          }
        }

        // Debit customer account
        await debitCustomerAccount(order.customerAcctNo, order.amount, order.currency);

        // Create execution record
        await StandingOrderExecution.create({
          standingOrderId: order.id,
          executionDate: now,
          amount: order.amount,
          currency: order.currency,
          status: 'success'
        }, { transaction });

        // Calculate next execution date
        const nextDate = calculateNextExecutionDate({
          frequency: order.frequency,
          interval: order.interval,
          dayOfWeek: order.dayOfWeek,
          dayOfMonth: order.dayOfMonth,
          weekOfMonth: order.weekOfMonth,
          startDate: order.startDate,
          currentDate: now
        });

        await order.update({
          nextExecutionDate: new Date(nextDate),
          updatedAt: new Date()
        }, { transaction });

        results.successful++;
        results.processed.push(order.id);

      } catch (error) {
        // Create failed execution record
        await StandingOrderExecution.create({
          standingOrderId: order.id,
          executionDate: now,
          amount: order.amount,
          currency: order.currency,
          status: 'failed',
          failureReason: error.message
        }, { transaction });

        results.failed++;
        results.errors.push({
          orderId: order.id,
          error: error.message
        });
        
        logger.error('Failed to process standing order', {
          orderId: order.id,
          error: error.message
        });
      }
    }

    await transaction.commit();
    
    logger.info('Processed due standing orders', results);
    return results;

  } catch (error) {
    await transaction.rollback();
    logger.error('Error processing due standing orders', { error: error.message });
    throw error;
  }
};