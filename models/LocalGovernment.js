// models/LocalGovernment.js
import mongoose from 'mongoose';

const LocalGovernmentSchema = new mongoose.Schema({
  LOCAL_GOV_ID: {
    type: String,
    unique: true,
    trim: true
  },
  LOCAL_GOV_NM: {
    type: String,
    required: true,
    trim: true
  },
  URBAN: {
    type: Boolean,
    default: false
  },
  RURAL: {
    type: Boolean,
    default: false
  },
  STATE_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'State',
    
  }
}, {
  timestamps: true
});

const LocalGovernment = mongoose.model('LocalGovernment', LocalGovernmentSchema);

export default LocalGovernment;
