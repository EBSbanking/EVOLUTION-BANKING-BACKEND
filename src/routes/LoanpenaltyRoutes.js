// src/routes/penaltyRoutes.js - FINAL WORKING VERSION
import express from 'express';
import {
  // PenaltyRule controllers
  createPenaltyRule,
  getPenaltyRules,
  getPenaltyRuleById,
  updatePenaltyRule,
  deletePenaltyRule,
  calculatePenalty,
  getActiveRules,

  // Penalty controllers
  createPenalty,
  getPenalties,
  getPenaltyById,
  getPenaltiesByLoan,
  updatePenalty,
  waivePenalty,
  settlePenalty,
  applyLatePaymentPenalty,
  applyBatchPenalties,
  recalculatePenalties,
  getPenaltyStatistics,
} from '../controllers/LoanpenaltyController.js';


const router = express.Router();

// ====================
// Penalty Rule Routes
// ====================
router.post('/rules', createPenaltyRule);
router.get('/rules', getPenaltyRules);
router.get('/rules/active', getActiveRules);
router.get('/rules/:id', getPenaltyRuleById);
router.put('/rules/:id', updatePenaltyRule);
router.delete('/rules/:id', deletePenaltyRule);
router.post('/rules/calculate', calculatePenalty);

// ====================
// Penalty Routes
// ====================
router.post('/', createPenalty);
router.get('/', getPenalties);
router.get('/statistics', getPenaltyStatistics);
router.get('/:id', getPenaltyById);
router.get('/loan/:loan_id', getPenaltiesByLoan);
router.put('/:id', updatePenalty);
router.post('/:id/waive', waivePenalty);
router.post('/:id/settle', settlePenalty);
router.post('/apply/late-payment', applyLatePaymentPenalty);
router.post('/apply/batch', applyBatchPenalties);
router.post('/recalculate/:loan_id', recalculatePenalties);

export default router;