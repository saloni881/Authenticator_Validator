import Certificate from '../models/Certificate.js';
import User from '../models/User.js';
import Institution from '../models/Institution.js';
import { AuditLog, Blacklist } from '../models/AuditLog.js';
import { auditLog } from '../middleware/auditLogger.js';

// ── GET /api/admin/stats ─────────────────────────────
export const getStats = async (req, res) => {
  try {
    const [total, genuine, review, fake, institutions, users] = await Promise.all([
      Certificate.countDocuments(),
      Certificate.countDocuments({ verdict: 'Genuine' }),
      Certificate.countDocuments({ verdict: 'Review' }),
      Certificate.countDocuments({ verdict: 'Fake' }),
      Institution.countDocuments(),
      User.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      stats: { total, genuine, review, fake, institutions, users },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/admin/daily-stats ───────────────────────
export const getDailyStats = async (req, res) => {
  try {
    const days = Number(req.query.days) || 7;
    const from = new Date();
    from.setDate(from.getDate() - days);

    const data = await Certificate.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: 1 },
          fake:  { $sum: { $cond: [{ $eq: ['$verdict', 'Fake'] }, 1, 0] } },
          genuine: { $sum: { $cond: [{ $eq: ['$verdict', 'Genuine'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', total: 1, fake: 1, genuine: 1, _id: 0 } },
    ]);

    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/admin/recent-flags ──────────────────────
export const getRecentFlags = async (req, res) => {
  try {
    const flags = await Certificate.find({ verdict: 'Fake' })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('uploadedBy', 'name email')
      .select('extractedFields finalScore verdict createdAt uploadedBy');

    res.status(200).json({ success: true, data: flags });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/admin/audit-logs ────────────────────────
export const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const total = await AuditLog.countDocuments();
    const logs  = await AuditLog.find()
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / limit),
      data:       logs,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/admin/blacklist ─────────────────────────
export const getBlacklist = async (req, res) => {
  try {
    const list = await Blacklist.find()
      .sort({ createdAt: -1 })
      .populate('addedBy', 'name');
    res.status(200).json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── POST /api/admin/blacklist ────────────────────────
export const addToBlacklist = async (req, res) => {
  try {
    const { name, certId, reason, university } = req.body;

    if (!name || !certId) {
      return res.status(400).json({ success: false, message: 'name and certId are required', code: 400 });
    }

    const entry = await Blacklist.create({
      name, certId, reason, university, addedBy: req.user._id,
    });

    auditLog(req, 'ADD_BLACKLIST', 'SUCCESS', { certId });

    res.status(201).json({ success: true, message: 'Added to blacklist', data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── DELETE /api/admin/blacklist/:id ──────────────────
export const removeFromBlacklist = async (req, res) => {
  try {
    const entry = await Blacklist.findByIdAndDelete(req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Blacklist entry not found', code: 404 });
    }
    auditLog(req, 'REMOVE_BLACKLIST', 'SUCCESS', { id: req.params.id });
    res.status(200).json({ success: true, message: 'Removed from blacklist' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};