import fs from 'fs';
import path from 'path';
import Certificate from '../models/Certificate.js';
import { runOCR, parseFields } from '../utils/ocr.js';
import { analyzeWithClaude } from '../utils/claudeAI.js';
import { calculateRiskScore } from '../utils/riskScorer.js';
import { generatePDF } from '../utils/pdfGenerator.js';
import { auditLog } from '../middleware/auditLogger.js';
import { matchAgainstOfficialRecords } from '../utils/matcher.js';  // ← NEW

// ── POST /api/certificate/verify ────────────────────────────────────────────
export const verifyCertificate = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a certificate file', code: 400 });
    }

    const filePath = req.file.path;

    // ── Step 1: OCR ──────────────────────────────────────────────────────────
    console.log('Step 1: Running OCR...');
    const rawText = await runOCR(filePath, req.file.mimetype);
    const extractedFields = parseFields(rawText);

    // ── Step 2: Match against OfficialCertificate DB ─────────────────────────
    // Replaces old Institution.findOne() — now uses smart scoring matcher
    console.log('Step 2: Matching against official records...');
    const matchResult = await matchAgainstOfficialRecords(extractedFields);
    console.log(`[DB Match] verdict=${matchResult.verdict}  score=${matchResult.score}  confidence=${matchResult.confidence}`);

    // ── Step 3: AI analysis ───────────────────────────────────────────────────
    // Pass DB match context to AI so it can factor it in
    let aiAnalysis = null;
    if (matchResult.verdict !== 'blacklisted') {
      console.log('Step 3: Running AI analysis...');
      aiAnalysis = await analyzeWithClaude({
        ...extractedFields,
        dbMatchVerdict:    matchResult.verdict,      // 'verified' | 'not_found' | 'partial_match'
        dbMatchScore:      matchResult.score,
        dbMatchConfidence: matchResult.confidence,
      });
    }

    // ── Step 4: Combined risk score ───────────────────────────────────────────
    console.log('Step 4: Calculating risk score...');
    const { finalScore, verdict, reasons, breakdown } = calculateRiskScore({
      aiAnalysis,
      dbMatch:        matchResult.matched,
      dbVerdict:      matchResult.verdict,
      dbScore:        matchResult.score,
      dbReasons:      matchResult.reasons,
      extractedFields,
    });

    // ── Step 5: Save to MongoDB ───────────────────────────────────────────────
    const certificate = await Certificate.create({
      uploadedBy:  req.user._id,
      fileName:    req.file.originalname,
      filePath:    req.file.path,
      extractedFields,
      aiAnalysis:  aiAnalysis
        ? { ...aiAnalysis, reasons }
        : { verdict, score: finalScore, reasons, flaggedFields: [], confidence: matchResult.confidence },
      dbMatch:     matchResult.matched,
      dbMatchDetail: {
        verdict:        matchResult.verdict,
        score:          matchResult.score,
        confidence:     matchResult.confidence,
        officialRecord: matchResult.record?._id || null,
        reasons:        matchResult.reasons,
      },
      finalScore,
      verdict,
    });

    // Clean up uploaded temp file
    fs.unlink(filePath, () => {});

    auditLog(req, 'VERIFY', verdict === 'Genuine' ? 'SUCCESS' : 'FLAGGED', {
      certId:    extractedFields.certId,
      finalScore,
      verdict,
      dbVerdict: matchResult.verdict,
    });

    res.status(200).json({
      success:       true,
      _id:           certificate._id,   // used by frontend redirect
      certificateId: certificate._id,
      extractedFields,
      aiAnalysis:    { ...aiAnalysis, reasons },
      dbMatch:       matchResult.matched,
      dbMatchDetail: {
        verdict:    matchResult.verdict,
        score:      matchResult.score,
        confidence: matchResult.confidence,
        reasons:    matchResult.reasons,
      },
      finalScore,
      verdict,
      breakdown,
    });
  } catch (err) {
    console.error('Verify Error:', err);
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/certificate/:id ─────────────────────────────────────────────────
export const getCertificate = async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate('uploadedBy', 'name email')
      .populate('dbMatchDetail.officialRecord', 'studentName university rollNumber certId year degree');

    if (!certificate) {
      return res.status(404).json({ success: false, message: 'Certificate not found', code: 404 });
    }

    if (
      certificate.uploadedBy._id.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized', code: 403 });
    }

    res.status(200).json({ success: true, certificate });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/certificate/history ─────────────────────────────────────────────
export const getHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', startDate, endDate } = req.query;

    const query = {};
    if (req.user.role !== 'admin') query.uploadedBy = req.user._id;
    if (status && ['Genuine', 'Fake', 'Review'].includes(status)) query.verdict = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate)   query.createdAt.$lte = new Date(endDate);
    }
    if (search.trim()) {
      query.$or = [
        { 'extractedFields.name':       { $regex: search, $options: 'i' } },
        { 'extractedFields.rollNumber': { $regex: search, $options: 'i' } },
        { 'extractedFields.certId':     { $regex: search, $options: 'i' } },
        { 'extractedFields.university': { $regex: search, $options: 'i' } },
      ];
    }

    const total        = await Certificate.countDocuments(query);
    const certificates = await Certificate.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('extractedFields finalScore verdict createdAt dbMatch dbMatchDetail');

    const stats = await Certificate.aggregate([
      { $match: req.user.role !== 'admin' ? { uploadedBy: req.user._id } : {} },
      { $group: { _id: '$verdict', count: { $sum: 1 } } },
    ]);

    const counts = { total: 0, Genuine: 0, Fake: 0, Review: 0 };
    stats.forEach(s => { counts[s._id] = s.count; counts.total += s.count; });

    res.status(200).json({
      success: true, total,
      page:       Number(page),
      totalPages: Math.ceil(total / limit),
      counts,
      data: certificates,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/certificate/export ──────────────────────────────────────────────
export const exportCSV = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const query = {};
    if (req.user.role !== 'admin') query.uploadedBy = req.user._id;
    if (status) query.verdict = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate)   query.createdAt.$lte = new Date(endDate);
    }

    const certs = await Certificate.find(query).sort({ createdAt: -1 });

    const header = 'Name,Roll Number,University,Cert ID,Year,Score,Verdict,DB Match,DB Verdict,Date\n';
    const rows = certs.map(c => {
      const f = c.extractedFields;
      return [
        f.name, f.rollNumber, f.university, f.certId, f.year,
        c.finalScore, c.verdict,
        c.dbMatch ? 'Yes' : 'No',
        c.dbMatchDetail?.verdict || '—',
        new Date(c.createdAt).toLocaleDateString('en-IN'),
      ].map(v => `"${v || ''}"`).join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=verifications.csv');
    res.send(header + rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/certificate/:id/pdf ─────────────────────────────────────────────
export const downloadPDF = async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id);
    if (!certificate) {
      return res.status(404).json({ success: false, message: 'Certificate not found', code: 404 });
    }
    const pdfBuffer = await generatePDF(certificate);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=report-${certificate._id}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── DELETE /api/certificate/:id ──────────────────────────────────────────────
export const deleteCertificate = async (req, res) => {
  try {
    const certificate = await Certificate.findByIdAndDelete(req.params.id);
    if (!certificate) {
      return res.status(404).json({ success: false, message: 'Certificate not found', code: 404 });
    }
    auditLog(req, 'DELETE', 'SUCCESS', { id: req.params.id });
    res.status(200).json({ success: true, message: 'Certificate record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};