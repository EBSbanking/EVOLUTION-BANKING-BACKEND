// scripts/createNigeria.js - FINAL WORKING VERSION (NO EMOJI)
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function createNigeria() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'core_banking'
    });

    console.log('✅ Database connected');

    // Check if Nigeria exists
    const [existing] = await connection.execute(
      `SELECT * FROM countries WHERE code = 'NG' OR name = 'Nigeria'`
    );

    if (existing && existing.length > 0) {
      console.log('✅ Nigeria already exists:');
      console.log(JSON.stringify(existing[0], null, 2));
      await connection.end();
      process.exit(0);
      return;
    }

    console.log('🔄 Creating Nigeria...');

    // Insert Nigeria - NO EMOJI, using simple text
    await connection.execute(`
      INSERT INTO countries (
          code,
          name,
          iso_code,
          iso_numeric,
          dialing_code,
          currency_code,
          currency_name,
          region,
          sub_region,
          capital,
          population,
          area,
          timezone,
          languages,
          flag_emoji,
          is_active,
          is_supported
      ) VALUES (
          'NG',
          'Nigeria',
          'NGA',
          '566',
          '+234',
          'NGN',
          'Naira',
          'Africa',
          'Western Africa',
          'Abuja',
          206139589,
          923768.00,
          'Africa/Lagos',
          'English, Hausa, Yoruba, Igbo, Pidgin',
          'NG',
          1,
          1
      )
    `);

    // Fetch the created record
    const [result] = await connection.execute(
      `SELECT * FROM countries WHERE code = 'NG'`
    );

    const nigeria = result[0];

    console.log('✅ Nigeria created successfully!');
    console.log('📊 Country Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🆔 ID:               ${nigeria.id}`);
    console.log(`🏷️  Code:             ${nigeria.code}`);
    console.log(`📛 Name:             ${nigeria.name}`);
    console.log(`📋 ISO Code:         ${nigeria.iso_code || 'N/A'}`);
    console.log(`🔢 ISO Numeric:      ${nigeria.iso_numeric || 'N/A'}`);
    console.log(`📞 Dialing Code:     ${nigeria.dialing_code || 'N/A'}`);
    console.log(`💱 Currency Code:    ${nigeria.currency_code || 'N/A'}`);
    console.log(`💰 Currency Name:    ${nigeria.currency_name || 'N/A'}`);
    console.log(`🌍 Region:           ${nigeria.region || 'N/A'}`);
    console.log(`🗺️  Sub-Region:       ${nigeria.sub_region || 'N/A'}`);
    console.log(`🏙️  Capital:          ${nigeria.capital || 'N/A'}`);
    console.log(`👥 Population:       ${nigeria.population || 'N/A'}`);
    console.log(`📐 Area:             ${nigeria.area || 'N/A'}`);
    console.log(`⏰ Timezone:         ${nigeria.timezone || 'N/A'}`);
    console.log(`🗣️  Languages:        ${nigeria.languages || 'N/A'}`);
    console.log(`🏳️  Flag:             ${nigeria.flag_emoji || 'N/A'}`);
    console.log(`✅ Active:           ${nigeria.is_active ? 'Yes' : 'No'}`);
    console.log(`⭐ Supported:        ${nigeria.is_supported ? 'Yes' : 'No'}`);
    console.log(`📅 Created:          ${nigeria.created_at || 'N/A'}`);
    console.log(`🔄 Updated:          ${nigeria.updated_at || 'N/A'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating Nigeria:', error.message);
    if (error.sql) {
      console.error('📝 SQL:', error.sql);
    }
    if (error.code) {
      console.error('🔢 Code:', error.code);
    }
    if (connection) {
      await connection.end();
    }
    process.exit(1);
  }
}

createNigeria();