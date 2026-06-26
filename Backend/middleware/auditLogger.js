import { AuditLog } from '../models/AuditLog.js';

// Fire-and-forget — never blocks the response
export const auditLog = (req, action, result, details = {}) => {
  setImmediate(async () => {
    try {
      await AuditLog.create({
        userId:    req.user?._id   || null,
        userName:  req.user?.name  || 'anonymous',
        action,
        result,
        ip:        req.ip          || '',
        userAgent: req.headers?.['user-agent'] || '',
        details,
      });
    } catch (err) {
      console.error('[AuditLog]', err.message);
    }
  });
};