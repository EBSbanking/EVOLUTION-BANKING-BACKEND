import express from 'express';
import {
    getAllLedgers,
    getLedgerByAcctNo,
    createLedgerEntry,
    updateLedgerByAcctNo,
    deleteLedgerByAcctNo,
    updateLedgerBalanceById // import the new controller function here
} from '../controllers/LedgerController.js';

const router = express.Router();

// Route to fetch all ledger entries
router.get('/', getAllLedgers);

// Route to fetch a ledger entry by account number
router.get('/:acct_no', getLedgerByAcctNo);

// Route to create a new ledger entry
router.post('/create', createLedgerEntry);

// Route to update a ledger entry by account number
router.put('/:acct_no', updateLedgerByAcctNo);

// Route to update LEDGER_BALANCE by ledger ID (new route)
router.put('/balance/:id', updateLedgerBalanceById);

// Route to delete a ledger entry by account number
router.delete('/:acct_no', deleteLedgerByAcctNo);

export default router;
