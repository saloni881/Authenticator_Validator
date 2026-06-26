import 'dotenv/config';   // ← MUST be first line — loads .env before anything else
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import authRoutes        from './routes/auth.js';
import certificateRoutes from './routes/certificate.js';
import institutionRoutes from './routes/institution.js';
import adminRoutes       from './routes/admin.js';
import adminCertificateRoutes from './routes/adminCertificates.js';

// Connect MongoDB
connectDB();

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS must come BEFORE helmet ──────────────────────────────────────────────
const corsOptions = {
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));

// Handle OPTIONS preflight for ALL routes (required for Authorization header)
app.options('*', cors(corsOptions));

// Security headers (after cors so it doesn't strip them)
app.use(helmet({
  crossOriginResourcePolicy: false,  // allow cross-origin resource requests
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { success: false, message: 'Too many requests', code: 429 },
}));
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { success: false, message: 'Too many login attempts', code: 429 },
}));  

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── NoSQL injection sanitizer ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (key.startsWith('$') || key.includes('.')) delete obj[key];
        else sanitize(obj[key]);
      }
    }
  };
  sanitize(req.body);
  sanitize(req.params);
  next();
});

// ── Static files ──────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/certificate', certificateRoutes);
app.use('/api/institution', institutionRoutes);
app.use('/api/admin', adminCertificateRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running', time: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found`, code: 404 });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('ERROR:', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    code:    err.statusCode || 500,
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`🔗 API:    http://localhost:${PORT}/api`);
  console.log(`🔑 JWT:    ${process.env.JWT_SECRET ? '✅ loaded' : '❌ MISSING'}`);
  console.log(`🍃 Mongo:  ${process.env.MONGO_URI  ? '✅ loaded' : '❌ MISSING'}\n`);
});

export default app;