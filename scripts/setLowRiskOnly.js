// filename: setLowRiskOnly.js
import mongoose from "mongoose";

async function run() {
  try {
    // Connect to MongoDB
    await mongoose.connect("mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Use your existing schema
    const customerSchema = new mongoose.Schema(
      {
        CUST_ID: { type: String, required: true, unique: true },
        CUST_NO: { type: String, required: true, unique: true },
        TITLE_ID: { type: String },
        FIRST_NAME: { type: String },
        MIDDLE_NAME: { type: String },
        LAST_NAME: { type: String },
        CUST_NM: { type: String },
        HOME_ADDRESS: { type: String, required: true },
        EMAIL_ADDRESS: { type: String, lowercase: true, trim: true },
        BU_ID: { type: String, required: true },
        MAIDEN_NM: { type: String },
        BIRTH_DT: { type: Date },
        CNTRY_OF_BIRTH_ID: { type: String, default: "NGA" },
        CUST_CAT: { type: String },
        CAMPAIGN_ID: { type: String },
        GENDER_TY: { type: String },
        NIN: { type: String, match: /^\d{11}$/ },
        BVN: { type: String, match: /^\d{11}$/ },
        COUNTRY_NM: { type: String, default: "Nigeria" },
        STATE: { type: String },
        LOCAL_GOV: { type: String },
        OPENING_RSN_ID: { type: String },
        OPENED_DT: { type: Date },
        RESIDENT_CNTRY_ID: { type: String, default: "NGA" },
        RISK_CLASS: { type: String },
        STMNT_FREQ_CD: { type: String },
        STMNT_FREQ_VALUE: { type: Number },
        CREATED_BY: { type: String },
        USER_ID: { type: String },
        CREATE_DT: { type: Date, default: Date.now },
        INDUSTRY_ID: { type: String },
        INDUSTRY_CD: { type: String },
        TAX_STATUS: { type: String },
        MARITAL_ST: { type: String },
        TAX_GRP_ID: { type: String },
        OPERATIONS_CRNCY_ID: { type: String, default: "NGN" },
        EMP_ST: { type: String },
        ORGANISATION_NM: { type: String },
        REGISTRATION_ADDRESS: { type: String },
        REGISTRATION_DT: { type: Date },
        ALERT_DELIVERY_METHOD: { type: String },
        KYC_LEVEL: { type: String },
        PHONE_NO: { type: String },
        SMS: { type: String },
        REC_ST: {
          type: String,
          enum: [
            "Pending",
            "Active",
            "Approved",
            "Inactive",
            "Closed",
            "Suspended",
            "Cancelled",
            "Rejected",
          ],
          default: "Pending",
        },
        EVENT_ID: { type: String },
        IS_PEP: { type: Boolean, default: false },
        SANCTION_SCORE: { type: Number },
        DOCUMENT_VERIFICATION_STATUS: { type: String, default: "Pending" },
        // Add fields for risk classification
        RISK_ID: { type: Number },
        RISK_NEW: { type: Number },
        RISK_NEW_CD: { type: String },
      },
      { timestamps: true, strict: true }
    );

    const Customer = mongoose.model("Customer", customerSchema, "customers");

    const RISK_REF = { LowRisk: 532, ModerateRisk: 533, HighRisk: 534 };

    // Country risk classification
    const LOW_RISK_COUNTRIES = [
      "Austria",
      "Belgium",
      "Bulgaria",
      "Canada",
      "Croatia",
      "Cyprus",
      "Czechia (Czech Republic)",
      "Denmark",
      "Estonia",
      "Finland",
      "France",
      "Germany",
      "Greece",
      "Grenada",
      "Hungary",
      "Ireland",
      "Italy",
      "Latvia",
      "Lithuania",
      "Luxembourg",
      "Netherlands",
      "Poland",
      "Portugal",
      "Romania",
      "Slovakia",
      "Slovenia",
      "Spain",
      "Sweden",
      "Tanzania",
      "United Kingdom",
      "United States of America",
    ];
    const MODERATE_RISK_COUNTRIES = [
      "Albania",
      "Algeria",
      "Andorra",
      "Angola",
      "Antigua and Barbuda",
      "Argentina",
      "Armenia",
      "Australia",
      "Azerbaijan",
      "Bahamas",
      "Bahrain",
      "Bangladesh",
      "Barbados",
      "Belize",
      "Benin",
      "Bhutan",
      "Bolivia",
      "Bosnia and Herzegovina",
      "Botswana",
      "Brazil",
      "Brunei",
      "Burkina Faso",
      "Burundi",
      "Cabo Verde",
      "Cambodia",
      "Cameroon",
      "Cayman Islands",
      "Chad",
      "Chile",
      "China",
      "Colombia",
      "Comoros",
      "Costa Rica",
      "Côte d'Ivoire",
      "Djibouti",
      "Dominica",
      "Dominican Republic",
      "Ecuador",
      "Egypt",
      "El Salvador",
      "Equatorial Guinea",
      "Eritrea",
      "Swaziland",
      "Fiji",
      "Gabon",
      "Gambia",
      "Georgia",
      "Ghana",
      "Gibraltar",
      "Guatemala",
      "Guinea",
      "Guyana",
      "Haiti",
      "Holy See",
      "Honduras",
      "Iceland",
      "India",
      "Indonesia",
      "Israel",
      "Jamaica",
      "Japan",
      "Jordan",
      "Kazakhstan",
      "Kenya",
      "Kiribati",
      "Kuwait",
      "Kyrgyzstan",
      "Laos",
      "Lesotho",
      "Liberia",
      "Liechtenstein",
      "Madagascar",
      "Malawi",
      "Malaysia",
      "Maldives",
      "Marshall Islands",
      "Mauritania",
      "Mauritius",
      "Mexico",
      "Micronesia",
      "Moldova",
      "Monaco",
      "Mongolia",
      "Montenegro",
      "Morocco",
      "Mozambique",
      "Namibia",
      "Nauru",
      "Nepal",
      "New Zealand",
      "Nicaragua",
      "Niger",
      "Nigeria",
      "North Macedonia",
      "Norway",
      "Oman",
      "Pakistan",
      "Palau",
      "Palestine State",
      "Panama",
      "Papua New Guinea",
      "Paraguay",
      "Peru",
      "Philippines",
      "Qatar",
      "Rwanda",
      "Saint Kitts and Nevis",
      "Saint Lucia",
      "Saint Vincent and the Grenadines",
      "Samoa",
      "San Marino",
      "Sao Tome and Principe",
      "Saudi Arabia",
      "Senegal",
      "Serbia",
      "Seychelles",
      "Sierra Leone",
      "Singapore",
      "Solomon Islands",
      "South Africa",
      "South Korea",
      "Sri Lanka",
      "Suriname",
      "Switzerland",
      "Tajikistan",
      "Thailand",
      "Timor-Leste",
      "Togo",
      "Tonga",
      "Trinidad and Tobago",
      "Tunisia",
      "Turkmenistan",
      "Tuvalu",
      "Uganda",
      "United Arab Emirates",
      "Uruguay",
      "Uzbekistan",
      "Vanuatu",
      "Vietnam",
      "Zambia",
      "Zimbabwe",
    ];
    const HIGH_RISK_COUNTRIES = [
      "Afghanistan",
      "Belarus",
      "Central African Republic",
      "Congo (Congo-Brazzaville)",
      "Cuba",
      "Democratic Republic of Congo",
      "Ethiopia",
      "Guinea-Bissau",
      "Iraq",
      "Lebanon",
      "Libya",
      "Mali",
      "Malta",
      "Myanmar (formerly Burma)",
      "Russia",
      "Somalia",
      "South Sudan",
      "Sudan",
      "Syria",
      "Turkey",
      "Ukraine",
      "Venezuela",
      "Yemen",
    ];
    const VERY_HIGH_301_COUNTRIES = ["Iran", "North Korea"];

    // Industry risk classification
    const INDUSTRY_3 = [
      "International business",
      "Security market",
      "Mining sector",
      "Retail Pharmacy",
      "Retail Art or crafts or souvenirs or jewelry",
      "Service Insurance provider or agent",
      "Foreign Exchange Companies",
      "Shipping Companies",
      "Insurance Companies",
      "Bishop and church leaders",
      "Bad debtors customers",
      "Written off customers",
      "Trust, Charities, NGOs and organizations receiving donations",
    ];
    const INDUSTRY_2 = [
      "Manufacturing industries",
      "Retail Cosmetics",
      "Retail Fuel or charcoal",
      "Service Hotel services",
      "Service Mobile money agent",
      "Service Healthcare",
      "Production Manufacturing Quarrying of minerals or stone or sand or clay",
      "Hotel management",
      "Construction and building",
      "Real estate business",
      "Health Centres Hospital companies",
      "Tech", // Added based on your sample data
    ];

    // Customer type classification (inferred from CUST_CAT and MARITAL_ST)
    const CUST_TY_1 = ["Retail", "Individual", "Student", "Single"];
    const CUST_TY_2 = ["Partnership", "Clubs", "Association"];
    const CUST_TY_3 = ["Political Exposed Personnel"];

    // Helpers (uppercase normalize)
    const up = (arr) => arr.map((s) => s.toUpperCase().trim());
    const LOW_UP = up(LOW_RISK_COUNTRIES);
    const MOD_UP = up(MODERATE_RISK_COUNTRIES);
    const HIGH_UP = up(HIGH_RISK_COUNTRIES);
    const VHIGH_UP = up(VERY_HIGH_301_COUNTRIES);
    const INDUSTRY_3_UP = up(INDUSTRY_3);
    const INDUSTRY_2_UP = up(INDUSTRY_2);
    const CUST_TY_1_UP = up(CUST_TY_1);
    const CUST_TY_2_UP = up(CUST_TY_2);
    const CUST_TY_3_UP = up(CUST_TY_3);

    // Pipeline
    const pipeline = [
      {
        $addFields: {
          CNTRY_KEY: { $toUpper: { $trim: { input: { $ifNull: ["$COUNTRY_NM", ""] } } } },
          IND_KEY: { $toUpper: { $trim: { input: { $ifNull: ["$INDUSTRY_CD", ""] } } } },
          CUST_TY_KEY: {
            $toUpper: {
              $trim: {
                input: {
                  $ifNull: [
                    "$CUST_CAT",
                    { $ifNull: ["$MARITAL_ST", ""] }, // Fallback to MARITAL_ST if CUST_CAT is null
                  ],
                },
              },
            },
          },
          RISK_DESC_KEY: { $toUpper: { $trim: { input: { $ifNull: ["$RISK_CLASS", ""] } } } },
        },
      },
      {
        $addFields: {
          BYCOUNTRY: {
            $switch: {
              branches: [
                { case: { $in: ["$CNTRY_KEY", LOW_UP] }, then: 1 },
                { case: { $in: ["$CNTRY_KEY", MOD_UP] }, then: 2 },
                { case: { $in: ["$CNTRY_KEY", HIGH_UP] }, then: 3 },
                { case: { $in: ["$CNTRY_KEY", VHIGH_UP] }, then: 3.01 },
              ],
              default: 2, // Default to moderate risk if country is unknown (e.g., Nigeria is moderate)
            },
          },
          BYCUSTOMER: {
            $switch: {
              branches: [
                { case: { $in: ["$CUST_TY_KEY", CUST_TY_1_UP] }, then: 1 },
                { case: { $in: ["$CUST_TY_KEY", CUST_TY_2_UP] }, then: 2 },
                { case: { $in: ["$CUST_TY_KEY", CUST_TY_3_UP] }, then: 3 },
              ],
              default: 1, // Default to low risk if customer type is unknown
            },
          },
          BYECONOMIC: {
            $switch: {
              branches: [
                { case: { $in: ["$IND_KEY", INDUSTRY_3_UP] }, then: 3 },
                { case: { $in: ["$IND_KEY", INDUSTRY_2_UP] }, then: 2 },
              ],
              default: 1, // Default to low risk if industry is unknown
            },
          },
        },
      },
      {
        $addFields: {
          // Simplified: Use only BYCOUNTRY, BYCUSTOMER, and BYECONOMIC since financial fields are missing
          AVG_BASE: {
            $round: [
              { $divide: [{ $add: ["$BYCOUNTRY", "$BYCUSTOMER", "$BYECONOMIC"] }, 3] },
              2,
            ],
          },
        },
      },
      {
        $addFields: {
          RISK_NEW: {
            $ifNull: [
              {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$BYCOUNTRY", 3] },
                      { $eq: ["$BYCUSTOMER", 3] },
                    ],
                  },
                  3,
                  null,
                ],
              },
              {
                $ifNull: [
                  { $cond: [{ $eq: ["$BYCUSTOMER", 3] }, 3, null] },
                  {
                    $ifNull: [
                      { $cond: [{ $eq: ["$BYCOUNTRY", 3.01] }, 3, null] },
                      {
                        $ifNull: [
                          { $cond: [{ $gte: ["$AVG_BASE", 2.25] }, 3, null] },
                          "$AVG_BASE",
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $addFields: {
          RISK_NEW_CD: {
            $switch: {
              branches: [
                { case: { $and: [{ $gte: ["$RISK_NEW", 1] }, { $lte: ["$RISK_NEW", 1.5] }] }, then: "LowRisk" },
                { case: { $and: [{ $gte: ["$RISK_NEW", 1.6] }, { $lte: ["$RISK_NEW", 2.3] }] }, then: "ModerateRisk" },
                { case: { $and: [{ $gte: ["$RISK_NEW", 2.4] }, { $lte: ["$RISK_NEW", 3] }] }, then: "HighRisk" },
              ],
              default: "LowRisk", // Default to LowRisk if calculation fails
            },
          },
        },
      },
      { $merge: { into: "customers", whenMatched: "merge", whenNotMatched: "discard" } },
    ];

    await Customer.aggregate(pipeline);

    // Update only LowRisk customers
    const res = await Customer.updateMany(
      { RISK_NEW_CD: "LowRisk" },
      { $set: { RISK_ID: RISK_REF.LowRisk } }
    );

    console.log("Updated LowRisk count:", res.modifiedCount);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.connection.close();
  }
}

run();