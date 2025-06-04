import express from 'express';
import {
  createDirectDebitScheduler,
  getAllDirectDebitSchedulers,
  getDirectDebitSchedulerById,
  updateDirectDebitScheduler,
  deleteDirectDebitScheduler
} from '../controllers/DirectDebitSchedulerController.js';

const router = express.Router();

// Route to create a new Direct Debit Scheduler
router.post('/', createDirectDebitScheduler);

// Route to get all Direct Debit Schedulers
router.get('/', getAllDirectDebitSchedulers);

// Route to get a Direct Debit Scheduler by ID
router.get('/:id', getDirectDebitSchedulerById);

// Route to update a Direct Debit Scheduler by ID
router.put('/:id', updateDirectDebitScheduler);

// Route to delete a Direct Debit Scheduler by ID
router.delete('/:id', deleteDirectDebitScheduler);

export default router;
