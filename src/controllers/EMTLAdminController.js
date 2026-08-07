// controllers/EMTLAdminController.js

import { EMTLPolicy, EMTLAuditLog, EMTLTransaction, RemittanceBatch } from '../models/index.js';

export const getEMTLConfig = async (req, res) => {
  try {
    // Get the active policy or the first one
    let policy = await EMTLPolicy.getActivePolicy();
    if (!policy) {
      policy = await EMTLPolicy.findOne({ order: [['id', 'ASC']] });
    }
    res.json({ success: true, data: policy });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateEMTLConfig = async (req, res) => {
  try {
    const { updatedBy, reason, ...updateData } = req.body;
    
    // Call the model's updatePolicy method
    const policy = await EMTLPolicy.updatePolicy(updateData, updatedBy);
    
    // Log the change (if you have an audit log model)
    // You can implement EMTLAuditLog.create later
    // For now, we just return success

    res.json({
      success: true,
      message: 'EMTL configuration updated successfully',
      data: policy
    });
  } catch (error) {
    console.error('Error updating EMTL config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAuditTrail = async (req, res) => {
  try {
    const { policyId, limit } = req.query;
    // If EMTLAuditLog model exists, implement; otherwise return empty
    // For now, return an empty array as placeholder
    res.json({ success: true, data: [] });
    // const logs = await EMTLAuditLog.getAuditTrail(policyId, limit);
    // res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRemittanceReport = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    // If EMTLTransaction model exists, implement; otherwise return empty
    // For now, return empty
    res.json({
      success: true,
      data: { transactions: [], stats: { total: 0 } }
    });
    // const transactions = await EMTLTransaction.getPendingRemittances(dateFrom, dateTo);
    // const stats = await EMTLTransaction.getRemittanceStats(dateFrom, dateTo);
    // res.json({ success: true, data: { transactions, stats } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};