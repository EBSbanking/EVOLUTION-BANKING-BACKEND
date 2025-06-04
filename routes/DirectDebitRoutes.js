import express from 'express';
import { createDirectDebit, getAllDirectDebits, getDirectDebitById, updateDirectDebit, deleteDirectDebit } from '../controllers/DirectDebitController.js';

const router = express.Router();

// POST route for creating a new Direct Debit
router.post('/direct-debits', createDirectDebit);

// GET route to fetch all Direct Debits
router.get('/direct-debits', getAllDirectDebits);

// GET route to fetch a Direct Debit by its ID
router.get('/direct-debits/:id', getDirectDebitById);

// PUT route to update a Direct Debit by its ID
router.put('/direct-debits/:id', updateDirectDebit);

// DELETE route to delete a Direct Debit by its ID
router.delete('/direct-debits/:id', deleteDirectDebit);

export default router;
