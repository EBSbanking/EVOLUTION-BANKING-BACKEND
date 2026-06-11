// scripts/seedBanksFromPrembly.js
import sequelize from '../config/db.js';
import Bank from '../src/models/Banks.js';
import { Op } from 'sequelize';

// The bank data from Prembly API
const premblyBankData = {
  "status": true,
  "response_code": "00",
  "message": "Bank Code Retreived - You are in sandbox mode. Switch to production mode for live data.",
  "detail": "Bank Code Retreived - You are in sandbox mode. Switch to production mode for live data.",
  "data": [
    {
      "id": 879,
      "code": "40195",
      "name": "78 Finance Company Ltd",
      "slug": "78-finance-company-ltd-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "110072",
      "createdAt": "2025-11-21T12:32:33.000Z",
      "updatedAt": "2025-11-21T12:32:33.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 302,
      "code": "120001",
      "name": "9mobile 9Payment Service Bank",
      "slug": "9mobile-9payment-service-bank-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": "",
      "currency": "NGN",
      "longcode": "120001",
      "createdAt": "2022-05-31T06:50:27.000Z",
      "updatedAt": "2022-06-23T09:33:55.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 174,
      "code": "404",
      "name": "Abbey Mortgage Bank",
      "slug": "abbey-mortgage-bank-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "",
      "createdAt": "2020-12-07T16:19:09.000Z",
      "updatedAt": "2023-09-14T13:02:38.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 188,
      "code": "51204",
      "name": "Above Only MFB",
      "slug": "above-only-mfb",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "",
      "createdAt": "2021-10-13T20:35:17.000Z",
      "updatedAt": "2021-10-13T20:35:17.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 627,
      "code": "51312",
      "name": "Abulesoro MFB",
      "slug": "abulesoro-mfb-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "",
      "createdAt": "2022-08-31T08:26:20.000Z",
      "updatedAt": "2022-08-31T08:26:20.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 1,
      "code": "044",
      "name": "Access Bank",
      "slug": "access-bank",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": "emandate",
      "currency": "NGN",
      "longcode": "044150149",
      "createdAt": "2016-07-14T10:04:29.000Z",
      "updatedAt": "2020-02-18T08:06:44.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": true
    },
    {
      "id": 3,
      "code": "063",
      "name": "Access Bank (Diamond)",
      "slug": "access-bank-diamond",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": "emandate",
      "currency": "NGN",
      "longcode": "063150162",
      "createdAt": "2016-07-14T10:04:29.000Z",
      "updatedAt": "2020-02-18T08:06:48.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 495,
      "code": "602",
      "name": "Accion Microfinance Bank",
      "slug": "accion-microfinance-bank-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": "emandate",
      "currency": "NGN",
      "longcode": "",
      "createdAt": "2022-07-28T14:22:56.000Z",
      "updatedAt": "2022-09-19T07:48:37.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 687,
      "code": "50315",
      "name": "Aella MFB",
      "slug": "aella-mfb-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "50315",
      "createdAt": "2023-03-09T08:11:06.000Z",
      "updatedAt": "2024-07-30T10:51:33.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 780,
      "code": "90077",
      "name": "AG Mortgage Bank",
      "slug": "ag-mortgage-bank-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "100028",
      "createdAt": "2024-06-07T13:28:00.000Z",
      "updatedAt": "2024-06-07T13:28:00.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 676,
      "code": "50036",
      "name": "Ahmadu Bello University Microfinance Bank",
      "slug": "ahmadu-bello-university-microfinance-bank-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "",
      "createdAt": "2022-11-14T13:35:42.000Z",
      "updatedAt": "2022-11-14T13:35:42.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 300,
      "code": "120004",
      "name": "Airtel Smartcash PSB",
      "slug": "airtel-smartcash-psb-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": "",
      "currency": "NGN",
      "longcode": "120004",
      "createdAt": "2022-05-30T14:03:00.000Z",
      "updatedAt": "2022-05-31T06:58:22.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 698,
      "code": "51336",
      "name": "AKU Microfinance Bank",
      "slug": "aku-mfb",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "",
      "createdAt": "2023-05-04T15:12:34.000Z",
      "updatedAt": "2023-05-04T15:12:34.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 497,
      "code": "090561",
      "name": "Akuchukwu Microfinance Bank Limited",
      "slug": "akuchukwu-microfinance-bank-limited-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": "emandate",
      "currency": "NGN",
      "longcode": "090561",
      "createdAt": "2022-07-28T14:22:56.000Z",
      "updatedAt": "2023-11-03T12:09:37.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 872,
      "code": "50055",
      "name": "Al-Barakah Microfinance Bank",
      "slug": "al-barakah-microfinance-bank-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "090133",
      "createdAt": "2025-10-17T10:08:10.000Z",
      "updatedAt": "2025-10-17T10:08:10.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 27,
      "code": "035A",
      "name": "ALAT by WEMA",
      "slug": "alat-by-wema",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": "emandate",
      "currency": "NGN",
      "longcode": "035150103",
      "createdAt": "2017-11-15T12:21:31.000Z",
      "updatedAt": "2022-05-31T15:54:34.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 857,
      "code": "108",
      "name": "Alpha Morgan Bank",
      "slug": "alpha-morgan",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "000041",
      "createdAt": "2025-06-16T10:33:05.000Z",
      "updatedAt": "2025-06-16T10:33:05.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    },
    {
      "id": 790,
      "code": "000304",
      "name": "Alternative bank",
      "slug": "the-alternative-bank-ng",
      "type": "nuban",
      "active": true,
      "country": "Nigeria",
      "gateway": null,
      "currency": "NGN",
      "longcode": "000304",
      "createdAt": "2024-08-06T12:31:06.000Z",
      "updatedAt": "2025-02-19T13:05:14.000Z",
      "is_deleted": false,
      "pay_with_bank": false,
      "supports_transfer": true,
      "available_for_direct_debit": false
    }
  ]
};

async function seedBanks() {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    // Check if banks table exists and has required columns
    const [columns] = await sequelize.query("SHOW COLUMNS FROM banks");
    const existingColumns = columns.map(c => c.Field);
    console.log('📊 Existing columns:', existingColumns);
    
    // Add missing columns if needed
    if (!existingColumns.includes('currency')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN currency VARCHAR(3) DEFAULT 'NGN'");
      console.log('✅ Added currency column');
    }
    if (!existingColumns.includes('type')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN type VARCHAR(20) DEFAULT 'nuban'");
      console.log('✅ Added type column');
    }
    if (!existingColumns.includes('slug')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN slug VARCHAR(100)");
      console.log('✅ Added slug column');
    }
    if (!existingColumns.includes('gateway')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN gateway VARCHAR(50)");
      console.log('✅ Added gateway column');
    }
    if (!existingColumns.includes('pay_with_bank')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN pay_with_bank BOOLEAN DEFAULT FALSE");
      console.log('✅ Added pay_with_bank column');
    }
    if (!existingColumns.includes('supports_transfer')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN supports_transfer BOOLEAN DEFAULT TRUE");
      console.log('✅ Added supports_transfer column');
    }
    if (!existingColumns.includes('available_for_direct_debit')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN available_for_direct_debit BOOLEAN DEFAULT FALSE");
      console.log('✅ Added available_for_direct_debit column');
    }
    if (!existingColumns.includes('prembly_id')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN prembly_id INT");
      console.log('✅ Added prembly_id column');
    }
    if (!existingColumns.includes('long_code')) {
      await sequelize.query("ALTER TABLE banks ADD COLUMN long_code VARCHAR(20)");
      console.log('✅ Added long_code column');
    }
    
    console.log(`\n🔄 Processing ${premblyBankData.data.length} banks...\n`);
    
    for (const premblyBank of premblyBankData.data) {
      try {
        // Check if bank already exists
        const existingBank = await Bank.findOne({
          where: {
            [Op.or]: [
              { code: premblyBank.code },
              { prembly_id: premblyBank.id }
            ]
          }
        });
        
        const bankData = {
          name: premblyBank.name,
          code: premblyBank.code,
          long_code: premblyBank.longcode || premblyBank.code,
          country: premblyBank.country || 'NG',
          currency: premblyBank.currency || 'NGN',
          status: premblyBank.active ? 'ACTIVE' : 'INACTIVE',
          slug: premblyBank.slug,
          type: premblyBank.type || 'nuban',
          gateway: premblyBank.gateway || null,
          pay_with_bank: premblyBank.pay_with_bank || false,
          supports_transfer: premblyBank.supports_transfer !== undefined ? premblyBank.supports_transfer : true,
          available_for_direct_debit: premblyBank.available_for_direct_debit || false,
          prembly_id: premblyBank.id,
          updated_at: new Date()
        };
        
        if (existingBank) {
          await Bank.update(bankData, { where: { id: existingBank.id } });
          updated++;
          console.log(`🔄 Updated: ${premblyBank.name} (${premblyBank.code})`);
        } else {
          const lastBank = await Bank.findOne({ order: [['id', 'DESC']] });
          const nextId = lastBank ? lastBank.id + 1 : 1;
          
          await Bank.create({
            id: nextId,
            ...bankData,
            created_at: new Date()
          });
          created++;
          console.log(`✅ Created: ${premblyBank.name} (${premblyBank.code})`);
        }
      } catch (bankError) {
        console.error(`❌ Error processing ${premblyBank.name}:`, bankError.message);
        skipped++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 SEED COMPLETE SUMMARY:');
    console.log('='.repeat(50));
    console.log(`✅ Created: ${created} banks`);
    console.log(`🔄 Updated: ${updated} banks`);
    console.log(`⚠️ Skipped: ${skipped} banks`);
    console.log(`📋 Total processed: ${premblyBankData.data.length} banks`);
    console.log('='.repeat(50));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
}

// Run the seed function
seedBanks();