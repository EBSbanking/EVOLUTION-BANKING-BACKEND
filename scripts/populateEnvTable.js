// scripts/populateEnvTable.js
import { sequelize } from '../config/db.js';
import { QueryTypes } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, '../.env');

async function populateEnvTable() {
  try {
    console.log('📂 Reading .env file from:', ENV_PATH);
    
    if (!fs.existsSync(ENV_PATH)) {
      console.error('❌ .env file not found at:', ENV_PATH);
      console.log('📁 Current directory:', process.cwd());
      console.log('📁 __dirname:', __dirname);
      return;
    }

    const content = fs.readFileSync(ENV_PATH, 'utf8');
    const lines = content.split('\n');
    let count = 0;
    let skipped = 0;

    console.log('📝 Parsing .env file...');
    console.log(`📄 Found ${lines.length} lines`);

    // First, check if table exists
    try {
      await sequelize.query('SELECT 1 FROM admin_env_vars LIMIT 1', { type: QueryTypes.SELECT });
      console.log('✅ Table admin_env_vars exists');
    } catch (err) {
      console.log('⚠️ Table admin_env_vars does not exist. Creating it...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS admin_env_vars (
          id INT PRIMARY KEY AUTO_INCREMENT,
          \`key\` VARCHAR(255) NOT NULL UNIQUE,
          \`value\` TEXT,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_key (\`key\`)
        )
      `);
      console.log('✅ Table admin_env_vars created');
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip empty lines
      if (line.trim() === '') {
        continue;
      }

      // Check if it's a comment
      if (line.trim().startsWith('#')) {
        // Store comment as description for the next variable
        continue;
      }

      // Parse key=value
      const match = line.match(/^([^=#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Find description (comment above this line)
        let description = null;
        if (i > 0 && lines[i - 1].trim().startsWith('#')) {
          description = lines[i - 1].trim().replace(/^#\s*/, '');
        }

        try {
          // Check if key already exists
          const existing = await sequelize.query(
            'SELECT id FROM admin_env_vars WHERE `key` = ?',
            { replacements: [key], type: QueryTypes.SELECT }
          );

          if (existing.length === 0) {
            // Insert new variable
            await sequelize.query(
              `INSERT INTO admin_env_vars (\`key\`, \`value\`, description, created_at, updated_at) 
               VALUES (?, ?, ?, NOW(), NOW())`,
              { replacements: [key, value, description] }
            );
            count++;
            console.log(`✅ Added: ${key} = ${value.substring(0, 30)}${value.length > 30 ? '...' : ''}`);
          } else {
            // Update existing variable
            await sequelize.query(
              `UPDATE admin_env_vars 
               SET \`value\` = ?, description = ?, updated_at = NOW() 
               WHERE \`key\` = ?`,
              { replacements: [value, description, key] }
            );
            console.log(`🔄 Updated: ${key}`);
          }
        } catch (err) {
          console.error(`❌ Error processing ${key}:`, err.message);
          skipped++;
        }
      }
    }

    // Get total count
    const totalResult = await sequelize.query(
      'SELECT COUNT(*) as count FROM admin_env_vars',
      { type: QueryTypes.SELECT }
    );
    const total = totalResult[0]?.count || 0;

    console.log(`\n✅ Successfully processed ${count} environment variables`);
    console.log(`📊 Total variables in database: ${total}`);
    if (skipped > 0) {
      console.log(`⚠️ Skipped ${skipped} variables due to errors`);
    }

    // Show sample of what was added
    const sample = await sequelize.query(
      'SELECT `key`, `value`, description FROM admin_env_vars LIMIT 10',
      { type: QueryTypes.SELECT }
    );
    console.log('\n📋 Sample of variables in database:');
    sample.forEach(row => {
      console.log(`  ${row.key} = ${row.value.substring(0, 20)}${row.value.length > 20 ? '...' : ''}`);
    });

  } catch (error) {
    console.error('❌ Error populating environment table:', error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run the script
populateEnvTable();