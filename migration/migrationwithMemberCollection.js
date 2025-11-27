// migrate-groups-with-members-and-collections.js
import mysql from 'mysql2/promise';
import { MongoClient, Decimal128 } from 'mongodb';

const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'core_x_banking',
  port: 3306,
};

const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'evolution_banking';

// Function to fetch group members from customer table
async function fetchGroupMembers(mysqlConnection, groupId) {
  try {
    const [members] = await mysqlConnection.execute(`
      SELECT 
        customer_id,
        fname,
        mname, 
        lname,
        company_name,
        date_of_birth,
        gender,
        marital_status,
        primary_relationship_manager,
        secondary_relationship_manager,
        branch,
        primary_branch,
        phone_no,
        phone_no_sec,
        email,
        address,
        country,
        state,
        city,
        status,
        creation_date_time,
        open_date,
        created_by
      FROM customer 
      WHERE group_id = ? AND (status = 'Open' OR status IS NULL)
    `, [groupId]);

    return members;
  } catch (error) {
    console.log(`   ⚠️ Error fetching members for group ${groupId}: ${error.message}`);
    return [];
  }
}

// Function to fetch group collections from collections table
async function fetchGroupCollections(mysqlConnection, groupId) {
  try {
    const [collections] = await mysqlConnection.execute(`
      SELECT 
        id,
        group_id,
        created_by,
        branch,
        relationship_manager,
        date,
        total,
        status,
        currency,
        last_updated,
        offline_id,
        channel
      FROM collections 
      WHERE group_id = ?
      ORDER BY date ASC
    `, [groupId]);

    return collections;
  } catch (error) {
    console.log(`   ⚠️ Error fetching collections for group ${groupId}: ${error.message}`);
    return [];
  }
}

// Enhanced mapping function for groups with members AND collections
async function mapGroupRowToMongoDoc(row, schema, mysqlConnection) {
  const groupCode = `GRP${String(row.id).padStart(3, '0')}`;
  
  const statusMap = {
    'Active': 'active',
    'Inactive': 'inactive', 
    'Dissolved': 'dissolved'
  };

  // Fetch members for this group from customer table
  const mysqlMembers = await fetchGroupMembers(mysqlConnection, row.id);
  
  // Fetch collections for this group from collections table
  const mysqlCollections = await fetchGroupCollections(mysqlConnection, row.id);
  
  console.log(`   👥 Group ${row.id} (${row.name}): ${mysqlMembers.length} members, ${mysqlCollections.length} collections`);
  
  // Map members to MongoDB format
  const members = mysqlMembers.map(member => ({
    customerId: member.customer_id,
    membershipNumber: `MEM${String(member.customer_id).padStart(6, '0')}`,
    customerName: `${member.fname || ''} ${member.mname || ''} ${member.lname || ''}`.trim(),
    firstName: member.fname,
    middleName: member.mname,
    lastName: member.lname,
    companyName: member.company_name,
    phoneNumber: member.phone_no,
    secondaryPhone: member.phone_no_sec,
    email: member.email,
    address: member.address,
    country: member.country,
    state: member.state,
    city: member.city,
    branch: member.branch,
    primaryBranch: member.primary_branch,
    joinDate: member.creation_date_time ? new Date(member.creation_date_time) : new Date(),
    openDate: member.open_date ? new Date(member.open_date) : null,
    status: member.status === 'Open' ? 'active' : 'inactive',
    role: 'member',
    isGroupLeader: false,
    
    // Personal details
    dateOfBirth: member.date_of_birth ? new Date(member.date_of_birth) : null,
    gender: member.gender,
    maritalStatus: member.marital_status,
    primaryRelationshipManager: member.primary_relationship_manager,
    secondaryRelationshipManager: member.secondary_relationship_manager,
    createdBy: member.created_by,
    
    mysqlCustomerId: member.customer_id
  }));

  // Map collections to MongoDB format
  const collections = mysqlCollections.map(collection => ({
    collectionId: collection.id,
    amount: Number(collection.total),
    currency: collection.currency || 'NGN',
    collectionDate: collection.date ? new Date(collection.date) : new Date(),
    status: collection.status?.toLowerCase() || 'approved',
    branch: collection.branch,
    relationshipManager: collection.relationship_manager,
    createdBy: collection.created_by,
    channel: collection.channel,
    lastUpdated: collection.last_updated ? new Date(collection.last_updated) : new Date(),
    offlineId: collection.offline_id,
    mysqlCollectionId: collection.id
  }));

  // Calculate total collections amount
  const totalCollections = collections.reduce((sum, collection) => sum + collection.amount, 0);

  return {
    // New schema fields
    groupCode: groupCode,
    groupName: row.name,
    members: members,
    memberCount: members.length,
    collections: collections,
    collectionCount: collections.length,
    totalCollections: totalCollections,
    status: statusMap[row.status] || 'active',
    
    // Legacy fields
    legacyId: row.id + 1000,
    branch: row.branch,
    relationshipManager: row.relationship_manager,
    regDate: row.reg_date ? new Date(row.reg_date) : new Date(),
    minMembers: row.min_members || 0,
    maxMembers: row.max_members || 0,
    meetingDay: row.meeting_day,
    meetingFrequency: row.meeting_frequency,
    unionAddress: row.union_address,
    createdBy: row.created_by,
    offlineId: row.offline_id,
    groupType: row.group_type,
    unionPurseAccount: row.union_purse_account || 0,
    migrationId: row.migration_id,
    
    // Timestamps
    createdAt: row.reg_date ? new Date(row.reg_date) : new Date(),
    updatedAt: new Date(),
    
    // Preserve original data
    mysqlId: row.id
  };
}

async function migrateGroupsWithMembersAndCollections() {
  let mysqlConnection;
  let mongoClient;
  try {
    console.log('🔌 Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ MySQL connected.');

    console.log('🔌 Connecting to MongoDB...');
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db(DB_NAME);
    console.log('✅ MongoDB connected.');

    // Only migrate groups table with members and collections
    const tableName = 'groups';
    console.log(`\n🔄 Processing table: "${tableName}"`);

    // Get table schema
    const [schemaRows] = await mysqlConnection.execute(`DESCRIBE \`${tableName}\``);

    // Fetch data
    const [rows] = await mysqlConnection.execute(`SELECT * FROM \`${tableName}\` ORDER BY id ASC`);
    console.log(`   📥 Fetched ${rows.length} groups.`);

    if (rows.length === 0) {
      console.log(`   ⏭️ No groups found.`);
      return;
    }

    // Check and drop existing collection
    const collectionsCursor = db.listCollections({ name: tableName });
    const collectionExists = await collectionsCursor.hasNext();
    if (collectionExists) {
      await db.collection(tableName).drop();
      console.log(`   🗑️ Dropped existing "${tableName}" collection.`);
    }

    // Process groups one by one to fetch members and collections
    const mongoDocs = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`   🔍 Processing group ${i + 1}/${rows.length}: ${row.id} - ${row.name}`);
      const doc = await mapGroupRowToMongoDoc(row, schemaRows, mysqlConnection);
      mongoDocs.push(doc);
    }

    // Insert all groups with their members and collections
    if (mongoDocs.length > 0) {
      const collection = db.collection(tableName);
      const result = await collection.insertMany(mongoDocs, { ordered: false });
      console.log(`   ✅ Groups inserted: ${result.insertedCount}`);
    }

    // Create indexes
    const collection = db.collection(tableName);
    await collection.createIndex({ groupCode: 1 }, { unique: true });
    await collection.createIndex({ legacyId: 1 }, { unique: true, sparse: true });
    await collection.createIndex({ groupName: 'text' });
    await collection.createIndex({ branch: 1 });
    await collection.createIndex({ status: 1 });
    await collection.createIndex({ "members.customerId": 1 });
    await collection.createIndex({ "collections.collectionId": 1 });
    await collection.createIndex({ "collections.collectionDate": 1 });
    console.log(`   🔧 Created indexes for groups table.`);

    // Log detailed statistics
    const groupStats = await collection.aggregate([
      {
        $group: {
          _id: null,
          totalGroups: { $sum: 1 },
          totalMembers: { $sum: "$memberCount" },
          totalCollections: { $sum: "$collectionCount" },
          totalCollectionAmount: { $sum: "$totalCollections" },
          groupsWithMembers: {
            $sum: {
              $cond: [{ $gt: ["$memberCount", 0] }, 1, 0]
            }
          },
          groupsWithCollections: {
            $sum: {
              $cond: [{ $gt: ["$collectionCount", 0] }, 1, 0]
            }
          },
          averageMembersPerGroup: { $avg: "$memberCount" },
          averageCollectionsPerGroup: { $avg: "$collectionCount" }
        }
      }
    ]).toArray();
    
    if (groupStats.length > 0) {
      const stats = groupStats[0];
      console.log(`\n📊 COMPREHENSIVE MIGRATION SUMMARY:`);
      console.log(`   Total Groups: ${stats.totalGroups}`);
      console.log(`   Total Members: ${stats.totalMembers}`);
      console.log(`   Total Collections: ${stats.totalCollections}`);
      console.log(`   Total Collection Amount: ₦${stats.totalCollectionAmount?.toLocaleString() || 0}`);
      console.log(`   Groups with Members: ${stats.groupsWithMembers}`);
      console.log(`   Groups with Collections: ${stats.groupsWithCollections}`);
      console.log(`   Average Members per Group: ${stats.averageMembersPerGroup?.toFixed(1) || 0}`);
      console.log(`   Average Collections per Group: ${stats.averageCollectionsPerGroup?.toFixed(1) || 0}`);
      
      // Show groups with most collections
      const topCollectionGroups = await collection.find({ collectionCount: { $gt: 0 } })
        .project({ groupCode: 1, groupName: 1, collectionCount: 1, totalCollections: 1, _id: 0 })
        .sort({ totalCollections: -1 })
        .limit(10)
        .toArray();
      
      console.log(`\n💰 TOP 10 GROUPS BY COLLECTION AMOUNT:`);
      topCollectionGroups.forEach((group, index) => {
        console.log(`   ${index + 1}. ${group.groupCode} - ${group.groupName}: ${group.collectionCount} collections, ₦${group.totalCollections?.toLocaleString() || 0}`);
      });

      // Show groups with most members
      const topMemberGroups = await collection.find({ memberCount: { $gt: 0 } })
        .project({ groupCode: 1, groupName: 1, memberCount: 1, _id: 0 })
        .sort({ memberCount: -1 })
        .limit(10)
        .toArray();
      
      console.log(`\n👥 TOP 10 GROUPS BY MEMBER COUNT:`);
      topMemberGroups.forEach((group, index) => {
        console.log(`   ${index + 1}. ${group.groupCode} - ${group.groupName}: ${group.memberCount} members`);
      });
    }

    // Verify specific groups we know have collections
    console.log(`\n🔍 VERIFYING SPECIFIC GROUPS WITH COLLECTIONS:`);
    const specificGroups = [176, 183]; // Groups we know have collections
    for (const groupId of specificGroups) {
      const group = await collection.findOne({ mysqlId: groupId });
      if (group) {
        console.log(`\n   Group ${groupId} (${group.groupName}):`);
        console.log(`     Members: ${group.memberCount}`);
        console.log(`     Collections: ${group.collectionCount}`);
        console.log(`     Total Collection Amount: ₦${group.totalCollections?.toLocaleString() || 0}`);
        
        if (group.collectionCount > 0) {
          console.log(`     Recent Collections:`);
          group.collections.slice(0, 3).forEach((collection, index) => {
            const date = collection.collectionDate.toISOString().split('T')[0];
            console.log(`       ${index + 1}. ${date}: ₦${collection.amount.toLocaleString()} (${collection.status})`);
          });
        }
        
        if (group.memberCount > 0) {
          console.log(`     Sample Members:`);
          group.members.slice(0, 3).forEach((member, index) => {
            console.log(`       ${index + 1}. ${member.customerName} (ID: ${member.customerId})`);
          });
        }
      }
    }

    console.log(`\n🎉 COMPLETE! Groups migrated with members and collections!`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log('🔌 MySQL disconnected.');
    }
    if (mongoClient) {
      await mongoClient.close();
      console.log('🔌 MongoDB disconnected.');
    }
  }
}

// Run the comprehensive migration
migrateGroupsWithMembersAndCollections().catch(console.error);