// models/User.js
import mongoose from 'mongoose';

// Define the user schema
const userSchema = new mongoose.Schema({
  user_name: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  employer_number: String,
  first_name: String,
  last_name: String,
  middle_name: String,
  preferred_name: String,
  job_title: String,
  email: {
    type: String,
    required: true,
    unique: true,
    match: /.+\@.+\..+/,
  },
  customer_number: String,
  main_business_unit: {
    type: String,
    default: '',
  },
  responsibility_centre: String,

  // This is now a reference to UserRole
  primary_business_role: {
    type: String, // Alternatively: mongoose.Schema.Types.ObjectId with ref: 'UserRole'
    required: false,
  },

  start_date: Date,
  expiry_date: Date,
  earliest_login_time: String,
  latest_login_time: String,

  internal_employee_enabled: {
    type: Boolean,
    default: false,
  },

  relationship_officer: {
    type: String,
    default: '',
  },

  enable_multi_session: {
    type: Boolean,
    default: false,
  },

  validate_ip_address: {
    type: Boolean,
    default: false,
  },

  note: String,
  ip_address: String,

  is_supervisor: {
    type: Boolean,
    default: false,
  },

  is_main_BU: {
    type: Boolean,
    default: false,
  },

  status: {
    type: String,
    enum: ['Active', 'Deactivated'],
    default: 'Active',
  },

  failed_attempts: {
    type: Number,
    default: 0,
  },

  lock_until: {
    type: Date,
    default: null,
  },

  reset_token: {
    type: String,
    default: null,
  },

}, {
  timestamps: true, // createdAt and updatedAt
});

// Create and export User model
const User = mongoose.model('User', userSchema);
export default User;
