// scripts/populateStates.js
import dotenv from 'dotenv';
import sequelize from '../config/db.js';
import States from './data/nigeriaStates.js';

dotenv.config();

// Helper function to sanitize LOCAL_GOV_ID
function sanitizeLocalGovId(value) {
  if (!value) return value;
  // Remove special characters, keep alphanumeric, underscores, and hyphens
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '') // Remove anything that's not A-Z, 0-9, underscore, or hyphen
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

async function populateStates() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Get Nigeria
    const [nigeria] = await sequelize.query(
      `SELECT code FROM countries WHERE code = 'NG' OR name = 'Nigeria' LIMIT 1`
    );

    if (!nigeria || nigeria.length === 0) {
      throw new Error('Nigeria not found. Please run createNigeria.js first.');
    }

    const countryCode = nigeria[0].code;
    console.log(`✅ Found Nigeria with code: ${countryCode}`);

    // Check existing states
    const [existing] = await sequelize.query(
      `SELECT COUNT(*) as count FROM states WHERE COUNTRY_ID = ?`,
      { replacements: [countryCode] }
    );

    if (existing[0].count > 0) {
      console.log(`⚠️ Found ${existing[0].count} existing states. Clearing and repopulating...`);
      
      // Delete existing data
      await sequelize.query(`DELETE FROM local_governments`);
      await sequelize.query(`DELETE FROM states WHERE COUNTRY_ID = ?`, {
        replacements: [countryCode]
      });
      await sequelize.query(`ALTER TABLE states AUTO_INCREMENT = 1`);
      await sequelize.query(`ALTER TABLE local_governments AUTO_INCREMENT = 1`);
      console.log('  ✅ Cleared existing data');
    }

    console.log('🔄 Starting population...');

    let totalLGs = 0;
    let statesCreated = 0;

    for (let i = 0; i < States.length; i++) {
      const stateData = States[i];
      const stateId = i + 1;
      const stateName = stateData.name;
      const stateCode = stateName.toUpperCase().replace(/\s+/g, '_');
      const customStateId = `ST_${stateCode}`;

      console.log(`\n📂 Processing ${stateId}: ${stateName}...`);

      // Insert state
      await sequelize.query(
        `INSERT INTO states (STATE_ID, STATE_NM, COUNTRY_ID, CREATED_AT, UPDATED_AT) 
         VALUES (?, ?, ?, NOW(), NOW())`,
        { replacements: [customStateId, stateName, countryCode] }
      );

      statesCreated++;

      // Get the auto-increment id
      const [stateResult] = await sequelize.query(
        `SELECT id FROM states WHERE STATE_ID = ? LIMIT 1`,
        { replacements: [customStateId] }
      );

      if (!stateResult || stateResult.length === 0) {
        console.error(`  ❌ Could not find id for state: ${customStateId}`);
        continue;
      }

      const stateAutoId = stateResult[0].id;
      console.log(`  ✅ Created state: ${stateName} (ID: ${stateAutoId}, STATE_ID: ${customStateId})`);

      // Insert local governments
      for (const lg of stateData.LOCAL_GOV) {
        // Create a clean LOCAL_GOV_ID
        const rawLgId = `${stateId}_${lg.name}`;
        const cleanLgId = sanitizeLocalGovId(rawLgId);
        
        // If sanitization removed everything, create a fallback
        const finalLgId = cleanLgId || `${stateId}_LG_${Math.random().toString(36).substr(2, 6)}`;
        
        await sequelize.query(
          `INSERT INTO local_governments 
           (LOCAL_GOV_ID, LOCAL_GOV_NM, STATE_ID, URBAN, RURAL, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          { 
            replacements: [
              finalLgId, 
              lg.name, 
              stateAutoId,
              lg.URBAN ? 1 : 0, 
              lg.RURAL ? 1 : 0
            ] 
          }
        );
        
        totalLGs++;
      }

      console.log(`  ✅ Completed: ${stateData.LOCAL_GOV.length} LGs`);
    }

    console.log('\n✅ Population completed successfully!');
    console.log(`📊 ${statesCreated} states created`);
    console.log(`📊 ${totalLGs} local governments created`);

    // Verify
    const [verifyStates] = await sequelize.query(
      `SELECT COUNT(*) as count FROM states WHERE COUNTRY_ID = ?`,
      { replacements: [countryCode] }
    );
    const [verifyLGs] = await sequelize.query(
      `SELECT COUNT(*) as count FROM local_governments`
    );

    console.log(`✅ Verification: ${verifyStates[0].count} states, ${verifyLGs[0].count} LGs`);

    // Show sample data
    const [sample] = await sequelize.query(`
      SELECT 
        s.STATE_NM,
        s.STATE_ID,
        COUNT(lg.id) as lg_count
      FROM states s
      LEFT JOIN local_governments lg ON lg.STATE_ID = s.id
      WHERE s.COUNTRY_ID = ?
      GROUP BY s.id
      ORDER BY s.STATE_NM ASC
      LIMIT 5
    `, { replacements: [countryCode] });
    
    console.log('\n📊 Sample data:');
    console.table(sample);

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.sql) {
      console.error('SQL:', error.sql);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

populateStates();