// routes/DrawerRoutes.js
import express from 'express';
import { createDrawer, getDrawerById } from '../controllers/DrawerController.js'; // Adjust the import path if necessary

const router = express.Router();

// Define the POST route for creating a drawer
router.post('/drawers', createDrawer);  // This expects the full route to be /api/drawer/drawers

// Define the GET route for retrieving a drawer by DRAWER_ID
router.get('/drawers/:drawerId', getDrawerById);  // Use drawerId as a route parameter

export default router;
