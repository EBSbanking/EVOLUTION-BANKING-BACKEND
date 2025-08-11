import mongoose from 'mongoose';
import moment from 'moment-timezone';

const AMLSchema = new mongoose.Schema(
  {
    CUST_ID: {
      type: String,
      required: [true, 'Customer ID is required'],
      unique: true,
      index: true
    },
    BVN: {
      type: String,
      required: [true, 'BVN is required'],
      unique: true,
      validate: {
        validator: v => /^[0-9]{11}$/.test(v),
        message: props => `${props.value} is not a valid BVN! Must be 11 digits.`
      }
    },
    NIN: {
      type: String,
      required: [true, 'NIN is required'],
      unique: true,
      validate: {
        validator: v => /^[0-9]{11}$/.test(v),
        message: props => `${props.value} is not a valid NIN! Must be 11 digits.`
      }
    },
    IS_PEP: { type: Boolean, default: false },
    IS_RCA: { type: Boolean, default: false },
    SANCTION_SCORE: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    SANCTION_MATCH: { type: Boolean, default: false },
    SANCTION_DETAILS: mongoose.Schema.Types.Mixed,

    CUSTOMER_RISK_RATING: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Low'
    },

    AML_STATUS: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Suspended', 'Deleted'],
      default: 'Pending'
    },

    RISK_REASON: String,
    REJECTION_REASON: String,
    REJECTION_COMMENTS: String,

    LAST_RISK_ASSESSMENT_DT: { type: Date, default: Date.now },
    NEXT_REVIEW_DATE: { type: Date, required: true },

    ID_DOCUMENTS: [
      {
        documentType: {
          type: String,
          required: true
        },
        documentNumber: { type: String, required: true },
        issueDate: Date,
        expiryDate: Date,
        verificationStatus: {
          type: String,
          enum: ['Pending', 'Verified', 'Failed', 'Expired'],
          default: 'Pending'
        },
        verifiedBy: { type: String },
        verificationDate: Date,
        documentImage: String
      }
    ],

    DOCUMENT_VERIFICATION_STATUS: {
      type: String,
      enum: ['Pending', 'Verified', 'Failed', 'Partial'],
      default: 'Pending'
    },

    APPROVED_BY: { type: String },
    APPROVAL_DATE: Date,
    APPROVAL_COMMENTS: String,

    REJECTED_BY: { type: String },
    REJECTION_DATE: Date,

    UPDATED_BY: { type: String, required: true },
    UPDATED_AT: { type: Date, default: Date.now },

    SARs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SAR' }],

    NOTES: [
      {
        note: String,
        createdBy: { type: String },
        createdAt: { type: Date, default: Date.now }
      }
    ],

    CUSTOMER_SCREENING_RESULT: mongoose.Schema.Types.Mixed,

    WATCHLIST_MATCHES: [
      {
        listName: String,
        matchScore: Number,
        matchDetails: mongoose.Schema.Types.Mixed,
        dateChecked: { type: Date, default: Date.now }
      }
    ],

    KYC_COMPLETION_DATE: Date,
    LAST_ENHANCED_DD_DATE: Date,
    RISK_CATEGORY: {
      type: String,
      enum: ['Individual', 'Corporate', 'Charity', 'PEP', 'HighRisk'],
      default: 'Individual'
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        if (ret.createdAt) {
          ret.createdAt = moment(ret.createdAt).tz('Africa/Lagos').format('YYYY-MM-DD HH:mm:ss');
        }
        if (ret.updatedAt) {
          ret.updatedAt = moment(ret.updatedAt).tz('Africa/Lagos').format('YYYY-MM-DD HH:mm:ss');
        }
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        if (ret.createdAt) {
          ret.createdAt = moment(ret.createdAt).tz('Africa/Lagos').format('YYYY-MM-DD HH:mm:ss');
        }
        if (ret.updatedAt) {
          ret.updatedAt = moment(ret.updatedAt).tz('Africa/Lagos').format('YYYY-MM-DD HH:mm:ss');
        }
        return ret;
      }
    }
  }
);

// Virtual for customer join
AMLSchema.virtual('customer', {
  ref: 'Customer',
  localField: 'CUST_ID',
  foreignField: 'CUST_ID',
  justOne: true
});

// Indexes
AMLSchema.index({ CUST_ID: 1 });
AMLSchema.index({ BVN: 1 });
AMLSchema.index({ NIN: 1 });
AMLSchema.index({ AML_STATUS: 1 });
AMLSchema.index({ CUSTOMER_RISK_RATING: 1 });
AMLSchema.index({ NEXT_REVIEW_DATE: 1 });

// Pre-save hook for document verification status
AMLSchema.pre('save', function (next) {
  if (this.ID_DOCUMENTS?.length) {
    const verified = this.ID_DOCUMENTS.filter(doc => doc.verificationStatus === 'Verified').length;
    if (verified === this.ID_DOCUMENTS.length) {
      this.DOCUMENT_VERIFICATION_STATUS = 'Verified';
    } else if (verified > 0) {
      this.DOCUMENT_VERIFICATION_STATUS = 'Partial';
    } else {
      this.DOCUMENT_VERIFICATION_STATUS = 'Pending';
    }
  }
  next();
});

// Static risk rating calculator
AMLSchema.statics.calculateRiskRating = function (aml) {
  if (aml.IS_PEP || aml.SANCTION_MATCH) return 'High';
  if (aml.SANCTION_SCORE > 70) return 'High';
  if (aml.DOCUMENT_VERIFICATION_STATUS === 'Failed') return 'Medium';
  if (aml.SANCTION_SCORE > 30) return 'Medium';
  return 'Low';
};

// Static: aggregate stats
AMLSchema.statics.getRiskStats = async function () {
  return this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        highRisk: { $sum: { $cond: [{ $eq: ['$CUSTOMER_RISK_RATING', 'High'] }, 1, 0] } },
        mediumRisk: { $sum: { $cond: [{ $eq: ['$CUSTOMER_RISK_RATING', 'Medium'] }, 1, 0] } },
        lowRisk: { $sum: { $cond: [{ $eq: ['$CUSTOMER_RISK_RATING', 'Low'] }, 1, 0] } },
        pepCount: { $sum: { $cond: ['$IS_PEP', 1, 0] } },
        sanctionedCount: { $sum: { $cond: ['$SANCTION_MATCH', 1, 0] } }
      }
    }
  ]);
};

const AML = mongoose.model('AML', AMLSchema);
export default AML;
