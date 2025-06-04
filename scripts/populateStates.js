// scripts/populateStates.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Country from '../models/Country.js';
import State from '../models/State.js';
import LocalGovernment from '../models/LocalGovernment.js';
import States from './data/nigeriaStates.js'; // Ensure this contains all states and local governments

dotenv.config();

// MongoDB connection string
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected.'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

async function populateStatesAndLocalGovs() {
  try {
    // Find Nigeria by COUNTRY_ID ('NG001')
    const nigeria = await Country.findOne({ COUNTRY_ID: 'NG001' });

    if (!nigeria) {
      throw new Error('Nigeria (NGA) country not found. Please create it first.');
    }

    // Check if states are already populated for Nigeria
    const stateCount = await State.countDocuments({ COUNTRY_ID: nigeria._id });
    if (stateCount > 0) {
      console.log('States already populated!');
      return;
    }

    // Loop through the state data and insert them into the database
    for (let i = 0; i < States.length; i++) {
      const stateData = States[i];
      const localGovIds = [];

      // Assign state ID as 1 to 36
      const stateId = i + 1;  // This ensures the ID starts from 1

      // For each local government in the state, create and save the Local Government document
      for (const lg of stateData.LOCAL_GOV) {
        const localGov = new LocalGovernment({
          LOCAL_GOV_ID: `${stateId}_${lg.name}`.toUpperCase().replace(/\s+/g, '_'), // Unique LocalGov ID
          LOCAL_GOV_NM: lg.name,
          URBAN: lg.URBAN || false,
          RURAL: lg.RURAL || false,
        });
        await localGov.save();
        localGovIds.push(localGov._id);
      }

      // Now save the state and link to the country and local governments
      const state = new State({
        STATE_ID: stateId,  // Numeric state ID (1-36)
        STATE_NM: stateData.name,
        LOCAL_GOV: localGovIds,  // Array of Local Gov IDs
        COUNTRY_ID: nigeria._id
      });
      await state.save();

      // After saving the state, update the Local Governments to link back to the STATE_ID
      await LocalGovernment.updateMany(
        { _id: { $in: localGovIds } },
        { $set: { STATE_ID: state._id } }  // Now we can safely update STATE_ID
      );

      // Push the state's ID to Nigeria's STATES array
      nigeria.STATES.push(state._id);
    }

    // Save the updated Nigeria document with references to its states
    await nigeria.save();

    console.log('States and Local Governments populated successfully.');
    process.exit();
  } catch (error) {
    console.error('Error populating:', error);
    process.exit(1);
  }
}

populateStatesAndLocalGovs();
