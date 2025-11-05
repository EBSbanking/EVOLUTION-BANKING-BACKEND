import express from 'express';
import {
  createThreshold,
  getAllThresholds,
  getThresholdByType,
  updateThreshold,
  deleteThreshold
} from '../controllers/AMLThresholdController.js';

const router = express.Router();

router.post('/create', createThreshold);
router.get('/', getAllThresholds);
router.get('/:type', getThresholdByType);
router.put('/:type', updateThreshold);
router.delete('/:type', deleteThreshold);

export default router;
