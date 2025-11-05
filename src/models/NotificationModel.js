import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    ROLE_ID: { 
        type: String, 
        required: true 
    }, // Target role (e.g., Supervisor, Manager)
    message: { 
        type: String, 
        required: true 
    }, // Notification content
    WORK_ITEM_ID: { 
        type: Number, 
        required: true 
    }, // Associated workflow item ID
    EVENT_ID: { 
        type: Number 
    }, // Optional event ID for tracking
    status: { 
        type: String, 
        default: 'Pending' 
    }, // Status of the notification (e.g., Pending, Sent, Viewed)
    notificationType: { 
        type: String, 
        default: 'system' 
    }, // Type of notification (e.g., system, email, SMS)
    createdAt: { 
        type: Date, 
        default: Date.now 
    }, // When the notification was created
    updatedAt: { 
        type: Date 
    }, // When the notification was last updated
}, {
    timestamps: true, // Automatically manage createdAt and updatedAt fields
});



// Check if the Notification model already exists, if not, create it
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

export default Notification;
