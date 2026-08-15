// src/models/RolesVw.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const RolesVw = sequelize.define('RolesVw', {
  role_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    field: 'role_id'
  },
  role_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'role_name'
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'description'
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'active'
  },
  permissions: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'permissions'  // ✅ Matches the view column
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
  },
}, {
  tableName: 'roles_vw',
  timestamps: false,
  underscored: false,
  freezeTableName: true,
});

// ✅ Add a method to ensure the view exists
RolesVw.ensureViewExists = async function() {
  try {
    // Check if view exists
    const [result] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.VIEWS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'roles_vw'
    `);
    
    if (result.length === 0) {
      console.log('📝 Creating roles_vw view...');
      await sequelize.query(`
        CREATE VIEW roles_vw AS 
        SELECT 
          role_id,
          role_name,
          description,
          active,
          permissions,
          created_at,
          updated_at
        FROM roles
        WHERE active = 1
      `);
      console.log('✅ roles_vw view created');
    } else {
      // Recreate to ensure it has the permissions column
      await sequelize.query(`DROP VIEW IF EXISTS roles_vw`);
      await sequelize.query(`
        CREATE VIEW roles_vw AS 
        SELECT 
          role_id,
          role_name,
          description,
          active,
          permissions,
          created_at,
          updated_at
        FROM roles
        WHERE active = 1
      `);
      console.log('✅ roles_vw view updated with permissions column');
    }
    return true;
  } catch (error) {
    console.error('❌ Error ensuring roles_vw view exists:', error.message);
    return false;
  }
};

// ✅ Add a method to get all roles from the view
RolesVw.getAllRoles = async function() {
  try {
    await this.ensureViewExists();
    return await this.findAll({
      where: { active: true },
      raw: true,
    });
  } catch (error) {
    console.error('Error getting roles from view:', error.message);
    return [];
  }
};

// ✅ Add a method to get a role by ID
RolesVw.getRoleById = async function(roleId) {
  try {
    await this.ensureViewExists();
    return await this.findOne({
      where: { role_id: roleId, active: true },
      raw: true,
    });
  } catch (error) {
    console.error('Error getting role by ID from view:', error.message);
    return null;
  }
};

export default RolesVw;
