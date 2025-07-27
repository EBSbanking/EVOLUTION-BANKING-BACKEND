// routes/productTypeMappingRoutes.js
import express from 'express';
import {
  createOrUpdateMapping,
  getProductTypeByProdId,
  getAllMappings,
  deleteMapping
} from '../controllers/ProductTypeMappingController.js';

const router = express.Router();

router.post('/mapping', createOrUpdateMapping);
router.get('/mapping/:PROD_ID', getProductTypeByProdId);
router.get('/mappings', getAllMappings);
router.delete('/mapping/:PROD_ID', deleteMapping);

export default router;
