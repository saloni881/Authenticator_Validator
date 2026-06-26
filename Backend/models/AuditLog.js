import mongoose from 'mongoose';

// ── Audit Log ──────────────────────────────────────
const AuditLogSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:  String,
  action:    String,   // VERIFY, LOGIN, LOGOUT, REGISTER, DELETE
  result:    String,   // SUCCESS, FAILED, FLAGGED
  ip:        String,
  userAgent: String,
  details:   Object,
  timestamp: { type: Date, default: Date.now },
});

// ── Blacklist ──────────────────────────────────────
const BlacklistSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  certId:     { type: String, required: true },
  university: String,
  reason:     String,
  addedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:  { type: Date, default: Date.now },
});

export const AuditLog  = mongoose.model('AuditLog', AuditLogSchema);
export const Blacklist = mongoose.model('Blacklist', BlacklistSchema);