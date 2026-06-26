import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OfficialCertificate from '../models/OfficialCertificate.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { runOCR, parseFields } from '../utils/ocr.js';  // reuse existing OCR

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Multer — accepts CSV, PDF, JPG, PNG, WEBP ─────────────────────────────────
const ALLOWED_TYPES = [
  'text/csv',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const ALLOWED_EXTS = ['.csv', '.pdf', '.jpg', '.jpeg', '.png', '.webp'];

const upload = multer({
  dest: path.join(__dirname, '../uploads/admin-temp/'),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_TYPES.includes(file.mimetype) || ALLOWED_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, PDF, JPG, PNG, or WEBP files are allowed'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ── Helper: save a parsed record to DB (skip duplicates) ──────────────────────
const saveRecord = async (data, uploadedBy, source) => {
  const query = [];
  if (data.rollNumber) query.push({ rollNumber: data.rollNumber });
  if (data.certId)     query.push({ certId:     data.certId     });
  const exists = query.length ? await OfficialCertificate.findOne({ $or: query }) : null;
  if (exists) return { skipped: true, reason: `Duplicate: ${data.studentName}` };

  await OfficialCertificate.create({ ...data, uploadedBy, uploadSource: source });
  return { skipped: false };
};

// ── GET /api/admin/certificates — list all official records ───────────────────
router.get('/certificates', protect, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const query = search
      ? { $or: [
          { studentName: new RegExp(search, 'i') },
          { rollNumber:  new RegExp(search, 'i') },
          { certId:      new RegExp(search, 'i') },
          { university:  new RegExp(search, 'i') },
        ]}
      : {};
    const total   = await OfficialCertificate.countDocuments(query);
    const records = await OfficialCertificate.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('uploadedBy', 'name email');
    res.json({ success: true, total, page: Number(page), records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/admin/certificates/manual — add single record ───────────────────
router.post('/certificates/manual', protect, authorize('admin'), async (req, res) => {
  try {
    const { studentName, rollNumber, certId, university, degree, year, marks, notes } = req.body;
    if (!studentName || !university) {
      return res.status(400).json({ success: false, message: 'studentName and university are required' });
    }
    const result = await saveRecord({
      studentName: studentName.toUpperCase(),
      rollNumber:  (rollNumber || '').toUpperCase(),
      certId:      (certId     || '').toUpperCase(),
      university:  university.toUpperCase(),
      degree:      (degree || '').toUpperCase(),
      year:        year   || '',
      marks:       marks  || '',
      notes:       notes  || '',
    }, req.user._id, 'manual');

    if (result.skipped) {
      return res.status(409).json({ success: false, message: result.reason });
    }
    res.status(201).json({ success: true, message: 'Record added successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/admin/certificates/upload — CSV, PDF, or Image ─────────────────
router.post('/certificates/upload', protect, authorize('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const filePath = req.file.path;
  const ext      = path.extname(req.file.originalname).toLowerCase();

  try {
    // ── CSV handling ───────────────────────────────────────────────────────────
    if (ext === '.csv') {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines   = content.split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length < 2) {
        return res.status(400).json({ success: false, message: 'CSV must have a header row and at least one data row' });
      }

      const headers  = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
      const nameIdx  = headers.indexOf('studentname');
      const rollIdx  = headers.indexOf('rollnumber');
      const certIdx  = headers.indexOf('certid');
      const uniIdx   = headers.indexOf('university');
      const degIdx   = headers.indexOf('degree');
      const yearIdx  = headers.indexOf('year');
      const marksIdx = headers.indexOf('marks');

      if (nameIdx === -1 || uniIdx === -1) {
        return res.status(400).json({ success: false, message: 'CSV must have studentName and university columns' });
      }

      let inserted = 0;
      const errors = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const studentName = cols[nameIdx];
        const university  = cols[uniIdx];
        if (!studentName || !university) { errors.push(`Row ${i + 1}: missing required fields`); continue; }

        const result = await saveRecord({
          studentName: studentName.toUpperCase(),
          rollNumber:  rollIdx  !== -1 ? (cols[rollIdx]  || '').toUpperCase() : '',
          certId:      certIdx  !== -1 ? (cols[certIdx]  || '').toUpperCase() : '',
          university:  university.toUpperCase(),
          degree:      degIdx   !== -1 ? (cols[degIdx]   || '').toUpperCase() : '',
          year:        yearIdx  !== -1 ?  cols[yearIdx]  || '' : '',
          marks:       marksIdx !== -1 ?  cols[marksIdx] || '' : '',
        }, req.user._id, 'csv');

        if (result.skipped) errors.push(result.reason);
        else inserted++;
      }

      return res.json({
        success: true,
        message: `CSV: ${inserted} records imported, ${errors.length} skipped`,
        inserted,
        skipped: errors.length,
        errors:  errors.slice(0, 20),
        source:  'csv',
      });
    }

    // ── PDF / Image handling — run OCR then save ───────────────────────────────
    console.log(`[Admin Upload] Running OCR on ${ext} file...`);
    const rawText         = await runOCR(filePath, req.file.mimetype);
    const extractedFields = parseFields(rawText);

    console.log('[Admin Upload] Extracted fields:', extractedFields);

    // Use filename as fallback name if OCR couldn't extract it
    const studentName = extractedFields.name ||
      req.file.originalname.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').toUpperCase();

    // Need at least a name to save (university can be empty — admin can edit later)
    if (!studentName.trim()) {
      return res.status(422).json({
        success: false,
        message: 'Could not extract student name from this file. Please add the record manually.',
        extracted: extractedFields,
      });
    }

    const result = await saveRecord({
      studentName: studentName.toUpperCase().trim(),
      rollNumber:  (extractedFields.rollNumber  || '').toUpperCase(),
      certId:      (extractedFields.certId      || '').toUpperCase(),
      university:  (extractedFields.university  || 'UNKNOWN').toUpperCase(),
      degree:      (extractedFields.degree      || '').toUpperCase(),
      year:        extractedFields.year  || '',
      marks:       extractedFields.marks || '',
      notes:       `Auto-extracted from ${ext.replace('.', '').toUpperCase()} file: ${req.file.originalname}`,
    }, req.user._id, 'pdf');

    if (result.skipped) {
      return res.status(409).json({
        success:   false,
        message:   result.reason,
        extracted: extractedFields,
      });
    }

    return res.status(201).json({
      success:   true,
      message:   `Record extracted and saved from ${ext.replace('.', '').toUpperCase()}`,
      extracted: extractedFields,  // send back so admin can review
      source:    ext === '.pdf' ? 'pdf' : 'image',
    });

  } catch (err) {
    console.error('[Admin Upload Error]', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    // Always clean up temp file
    fs.unlink(filePath, () => {});
  }
});

// ── DELETE /api/admin/certificates/:id ───────────────────────────────────────
router.delete('/certificates/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const rec = await OfficialCertificate.findByIdAndDelete(req.params.id);
    if (!rec) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/admin/certificates/:id/blacklist ───────────────────────────────
router.patch('/certificates/:id/blacklist', protect, authorize('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    const rec = await OfficialCertificate.findByIdAndUpdate(
      req.params.id,
      { isBlacklisted: true, blacklistReason: reason || 'Flagged by admin' },
      { new: true }
    );
    if (!rec) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, message: 'Certificate blacklisted', record: rec });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;