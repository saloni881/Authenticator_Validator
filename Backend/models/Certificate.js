import mongoose from 'mongoose';

const CertificateSchema = new mongoose.Schema({
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  fileName: String,
  filePath: String,

  extractedFields: {
    name:        { type: String, default: '' },
    rollNumber:  { type: String, default: '' },
    marks:       { type: String, default: '' },
    certId:      { type: String, default: '' },
    university:  { type: String, default: '' },
    year:        { type: String, default: '' },
    degree:      { type: String, default: '' },
  },

  aiAnalysis: {
    score:       { type: Number, default: 0 },
    verdict:     { type: String, default: '' },
    reasons:     [String],
    confidence:  { type: String, default: 'Low' },
    flaggedFields: [String],
  },

  // Add to your Certificate mongoose schema
dbMatchDetail: {
  verdict:        { type: String, enum: ['verified','not_found','partial_match','blacklisted',''], default: '' },
  score:          { type: Number, default: 0 },
  confidence:     { type: String, enum: ['high','medium','low','none',''], default: '' },
  officialRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficialCertificate', default: null },
  reasons:        { type: [String], default: [] },
},
  finalScore:  { type: Number, default: 0 },
  verdict: {
    type: String,
    enum: ['Genuine', 'Fake', 'Review'],
    default: 'Review',
  },

  fingerprint: { type: String },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Certificate', CertificateSchema);