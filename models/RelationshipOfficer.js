import mongoose from 'mongoose';

const RelationshipOfficerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    USER_ID: { type: String, required: true, unique: true },  // Ensure USER_ID is a string
    ROLE_ID: { type: String, required: true }  // Corrected to 'String' for ROLE_ID
  });
  

const Officer = mongoose.model('RelationshipOfficer', RelationshipOfficerSchema);

export default Officer;
