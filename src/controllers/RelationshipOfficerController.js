// controllers/relationshipOfficerController.js - MySQL Version
import RelationshipOfficer from '../models/RelationshipOfficer.js';

// Search for Relationship Officers by name, USER_ID, email, or employee ID
const searchRelationshipOfficers = async (req, res) => {
  try {
    const query = req.query.query || ''; // User input for searching
    const limit = parseInt(req.query.limit) || 50;
    
    if (!query.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query is required' 
      });
    }

    const officers = await RelationshipOfficer.searchOfficers(query, limit);
    
    res.json({
      success: true,
      data: officers,
      count: officers.length
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error searching Relationship Officers',
      error: error.message 
    });
  }
};

// Create a new Relationship Officer
const createRelationshipOfficer = async (req, res) => {
  try {
    const officerData = req.body;
    const createdBy = req.user?.id || req.user?.USER_ID || 'system';

    // Required fields validation
    if (!officerData.name || !officerData.USER_ID || !officerData.ROLE_ID) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, USER_ID, and ROLE_ID are required' 
      });
    }

    // Check if an officer with the same USER_ID already exists
    const existingOfficer = await RelationshipOfficer.getOfficerByUserId(officerData.USER_ID);
    if (existingOfficer) {
      return res.status(400).json({ 
        success: false, 
        message: 'Officer with this USER_ID already exists' 
      });
    }

    // Check if employee_id already exists if provided
    if (officerData.employee_id) {
      const existingByEmployeeId = await RelationshipOfficer.findOne({
        where: { employee_id: officerData.employee_id }
      });
      if (existingByEmployeeId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Officer with this employee ID already exists' 
        });
      }
    }

    // Add audit fields
    officerData.created_by = createdBy;
    officerData.status = officerData.status || 'ACTIVE';

    // Create a new officer
    const newOfficer = await RelationshipOfficer.createOfficer(officerData);

    res.status(201).json({
      success: true,
      message: 'Officer created successfully',
      data: newOfficer
    });
  } catch (error) {
    console.error('Create officer error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating Relationship Officer',
      error: error.message 
    });
  }
};

// Get all Relationship Officers with filters
const getRelationshipOfficers = async (req, res) => {
  try {
    const filters = {};
    
    // Apply filters from query parameters
    if (req.query.branch_code) {
      filters.branch_code = req.query.branch_code;
    }
    
    if (req.query.bu_id) {
      filters.bu_id = req.query.bu_id;
    }
    
    if (req.query.department) {
      filters.department = req.query.department;
    }
    
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    if (req.query.team_id) {
      filters.team_id = req.query.team_id;
    }

    const officers = await RelationshipOfficer.getActiveOfficers(filters);
    
    res.json({
      success: true,
      data: officers,
      count: officers.length
    });
  } catch (error) {
    console.error('Error fetching officers:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching Relationship Officers',
      error: error.message 
    });
  }
};

// Get a Relationship Officer by USER_ID or ID
const getRelationshipOfficerById = async (req, res) => {
  try {
    const { id } = req.params;
    
    let officer;
    
    // Check if id is numeric (likely database ID) or alphanumeric (likely USER_ID)
    if (/^\d+$/.test(id)) {
      // ID is numeric, treat as database ID
      officer = await RelationshipOfficer.getOfficerById(parseInt(id));
    } else {
      // ID is alphanumeric, treat as USER_ID
      officer = await RelationshipOfficer.getOfficerByUserId(id);
    }

    if (!officer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Officer not found' 
      });
    }

    res.json({
      success: true,
      data: officer
    });
  } catch (error) {
    console.error('Error fetching officer:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching Relationship Officer',
      error: error.message 
    });
  }
};

// Update a Relationship Officer by ID or USER_ID
const updateRelationshipOfficer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const updatedBy = req.user?.id || req.user?.USER_ID || 'system';

    // Find officer
    let officer;
    
    if (/^\d+$/.test(id)) {
      // ID is numeric, treat as database ID
      officer = await RelationshipOfficer.findByPk(parseInt(id));
    } else {
      // ID is alphanumeric, treat as USER_ID
      officer = await RelationshipOfficer.findOne({ where: { user_id: id } });
    }

    if (!officer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Officer not found' 
      });
    }

    // Check if USER_ID is being changed and if it already exists
    if (updateData.USER_ID && updateData.USER_ID !== officer.USER_ID) {
      const existingOfficer = await RelationshipOfficer.getOfficerByUserId(updateData.USER_ID);
      if (existingOfficer && existingOfficer.id !== officer.id) {
        return res.status(400).json({ 
          success: false, 
          message: 'Officer with this USER_ID already exists' 
        });
      }
    }

    // Check if employee_id is being changed and if it already exists
    if (updateData.employee_id && updateData.employee_id !== officer.employee_id) {
      const existingByEmployeeId = await RelationshipOfficer.findOne({
        where: { employee_id: updateData.employee_id }
      });
      if (existingByEmployeeId && existingByEmployeeId.id !== officer.id) {
        return res.status(400).json({ 
          success: false, 
          message: 'Officer with this employee ID already exists' 
        });
      }
    }

    // Add audit field
    updateData.updated_by = updatedBy;

    // Update the officer
    await officer.update(updateData);

    // Get updated officer with relationships
    const updatedOfficer = await RelationshipOfficer.getOfficerById(officer.id);

    res.json({
      success: true,
      message: 'Officer updated successfully',
      data: updatedOfficer
    });
  } catch (error) {
    console.error('Error updating officer:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating Relationship Officer',
      error: error.message 
    });
  }
};

// Delete a Relationship Officer by ID or USER_ID
const deleteRelationshipOfficer = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBy = req.user?.id || req.user?.USER_ID || 'system';

    // Find officer
    let officer;
    
    if (/^\d+$/.test(id)) {
      // ID is numeric, treat as database ID
      officer = await RelationshipOfficer.findByPk(parseInt(id));
    } else {
      // ID is alphanumeric, treat as USER_ID
      officer = await RelationshipOfficer.findOne({ where: { user_id: id } });
    }

    if (!officer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Officer not found' 
      });
    }

    // Check if officer has subordinates
    const subordinatesCount = await RelationshipOfficer.count({
      where: { supervisor_id: officer.id }
    });

    if (subordinatesCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete officer with subordinates. Please reassign subordinates first.' 
      });
    }

    // Soft delete: Update status instead of deleting
    await officer.update({
      status: 'INACTIVE',
      updated_by: deletedBy
    });

    res.json({
      success: true,
      message: 'Officer deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting officer:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting Relationship Officer',
      error: error.message 
    });
  }
};

// Get officer statistics
const getOfficerStatistics = async (req, res) => {
  try {
    const filters = {};
    
    if (req.query.branch_code) {
      filters.branch_code = req.query.branch_code;
    }
    
    if (req.query.bu_id) {
      filters.bu_id = req.query.bu_id;
    }

    const stats = await RelationshipOfficer.getOfficerStats(filters);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting officer statistics:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting officer statistics',
      error: error.message 
    });
  }
};

// Get top performing officers
const getTopPerformingOfficers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const filters = {};
    
    if (req.query.branch_code) {
      filters.branch_code = req.query.branch_code;
    }
    
    if (req.query.bu_id) {
      filters.bu_id = req.query.bu_id;
    }
    
    if (req.query.department) {
      filters.department = req.query.department;
    }

    const topPerformers = await RelationshipOfficer.getTopPerformers(limit, filters);
    
    res.json({
      success: true,
      data: topPerformers,
      count: topPerformers.length
    });
  } catch (error) {
    console.error('Error getting top performers:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error getting top performing officers',
      error: error.message 
    });
  }
};

// Assign supervisor to an officer
const assignSupervisor = async (req, res) => {
  try {
    const { officerId } = req.params;
    const { supervisorId } = req.body;
    const updatedBy = req.user?.id || req.user?.USER_ID || 'system';

    if (!supervisorId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Supervisor ID is required' 
      });
    }

    // Convert officerId to integer if it's numeric
    const officerIdNum = /^\d+$/.test(officerId) ? parseInt(officerId) : officerId;
    
    const officer = await RelationshipOfficer.assignSupervisor(officerIdNum, supervisorId);
    
    if (!officer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Officer not found' 
      });
    }

    // Update audit field
    await officer.update({ updated_by: updatedBy });

    res.json({
      success: true,
      message: 'Supervisor assigned successfully',
      data: officer
    });
  } catch (error) {
    console.error('Error assigning supervisor:', error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error assigning supervisor',
      error: error.message 
    });
  }
};

// Update officer performance metrics
const updateOfficerPerformance = async (req, res) => {
  try {
    const { officerId } = req.params;
    const metrics = req.body;
    const updatedBy = req.user?.id || req.user?.USER_ID || 'system';

    if (!metrics || Object.keys(metrics).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Performance metrics are required' 
      });
    }

    // Convert officerId to integer if it's numeric
    const officerIdNum = /^\d+$/.test(officerId) ? parseInt(officerId) : officerId;
    
    let officer;
    
    if (typeof officerIdNum === 'number') {
      officer = await RelationshipOfficer.findByPk(officerIdNum);
    } else {
      officer = await RelationshipOfficer.findOne({ where: { user_id: officerIdNum } });
    }

    if (!officer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Officer not found' 
      });
    }

    const updatedOfficer = await RelationshipOfficer.updatePerformanceMetrics(officer.id, metrics);
    
    // Update audit field
    await updatedOfficer.update({ updated_by: updatedBy });

    res.json({
      success: true,
      message: 'Performance metrics updated successfully',
      data: updatedOfficer
    });
  } catch (error) {
    console.error('Error updating performance metrics:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating performance metrics',
      error: error.message 
    });
  }
};

// Bulk create officers (for initialization)
const bulkCreateOfficers = async (req, res) => {
  try {
    const officersData = req.body.officers || [];
    const createdBy = req.user?.id || req.user?.USER_ID || 'system';

    if (!Array.isArray(officersData) || officersData.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Officers array is required' 
      });
    }

    const results = {
      created: [],
      skipped: [],
      errors: []
    };

    for (const officerData of officersData) {
      try {
        // Validate required fields
        if (!officerData.name || !officerData.USER_ID || !officerData.ROLE_ID) {
          results.skipped.push({
            data: officerData,
            reason: 'Missing required fields'
          });
          continue;
        }

        // Check if officer already exists
        const existingOfficer = await RelationshipOfficer.getOfficerByUserId(officerData.USER_ID);
        if (existingOfficer) {
          results.skipped.push({
            data: officerData,
            reason: 'Officer already exists'
          });
          continue;
        }

        // Add audit fields
        officerData.created_by = createdBy;
        officerData.status = officerData.status || 'ACTIVE';

        const newOfficer = await RelationshipOfficer.createOfficer(officerData);
        results.created.push(newOfficer);
      } catch (error) {
        results.errors.push({
          data: officerData,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Bulk create completed',
      data: {
        total: officersData.length,
        created: results.created.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
        details: {
          created: results.created.map(o => ({ id: o.id, USER_ID: o.USER_ID, name: o.name })),
          skipped: results.skipped,
          errors: results.errors
        }
      }
    });
  } catch (error) {
    console.error('Error in bulk create:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error in bulk create operation',
      error: error.message 
    });
  }
};

// Exporting the controller functions
export { 
  searchRelationshipOfficers,
  createRelationshipOfficer,
  getRelationshipOfficers,
  getRelationshipOfficerById,
  updateRelationshipOfficer,
  deleteRelationshipOfficer,
  getOfficerStatistics,
  getTopPerformingOfficers,
  assignSupervisor,
  updateOfficerPerformance,
  bulkCreateOfficers
};