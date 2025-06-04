import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
    WORK_ITEM_ID: { type: Number, required: true },
    EVENT_ID: { type: Number, required: true },
    QUEUE_ID: {type: Number, required: true},
  // other fields...
});

const Event = mongoose.model('Event', eventSchema);
export default Event;
