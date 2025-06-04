import mongoose from 'mongoose';
import UserRole from './models/USERROLE.js'; // Ensure the path is correct
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("Connected to MongoDB successfully");

    // Create a new UserRole
    const userId = 'admin123';  // This can be provided manually or via some input
    await createUserRole(userId);

  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

// Function to get the next sequence for USER_ROLE_ID
const getNextUserRoleId = async () => {
  try {
    const counter = await mongoose.model('Counter', new mongoose.Schema({
      _id: { type: String, required: true },
      seq: { type: Number, default: 1 }
    })).findOneAndUpdate(
      { _id: 'user_role_id' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return counter.seq;
  } catch (error) {
    console.error('Error getting next USER_ROLE_ID:', error);
    return 1; // fallback to 1 if there's an error
  }
};

// Function to create a new UserRole
const createUserRole = async (userId) => {
  try {
    const userRoleId = await getNextUserRoleId();
    
    // Randomly select access levels and permissions
    const wfItemAccessLevel = ['BU', 'ALL', 'SU'][Math.floor(Math.random() * 3)];
    const recSt = ['A', 'D'][Math.floor(Math.random() * 2)];

    const custPostingAccessLevel = ['ALL', 'BU'][Math.floor(Math.random() * 2)];
    const glPostingAccessLevel = ['ALL', 'SU'][Math.floor(Math.random() * 2)];
    const drawerAccessLevel = ['BU', 'SU'][Math.floor(Math.random() * 2)];
    const txnEnquiryAccessLevel = ['BU', 'ALL', 'SU'][Math.floor(Math.random() * 3)];
    const fixedAssetAccessLevel = ['ALL', 'BU', 'SU'][Math.floor(Math.random() * 3)];
    const reportAccessLevel = ['ALL', 'BU', 'SU'][Math.floor(Math.random() * 3)];
    const grpActivityDownloadPerm = ['NOT_APPLY'][0]; // Only one option
    const grpActivityUploadPerm = ['NOT_APPLY'][0]; // Only one option
    const dashboardAccessLevel = ['BU', 'SU', 'ALL'][Math.floor(Math.random() * 3)];
    const creditApplAccessLevel = ['BU', 'ALL'][Math.floor(Math.random() * 2)];
    const customerAccessLevel = ['BU', 'ALL', 'SU'][Math.floor(Math.random() * 3)];
    const accountAccessLevel = ['BU', 'SU', 'ALL'][Math.floor(Math.random() * 3)];
    
    // Randomly select VAULT_ACCESS_LEVEL between 'BU' and 'SU'
    const vaultAccessLevel = ['BU', 'SU'][Math.floor(Math.random() * 2)];

    const newUserRole = new UserRole({
      USER_ROLE_ID: userRoleId,
      SYSUSER_ID: 2,
      BU_ROLE_ID: 3,
      EFF_FROM_DT: new Date(),
      EFF_TO_DT: null,
      DEF_ROLE_FG: 'N',
      SUPERVISOR_FG: 'N',
      MULTI_CRNCY_FG: 'N',
      WF_ITEM_ACCESS_LEVEL: wfItemAccessLevel,
      REC_ST: recSt,
      VERSION_NO: 1,
      ROW_TS: new Date(),
      USER_ID: userId,
      CREATE_DT: new Date(),
      CREATED_BY: 'admin',
      SYS_CREATE_TS: new Date(),
      VAULT_ACCESS_LEVEL: vaultAccessLevel,  // Set VAULT_ACCESS_LEVEL randomly
      DRAWER_ACCESS_LEVEL: drawerAccessLevel,
      CUST_POSTING_ACCESS_LEVEL: custPostingAccessLevel,
      GL_POSTING_ACCESS_LEVEL: glPostingAccessLevel,
      TXN_ENQUIRY_ACCESS_LVL: txnEnquiryAccessLevel,
      FIXED_ASSET_ACCESS_LEVEL: fixedAssetAccessLevel,
      REPORT_ACCESS_LEVEL: reportAccessLevel,
      GRP_ACTIVITY_DOWNLOAD_PERM: grpActivityDownloadPerm,
      GRP_ACTIVITY_UPLOAD_PERM: grpActivityUploadPerm,
      DASHBOARD_ACCESS_LEVEL: dashboardAccessLevel,
      FAV_DASHBOARD_BU_ROLE_ID: null,
      CREDIT_APPL_ACCESS_LEVEL: creditApplAccessLevel,
      CUSTOMER_ACCESS_LEVEL: customerAccessLevel,
      ACCOUNT_ACCESS_LEVEL: accountAccessLevel,
      BU_RESPONSIBLE_CENTRE_ID: null
    });

    await newUserRole.save();
    console.log('UserRole created:', newUserRole);
  } catch (error) {
    console.error('Error creating UserRole:', error);
  }
};

// Call the connectDB function to run the entire process
connectDB();
