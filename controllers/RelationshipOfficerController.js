import Officer from '../models/RelationshipOfficer.js';  // Import the Officer model

// Search for Relationship Officers by name or USER_ID
const searchRelationshipOfficers = async (req, res) => {
  const query = req.query.query; // User input for searching
  try {
    const officers = await Officer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } }, // Search by name
        { USER_ID: { $regex: query, $options: 'i' } } // Search by USER_ID
      ]
    }).select('USER_ID name');  // Only return these fields

    res.json(officers);  // Respond with found officers
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Error searching Relationship Officers' });
  }
};

// Create a new Relationship Officer
const createRelationshipOfficer = async (req, res) => {
  const { name, USER_ID, ROLE_ID } = req.body; // Get officer data from request body

  if (!name || !USER_ID || !ROLE_ID) {
    return res.status(400).json({ message: 'Name, USER_ID, and ROLE_ID are required' });
  }

  try {
    // Check if an officer with the same USER_ID already exists
    const existingOfficer = await Officer.findOne({ USER_ID });
    if (existingOfficer) {
      return res.status(400).json({ message: 'Officer with this USER_ID already exists' });
    }

    // Create a new officer
    const newOfficer = new Officer({ name, USER_ID, ROLE_ID });
    await newOfficer.save();

    res.status(201).json({ message: 'Officer created successfully', officer: newOfficer });
  } catch (error) {
    console.error('Create officer error:', error);
    res.status(500).json({ message: 'Error creating Relationship Officer' });
  }
};

// Get all Relationship Officers
const getRelationshipOfficers = async (req, res) => {
  try {
    const officers = await Officer.find();  // Get all officers
    res.json(officers);  // Return all officers
  } catch (error) {
    console.error('Error fetching officers:', error);
    res.status(500).json({ message: 'Error fetching Relationship Officers' });
  }
};

// Get a Relationship Officer by USER_ID
const getRelationshipOfficerById = async (req, res) => {
    const { id } = req.params;  // Get the USER_ID from URL params
    try {
      // Search officer by USER_ID
      const officer = await Officer.findOne({ USER_ID: id });
  
      if (!officer) {
        return res.status(404).json({ message: 'Officer not found' });
      }
      res.json(officer);  // Return officer details
    } catch (error) {
      console.error('Error fetching officer:', error);
      res.status(500).json({ message: 'Error fetching Relationship Officer' });
    }
  };
  

// Update a Relationship Officer by USER_ID
const updateRelationshipOfficer = async (req, res) => {
    const { id } = req.params;  // Get USER_ID from URL params
    const { name, USER_ID, ROLE_ID } = req.body;  // Get updated data
  
    try {
      // Find and update the officer by USER_ID (instead of _id)
      const updatedOfficer = await Officer.findOneAndUpdate(
        { USER_ID: id },  // Search by USER_ID instead of _id
        { name, USER_ID, ROLE_ID },
        { new: true }  // Return the updated officer
      );
  
      if (!updatedOfficer) {
        return res.status(404).json({ message: 'Officer not found' });
      }
  
      res.json({ message: 'Officer updated successfully', officer: updatedOfficer });
    } catch (error) {
      console.error('Error updating officer:', error);
      res.status(500).json({ message: 'Error updating Relationship Officer' });
    }
  };
  
// Delete a Relationship Officer by ID
const deleteRelationshipOfficer = async (req, res) => {
  const { id } = req.params;  // Get officer ID from URL params

  try {
    const officer = await Officer.findByIdAndDelete(id);  // Delete the officer
    if (!officer) {
      return res.status(404).json({ message: 'Officer not found' });
    }

    res.json({ message: 'Officer deleted successfully' });
  } catch (error) {
    console.error('Error deleting officer:', error);
    res.status(500).json({ message: 'Error deleting Relationship Officer' });
  }
};

// Exporting the controller functions
export { 
  searchRelationshipOfficers, 
  createRelationshipOfficer, 
  getRelationshipOfficers, 
  getRelationshipOfficerById, 
  updateRelationshipOfficer, 
  deleteRelationshipOfficer 
};
