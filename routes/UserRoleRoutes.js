import express from "express";
import {
  createCustomerServiceOfficer,
  createUserRole,
  getAllUserRoles,
  getUserRoleByUserId,
  deleteUserRole,
} from "../controllers/UserRoleController.js";

const router = express.Router();

// Routes
router.post("/create-cso", createCustomerServiceOfficer);
router.post("/create", createUserRole);
router.get("/", getAllUserRoles);
router.get("/:userId", getUserRoleByUserId);
router.delete("/:userRoleId", deleteUserRole);

export default router;
