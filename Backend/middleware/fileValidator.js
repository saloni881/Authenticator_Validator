import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// Create upload directory
const tempDir = './uploads/temp';
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => {
    const safeName = crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    cb(null, safeName);
  },
});

// File filter for certificates
const certFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('Only JPG, PNG, and PDF files are allowed'), false);
  }
  cb(null, true);
};

// Raw multer instances
const multerCert = multer({
  storage,
  fileFilter: certFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('certificate');

const multerCSV = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');

// ── Wrapped as proper Express middleware ──────────────
export const uploadCert = (req, res, next) => {
  multerCert(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message, code: 400 });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message, code: 400 });
    }
    next();
  });
};

export const uploadCSV = (req, res, next) => {
  multerCSV(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message, code: 400 });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message, code: 400 });
    }
    next();
  });
};

export const preprocessImage = async (filePath) => filePath;