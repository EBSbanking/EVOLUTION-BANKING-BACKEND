import { Router } from 'express';
import {
  createJournalEntry,
    approveJournalEntryDirect,
  reverseJournalEntry,
   getPendingJournalEntries 
} from '../controllers/JournalEntryController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

router.post('/journal-entries', authenticate, createJournalEntry);
router.put('/:id/approve', authenticate, approveJournalEntryDirect);
router.post('/journal-entries/reverse', authenticate, reverseJournalEntry);

// New route: get pending journal entries for approval
router.get('/pending', authenticate, getPendingJournalEntries);

export default router;