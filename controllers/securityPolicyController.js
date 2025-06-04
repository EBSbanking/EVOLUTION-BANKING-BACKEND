const SecurityPolicy = require('../models/SecurityPolicy');

// Create a new security policy
exports.createSecurityPolicy = async (req, res) => {
    try {
        const newPolicy = new SecurityPolicy(req.body);
        await newPolicy.save();
        res.status(201).json({ message: 'Security policy created successfully', policy: newPolicy });
    } catch (error) {
        console.error('Error creating security policy:', error);
        res.status(500).json({ message: 'Error creating security policy', error: error.message });
    }
};

// Get all security policies
exports.getAllSecurityPolicies = async (req, res) => {
    try {
        const policies = await SecurityPolicy.find();
        res.status(200).json({ policies });
    } catch (error) {
        console.error('Error retrieving security policies:', error);
        res.status(500).json({ message: 'Error retrieving security policies', error: error.message });
    }
};

// Get a specific security policy by ID
exports.getSecurityPolicyById = async (req, res) => {
    try {
        const { id } = req.params;
        const policy = await SecurityPolicy.findById(id);

        if (!policy) {
            return res.status(404).json({ message: 'Security policy not found' });
        }

        res.status(200).json({ policy });
    } catch (error) {
        console.error('Error retrieving security policy:', error);
        res.status(500).json({ message: 'Error retrieving security policy', error: error.message });
    }
};

// Update a specific security policy by ID
exports.updateSecurityPolicy = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedPolicy = await SecurityPolicy.findByIdAndUpdate(id, req.body, { new: true });

        if (!updatedPolicy) {
            return res.status(404).json({ message: 'Security policy not found' });
        }

        res.status(200).json({ message: 'Security policy updated successfully', policy: updatedPolicy });
    } catch (error) {
        console.error('Error updating security policy:', error);
        res.status(500).json({ message: 'Error updating security policy', error: error.message });
    }
};

// Delete a specific security policy by ID
exports.deleteSecurityPolicy = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedPolicy = await SecurityPolicy.findByIdAndDelete(id);

        if (!deletedPolicy) {
            return res.status(404).json({ message: 'Security policy not found' });
        }

        res.status(200).json({ message: 'Security policy deleted successfully' });
    } catch (error) {
        console.error('Error deleting security policy:', error);
        res.status(500).json({ message: 'Error deleting security policy', error: error.message });
    }
};
