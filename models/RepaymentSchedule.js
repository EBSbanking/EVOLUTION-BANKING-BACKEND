import mongoose from 'mongoose';

const repaymentScheduleSchema = new mongoose.Schema({
    ACCT_NO: {
        type: String,
        required: true,
    },
    installmentNo: {
        type: Number,
        required: true,
    },
    dueDate: {
        type: Date,
        required: true,
    },
    principal: {
        type: Number,
        required: true,
    },
    interest: {
        type: Number,
        required: true,
    },
    totalPayment: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['Pending', 'Paid', 'Overdue'],
        default: 'Pending',
    }
}, {
    timestamps: true,
});

// ✅ Prevent OverwriteModelError
const RepaymentSchedule = mongoose.models.RepaymentSchedule || mongoose.model('RepaymentSchedule', repaymentScheduleSchema);

export default RepaymentSchedule;
