import { sequelize } from '../config/db.js';  // adjust path to your DB config
import { DataTypes, Op } from 'sequelize';
import Customer from '../src/models/Customer.js';

// Risk reference IDs
const RISK_REF = { LowRisk: 532, ModerateRisk: 533, HighRisk: 534 };

// ---- Risk classification lists (same as before) ----
const LOW_RISK_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Canada", "Croatia", "Cyprus",
  "Czechia (Czech Republic)", "Denmark", "Estonia", "Finland", "France",
  "Germany", "Greece", "Grenada", "Hungary", "Ireland", "Italy", "Latvia",
  "Lithuania", "Luxembourg", "Netherlands", "Poland", "Portugal", "Romania",
  "Slovakia", "Slovenia", "Spain", "Sweden", "Tanzania", "United Kingdom",
  "United States of America"
];
const MODERATE_RISK_COUNTRIES = [
  "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
  "Argentina", "Armenia", "Australia", "Azerbaijan", "Bahamas", "Bahrain",
  "Bangladesh", "Barbados", "Belize", "Benin", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Burkina Faso",
  "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Cayman Islands", "Chad",
  "Chile", "China", "Colombia", "Comoros", "Costa Rica", "Côte d'Ivoire",
  "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt",
  "El Salvador", "Equatorial Guinea", "Eritrea", "Swaziland", "Fiji", "Gabon",
  "Gambia", "Georgia", "Ghana", "Gibraltar", "Guatemala", "Guinea", "Guyana",
  "Haiti", "Holy See", "Honduras", "Iceland", "India", "Indonesia", "Israel",
  "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
  "Kyrgyzstan", "Laos", "Lesotho", "Liberia", "Liechtenstein", "Madagascar",
  "Malawi", "Malaysia", "Maldives", "Marshall Islands", "Mauritania",
  "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia",
  "Montenegro", "Morocco", "Mozambique", "Namibia", "Nauru", "Nepal",
  "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palau", "Palestine State", "Panama",
  "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Qatar", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
  "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal",
  "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Solomon Islands",
  "South Africa", "South Korea", "Sri Lanka", "Suriname", "Switzerland",
  "Tajikistan", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago",
  "Tunisia", "Turkmenistan", "Tuvalu", "Uganda", "United Arab Emirates",
  "Uruguay", "Uzbekistan", "Vanuatu", "Vietnam", "Zambia", "Zimbabwe"
];
const HIGH_RISK_COUNTRIES = [
  "Afghanistan", "Belarus", "Central African Republic", "Congo (Congo-Brazzaville)",
  "Cuba", "Democratic Republic of Congo", "Ethiopia", "Guinea-Bissau", "Iraq",
  "Lebanon", "Libya", "Mali", "Malta", "Myanmar (formerly Burma)", "Russia",
  "Somalia", "South Sudan", "Sudan", "Syria", "Turkey", "Ukraine", "Venezuela",
  "Yemen"
];
const VERY_HIGH_301_COUNTRIES = ["Iran", "North Korea"];

const INDUSTRY_3 = [
  "International business", "Security market", "Mining sector", "Retail Pharmacy",
  "Retail Art or crafts or souvenirs or jewelry", "Service Insurance provider or agent",
  "Foreign Exchange Companies", "Shipping Companies", "Insurance Companies",
  "Bishop and church leaders", "Bad debtors customers", "Written off customers",
  "Trust, Charities, NGOs and organizations receiving donations"
];
const INDUSTRY_2 = [
  "Manufacturing industries", "Retail Cosmetics", "Retail Fuel or charcoal",
  "Service Hotel services", "Service Mobile money agent", "Service Healthcare",
  "Production Manufacturing Quarrying of minerals or stone or sand or clay",
  "Hotel management", "Construction and building", "Real estate business",
  "Health Centres Hospital companies", "Tech"
];

const CUST_TY_1 = ["Retail", "Individual", "Student", "Single"];
const CUST_TY_2 = ["Partnership", "Clubs", "Association"];
const CUST_TY_3 = ["Political Exposed Personnel"];

// Normalize helpers (uppercase trim)
const toUpper = (arr) => arr.map(s => s.toUpperCase().trim());

const LOW_UP = toUpper(LOW_RISK_COUNTRIES);
const MOD_UP = toUpper(MODERATE_RISK_COUNTRIES);
const HIGH_UP = toUpper(HIGH_RISK_COUNTRIES);
const VHIGH_UP = toUpper(VERY_HIGH_301_COUNTRIES);
const INDUSTRY_3_UP = toUpper(INDUSTRY_3);
const INDUSTRY_2_UP = toUpper(INDUSTRY_2);
const CUST_TY_1_UP = toUpper(CUST_TY_1);
const CUST_TY_2_UP = toUpper(CUST_TY_2);
const CUST_TY_3_UP = toUpper(CUST_TY_3);

async function run() {
  const transaction = await sequelize.transaction();

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established.');

    // Fetch all customers (only needed fields)
    const customers = await Customer.findAll({
      attributes: [
        'id', 'COUNTRY_NM', 'INDUSTRY_CD', 'CUST_CAT', 'MARITAL_ST',
        'RISK_ID', 'RISK_NEW', 'RISK_NEW_CD'
      ],
      raw: true,
      transaction,
    });

    console.log(`📊 Fetched ${customers.length} customers.`);

    let lowRiskCount = 0;
    const updates = [];

    for (const cust of customers) {
      // Normalize fields
      const country = (cust.COUNTRY_NM || '').toUpperCase().trim();
      const industry = (cust.INDUSTRY_CD || '').toUpperCase().trim();
      let custType = (cust.CUST_CAT || '').toUpperCase().trim();
      if (!custType) custType = (cust.MARITAL_ST || '').toUpperCase().trim();

      // 1. Country risk score
      let byCountry = 2; // default moderate
      if (LOW_UP.includes(country)) byCountry = 1;
      else if (MOD_UP.includes(country)) byCountry = 2;
      else if (HIGH_UP.includes(country)) byCountry = 3;
      else if (VHIGH_UP.includes(country)) byCountry = 3.01;

      // 2. Customer type risk score
      let byCustomer = 1;
      if (CUST_TY_1_UP.includes(custType)) byCustomer = 1;
      else if (CUST_TY_2_UP.includes(custType)) byCustomer = 2;
      else if (CUST_TY_3_UP.includes(custType)) byCustomer = 3;

      // 3. Industry risk score
      let byEconomic = 1;
      if (INDUSTRY_3_UP.includes(industry)) byEconomic = 3;
      else if (INDUSTRY_2_UP.includes(industry)) byEconomic = 2;

      const avgBase = (byCountry + byCustomer + byEconomic) / 3;

      // Determine RISK_NEW and RISK_NEW_CD
      let riskNew = avgBase;
      if (byCountry === 3 && byCustomer === 3) riskNew = 3;
      else if (byCustomer === 3) riskNew = 3;
      else if (byCountry === 3.01) riskNew = 3;
      else if (avgBase >= 2.25) riskNew = 3;
      else riskNew = avgBase;

      let riskNewCd = 'LowRisk';
      if (riskNew >= 1 && riskNew <= 1.5) riskNewCd = 'LowRisk';
      else if (riskNew >= 1.6 && riskNew <= 2.3) riskNewCd = 'ModerateRisk';
      else if (riskNew >= 2.4 && riskNew <= 3) riskNewCd = 'HighRisk';
      else riskNewCd = 'LowRisk';

      // Only update RISK_ID for LowRisk customers (original logic)
      let riskId = null;
      if (riskNewCd === 'LowRisk') {
        riskId = RISK_REF.LowRisk;
        lowRiskCount++;
      }

      updates.push({
        id: cust.id,
        RISK_NEW: riskNew,
        RISK_NEW_CD: riskNewCd,
        RISK_ID: riskId,
      });
    }

    // Batch update – perform individual updates (could also use bulkCreate with updateOnDuplicate)
    // For simplicity, we'll update each record one by one in a transaction.
    for (const upd of updates) {
      // Only set RISK_ID if it's not null (i.e., LowRisk)
      const updateData = {
        RISK_NEW: upd.RISK_NEW,
        RISK_NEW_CD: upd.RISK_NEW_CD,
      };
      if (upd.RISK_ID !== null) {
        updateData.RISK_ID = upd.RISK_ID;
      } else {
        // For non-LowRisk, we set RISK_ID to null? The original didn't change it.
        // We'll keep existing RISK_ID by not including it.
        // But we need to ensure we don't accidentally set it to null.
        // So we simply don't include RISK_ID in the update.
        // However, we might want to clear it? Original only set for LowRisk.
        // So we leave RISK_ID unchanged.
        // To be safe, we fetch the existing value? That's complex.
        // Better: don't update RISK_ID at all for non-LowRisk.
        // So we won't include RISK_ID in updateData.
        // We'll use a separate update for LowRisk only.
        // Actually we can conditionally set.
        // Let's do: if riskId is not null, set it; otherwise, don't include it.
      }
      // We'll use a separate update for LowRisk only to avoid overwriting.
      // We'll do two queries: update all with RISK_NEW/RISK_NEW_CD, then separately update LowRisk with RISK_ID.
      // That's simpler.
    }

    // Better approach: bulk update all customers with new risk values, then separately update LowRisk RISK_ID.
    // But we already have the updates array. Let's just update all records with RISK_NEW and RISK_NEW_CD.
    // Then update LowRisk with RISK_ID.
    // We can do a single bulk update using Sequelize's update with where clause.

    // First, update all customers with RISK_NEW and RISK_NEW_CD
    for (const upd of updates) {
      await Customer.update(
        { RISK_NEW: upd.RISK_NEW, RISK_NEW_CD: upd.RISK_NEW_CD },
        { where: { id: upd.id }, transaction }
      );
    }

    // Second, update only LowRisk customers with RISK_ID
    const lowRiskIds = updates.filter(u => u.RISK_ID !== null).map(u => u.id);
    if (lowRiskIds.length > 0) {
      await Customer.update(
        { RISK_ID: RISK_REF.LowRisk },
        { where: { id: lowRiskIds }, transaction }
      );
    }

    await transaction.commit();

    console.log(`✅ Updated ${lowRiskCount} customers to LowRisk (RISK_ID = ${RISK_REF.LowRisk}).`);
    console.log(`✅ All customers have updated RISK_NEW and RISK_NEW_CD.`);
    console.log('✅ Process completed.');

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}