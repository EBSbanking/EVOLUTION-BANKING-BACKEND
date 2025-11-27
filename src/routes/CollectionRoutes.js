import express from 'express';
import {
  createCollection,
  getCollections,
  getCollectionById,
  updateCollection,
  deleteCollection,
  approveCollection,
  rejectCollection,
  getCollectionsByGroup,
  getCollectionStats,
  processCollection,
  addLoanRepayment,
  addSavingsCollection,
  getCollectionBreakdown,
  getCollectionsByGroupLoan,
  getRepaymentStats
} from '../controllers/CollectionController.js';

const router = express.Router();

router.route('/')
  .post(createCollection)
  .get(getCollections);

router.route('/stats/overview')
  .get(getCollectionStats);

router.route('/stats/repayments')
  .get(getRepaymentStats);

router.route('/group/:groupId')
  .get(getCollectionsByGroup);

router.route('/loan/:groupLoanId')
  .get(getCollectionsByGroupLoan);

router.route('/:id')
  .get(getCollectionById)
  .put(updateCollection)
  .delete(deleteCollection);

router.route('/:id/approve')
  .patch(approveCollection);

router.route('/:id/reject')
  .patch(rejectCollection);

// NEW ROUTES FOR LOAN REPAYMENT INTEGRATION:
router.route('/:id/process')
  .patch(processCollection);

router.route('/:id/repayments')
  .patch(addLoanRepayment);

router.route('/:id/savings')
  .patch(addSavingsCollection);

router.route('/:id/breakdown')
  .get(getCollectionBreakdown);

export default router;