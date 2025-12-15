// src/routes/RateIndexRoutes.js - MINIMAL WORKING VERSION
import express from 'express';
import RateIndexController from '../controllers/Rate-IndexController.js';

const router = express.Router();

// Only use methods that exist in your controller
router.route('/create')
  .get(RateIndexController.getAllRateIndices)
  .post(RateIndexController.createRateIndex);

// Add GET default route (this method exists)
router.get('/default', RateIndexController.getDefaultRateIndex);

// GET/PUT/DELETE by ID
router.route('/:id')
  .get(RateIndexController.getRateIndexById)
  .put(RateIndexController.updateRateIndex)
  .delete(RateIndexController.deleteRateIndex);

// Calculate interest
router.post('/:id/calculate', RateIndexController.calculateInterest);

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Rate Index Routes are working!' });
});

// Add this route for active rates by currency (after you add the method to controller)
// router.get('/active/:currency', RateIndexController.getActiveRateIndicesByCurrency);

export default router;