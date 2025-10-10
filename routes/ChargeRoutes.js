import express from 'express';
import ChargeController from '../controllers/ChargeController.js';

const router = express.Router();

router.post('/charges', ChargeController.createCharge);
router.get('/charges', ChargeController.getAllCharges);
router.get('/charges/active', ChargeController.getActiveCharges);
router.get('/charges/type/:type', ChargeController.getChargesByType);
router.get('/charges/id/:id', ChargeController.getChargeById);
router.get('/charges/code/:code', ChargeController.getChargeByCode);
router.put('/charges/:id', ChargeController.updateCharge);
router.delete('/charges/:id', ChargeController.deleteCharge);
router.patch('/charges/:id/deactivate', ChargeController.deactivateCharge);
router.patch('/charges/:id/activate', ChargeController.activateCharge);
router.post('/charges/bulk', ChargeController.bulkCreateCharges);

export default router;