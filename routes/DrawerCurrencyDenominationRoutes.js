import express from 'express';
import {
  createDrawerCurrencyDenomination,
  deleteDrawerCurrencyDenomination
} from '../controllers/DrawerCurrencyDenominationController.js';

const router = express.Router();

// Route to create a new Drawer Currency Denomination
router.post('/create', createDrawerCurrencyDenomination);

// Route to delete a Drawer Currency Denomination by ID
router.delete('/:id', deleteDrawerCurrencyDenomination);

export default router;
