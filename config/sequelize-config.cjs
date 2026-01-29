// config/sequelize-config.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  development: {
    // ... same as above
  },
  test: {
    // ... same as above  
  },
  production: {
    // ... same as above
  }
};