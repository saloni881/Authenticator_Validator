import mongoose from 'mongoose';

const officialCertificateSchema = new mongoose.Schema({
  // Core identity fields — used for matching
  studentName:   { type: String, required: true, trim: true, uppercase: true },
  rollNumber:    { type: String, trim: true, uppercase: true, default: '' },
  certId:        { type: String, trim: true, uppercase: true, default: '' },
  university:    { type: String, required: true, trim: true, uppercase: true },
  degree:        { type: String, trim: true, uppercase: true, default: '' },
  year:          { type: String, trim: true, default: '' },
  marks:         { type: String, trim: true, default: '' },

  // Metadata
  uploadedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadSource:  { type: String, enum: ['csv', 'manual', 'pdf'], default: 'manual' },
  isBlacklisted: { type: Boolean, default: false },
  blacklistReason: { type: String, default: '' },
  notes:         { type: String, default: '' },
}, { timestamps: true });

// Indexes for fast matching
officialCertificateSchema.index({ rollNumber: 1 });
officialCertificateSchema.index({ certId: 1 });
officialCertificateSchema.index({ studentName: 1, university: 1 });

export default mongoose.model('OfficialCertificate', officialCertificateSchema);