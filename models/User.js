import mongoose from 'mongoose'; // Use import instead of require

// Define the user schema
const userSchema = new mongoose.Schema({
    user_name: {
        type: String,
        required: true,
        unique: true, // Ensures the username is unique
    },
    password: {
        type: String,
        required: true, // Password is required
        minlength: 6, // Ensures password is at least 6 characters long
    },
    employer_number: {
        type: String,
        required: false, // Optional field
    },
    first_name: {
        type: String,
        required: false, // Optional field
    },
    last_name: {
        type: String,
        required: false, // Optional field
    },
    middle_name: {
        type: String,
        required: false, // Optional field
    },
    preferred_name: {
        type: String,
        required: false, // Optional field
    },
    job_title: {
        type: String,
        required: false, // Optional field
    },
    email: {
        type: String,
        required: true,
        unique: true, // Ensures the email is unique
        match: /.+\@.+\..+/, // Validates the email format
    },
    customer_number: {
        type: String,
        required: false, // Optional field
    },
    main_business_unit: {
        type: String,
        required: false, // Optional field
        default: '', // Default value for business unit
    },
    responsibility_centre: {
        type: String,
        required: false, // Optional field
    },
    primary_business_role: {
        type: String,
        required: false, // Optional field
    },
    start_date: {
        type: Date,
        required: false, // Optional field
    },
    expiry_date: {
        type: Date,
        required: false, // Optional field
    },
    earliest_login_time: {
        type: String,
        required: false, // Optional field
    },
    latest_login_time: {
        type: String,
        required: false, // Optional field
    },
    internal_employee_enabled: {
        type: Boolean,
        default: false, // Default to false
    },
    relationship_officer: {
  type: String,
  default: '', // Or null if you'd prefer
},

    enable_multi_session: {
        type: Boolean,
        default: false, // Default to false
    },
    validate_ip_address: {
        type: Boolean,
        default: false, // Default to false
    },
    note: {
        type: String,
        required: false, // Optional field
    },
    ip_address: {
        type: String,
        required: false, // Optional field
    },
    is_supervisor: { // New field for Supervisor checkbox
        type: Boolean,
        default: false, // Default to false
    },
    is_main_BU: { // New field for Main BU checkbox
        type: Boolean,
        default: false, // Default to false
    },
    status: { // Status field for Active or Deactivated
        type: String,
        enum: ['Active', 'Deactivated'], // Enum restricts to either 'Active' or 'Deactivated'
        default: 'Active', // Default status is Active
    },
    failed_attempts: {  // New field to track failed login attempts
        type: Number,
        default: 0,
    },
    lock_until: {  // New field to store lock expiry time
        type: Date,
        default: null,
    },
    reset_token: {  // Field to store the password reset token
        type: String,
        default: null,
    },
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
});

// Create User model from the schema
const User = mongoose.model('User', userSchema);

// Export the User model using ES module export
export default User;
