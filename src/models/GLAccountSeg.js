// models/GLAccountSeg.js
import mongoose from 'mongoose';

const GLAccountSegSchema = new mongoose.Schema({
  GL_ACCT_SEG_ID: {
    type: Number,
    required: true,
    unique: true,
    comment: 'Account Segment Identifier',
  },
  GL_ACCT_STRUCT_ID: {
    type: String,
    required: true,
    ref: 'GLAccount',
    comment: 'GL Account Structure Identifier (matches GL_ACCT_NO)',
  },
  POSN: {
    type: Number,
    required: true,
    min: 1,
    max: 999,
    comment: 'Position in Account Segment (1-3 digits)',
  },
  PROMPT: {
    type: String,
    maxlength: 50,
    comment: 'Prompt Text',
  },
  SEG_PLACEHLDR_ID: {
    type: Number,
    required: true,
    comment: 'Segment Placeholder Identifier',
  },
  ACCT_SEG_DESC: {
    type: String,
    maxlength: 100,
    comment: 'Account Segment Description',
  },
  SEG_TY_CD: {
    type: String,
    required: true,
    maxlength: 10,
    comment: 'Segment Type Code',
  },
  REC_ST: {
    type: String,
    required: true,
    maxlength: 1,
    enum: ['A', 'I'], // Active, Inactive
    default: 'A',
    comment: 'Record State',
  },
  VERSION_NO: {
    type: Number,
    required: true,
    default: 1,
    comment: 'Version Number',
  }
}, {
  timestamps: { 
    createdAt: 'ROW_TS',
    updatedAt: false 
  },
  collection: 'GLACCOUNT_SEG'
});

// Auto-increment for GL_ACCT_SEG_ID
GLAccountSegSchema.pre('save', async function(next) {
  if (this.isNew) {
    const lastDoc = await this.constructor.findOne({}, {}, { sort: { GL_ACCT_SEG_ID: -1 } });
    this.GL_ACCT_SEG_ID = lastDoc ? lastDoc.GL_ACCT_SEG_ID + 1 : 1;
  }
  next();
});

const GLAccountSeg = mongoose.model('GLAccountSeg', GLAccountSegSchema);
export default GLAccountSeg;