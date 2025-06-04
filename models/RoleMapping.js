import mongoose from 'mongoose';  // Keep only one import statement

const RoleMappingSchema = new mongoose.Schema({
  ROLE_ID: { type: Number, required: true },
  ROLE_NM: { type: String, required: true },
  Business_Unit: { type: String, required: true },
  USER_ID: { type: String, required: true },
  CREATED_BY: { type: String, required: true },
  EFF_FROM_DT: { type: Date, required: true },
  DEF_ROLE_FG: { type: String, required: true },
  SUPERVISOR_FG: { type: String, required: true },
  WF_ITEM_ACCESS_LEVEL: { type: String, required: true },
  REC_ST: { type: String, required: true }
});

const RoleMapping = mongoose.model('RoleMapping', RoleMappingSchema);

export default RoleMapping;
