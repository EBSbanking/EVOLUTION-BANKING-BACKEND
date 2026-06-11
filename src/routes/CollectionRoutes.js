import * as collectionController from '../controllers/CollectionController.js';  // use lowercase 'c' to match usage

// OR import individually:
// import { 
//   createCollection, getCollections, getCollectionById, updateCollection,
//   deleteCollection, approveCollection, rejectCollection, getCollectionsByGroup,
//   getCollectionStats, processCollection, addLoanRepayment, addSavingsCollection,
//   getCollectionBreakdown, getCollectionsByGroupLoan, getRepaymentStats
// } from '../controllers/CollectionController.js';

router.post('/collections', collectionController.createCollection);
router.get('/collections', collectionController.getCollections);
router.get('/collections/:id', collectionController.getCollectionById);
router.put('/collections/:id', collectionController.updateCollection);
router.delete('/collections/:id', collectionController.deleteCollection);
router.patch('/collections/:id/approve', collectionController.approveCollection);
router.patch('/collections/:id/reject', collectionController.rejectCollection);
router.get('/collections/group/:groupId', collectionController.getCollectionsByGroup);
router.get('/collections/stats/overview', collectionController.getCollectionStats);
router.patch('/collections/:id/process', collectionController.processCollection);
router.patch('/collections/:id/repayments', collectionController.addLoanRepayment);
router.patch('/collections/:id/savings', collectionController.addSavingsCollection);
router.get('/collections/:id/breakdown', collectionController.getCollectionBreakdown);
router.get('/collections/loan/:groupLoanId', collectionController.getCollectionsByGroupLoan);
router.get('/collections/stats/repayments', collectionController.getRepaymentStats);