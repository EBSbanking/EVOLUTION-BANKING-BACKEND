// models/Country.js
import mongoose from 'mongoose';

const CountrySchema = new mongoose.Schema({
  COUNTRY_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  COUNTRY_NM: {
    type: String,
    required: true,
    trim: true
  },
  CREATE_DT: {
    type: Date,
    default: Date.now
  },
  STATES: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'State'
  }]
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

const Country = mongoose.model('Country', CountrySchema);

export default Country;
