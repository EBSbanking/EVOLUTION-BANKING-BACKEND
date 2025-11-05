import mongoose from 'mongoose';

// Define the schema for workflow routing
const CustWorkflowRoutingSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true // Ensure the field name matches
    },
    wfRoutingId: { 
        type: Number, 
        required: true // Ensure the field name matches
    },
    workflow_id: {
        type: Number,
        required: true, // This field is mandatory
    },
    activity_id: {
        type: Number,
        required: true, // This field is mandatory
    },
    path_no: {
        type: Number,
        required: true, // This field is mandatory
    },
    next_activity_id: {
        type: Number,
        required: true, // This field is mandatory
    },
    rec_st: {
        type: String,
        required: true, // Ensures rec_st is always provided
        maxlength: 1, // Limiting to a single character
    },
    version_no: {
        type: Number,
        required: true, // Ensuring version number is present
    },
    row_ts: {
        type: Date,
        required: true, // Ensures the timestamp is always provided
    },
    create_dt: {
        type: Date,
        required: true, // Date when the workflow is created
    },
    sys_create_ts: {
        type: Date,
        required: true, // Timestamp when the workflow record is created in the system
    },
    created_by: {
        type: String,
        required: true, // Ensures created_by field is provided
        maxlength: 24, // Assuming a maximum length for the creator's ID
    },
    action: {
        type: String,
        required: false, // Optional action field
        maxlength: 20, // Limiting length of action string
    },
    routing_cd: {
        type: String,
        required: false, // Optional routing code field
        maxlength: 20, // Limiting length of routing code
    },
    routing_desc: {
        type: String,
        required: false, // Optional routing description
        maxlength: 100, // Limiting length of routing description
    }
});

// Exporting the model to be used in your application
const CustWorkflowRouting = mongoose.model('CustWorkflowRouting', CustWorkflowRoutingSchema);
export default CustWorkflowRouting;
