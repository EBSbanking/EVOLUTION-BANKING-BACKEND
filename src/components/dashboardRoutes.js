// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController'); // Adjusted path

// Define your routes here
router.get('/', dashboardController.getDashboard);

module.exports = router;
