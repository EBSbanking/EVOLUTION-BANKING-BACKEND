import mongoose from 'mongoose';

// Connect to your MongoDB
const uri = 'mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; // replace with your DB name
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define UserRole schema (simplified for insert)
const userRoleSchema = new mongoose.Schema({
  ROLE_NM: String,
  SYSUSER_ID: String,
  Business_Unit: String,
  USER_ROLE_ID: Number,
  EFF_FROM_DT: Date,
  DEF_ROLE_FG: String,
  SUPERVISOR_FG: String,
  MULTI_CRNCY_FG: String,
  WF_ITEM_ACCESS_LEVEL: String,
  REC_ST: String,
  VERSION_NO: Number,
  USER_ID: String,
  CREATE_DT: Date,
  CREATED_BY: String,
  VAULT_ACCESS_LEVEL: String,
  DRAWER_ACCESS_LEVEL: String,
  TXN_ENQUIRY_ACCESS_LVL: String,
  CREDIT_APPL_ACCESS_LEVEL: String,
  CUSTOMER_ACCESS_LEVEL: String,
  ACCOUNT_ACCESS_LEVEL: String,
});

const UserRole = mongoose.model('UserRole', userRoleSchema);

async function insertUserRole() {
  try {
    const newUserRole = new UserRole({
      ROLE_NM: "Administrator",
      SYSUSER_ID: "1",
      Business_Unit: "103",
      USER_ROLE_ID: 1,
      EFF_FROM_DT: new Date("2024-06-30T00:00:00Z"),
      DEF_ROLE_FG: "Y",
      SUPERVISOR_FG: "N",
      MULTI_CRNCY_FG: "N",
      WF_ITEM_ACCESS_LEVEL: "ALL BUSINESS UNIT",
      REC_ST: "Y",
      VERSION_NO: 1,
      USER_ID: "PCO06",
      CREATE_DT: new Date("2024-06-30T00:00:00Z"),
      CREATED_BY: "System",
      VAULT_ACCESS_LEVEL: "ALL BUSINESS UNIT",
      DRAWER_ACCESS_LEVEL: "ALL BUSINESS UNIT",
      TXN_ENQUIRY_ACCESS_LVL: "ALL BUSINESS UNIT",
      CREDIT_APPL_ACCESS_LEVEL: "ALL BUSINESS UNIT",
      CUSTOMER_ACCESS_LEVEL: "ALL BUSINESS UNIT",
      ACCOUNT_ACCESS_LEVEL: "ALL BUSINESS UNIT"
    });

    const savedDoc = await newUserRole.save();
    console.log('UserRole inserted:', savedDoc);
  } catch (err) {
    console.error('Error inserting UserRole:', err);
  } finally {
    mongoose.connection.close();
  }
}

insertUserRole();
