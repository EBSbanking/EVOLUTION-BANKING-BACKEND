import DrawerCurrencyDenomination from '../models/DrawerCurrencyDenomination.js';
import Drawer from '../models/Drawer.js';

export const createDrawerCurrencyDenomination = async (req, res) => {
  try {
    const {
      drawerCrncyDenomId,
      denomCount,
      denomCountType,
      recSt,
      versionNo,
      userId,
      createDt,
      createdBy,
      drawerId
    } = req.body;

    // Validate the required fields
    if (!drawerCrncyDenomId || !denomCount || !userId || !createdBy || !drawerId) {
      return res.status(400).json({ message: 'Missing required fields: drawerCrncyDenomId, denomCount, userId, createdBy, and drawerId are required.' });
    }

    // Find the Drawer by the provided drawerId
    const drawer = await Drawer.findOne({ DRAWER_ID: drawerId });

    if (!drawer) {
      return res.status(404).json({ message: 'Drawer not found' });
    }

    // Create a new DrawerCurrencyDenomination with the provided data
    const newDrawerCurrencyDenomination = new DrawerCurrencyDenomination({
      drawerCrncyDenomId,
      denomCount, // Denomination data is passed as is; Total and totalAmount will be calculated by the schema pre-save hook
      denomCountType: denomCountType || 'T',
      recSt: recSt || 'A',
      versionNo: versionNo || 1,
      rowTs: new Date(),
      userId,
      createDt: createDt || new Date(),
      sysCreateTs: new Date(),
      createdBy,
      drawerCrncyId: drawer._id, // Set drawerCrncyId to the ObjectId of the Drawer
      drawerId
    });

    // Save the new DrawerCurrencyDenomination
    const result = await newDrawerCurrencyDenomination.save();

    // Optionally, add the currency denomination to the drawer
    drawer.currencyDenominations = drawer.currencyDenominations || [];
    drawer.currencyDenominations.push(result._id);

    // Save the updated drawer with the new currency denomination
    await drawer.save();

    // Return success response with the calculated totalAmount
    res.status(201).json({
      message: 'Drawer Currency Denomination created successfully!',
      data: result,
      totalAmount: result.totalAmount  // Include totalAmount in the response
    });
  } catch (err) {
    console.error("Error details:", err);
    res.status(500).json({ message: 'Error creating Drawer Currency Denomination', error: err.message });
  }
};

export const deleteDrawerCurrencyDenomination = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the id is valid
    if (!id) {
      return res.status(400).json({ message: 'Missing required parameter: id' });
    }

    const deletedDenomination = await DrawerCurrencyDenomination.findByIdAndDelete(id);

    if (!deletedDenomination) {
      return res.status(404).json({ message: 'Drawer Currency Denomination not found' });
    }

    // Optionally, remove the currency denomination from the associated Drawer
    const drawer = await Drawer.findOne({ 'currencyDenominations': id });
    if (drawer) {
      drawer.currencyDenominations = drawer.currencyDenominations.filter(denom => denom.toString() !== id);
      await drawer.save();
    }

    res.status(200).json({ message: 'Drawer Currency Denomination deleted successfully' });
  } catch (err) {
    console.error("Error details:", err);
    res.status(500).json({ message: 'Error deleting Drawer Currency Denomination', error: err.message });
  }
};
