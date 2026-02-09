// scripts/test-db.cjs  ← CommonJS (require works here)
const path = require('path');

// Adjust these paths if needed (from project root → scripts folder is one level down)
const sequelizeModule = require(path.join(__dirname, '../config/db.js'));
const IdentificationModule = require(path.join(__dirname, '../models/IdentificationInformation.js'));

const sequelize = sequelizeModule.default || sequelizeModule.sequelize || sequelizeModule;
const Identification = IdentificationModule.default || IdentificationModule;

async function testConnection() {
  try {
    console.log('Authenticating connection...');
    await sequelize.authenticate();
    console.log('MySQL connection authenticated successfully ✅');

    console.log('Counting records...');
    const count = await Identification.count();
    console.log('Number of records in identification_information:', count);

    console.log('Fetching first record...');
    const first = await Identification.findOne();
    if (first) {
      console.log('First record example:', first.get({ plain: true }));
    } else {
      console.log('No records found in the table.');
    }

  } catch (err) {
    console.error('Test failed with error:');
    console.error('Message:', err.message);
    if (err.parent) {
      console.error('SQL/Database error:', err.parent.message);
    }
    if (err.original) {
      console.error('Original DB error:', err.original);
    }
    if (err.stack) {
      console.error('Stack:', err.stack.split('\n').slice(0, 5).join('\n'));
    }
  } finally {
    try {
      await sequelize.close();
      console.log('Database connection closed.');
    } catch (closeErr) {
      console.log('Close error (usually harmless):', closeErr?.message || closeErr);
    }
  }
}

testConnection();