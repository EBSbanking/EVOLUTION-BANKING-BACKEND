// utils/generateGuarantorId.js - UPDATED FOR SEQUELIZE
import Guarantor from '../models/Guarantor.js';
import { Op } from 'sequelize';

export const generateGuarantorId = async () => {
  try {
    // 1. Find the highest existing ID using Sequelize syntax
    const lastGuarantor = await Guarantor.findOne({
      order: [['GUARANTOR_ID', 'DESC']],
      attributes: ['GUARANTOR_ID'],
      raw: true
    });

    // 2. Determine next ID
    let nextId = 1000000; // Starting number (will become 1000001 on first increment)

    if (lastGuarantor?.GUARANTOR_ID) {
      // Convert existing ID to number and increment
      const lastIdNumber = parseInt(lastGuarantor.GUARANTOR_ID, 10);
      
      // Validate it's a 7-digit number
      if (!isNaN(lastIdNumber) && lastIdNumber >= 1000000) {
        nextId = lastIdNumber + 1;
      }
    }

    // 3. Ensure we don't exceed 7 digits
    if (nextId > 9999999) {
      throw new Error('Maximum guarantor ID limit reached');
    }

    // 4. Return as string to preserve leading zeros if any
    return nextId.toString();
  } catch (error) {
    console.error('ID Generation Error:', error);
    throw new Error('Failed to generate guarantor ID');
  }
};