import mongoose from 'mongoose';

const LoginSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    user_name: {
      type: String,
      required: false, // Changed from required: true
      default: 'Unknown', // Default value for anonymous attempts
      trim: true,
      maxlength: 50
    },
    login_time: {
      type: Date,
      default: Date.now,
    },
    ip_address: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Success', 'Failed'],
      required: true,
    },
    error: {
      type: String,
      default: null,
    },
    attempt_identifier: {  // New field to track what was entered
      type: String,
      required: true,
      trim: true
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Add indexes for better query performance
LoginSchema.index({ user_id: 1 });
LoginSchema.index({ user_name: 1 });
LoginSchema.index({ status: 1 });
LoginSchema.index({ login_time: -1 });
LoginSchema.index({ ip_address: 1 });

const Login = mongoose.model('Login', LoginSchema);
export default Login;