import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import InwardFundsTransfer from '../models/INWD_FUNDS_XFER.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';

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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
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

    if (!INWD_FUNDS_XFER_ID || !XFER_REF || !XFER_CRNCY_ID || !XFER_AMT || !PAY_CRNCY_ID ||
        !PAY_EXCH_RATE || !VALUE_DT || !PRIORITY_LEVEL_CD || !BENEFICIARY_ACCT ||
        !BENEFICIARY_BIC_ID || !BENEFICIARY_BANK_NM || !BENEFICIARY_BANK_CNTRY_ID || !REMITTER_NM) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!['A', 'P'].includes(REC_ST)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Invalid REC_ST. Must be A or P' });
    }

    const account = await CustomerAccount.findOne({ ACCT_NO: BENEFICIARY_ACCT }).session(session);
    if (!account) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `CustomerAccount with ACCT_NO ${BENEFICIARY_ACCT} not found` });
    }

    const amount = Number(XFER_AMT);
    if (amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Transfer amount must be positive' });
    }

    const totalCharges = (Number(TOTAL_CHRG) || 0) + (Number(SENDING_BANK_CHRG) || 0) + (Number(RECIEVING_BANK_CHRG) || 0);
    const netAmount = Number(optionalFields.NET_AMT_XFERED || (amount - totalCharges));
    if (netAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Net amount must be positive' });
    }

    const transfer = new InwardFundsTransfer({
      INWD_FUNDS_XFER_ID,
      XFER_REF,
      PAYMENT_MTD_CD,
      XFER_CRNCY_ID,
      XFER_AMT: mongoose.Types.Decimal128.fromString(amount.toFixed(10)),
      SENDING_BANK_CHRG: SENDING_BANK_CHRG ? mongoose.Types.Decimal128.fromString(Number(SENDING_BANK_CHRG).toFixed(10)) : undefined,
      RECIEVING_BANK_CHRG: RECIEVING_BANK_CHRG ? mongoose.Types.Decimal128.fromString(Number(RECIEVING_BANK_CHRG).toFixed(10)) : undefined,
      TOTAL_CHRG: TOTAL_CHRG ? mongoose.Types.Decimal128.fromString(Number(TOTAL_CHRG).toFixed(10)) : undefined,
      NET_AMT_XFERED: mongoose.Types.Decimal128.fromString(netAmount.toFixed(10)),
      PAY_CRNCY_ID,
      PAY_EXCH_RATE: mongoose.Types.Decimal128.fromString(Number(PAY_EXCH_RATE).toFixed(10)),
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
    });

    await transfer.save({ session });

    await AuditTrail.create([{
      EVENT_ID: uuidv4(),
      EVENT_TYPE: 'InwardFundsTransfer_Webhook_Create',
      EVENT_TS: new Date(),
      USER_ID: req.user.id,
      EVENT_DESC: `Created InwardFundsTransfer ${INWD_FUNDS_XFER_ID} via webhook`,
      MODULE: 'InwardFundsTransfer',
      IP_ADDRESS: req.ip,
      RECORD_ID: INWD_FUNDS_XFER_ID.toString(),
    }], { session });

    await session.commitTransaction();
    res.status(201).json({
      success: true,
      data: { INWD_FUNDS_XFER_ID, XFER_REF, REC_ST, NET_AMT_XFERED: netAmount.toFixed(2) },
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
});

// GET transfer by ID
router.get('/:id', webhookAuthMiddleware, async (req, res) => {
  try {
    const transfer = await InwardFundsTransfer.findOne({ INWD_FUNDS_XFER_ID: req.params.id });
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });

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
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
