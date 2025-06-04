import mongoose from 'mongoose'; // Use ES Module import

const BusinessUnitSchema = new mongoose.Schema({
    BU_ID: { type: Number, required: true }, // Unique identifier for the business unit
    BUSINESS_UNIT: { type: String, required: true }, // Name of the business unit
    DESCRIPTION: { type: String, required: true }, // Description of the business unit
    ADDRESS: { type: String, required: true }, // Address of the business unit
    created_at: { type: Date, default: Date.now }, // Creation timestamp
});

// Create the BusinessUnit model
const BusinessUnit = mongoose.model('BusinessUnit', BusinessUnitSchema);

// Export the model
export default BusinessUnit;
