import mongoose from 'mongoose';

const InstitutionSchema = new mongoose.Schema({
  universityName: {
    type: String,
    required: true,
    trim: true,
  },
  certId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  studentName: {
    type: String,
    required: true,
    trim: true,
  },
  rollNumber: {
    type: String,
    required: true,
    trim: true,
  },
  degree: {
    type: String,
    default: '',
  },
  year: {
    type: String,
    default: '',
  },
  marks: {
    type: String,
    default: '',
  },
  isVerified: {
    type: Boolean,
    default: true,
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Institution', InstitutionSchema);
