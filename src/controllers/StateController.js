// // controllers/StateController.js
// import State from '../models/State.js';
// import LocalGovernment from '../models/LocalGovernment.js';

// const seedStatesAndLGA = async (req, res) => {
//   try {
//     // Iterate through the States array and save to MongoDB
//     for (const stateData of States) {
//       // Create a new state
//       const state = new State({
//         STATE_ID: stateData.name.toUpperCase(), // or any logic for generating STATE_ID
//         STATE_NM: stateData.name,
//         COUNTRY_ID: 'your_country_id_here' // Adjust this to reference the country object if needed
//       });

//       // Save the state
//       await state.save();

//       // Iterate through local governments and create them
//       const localGOVIds = [];
//       for (const lgaData of stateData.LOCAL_GOV) {
//         const lga = new LocalGovernment({
//           name: lgaData.name,
//           URBAN: lgaData.URBAN,
//           RURAL: lgaData.RURAL,
//           STATE_ID: state._id
//         });

//         // Save LGA
//         await lga.save();
//         localGOVIds.push(lga._id);
//       }

//       // Update state with the local government references
//       state.LOCAL_GOV = localGOVIds;
//       await state.save();
//     }

//     res.status(200).send({ message: 'States and LGAs seeded successfully!' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).send({ message: 'Error seeding states and LGAs', error });
//   }
// };

// export { seedStatesAndLGA };
