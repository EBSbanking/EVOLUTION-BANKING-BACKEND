// controllers/BinCardCounterController.js
import { logAuditTrail } from '../utils/auditLogger.js';
import { getModel } from '../models/index.js';
import sequelize from '../../config/db.js';

// Helper to get user identifier from request
const getUserId = (req) => req.user?.username || req.user?.id || 'system';
const getClientIp = (req) => req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '127.0.0.1';

// ==================== BIN INFO CONTROLLER ====================

// GET /api/bin-info
export const getAllBinInfo = async (req, res) => {
  const userId = getUserId(req);
  const ip = getClientIp(req);
  try {
    const BinInfo = getModel('BinInfo');
    if (!BinInfo) throw new Error('BinInfo model not loaded');
    const { is_active, bin } = req.query;
    const where = {};
    if (is_active !== undefined) where.is_active = is_active === 'true';
    if (bin) where.bin = bin;
    const records = await BinInfo.findAll({ where, order: [['bin', 'ASC']] });
    await logAuditTrail('BIN_INFO', 'list', userId, 'VIEW_ALL', null, { count: records.length }, ip, 'BIN_MANAGEMENT');
    return res.status(200).json({ success: true, data: records });
  } catch (error) {
    await logAuditTrail('BIN_INFO', 'list', userId, 'VIEW_ALL_FAILED', null, { error: error.message }, ip, 'BIN_MANAGEMENT');
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/bin-info/:bin
export const getBinInfoByBin = async (req, res) => {
  const userId = getUserId(req);
  const ip = getClientIp(req);
  try {
    const BinInfo = getModel('BinInfo');
    const record = await BinInfo.findOne({ where: { bin: req.params.bin } });
    if (!record) return res.status(404).json({ success: false, error: 'BIN not found' });
    await logAuditTrail('BIN_INFO', req.params.bin, userId, 'VIEW', null, record.dataValues, ip, 'BIN_MANAGEMENT');
    return res.status(200).json({ success: true, data: record });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/bin-info
export const createBinInfo = async (req, res) => {
  const userId = getUserId(req);
  const ip = getClientIp(req);
  const dbTransaction = await sequelize.transaction();
  try {
    const { bin, bank_name, country, network, card_type, is_active } = req.body;
    if (!bin || !/^\d{6}$/.test(bin)) throw new Error('Valid 6‑digit BIN is required');
    const BinInfo = getModel('BinInfo');
    const existing = await BinInfo.findOne({ where: { bin }, transaction: dbTransaction });
    if (existing) throw new Error('BIN already exists');
    const newRecord = await BinInfo.create({
      bin, bank_name, country, network, card_type, is_active: is_active !== undefined ? is_active : true
    }, { transaction: dbTransaction });
    await dbTransaction.commit();
    await logAuditTrail('BIN_INFO', bin, userId, 'CREATE', null, newRecord.dataValues, ip, 'BIN_MANAGEMENT');
    return res.status(201).json({ success: true, data: newRecord });
  } catch (error) {
    await dbTransaction.rollback();
    await logAuditTrail('BIN_INFO', req.body.bin, userId, 'CREATE_FAILED', req.body, { error: error.message }, ip, 'BIN_MANAGEMENT');
    return res.status(400).json({ success: false, error: error.message });
  }
};

// PUT /api/bin-info/:bin
export const updateBinInfo = async (req, res) => {
  const userId = getUserId(req);
  const ip = getClientIp(req);
  const dbTransaction = await sequelize.transaction();
  try {
    const BinInfo = getModel('BinInfo');
    const record = await BinInfo.findOne({ where: { bin: req.params.bin }, transaction: dbTransaction });
    if (!record) throw new Error('BIN not found');
    const oldValue = { ...record.dataValues };
    await record.update(req.body, { transaction: dbTransaction });
    await dbTransaction.commit();
    await logAuditTrail('BIN_INFO', req.params.bin, userId, 'UPDATE', oldValue, record.dataValues, ip, 'BIN_MANAGEMENT');
    return res.status(200).json({ success: true, data: record });
  } catch (error) {
    await dbTransaction.rollback();
    return res.status(400).json({ success: false, error: error.message });
  }
};

// DELETE /api/bin-info/:bin
export const deleteBinInfo = async (req, res) => {
  const userId = getUserId(req);
  const ip = getClientIp(req);
  const dbTransaction = await sequelize.transaction();
  try {
    const BinInfo = getModel('BinInfo');
    const record = await BinInfo.findOne({ where: { bin: req.params.bin }, transaction: dbTransaction });
    if (!record) throw new Error('BIN not found');
    await record.destroy({ transaction: dbTransaction });
    await dbTransaction.commit();
    await logAuditTrail('BIN_INFO', req.params.bin, userId, 'DELETE', record.dataValues, null, ip, 'BIN_MANAGEMENT');
    return res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    await dbTransaction.rollback();
    return res.status(400).json({ success: false, error: error.message });
  }
};

// ==================== CARD COUNTER CONTROLLER ====================

// GET /api/card-counters
export const getAllCounters = async (req, res) => {
  const userId = getUserId(req);
  try {
    const CardCounter = getModel('CardCounter');
    const counters = await CardCounter.findAll({ order: [['bin', 'ASC']] });
    return res.status(200).json({ success: true, data: counters });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/card-counters/:bin
export const getCounterByBin = async (req, res) => {
  try {
    const CardCounter = getModel('CardCounter');
    const counter = await CardCounter.findOne({ where: { bin: req.params.bin } });
    if (!counter) return res.status(404).json({ success: false, error: 'Counter not found' });
    return res.status(200).json({ success: true, data: counter });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/card-counters (create a counter manually – not normally needed)
export const createCounter = async (req, res) => {
  const userId = getUserId(req);
  try {
    const { bin, last_sequence } = req.body;
    if (!bin || !/^\d{6}$/.test(bin)) throw new Error('Valid 6‑digit BIN required');
    const CardCounter = getModel('CardCounter');
    const existing = await CardCounter.findOne({ where: { bin } });
    if (existing) throw new Error('Counter already exists');
    const newCounter = await CardCounter.create({ bin, last_sequence: last_sequence || 0 });
    await logAuditTrail('CARD_COUNTER', bin, userId, 'CREATE', null, newCounter.dataValues, req.ip, 'CARD_MANAGEMENT');
    return res.status(201).json({ success: true, data: newCounter });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// PUT /api/card-counters/:bin (reset sequence)
export const updateCounter = async (req, res) => {
  const userId = getUserId(req);
  try {
    const { last_sequence } = req.body;
    if (last_sequence === undefined) throw new Error('last_sequence required');
    const CardCounter = getModel('CardCounter');
    const counter = await CardCounter.findOne({ where: { bin: req.params.bin } });
    if (!counter) throw new Error('Counter not found');
    const oldSeq = counter.last_sequence;
    await counter.update({ last_sequence });
    await logAuditTrail('CARD_COUNTER', req.params.bin, userId, 'UPDATE', { last_sequence: oldSeq }, { last_sequence }, req.ip, 'CARD_MANAGEMENT');
    return res.status(200).json({ success: true, data: counter });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
};

// DELETE /api/card-counters/:bin
export const deleteCounter = async (req, res) => {
  const userId = getUserId(req);
  const dbTransaction = await sequelize.transaction();
  try {
    const CardCounter = getModel('CardCounter');
    const counter = await CardCounter.findOne({ where: { bin: req.params.bin }, transaction: dbTransaction });
    if (!counter) throw new Error('Counter not found');
    await counter.destroy({ transaction: dbTransaction });
    await dbTransaction.commit();
    await logAuditTrail('CARD_COUNTER', req.params.bin, userId, 'DELETE', counter.dataValues, null, req.ip, 'CARD_MANAGEMENT');
    return res.status(200).json({ success: true, message: 'Deleted' });
  } catch (error) {
    await dbTransaction.rollback();
    return res.status(400).json({ success: false, error: error.message });
  }
};