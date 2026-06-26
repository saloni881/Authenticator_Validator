import express from 'express';
import {
  verifyCertificate,
  getCertificate,
  getHistory,
  exportCSV,
  downloadPDF,
  deleteCertificate,
} from '../controllers/certificateController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { uploadCert } from '../middleware/fileValidator.js';

const router = express.Router();

// All routes require login
router.use(protect);

// IMPORTANT: /export and /history must come BEFORE /:id
router.get('/history', getHistory);
router.get('/export',  exportCSV);

// Verify — multer directly as middleware
router.post('/verify', uploadCert, verifyCertificate);

router.get('/:id/pdf', downloadPDF);
router.get('/:id',     getCertificate);
router.delete('/:id',  authorize('admin'), deleteCertificate);

export default router;