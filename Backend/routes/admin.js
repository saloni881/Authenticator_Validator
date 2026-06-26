import express from 'express';
import {
  getStats,
  getDailyStats,
  getRecentFlags,
  getAuditLogs,
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// All admin routes — login required + admin role only
router.use(protect, authorize('admin'));

router.get('/stats',        getStats);
router.get('/daily-stats',  getDailyStats);
router.get('/recent-flags', getRecentFlags);
router.get('/audit-logs',   getAuditLogs);

router.get('/blacklist',       getBlacklist);
router.post('/blacklist',      addToBlacklist);
router.delete('/blacklist/:id', removeFromBlacklist);

export default router;