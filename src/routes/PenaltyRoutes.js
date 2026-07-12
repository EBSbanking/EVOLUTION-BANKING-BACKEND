// src/routes/penaltyRoutes.js
import express from 'express';
import PenaltyController from '../controllers/PenaltyRuleController.js';
import { protectAdmin, isAdminConsole } from '../middlewares/adminAuthMiddleware.js';

const router = express.Router();

// Apply admin middleware to all penalty routes
router.use(protectAdmin);
router.use(isAdminConsole);

// ================================================================
// PENALTY ACCRUAL ROUTES
// ================================================================

/**
 * GET /penalty/status - Get penalty accrual status
 */
router.get('/status', PenaltyController.getStatus);

/**
 * POST /penalty/accrue - Manually trigger penalty accrual
 */
router.post('/accrue', PenaltyController.accruePenalties);

/**
 * GET /penalty/loan/:loanId - Get penalty summary for a loan
 */
router.get('/loan/:loanId', PenaltyController.getLoanPenaltySummary);

/**
 * POST /penalty/pay - Process penalty payment
 */
router.post('/pay', PenaltyController.processPenaltyPayment);

/**
 * POST /penalty/waive - Waive a penalty
 */
router.post('/waive', PenaltyController.waivePenalty);

// ================================================================
// PENALTY RULE MANAGEMENT ROUTES
// ================================================================

/**
 * GET /penalty/rules - Get all penalty rules (with pagination & filtering)
 */
router.get('/rules', PenaltyController.getPenaltyRules);

/**
 * GET /penalty/rules/active - Get active rules
 */
router.get('/rules/active', PenaltyController.getActiveRules);

/**
 * GET /penalty/rules/types - Get rule types enum
 */
router.get('/rules/types', PenaltyController.getRuleTypes);

/**
 * GET /penalty/rules/methods - Get calculation methods enum
 */
router.get('/rules/methods', PenaltyController.getCalculationMethods);

/**
 * GET /penalty/rules/:id - Get penalty rule by ID
 */
router.get('/rules/:id', PenaltyController.getPenaltyRuleById);

/**
 * POST /penalty/rules - Create a new penalty rule
 */
router.post('/rules', PenaltyController.createPenaltyRule);

/**
 * PUT /penalty/rules/:id - Update a penalty rule
 */
router.put('/rules/:id', PenaltyController.updatePenaltyRule);

/**
 * DELETE /penalty/rules/:id - Delete (soft delete) a penalty rule
 */
router.delete('/rules/:id', PenaltyController.deletePenaltyRule);

/**
 * POST /penalty/calculate - Calculate penalty
 */
router.post('/calculate', PenaltyController.calculatePenalty);

export default router;