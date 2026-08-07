// scripts/debugCountry.js
import dotenv from 'dotenv';
import Country from '../src/models/Country.js';
import sequelize from '../config/db.js';
import { Op } from 'sequelize';

dotenv.config();

async function debugCountry() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Get all countries
    const countries = await Country.findAll({
      raw: true,
      limit: 5
    });

    if (countries.length === 0) {
      console.log('⚠️ No countries found in database');
      
      // Show table structure
      const [columns] = await sequelize.query('DESCRIBE countries');
      console.log('📋 Countries table structure:');
      console.table(columns);
      
      process.exit(0);
    }

    console.log('📋 Sample countries:');
    console.table(countries);

    // Show column names
    console.log('📋 Columns in Country model:');
    const attributes = Object.keys(Country.rawAttributes);
    console.log(attributes);

    // Try to find Nigeria
    let nigeria = await Country.findOne({
      where: { COUNTRY_NM: 'Nigeria' }
    });
    
    if (!nigeria) {
      nigeria = await Country.findOne({
        where: { name: 'Nigeria' }
      });
    }
    
    if (!nigeria) {
      nigeria = await Country.findOne({
        where: { COUNTRY_ID: 'NG001' }
      });
    }

    if (nigeria) {
      console.log('✅ Found Nigeria:');
      console.log(nigeria.toJSON());
    } else {
      console.log('❌ Nigeria not found');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugCountry();