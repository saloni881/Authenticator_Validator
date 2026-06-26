import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verify JWT token
export const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from Authorization header
    if (req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not logged in. Please login to continue.',
        code: 401,
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.',
        code: 401,
      });
    }

    // Check if blocked
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked.',
        code: 403,
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token expired or invalid. Please login again.',
      code: 401,
    });
  }
};
export const adminOnly = (req, res, next) => {

   if (req.user && req.user.role === "admin") {
      next();
   } else {
      return res.status(403).json({
         success: false,
         message: "Admin access only"
      });
   }
};

// Role-based access control
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role "${req.user.role}" is not allowed to access this route.`,
        code: 403,
      });
    }
    next();
  };
};