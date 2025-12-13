import express from 'express';
import RateIndexController from '../controllers/Rate-IndexController.js';

const router = express.Router();

// Route definitions ONLY - no middleware here
// POST http://localhost:5000/api/interest-rates/create
// GET http://localhost:5000/api/interest-rates/create
router.route('/create')
  .get(RateIndexController.getAllRateIndices)
  .post(RateIndexController.createRateIndex);

// GET http://localhost:5000/api/interest-rates/active/:currency
router.get('/active/:currency', RateIndexController.getActiveRateIndicesByCurrency);

// POST http://localhost:5000/api/interest-rates/bulk
router.post('/bulk', RateIndexController.bulkUpdateRateIndices);

// GET/PUT/DELETE http://localhost:5000/api/interest-rates/:id
router.route('/:id')
  .get(RateIndexController.getRateIndexById)
  .put(RateIndexController.updateRateIndex)
  .delete(RateIndexController.deleteRateIndex);

// POST http://localhost:5000/api/interest-rates/:id/calculate
router.post('/:id/calculate', RateIndexController.calculateInterest);


// In your loanInterestRoutes.js, add this at the top:
router.get('/test', (req, res) => {
  res.json({ message: 'Loan Interest Routes are working!' });
});

export default router;