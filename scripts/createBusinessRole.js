// createBusinessRole.js
import mongoose from 'mongoose';
import BusinessRole from '../models/BusinessRole.js'; // Adjust path if needed

// Direct MongoDB connection URI
const mongoUri = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';

// Connect to MongoDB
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
  createRole();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

async function createRole() {
  try {
    const role = new BusinessRole({
      ROLE_NM: "Administrator",
      REC_ST: "Active",
      VERSION_NO: 1,
      USER_ID: "PCO06",
      CREATE_DT: new Date("2025-07-27T12:00:00.000Z"),
      SYS_CREATE_TS: new Date("2025-07-27T12:00:00.000Z"),
      ROLE_ID: 1,
      ALLOW_TXN_POSTING_FG: "Y",
      BUSINESS_UNIT: "Information Technology",
      BU_ID: 103,
      SUPERVISOR_FG: "Y",
      CREATED_BY: "Administrator"
    });

    await role.save();
    console.log('✅ Business role created successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create business role:', err);
    process.exit(1);
  }
}
