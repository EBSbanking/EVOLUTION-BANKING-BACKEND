import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../config/db.js'; // MySQL connection pool

const router = express.Router();

// Webhook authentication middleware
const webhookAuthMiddleware = (req, res, next) => {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const signature = req.headers['x-webhook-signature'];
  if (!signature || !webhookSecret) return res.status(401).json({ success: false, message: 'Missing or invalid webhook signature' });

  const payload = JSON.stringify(req.body);
  const computedSignature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

  if (signature !== computedSignature) return res.status(401).json({ success: false, message: 'Invalid webhook signature' });

  req.user = { id: 'WebhookSystem' };
  next();
};

// POST webhook endpoint
router.post('/webhook', webhookAuthMiddleware, async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      INWD_FUNDS_XFER_ID,
      XFER_REF,
      PAYMENT_MTD_CD,
      XFER_CRNCY_ID,
      XFER_AMT,
      PAY_CRNCY_ID,
      PAY_EXCH_RATE,
      VALUE_DT,
      PRIORITY_LEVEL_CD,
      BENEFICIARY_ACCT,
      BENEFICIARY_BIC_ID,
      BENEFICIARY_BANK_NM,
      BENEFICIARY_BANK_CNTRY_ID,
      REMITTER_NM,
      REC_ST = 'P',
      SENDING_BANK_CHRG,
      RECIEVING_BANK_CHRG,
      TOTAL_CHRG,
      ...optionalFields
    } = req.body;

    // Validate required fields
    if (!INWD_FUNDS_XFER_ID || !XFER_REF || !XFER_CRNCY_ID || !XFER_AMT || !PAY_CRNCY_ID ||
        !PAY_EXCH_RATE || !VALUE_DT || !PRIORITY_LEVEL_CD || !BENEFICIARY_ACCT ||
        !BENEFICIARY_BIC_ID || !BENEFICIARY_BANK_NM || !BENEFICIARY_BANK_CNTRY_ID || !REMITTER_NM) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!['A', 'P'].includes(REC_ST)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Invalid REC_ST. Must be A or P' });
    }

    // Check if account exists in CustomerAccount table
    const [accountRows] = await connection.query(
      'SELECT ACCT_NO FROM CustomerAccount WHERE ACCT_NO = ?',
      [BENEFICIARY_ACCT]
    );
    
    if (accountRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `CustomerAccount with ACCT_NO ${BENEFICIARY_ACCT} not found` });
    }

    // Validate amounts
    const amount = Number(XFER_AMT);
    if (amount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Transfer amount must be positive' });
    }

    const totalCharges = (Number(TOTAL_CHRG) || 0) + (Number(SENDING_BANK_CHRG) || 0) + (Number(RECIEVING_BANK_CHRG) || 0);
    const netAmount = Number(optionalFields.NET_AMT_XFERED || (amount - totalCharges));
    if (netAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Net amount must be positive' });
    }

    // Prepare data for insertion
    const transferData = {
      INWD_FUNDS_XFER_ID,
      XFER_REF,
      PAYMENT_MTD_CD,
      XFER_CRNCY_ID,
      XFER_AMT: amount.toFixed(10),
      SENDING_BANK_CHRG: SENDING_BANK_CHRG ? Number(SENDING_BANK_CHRG).toFixed(10) : null,
      RECIEVING_BANK_CHRG: RECIEVING_BANK_CHRG ? Number(RECIEVING_BANK_CHRG).toFixed(10) : null,
      TOTAL_CHRG: TOTAL_CHRG ? Number(TOTAL_CHRG).toFixed(10) : null,
      NET_AMT_XFERED: netAmount.toFixed(10),
      PAY_CRNCY_ID,
      PAY_EXCH_RATE: Number(PAY_EXCH_RATE).toFixed(10),
      VALUE_DT: new Date(VALUE_DT),
      PRIORITY_LEVEL_CD,
      BENEFICIARY_ACCT,
      BENEFICIARY_BIC_ID,
      BENEFICIARY_BANK_NM,
      BENEFICIARY_BANK_CNTRY_ID,
      REMITTER_NM,
      REC_ST,
      VERSION_NO: 1,
      ROW_TS: new Date(),
      USER_ID: req.user.id,
      CREATE_DT: new Date(),
      CREATED_BY: req.user.id,
      SYS_CREATE_TS: new Date(),
      REPAIR_FG: 'N',
      FOREIGN_IFT_FG: optionalFields.FOREIGN_IFT_FG || 'N',
      ...optionalFields,
    };

    // Remove any undefined values
    Object.keys(transferData).forEach(key => {
      if (transferData[key] === undefined) {
        delete transferData[key];
      }
    });

    // Insert into INWD_FUNDS_XFER table
    const columns = Object.keys(transferData).join(', ');
    const placeholders = Object.keys(transferData).map(() => '?').join(', ');
    const values = Object.values(transferData);

    const [result] = await connection.query(
      `INSERT INTO INWD_FUNDS_XFER (${columns}) VALUES (${placeholders})`,
      values
    );

    // Create audit trail entry
    const auditTrailData = {
      EVENT_ID: uuidv4(),
      EVENT_TYPE: 'InwardFundsTransfer_Webhook_Create',
      EVENT_TS: new Date(),
      USER_ID: req.user.id,
      EVENT_DESC: `Created InwardFundsTransfer ${INWD_FUNDS_XFER_ID} via webhook`,
      MODULE: 'InwardFundsTransfer',
      IP_ADDRESS: req.ip,
      RECORD_ID: INWD_FUNDS_XFER_ID.toString(),
    };

    const auditColumns = Object.keys(auditTrailData).join(', ');
    const auditPlaceholders = Object.keys(auditTrailData).map(() => '?').join(', ');
    const auditValues = Object.values(auditTrailData);

    await connection.query(
      `INSERT INTO AuditTrail (${auditColumns}) VALUES (${auditPlaceholders})`,
      auditValues
    );

    await connection.commit();
    res.status(201).json({
      success: true,
      data: { INWD_FUNDS_XFER_ID, XFER_REF, REC_ST, NET_AMT_XFERED: netAmount.toFixed(2) },
    });
  } catch (err) {
    await connection.rollback();
    console.error('Webhook error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

// GET transfer by ID
router.get('/:id', webhookAuthMiddleware, async (req, res) => {
  const pool = getPool();
  
  try {
    const [rows] = await pool.query(
      'SELECT * FROM INWD_FUNDS_XFER WHERE INWD_FUNDS_XFER_ID = ?',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transfer not found' });
    }

    const transfer = rows[0];
    
    res.json({
      success: true,
      data: {
        INWD_FUNDS_XFER_ID: transfer.INWD_FUNDS_XFER_ID,
        XFER_REF: transfer.XFER_REF,
        REC_ST: transfer.REC_ST,
        NET_AMT_XFERED: Number(transfer.NET_AMT_XFERED).toFixed(2),
        VALUE_DT: transfer.VALUE_DT,
        CREATED_BY: transfer.CREATED_BY,
        CREATE_DT: transfer.CREATE_DT,
      },
    });
  } catch (err) {
    console.error('Get transfer error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Additional helper endpoints

// GET all transfers with pagination
router.get('/', webhookAuthMiddleware, async (req, res) => {
  const pool = getPool();
  const { page = 1, limit = 20, status } = req.query;
  const offset = (page - 1) * limit;
  
  try {
    let query = 'SELECT * FROM INWD_FUNDS_XFER';
    let countQuery = 'SELECT COUNT(*) as total FROM INWD_FUNDS_XFER';
    const queryParams = [];
    const countParams = [];
    
    if (status) {
      query += ' WHERE REC_ST = ?';
      countQuery += ' WHERE REC_ST = ?';
      queryParams.push(status);
      countParams.push(status);
    }
    
    query += ' ORDER BY CREATE_DT DESC LIMIT ? OFFSET ?';
    queryParams.push(parseInt(limit), parseInt(offset));
    
    const [rows] = await pool.query(query, queryParams);
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;
    
    res.json({
      success: true,
      data: rows.map(transfer => ({
        INWD_FUNDS_XFER_ID: transfer.INWD_FUNDS_XFER_ID,
        XFER_REF: transfer.XFER_REF,
        REC_ST: transfer.REC_ST,
        NET_AMT_XFERED: Number(transfer.NET_AMT_XFERED).toFixed(2),
        VALUE_DT: transfer.VALUE_DT,
        BENEFICIARY_ACCT: transfer.BENEFICIARY_ACCT,
        REMITTER_NM: transfer.REMITTER_NM,
        CREATED_BY: transfer.CREATED_BY,
        CREATE_DT: transfer.CREATE_DT,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Get transfers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET transfers by beneficiary account
router.get('/account/:accountNumber', webhookAuthMiddleware, async (req, res) => {
  const pool = getPool();
  
  try {
    const [rows] = await pool.query(
      'SELECT * FROM INWD_FUNDS_XFER WHERE BENEFICIARY_ACCT = ? ORDER BY CREATE_DT DESC',
      [req.params.accountNumber]
    );
    
    res.json({
      success: true,
      data: rows.map(transfer => ({
        INWD_FUNDS_XFER_ID: transfer.INWD_FUNDS_XFER_ID,
        XFER_REF: transfer.XFER_REF,
        REC_ST: transfer.REC_ST,
        NET_AMT_XFERED: Number(transfer.NET_AMT_XFERED).toFixed(2),
        VALUE_DT: transfer.VALUE_DT,
        REMITTER_NM: transfer.REMITTER_NM,
        CREATED_BY: transfer.CREATED_BY,
        CREATE_DT: transfer.CREATE_DT,
      }))
    });
  } catch (err) {
    console.error('Get transfers by account error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;