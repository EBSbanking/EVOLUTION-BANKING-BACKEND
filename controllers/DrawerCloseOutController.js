import DrawerCloseOut from '../models/DrawerCloseOut.js';
import { StatusCodes } from 'http-status-codes';  // Make sure this package is installed
import winston from 'winston';

// Create Drawer CloseOut
export const createDrawerCloseOut = async (req, res) => {
  try {
    const {
      drawerCloseOutPosnHistId,
      openingBal,
      totalCashIn,
      totalCashOut,
      totalCashBought,
      totalCashSale,
      closingBal,
      cashBoughtCount,
      cashInCount,
      cashSaleCount,
      cashOutCount,
      overageAmt,
      shortageAmt,
      drawerCrncyId,
      recSt,
      versionNo,
      userId,
      createdBy,
      drawerCloseDt,
      drawerOpenDt,
      sysUserId,
      drawerId,
      crncyId,
    } = req.body;

    // Create a new drawer close-out entry
    const newDrawerCloseOut = new DrawerCloseOut({
      drawerCloseOutPosnHistId,
      openingBal,
      totalCashIn,
      totalCashOut,
      totalCashBought,
      totalCashSale,
      closingBal,
      cashBoughtCount,
      cashInCount,
      cashSaleCount,
      cashOutCount,
      overageAmt,
      shortageAmt,
      drawerCrncyId,
      recSt,
      versionNo,
      userId,
      createdBy,
      drawerCloseDt,
      drawerOpenDt,
      sysUserId,
      drawerId,
      crncyId,
    });

    // Save the record to the database
    const savedDrawerCloseOut = await newDrawerCloseOut.save();

    // Return the created record
    return res.status(StatusCodes.CREATED).json({
      message: 'Drawer CloseOut record created successfully',
      data: savedDrawerCloseOut,
    });
  } catch (error) {
    winston.error('Error creating Drawer CloseOut record', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Error creating Drawer CloseOut record',
      error: error.message,
    });
  }
};

// Get all Drawer CloseOut records
export const getAllDrawerCloseOuts = async (req, res) => {
  try {
    const drawerCloseOuts = await DrawerCloseOut.find();
    return res.status(StatusCodes.OK).json({
      message: 'Drawer CloseOut records fetched successfully',
      data: drawerCloseOuts,
    });
  } catch (error) {
    winston.error('Error fetching Drawer CloseOut records', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Error fetching Drawer CloseOut records',
      error: error.message,
    });
  }
};

// Get a single Drawer CloseOut record by ID
export const getDrawerCloseOutById = async (req, res) => {
  const { id } = req.params;
  try {
    const drawerCloseOut = await DrawerCloseOut.findById(id);
    if (!drawerCloseOut) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: `Drawer CloseOut record with ID ${id} not found`,
      });
    }

    return res.status(StatusCodes.OK).json({
      message: 'Drawer CloseOut record fetched successfully',
      data: drawerCloseOut,
    });
  } catch (error) {
    winston.error('Error fetching Drawer CloseOut record', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Error fetching Drawer CloseOut record',
      error: error.message,
    });
  }
};

// Update a Drawer CloseOut record by ID
export const updateDrawerCloseOut = async (req, res) => {
  const { id } = req.params;
  try {
    const updatedDrawerCloseOut = await DrawerCloseOut.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true, // Make sure to run validators on the updated fields
    });

    if (!updatedDrawerCloseOut) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: `Drawer CloseOut record with ID ${id} not found`,
      });
    }

    return res.status(StatusCodes.OK).json({
      message: 'Drawer CloseOut record updated successfully',
      data: updatedDrawerCloseOut,
    });
  } catch (error) {
    winston.error('Error updating Drawer CloseOut record', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Error updating Drawer CloseOut record',
      error: error.message,
    });
  }
};

// Delete a Drawer CloseOut record by ID
export const deleteDrawerCloseOut = async (req, res) => {
  const { id } = req.params;
  try {
    const deletedDrawerCloseOut = await DrawerCloseOut.findByIdAndDelete(id);
    if (!deletedDrawerCloseOut) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: `Drawer CloseOut record with ID ${id} not found`,
      });
    }

    return res.status(StatusCodes.OK).json({
      message: 'Drawer CloseOut record deleted successfully',
      data: deletedDrawerCloseOut,
    });
  } catch (error) {
    winston.error('Error deleting Drawer CloseOut record', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Error deleting Drawer CloseOut record',
      error: error.message,
    });
  }
};
