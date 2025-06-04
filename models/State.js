// models/State.js
import mongoose from 'mongoose';

const StateSchema = new mongoose.Schema({
  STATE_ID: {
    type: String,
    unique: true,
    trim: true
  },
  STATE_NM: {
    type: String,
    required: true,
    trim: true
  },
  LOCAL_GOV: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LocalGovernment'
  }],
  COUNTRY_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Country',
    required: true
  }
}, {
  timestamps: true
});

const State = mongoose.model('State', StateSchema);

export default State;
