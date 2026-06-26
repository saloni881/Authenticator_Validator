import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { auditLog } from '../middleware/auditLogger.js';

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '2h',
  });
};

// ── POST /api/auth/register ──────────────────────────
export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email and password',
        code: 400,
      });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
        code: 400,
      });
    }

    const user  = await User.create({ name, email, password, role: role || 'verifier' });
    const token = generateToken(user._id, user.role);

    auditLog(req, 'REGISTER', 'SUCCESS', { email });

    return res.status(201).json({
      success: true,
      message: 'Registered successfully',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('[register]', err.message);
    return res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── POST /api/auth/login ─────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
        code: 400,
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 401,
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Contact admin.',
        code: 403,
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.failedLogins += 1;
      if (user.failedLogins >= 5) {
        user.isBlocked = true;
        await user.save();
        return res.status(403).json({
          success: false,
          message: 'Account blocked due to too many failed attempts',
          code: 403,
        });
      }
      await user.save();
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        code: 401,
      });
    }

    user.failedLogins = 0;
    user.lastLogin    = new Date();
    await user.save();

    const token = generateToken(user._id, user.role);
    req.user = user;
    auditLog(req, 'LOGIN', 'SUCCESS', { email });

    return res.status(200).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── POST /api/auth/logout ────────────────────────────
export const logout = async (req, res) => {
  try {
    auditLog(req, 'LOGOUT', 'SUCCESS', {});
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};

// ── GET /api/auth/me ─────────────────────────────────
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    return res.status(200).json({
      success: true,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message, code: 500 });
  }
};