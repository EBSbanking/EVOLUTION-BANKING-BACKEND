// routes/binCardCounterRoutes.js
import express from 'express';
import {
  getAllBinInfo, getBinInfoByBin, createBinInfo, updateBinInfo, deleteBinInfo,
  getAllCounters, getCounterByBin, createCounter, updateCounter, deleteCounter
} from '../controllers/BinCardCounterController.js';

const router = express.Router();

// BinInfo routes
router.get('/bin-info', getAllBinInfo);
router.get('/bin-info/:bin', getBinInfoByBin);
router.post('/bin-info', createBinInfo);
router.put('/bin-info/:bin', updateBinInfo);
router.delete('/bin-info/:bin', deleteBinInfo);

// CardCounter routes
router.get('/card-counters', getAllCounters);
router.get('/card-counters/:bin', getCounterByBin);
router.post('/card-counters', createCounter);
router.put('/card-counters/:bin', updateCounter);
router.delete('/card-counters/:bin', deleteCounter);

export default router;