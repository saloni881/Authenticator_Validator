import express from 'express';
import {
  addRecord,
  bulkUpload,
  listInstitutions,
  deleteRecord,
} from '../controllers/institutionController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { uploadCSV } from '../middleware/fileValidator.js';

const router = express.Router();

// All institution routes — admin only
router.use(protect, authorize('admin'));

router.get('/list',        listInstitutions);
router.post('/add',        addRecord);
router.post('/bulk',       uploadCSV, bulkUpload);
router.delete('/:id',      deleteRecord);

export default router;
