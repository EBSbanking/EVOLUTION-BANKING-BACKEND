import express from 'express';  // NEW: Import Express for Router
import { 
  createDrawerCurrencyDenomination, 
  getDrawerCurrencyHistory,
  deleteDrawerCurrencyDenomination,
  restoreDrawerCurrencyDenomination 
} from '../controllers/DrawerCurrencyDenominationController.js';

const router = express.Router();  // NEW: Declare router here (before any routes)

// Your routes (now safe to use 'router')
router.post('/currency-denominations', createDrawerCurrencyDenomination);
router.get('/drawers/:drawerId/currency-history', getDrawerCurrencyHistory);
router.delete('/currency-denominations/:id', deleteDrawerCurrencyDenomination);
router.patch('/currency-denominations/:id/restore', restoreDrawerCurrencyDenomination);

export default router;