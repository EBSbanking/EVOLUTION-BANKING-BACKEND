// routes/customerTransactionRoutes.js
import express from "express";
import {
  getCustomerTransactions,
  getTransactionsByCustomerId,
  getTransactionById,
  searchTransactions,
  exportTransactions,
} from "../controllers/CustomerTransactionController.js";


const router = express.Router();

// Public routes (if needed)
// router.get("/public/:accountNumber", getCustomerTransactions);

// Protected routes
router.get("/account/:accountNumber", getCustomerTransactions);
router.get("/customer/:customerId",  getTransactionsByCustomerId);
router.get("/search",  searchTransactions);
router.get("/export", exportTransactions);
router.get("/:transactionId", getTransactionById);

export default router;