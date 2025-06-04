import mongoose from 'mongoose';

const LoanContractFormSchema = new mongoose.Schema({
  loan_contract_no: {
    type: String,
    required: true,
    unique: true
  },
  customer_id: {
    type: String,
    required: true
  },
  borrower_name: {
    type: String,
    required: true
  },
  co_signatory_name: {
    type: String
  },
  borrower_address: {
    type: String,
    required: true
  },
  loan_purpose: {
    type: String,
    required: true
  },
  loan_amount: {
    type: String,
    required: true
  },
  loan_term: {
    type: Number,
    required: true
  },
  interest_rate: {
    type: Number,
    required: true
  },
  guarantor_name: {
    type: String
  },
  bank_name: {
    type: String,
    required: true
  },
  bank_short: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Disbursed', 'active'],
    default: 'Disbursed'
  },
  contract_text: {
    type: String // <-- Added this field
  }
}, { timestamps: true });

const LoanContractForm = mongoose.model('LoanContractForm', LoanContractFormSchema);

export default LoanContractForm;
