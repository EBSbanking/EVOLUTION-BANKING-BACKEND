import express from 'express';
import {
  createDrawerCurrency,
  getAllDrawerCurrencies,
  getDrawerCurrencyById,
  updateDrawerCurrency,
  deleteDrawerCurrency
} from '../controllers/DrawerCurrencyController.js';

const router = express.Router();

// Route to create a new Drawer Currency entry
router.post('/', createDrawerCurrency);

// Route to get all Drawer Currency entries
router.get('/', getAllDrawerCurrencies);

// Route to get a specific Drawer Currency entry by ID
router.get('/:id', getDrawerCurrencyById);

// Route to update a Drawer Currency entry by ID
router.put('/:id', updateDrawerCurrency);

// Route to delete a Drawer Currency entry by ID
router.delete('/:id', deleteDrawerCurrency);

export default router;
