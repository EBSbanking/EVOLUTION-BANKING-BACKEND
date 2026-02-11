// src/utils/sequelize.js
import sequelize from '../../config/db.js';

// Export Sequelize instance
export const getSequelize = () => sequelize;

// Export Op operators
export const getOp = () => sequelize.Op;

// Export DataTypes
export const getDataTypes = () => sequelize.DataTypes;

// Default export
export default sequelize;