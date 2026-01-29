// models/Sequence.js - SIMPLIFIED FIXED VERSION
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Sequence extends Model {}

Sequence.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  target_collection: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Target collection name',
    field: 'target_collection'
  },
  value: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Current sequence value',
    field: 'value'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'Sequence',
  tableName: 'sequences',
  timestamps: false, // Set to false since we're managing timestamps manually
  freezeTableName: true,
  hooks: {
    beforeCreate: (sequence) => {
      if (!sequence.target_collection) {
        throw new Error('target_collection is required');
      }
    }
  }
});

// Static method to get next value (SIMPLIFIED)
Sequence.getNextValue = async function(targetCollection, transaction = null) {
  const options = transaction ? { transaction } : {};
  
  try {
    // Find or create sequence
    let sequence = await this.findOne({
      where: { target_collection: targetCollection },
      ...options
    });
    
    if (!sequence) {
      // Create new sequence starting from 1000
      sequence = await this.create({
        target_collection: targetCollection,
        value: 1000,
        ...options
      });
    }
    
    // Get current value and increment
    const currentValue = sequence.value;
    const nextValue = currentValue + 1;
    
    // Update sequence
    await this.update(
      { value: nextValue, updated_at: new Date() },
      { 
        where: { id: sequence.id },
        ...options
      }
    );
    
    return nextValue;
    
  } catch (error) {
    console.error(`Error getting next value for ${targetCollection}:`, error);
    
    // Fallback: generate a random number
    const fallbackValue = 100000 + Math.floor(Math.random() * 900000);
    console.log(`Using fallback value for ${targetCollection}: ${fallbackValue}`);
    
    return fallbackValue;
  }
};

// Static method to get current value
Sequence.getCurrentValue = async function(targetCollection, transaction = null) {
  const options = transaction ? { transaction } : {};
  
  const sequence = await this.findOne({
    where: { target_collection: targetCollection },
    attributes: ['value'],
    ...options
  });
  
  if (!sequence) {
    return 1000; // Default starting value
  }
  
  return sequence.value;
};

// Static method to reset sequence
Sequence.resetSequence = async function(targetCollection, newValue = 1000, transaction = null) {
  const options = transaction ? { transaction } : {};
  
  const [updatedCount] = await this.update(
    {
      value: newValue,
      updated_at: new Date()
    },
    {
      where: { target_collection: targetCollection },
      ...options
    }
  );
  
  if (updatedCount === 0) {
    // Create if doesn't exist
    await this.create({
      target_collection: targetCollection,
      value: newValue,
      ...options
    });
  }
  
  return newValue;
};

export default Sequence;