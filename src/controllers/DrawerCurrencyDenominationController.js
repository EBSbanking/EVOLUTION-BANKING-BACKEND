import DrawerCurrencyDenomination from '../models/DrawerCurrencyDenomination.js';
import Drawer from '../models/Drawer.js';
import mongoose from 'mongoose';

export const createDrawerCurrencyDenomination = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      drawerId,
      denominationType, // 'OPENING' or 'CLOSING'
      currencyCount,
      userId,
      verifiedBy,
      notes
    } = req.body;

    // Validate required fields
    if (!drawerId || !denominationType || !currencyCount || !userId) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Missing required fields: drawerId, denominationType, currencyCount, userId' 
      });
    }

    // Use custom DRAWER_ID field instead of _id for lookup
    const drawer = await Drawer.findOne({ DRAWER_ID: drawerId }).session(session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Generate custom IDs if needed (assuming schema requires them)
    const drawerCrncyDenomId = `DCD-${Date.now()}`;

    // Calculate total (CORRECTED function)
    const totalAmount = calculateTotalFromDenominations(currencyCount);
    console.log(`Calculated totalAmount: ${totalAmount} from ${JSON.stringify(currencyCount)}`); // Debug log

    // Create currency denomination record with all required fields
    const currencyDenomination = new DrawerCurrencyDenomination({
      drawerCrncyId: new mongoose.Types.ObjectId(), // Or generate if custom
      drawerId: drawer._id, // Use MongoDB _id for reference
      drawerCrncyDenomId, // Custom ID
      denominationType,
      currencyCount,
      totalAmount,
      recordedBy: userId,
      verifiedBy: verifiedBy,
      notes: notes,
      recordDate: new Date(),
      status: 'ACTIVE',
      // Required audit fields
      createdBy: userId, // Or from req.user if auth
      createDt: new Date(),
      userId: userId, // If separate from recordedBy
      rowTs: new Date(),
      versionNo: 1,
      recSt: 'A' // Active
    });

    const result = await currencyDenomination.save({ session });
    console.log(`Denomination saved: ${result._id}`); // Debug log

    // Update drawer reference based on denomination type
    let drawerUpdated = false;
    if (denominationType === 'OPENING') {
      drawer.OPENING_CURRENCY_DENOMINATION = result._id;
      drawerUpdated = true;
    } else if (denominationType === 'CLOSING') {
      drawer.CLOSING_CURRENCY_DENOMINATION = result._id;
      drawerUpdated = true;
    }

    if (drawerUpdated) {
      drawer.VERSION_NO += 1;
      drawer.rowTs = new Date(); // Update timestamp
      await drawer.save({ session });
      console.log(`Drawer link updated for ${denominationType}: ${drawer._id}`); // Debug log
    }

    await session.commitTransaction();

    res.status(201).json({
      message: 'Currency denomination recorded successfully',
      data: result,
      totalAmount: totalAmount
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating currency denomination:', error);
    res.status(500).json({ 
      message: 'Error creating currency denomination', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// CORRECTED helper function that handles named currency keys
function calculateTotalFromDenominations(currency) {
  if (!currency) return 0;
  
  const denominations = {
    OneThousandNaira: 1000,
    FiveHundredNaira: 500,
    TwoHundredNaira: 200,
    OneHundredNaira: 100,
    FiftyNaira: 50,
    TwentyNaira: 20,
    TenNaira: 10,
    FiveNaira: 5
  };

  let total = 0;
  for (const [denom, value] of Object.entries(denominations)) {
    total += (currency[denom] || 0) * value;
  }
  
  console.log(`Currency calculation: ${total} from`, currency); // Debug log
  return total;
}

// Export for testing
export {
  calculateTotalFromDenominations
};


export const getDrawerCurrencyHistory = async (req, res) => {
  try {
    const { drawerId } = req.params;
    
    const currencyHistory = await DrawerCurrencyDenomination.find({ 
      drawerId: drawerId 
    })
    .sort({ recordDate: -1 })
    .populate('recordedBy', 'userId name')
    .populate('verifiedBy', 'userId name');

    res.status(200).json({
      success: true,
      count: currencyHistory.length,
      history: currencyHistory
    });
  } catch (error) {
    console.error('Error fetching currency history:', error);
    res.status(500).json({ 
      message: 'Error fetching currency history', 
      error: error.message 
    });
  }
};
// Add this export to your CurrencyDenominationController.js file

export const deleteDrawerCurrencyDenomination = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { userId, reason } = req.body; // Require deletion reason for audit

    // Validate required fields
    if (!userId || !reason) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Missing required fields: userId and reason are required for deletion' 
      });
    }

    // Find the currency denomination record
    const currencyDenomination = await DrawerCurrencyDenomination.findById(id).session(session);
    
    if (!currencyDenomination) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Currency denomination record not found' });
    }

    // Check if record is already inactive
    if (currencyDenomination.status === 'INACTIVE') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Currency denomination record is already deleted' });
    }

    // Find the associated drawer
    const drawer = await Drawer.findById(currencyDenomination.drawerId).session(session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Associated drawer not found' });
    }

    // Remove reference from drawer based on denomination type
    if (currencyDenomination.denominationType === 'OPENING') {
      drawer.OPENING_CURRENCY_DENOMINATION = null;
    } else if (currencyDenomination.denominationType === 'CLOSING') {
      drawer.CLOSING_CURRENCY_DENOMINATION = null;
    }

    // Soft delete: mark as inactive instead of actual deletion
    currencyDenomination.status = 'INACTIVE';
    currencyDenomination.deletedAt = new Date();
    currencyDenomination.deletedBy = userId;
    currencyDenomination.deletionReason = reason;

    await currencyDenomination.save({ session });
    drawer.VERSION_NO += 1;
    await drawer.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      message: 'Currency denomination record deleted successfully',
      data: {
        id: currencyDenomination._id,
        denominationType: currencyDenomination.denominationType,
        deletedAt: currencyDenomination.deletedAt
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error deleting currency denomination:', error);
    res.status(500).json({ 
      message: 'Error deleting currency denomination record', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

// Optional: Add a restore function if you need to undo deletions
export const restoreDrawerCurrencyDenomination = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Missing required field: userId' 
      });
    }

    const currencyDenomination = await DrawerCurrencyDenomination.findById(id).session(session);
    
    if (!currencyDenomination) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Currency denomination record not found' });
    }

    if (currencyDenomination.status === 'ACTIVE') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Currency denomination record is already active' });
    }

    const drawer = await Drawer.findById(currencyDenomination.drawerId).session(session);
    if (!drawer) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Associated drawer not found' });
    }

    // Restore reference in drawer
    if (currencyDenomination.denominationType === 'OPENING') {
      drawer.OPENING_CURRENCY_DENOMINATION = currencyDenomination._id;
    } else if (currencyDenomination.denominationType === 'CLOSING') {
      drawer.CLOSING_CURRENCY_DENOMINATION = currencyDenomination._id;
    }

    // Restore the record
    currencyDenomination.status = 'ACTIVE';
    currencyDenomination.deletedAt = undefined;
    currencyDenomination.deletedBy = undefined;
    currencyDenomination.deletionReason = undefined;

    await currencyDenomination.save({ session });
    drawer.VERSION_NO += 1;
    await drawer.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      message: 'Currency denomination record restored successfully',
      data: currencyDenomination
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error restoring currency denomination:', error);
    res.status(500).json({ 
      message: 'Error restoring currency denomination record', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};