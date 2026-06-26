import fs from 'fs';
import Institution from '../models/Institution.js';
import { auditLog } from '../middleware/auditLogger.js';

// ── POST /api/institution/add ────────────────────────
export const addRecord = async (req, res) => {
  try {
    const { universityName, certId, studentName, rollNumber, degree, year, marks } = req.body;

    if (!universityName || !certId || !studentName || !rollNumber) {
      return res.status(400).json({
        success: false,
        message: 'universityName, certId, studentName and rollNumber are required',
        code: 400,
      });
    }

    const exists = await Institution.findOne({ certId });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Certificate ID already exists in database', code: 400 });
    }

    const record = await Institution.create({
      universityName, certId, studentName, rollNumber,
      degree, year, marks, addedBy: req.user._id,
    });

    auditLog(req, 'ADD_INSTITUTION', 'SUCCESS', { certId });

    res.status(201).json({ success: true, message: 'Institution record added', record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── POST /api/institution/bulk ───────────────────────
export const bulkUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a CSV file', code: 400 });
    }

    const csvData = fs.readFileSync(req.file.path, 'utf-8');
    const lines   = csvData.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    let inserted = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row    = {};
      headers.forEach((h, idx) => row[h] = values[idx] || '');

      if (!row.certid || !row.studentname || !row.rollnumber || !row.universityname) {
        errors.push(`Row ${i + 1}: Missing required fields`);
        continue;
      }

      try {
        await Institution.findOneAndUpdate(
          { certId: row.certid },
          {
            certId:        row.certid,
            studentName:   row.studentname,
            rollNumber:    row.rollnumber,
            universityName: row.universityname,
            degree:        row.degree || '',
            year:          row.year   || '',
            marks:         row.marks  || '',
            addedBy:       req.user._id,
          },
          { upsert: true, new: true }
        );
        inserted++;
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e.message}`);
      }
    }

    fs.unlink(req.file.path, () => {});

    auditLog(req, 'BULK_UPLOAD', 'SUCCESS', { inserted, failed: errors.length });

    res.status(200).json({
      success: true,
      message: 'Bulk upload complete',
      inserted,
      failed: errors.length,
      errors,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/institution/list ────────────────────────
export const listInstitutions = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const query = {};

    if (search.trim()) {
      query.$or = [
        { universityName: { $regex: search, $options: 'i' } },
        { studentName:    { $regex: search, $options: 'i' } },
        { certId:         { $regex: search, $options: 'i' } },
      ];
    }

    const total   = await Institution.countDocuments(query);
    const records = await Institution.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / limit),
      data:       records,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── DELETE /api/institution/:id ──────────────────────
export const deleteRecord = async (req, res) => {
  try {
    const record = await Institution.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found', code: 404 });
    }
    auditLog(req, 'DELETE_INSTITUTION', 'SUCCESS', { id: req.params.id });
    res.status(200).json({ success: true, message: 'Institution record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};