import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false,
  },
  role: {
    type: String,
    enum: ['admin', 'verifier', 'institution'],
    default: 'verifier',
  },
  isBlocked:    { type: Boolean, default: false },
  failedLogins: { type: Number,  default: 0 },
  lastLogin:    Date,
  createdAt:    { type: Date, default: Date.now },
});

// ✅ async pre hook — NO next() parameter, NO next() calls
// Mongoose 7+ handles async hooks automatically
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare entered password with hashed
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', UserSchema);