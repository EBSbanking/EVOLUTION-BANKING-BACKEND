// models/RelationshipOfficer.js - MySQL/Sequelize Version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const RelationshipOfficer = sequelize.define('RelationshipOfficer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'name'
  },
  USER_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'user_id'
  },
  ROLE_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'role_id'
  },
  employee_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
    field: 'employee_id'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    },
    field: 'email'
  },
  phone_number: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'phone_number'
  },
  branch_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'branch_code'
  },
  bu_id: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'bu_id'
  },
  designation: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'designation'
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'department'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE'),
    defaultValue: 'ACTIVE',
    field: 'status'
  },
  joined_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'joined_date'
  },
  assigned_customers_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'assigned_customers_count'
  },
  total_loans_managed: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_loans_managed'
  },
  total_loan_amount_managed: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    field: 'total_loan_amount_managed'
  },
  performance_score: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
    field: 'performance_score'
  },
  supervisor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'supervisor_id'
  },
  team_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'team_id'
  },
  qualifications: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'qualifications'
  },
  specializations: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'specializations'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'notes'
  },
  created_by: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'created_by'
  },
  updated_by: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'updated_by'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    onUpdate: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'relationship_officers',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id']
    },
    {
      unique: true,
      fields: ['employee_id']
    },
    {
      unique: false,
      fields: ['name']
    },
    {
      unique: false,
      fields: ['branch_code']
    },
    {
      unique: false,
      fields: ['bu_id']
    },
    {
      unique: false,
      fields: ['status']
    },
    {
      unique: false,
      fields: ['supervisor_id']
    },
    {
      unique: false,
      fields: ['team_id']
    },
    {
      unique: false,
      fields: ['department']
    }
  ]
});

// Self-referential relationship for supervisors
RelationshipOfficer.hasMany(RelationshipOfficer, {
  foreignKey: 'supervisor_id',
  as: 'subordinates'
});

RelationshipOfficer.belongsTo(RelationshipOfficer, {
  foreignKey: 'supervisor_id',
  as: 'supervisor'
});

// Helper methods for RelationshipOfficer
RelationshipOfficer.createOfficer = async (officerData) => {
  try {
    const officer = await RelationshipOfficer.create(officerData);
    return officer;
  } catch (error) {
    console.error('Error creating relationship officer:', error.message);
    throw error;
  }
};

RelationshipOfficer.getOfficerByUserId = async (userId) => {
  try {
    const officer = await RelationshipOfficer.findOne({
      where: { user_id: userId }
    });
    
    return officer;
  } catch (error) {
    console.error('Error getting relationship officer by user ID:', error.message);
    throw error;
  }
};

RelationshipOfficer.getOfficerById = async (officerId) => {
  try {
    const officer = await RelationshipOfficer.findByPk(officerId, {
      include: [
        {
          model: RelationshipOfficer,
          as: 'supervisor',
          attributes: ['id', 'name', 'user_id', 'email', 'designation']
        },
        {
          model: RelationshipOfficer,
          as: 'subordinates',
          attributes: ['id', 'name', 'user_id', 'email', 'designation', 'status']
        }
      ]
    });
    
    return officer;
  } catch (error) {
    console.error('Error getting relationship officer by ID:', error.message);
    throw error;
  }
};

RelationshipOfficer.getActiveOfficers = async (filters = {}) => {
  try {
    const whereClause = {
      status: 'ACTIVE'
    };
    
    if (filters.branch_code) {
      whereClause.branch_code = filters.branch_code;
    }
    
    if (filters.bu_id) {
      whereClause.bu_id = filters.bu_id;
    }
    
    if (filters.department) {
      whereClause.department = filters.department;
    }
    
    if (filters.team_id) {
      whereClause.team_id = filters.team_id;
    }
    
    const officers = await RelationshipOfficer.findAll({
      where: whereClause,
      order: [['name', 'ASC']]
    });
    
    return officers;
  } catch (error) {
    console.error('Error getting active relationship officers:', error.message);
    throw error;
  }
};

RelationshipOfficer.getOfficersByBranch = async (branchCode) => {
  try {
    const officers = await RelationshipOfficer.findAll({
      where: { branch_code: branchCode },
      order: [['name', 'ASC']]
    });
    
    return officers;
  } catch (error) {
    console.error('Error getting relationship officers by branch:', error.message);
    throw error;
  }
};

RelationshipOfficer.updateOfficerStatus = async (officerId, status, updatedBy) => {
  try {
    const officer = await RelationshipOfficer.findByPk(officerId);
    
    if (!officer) {
      throw new Error('Relationship officer not found');
    }
    
    await officer.update({
      status: status,
      updated_by: updatedBy
    });
    
    return officer;
  } catch (error) {
    console.error('Error updating officer status:', error.message);
    throw error;
  }
};

RelationshipOfficer.assignSupervisor = async (officerId, supervisorId) => {
  try {
    const officer = await RelationshipOfficer.findByPk(officerId);
    
    if (!officer) {
      throw new Error('Relationship officer not found');
    }
    
    // Check if supervisor exists
    if (supervisorId) {
      const supervisor = await RelationshipOfficer.findByPk(supervisorId);
      if (!supervisor) {
        throw new Error('Supervisor not found');
      }
      
      // Prevent circular reference
      if (supervisorId === officerId) {
        throw new Error('Officer cannot be their own supervisor');
      }
    }
    
    await officer.update({
      supervisor_id: supervisorId || null
    });
    
    return officer;
  } catch (error) {
    console.error('Error assigning supervisor:', error.message);
    throw error;
  }
};

RelationshipOfficer.updatePerformanceMetrics = async (officerId, metrics) => {
  try {
    const officer = await RelationshipOfficer.findByPk(officerId);
    
    if (!officer) {
      throw new Error('Relationship officer not found');
    }
    
    const updateData = {};
    
    if (metrics.assigned_customers_count !== undefined) {
      updateData.assigned_customers_count = metrics.assigned_customers_count;
    }
    
    if (metrics.total_loans_managed !== undefined) {
      updateData.total_loans_managed = metrics.total_loans_managed;
    }
    
    if (metrics.total_loan_amount_managed !== undefined) {
      updateData.total_loan_amount_managed = metrics.total_loan_amount_managed;
    }
    
    if (metrics.performance_score !== undefined) {
      updateData.performance_score = metrics.performance_score;
    }
    
    await officer.update(updateData);
    
    return officer;
  } catch (error) {
    console.error('Error updating performance metrics:', error.message);
    throw error;
  }
};

RelationshipOfficer.getTopPerformers = async (limit = 10, filters = {}) => {
  try {
    const whereClause = {
      status: 'ACTIVE'
    };
    
    if (filters.branch_code) {
      whereClause.branch_code = filters.branch_code;
    }
    
    if (filters.bu_id) {
      whereClause.bu_id = filters.bu_id;
    }
    
    if (filters.department) {
      whereClause.department = filters.department;
    }
    
    const topPerformers = await RelationshipOfficer.findAll({
      where: whereClause,
      order: [
        ['performance_score', 'DESC'],
        ['total_loan_amount_managed', 'DESC']
      ],
      limit: limit
    });
    
    return topPerformers;
  } catch (error) {
    console.error('Error getting top performers:', error.message);
    throw error;
  }
};

RelationshipOfficer.getOfficerStats = async (filters = {}) => {
  try {
    let whereClause = '';
    const replacements = [];
    
    if (filters.branch_code) {
      whereClause = 'WHERE branch_code = ?';
      replacements.push(filters.branch_code);
    }
    
    if (filters.bu_id) {
      whereClause = whereClause ? `${whereClause} AND bu_id = ?` : 'WHERE bu_id = ?';
      replacements.push(filters.bu_id);
    }
    
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_officers,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_officers,
        SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) as inactive_officers,
        SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) as suspended_officers,
        SUM(CASE WHEN status = 'ON_LEAVE' THEN 1 ELSE 0 END) as on_leave_officers,
        AVG(performance_score) as average_performance_score,
        SUM(assigned_customers_count) as total_assigned_customers,
        SUM(total_loans_managed) as total_loans_managed,
        SUM(total_loan_amount_managed) as total_loan_amount_managed,
        COUNT(DISTINCT branch_code) as unique_branches,
        COUNT(DISTINCT department) as unique_departments,
        MAX(joined_date) as latest_join_date,
        MIN(joined_date) as earliest_join_date
      FROM relationship_officers 
      ${whereClause}
    `, { replacements });
    
    return stats[0];
  } catch (error) {
    console.error('Error getting officer stats:', error.message);
    throw error;
  }
};

RelationshipOfficer.searchOfficers = async (searchTerm, limit = 50) => {
  try {
    const officers = await RelationshipOfficer.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${searchTerm}%` } },
          { user_id: { [Op.like]: `%${searchTerm}%` } },
          { employee_id: { [Op.like]: `%${searchTerm}%` } },
          { email: { [Op.like]: `%${searchTerm}%` } },
          { phone_number: { [Op.like]: `%${searchTerm}%` } }
        ]
      },
      limit: limit,
      order: [['name', 'ASC']]
    });
    
    return officers;
  } catch (error) {
    console.error('Error searching officers:', error.message);
    throw error;
  }
};

// Initialize table if it doesn't exist
RelationshipOfficer.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS relationship_officers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        user_id VARCHAR(50) UNIQUE NOT NULL,
        role_id VARCHAR(50) NOT NULL,
        employee_id VARCHAR(50) UNIQUE,
        email VARCHAR(255),
        phone_number VARCHAR(20),
        branch_code VARCHAR(50),
        bu_id VARCHAR(20),
        designation VARCHAR(100),
        department VARCHAR(100),
        status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE') DEFAULT 'ACTIVE',
        joined_date DATE,
        assigned_customers_count INT DEFAULT 0,
        total_loans_managed INT DEFAULT 0,
        total_loan_amount_managed DECIMAL(15,2) DEFAULT 0.00,
        performance_score DECIMAL(5,2) DEFAULT 0.00,
        supervisor_id INT,
        team_id VARCHAR(50),
        qualifications JSON,
        specializations JSON,
        notes TEXT,
        created_by VARCHAR(50) NOT NULL,
        updated_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_employee_id (employee_id),
        INDEX idx_name (name),
        INDEX idx_branch_code (branch_code),
        INDEX idx_bu_id (bu_id),
        INDEX idx_status (status),
        INDEX idx_supervisor_id (supervisor_id),
        INDEX idx_team_id (team_id),
        INDEX idx_department (department),
        INDEX idx_performance_score (performance_score),
        INDEX idx_joined_date (joined_date),
        FOREIGN KEY (supervisor_id) REFERENCES relationship_officers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('âœ… Relationship officers table initialized');
    return true;
  } catch (error) {
    console.error('Error initializing relationship officers table:', error.message);
    return false;
  }
};

// Sync the model (creates table if it doesn't exist)
RelationshipOfficer.syncTable = async () => {
  try {
    await RelationshipOfficer.sync({ alter: true });
    console.log('âœ… RelationshipOfficer table synced');
    return true;
  } catch (error) {
    console.error('Error syncing RelationshipOfficer table:', error.message);
    return false;
  }
};

export default RelationshipOfficer;
