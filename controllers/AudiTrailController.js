import mongoose from 'mongoose'
import AuditTrail from '../models/AuditTrail.js';
import Users from '../models/User.js';



import Customer from '../models/Customer.js';


// Generate a 7-digit serial number (increments from the last event_id)
const generateEventID = async () => {
    const lastEvent = await AuditTrail.findOne().sort({ event_id: -1 });
    return lastEvent ? lastEvent.event_id + 1 : 1;
};

// ✅ Create a new Audit Trail Entry
export const createAuditTrail = async (req, res) => {
    try {
        const { EVENT_TYPE, USER_ID, ACTION, OLD_VALUE, NEW_VALUE, IP_ADDRESS } = req.body;

        if (!EVENT_TYPE || !USER_ID || !ACTION || !NEW_VALUE || !IP_ADDRESS) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const event_id = await generateEventID();
        console.log(`Generated event_id: ${event_id}`);

        const auditEntry = new AuditTrail({
            event_id,
            user_id: USER_ID,
            event_type: EVENT_TYPE,
            action: ACTION,
            old_value: OLD_VALUE,
            new_value: NEW_VALUE,
            ip_address: IP_ADDRESS
        });

        await auditEntry.save();

        return res.status(201).json({ message: 'Audit trail entry created', event: auditEntry });
    } catch (error) {
        console.error('Error creating audit trail:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

// ✅ Archive an Audit Trail Entry
export const archiveAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;

    const auditTrail = await AuditTrail.findById(id);
    if (!auditTrail) {
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    auditTrail.archived = true;
    await auditTrail.save();

    return res.status(200).json({ message: 'Audit trail entry archived' });
  } catch (error) {
    console.error('Error archiving audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const restoreAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;

    const auditTrail = await AuditTrail.findById(id);
    if (!auditTrail) {
      return res.status(404).json({ message: 'Audit trail not found' });
    }

    auditTrail.archived = false;
    await auditTrail.save();

    return res.status(200).json({ message: 'Audit trail entry restored' });
  } catch (error) {
    console.error('Error restoring audit trail:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};


// ✅ Get all Audit Trail Entries
export const getAllAuditTrails = async (req, res) => {
    try {
        const auditTrails = await AuditTrail.find();
        return res.status(200).json(auditTrails);
    } catch (error) {
        console.error('Error fetching audit trails:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};

// ✅ Get Audit Trail Entry by ID (MongoDB _id)
export const getAuditTrailById = async (req, res) => {
    try {
        const { id } = req.params;
        const auditTrail = await AuditTrail.findById(id);

        if (!auditTrail) {
            return res.status(404).json({ message: 'Audit trail not found' });
        }

        return res.status(200).json(auditTrail);
    } catch (error) {
        console.error('Error fetching audit trail:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};

// ✅ Update an Audit Trail Entry
export const updateAuditTrail = async (req, res) => {
    try {
        const { id } = req.params;
        const { ACTION, NEW_VALUE } = req.body;

        const auditTrail = await AuditTrail.findById(id);
        if (!auditTrail) {
            return res.status(404).json({ message: 'Audit trail not found' });
        }

        auditTrail.action = ACTION || auditTrail.action;
        auditTrail.new_value = NEW_VALUE || auditTrail.new_value;

        await auditTrail.save();

        return res.status(200).json({ message: 'Audit trail entry updated' });
    } catch (error) {
        console.error('Error updating audit trail:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};

// ✅ Delete an Audit Trail Entry
export const deleteAuditTrail = async (req, res) => {
    try {
        const { id } = req.params;
        const auditTrail = await AuditTrail.findById(id);

        if (!auditTrail) {
            return res.status(404).json({ message: 'Audit trail not found' });
        }

        await auditTrail.deleteOne();
        return res.status(200).json({ message: 'Audit trail entry deleted' });
    } catch (error) {
        console.error('Error deleting audit trail:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};
