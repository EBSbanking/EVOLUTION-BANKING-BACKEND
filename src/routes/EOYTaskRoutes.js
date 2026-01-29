// src/routes/EOYTaskRoutes.js
import express from 'express';
import { EOYTaskController } from '../controllers/EOYTaskController.js';
import { protect, authorize } from '../middlewares/auth.js';

const router = express.Router();

// Apply protection to all routes
router.use(protect);

// Execute Year-End Closing (Manual trigger)
router.post('/execute', 
  authorize(['FINANCE_MANAGER', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER']),
  EOYTaskController.createAndExecuteTask
);

// Dry run (test without changes)
router.post('/dry-run',
  authorize(['FINANCE_MANAGER', 'SYSTEM_ADMIN', 'AUDITOR']),
  EOYTaskController.executeDryRun
);

// Get task status
router.get('/status/:taskId',
  authorize(['FINANCE_MANAGER', 'SYSTEM_ADMIN', 'AUDITOR']),
  EOYTaskController.getTaskStatus
);

// Get recent tasks
router.get('/recent',
  authorize(['FINANCE_MANAGER', 'SYSTEM_ADMIN', 'AUDITOR']),
  EOYTaskController.getRecentTasks
);

// Restart failed task
router.post('/restart/:taskId',
  authorize(['SYSTEM_ADMIN']),
  EOYTaskController.restartTask
);

// Get statistics
router.get('/statistics/:fiscalYear?',
  authorize(['FINANCE_MANAGER', 'SYSTEM_ADMIN', 'AUDITOR']),
  EOYTaskController.getEOYStatistics
);

// Get next scheduled date
router.get('/next-run-date/:fiscalYear?',
  authorize(['FINANCE_MANAGER', 'SYSTEM_ADMIN', 'AUDITOR']),
  (req, res) => {
    const fiscalYear = req.params.fiscalYear || new Date().getFullYear();
    const nextRun = new Date(parseInt(fiscalYear), 11, 31, 1, 15, 0);
    
    res.json({
      success: true,
      data: {
        fiscalYear,
        nextRunDate: nextRun.toISOString(),
        nextRunFormatted: nextRun.toLocaleDateString('en-NG', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Africa/Lagos'
        })
      }
    });
  }
);

export default router;