import { DataTypes } from 'sequelize';

// Don't import getSequelize here - accept sequelize as a parameter instead
export default function(sequelize) {
  // Validate sequelize instance
  if (!sequelize || typeof sequelize.define !== 'function') {
    throw new Error('Invalid sequelize instance provided to Role model');
  }

  const Role = sequelize.define('Role', {
    role_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: false,
      field: 'role_id'
    },
    role_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'role_name'
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'permissions',
      get() {
        const rawValue = this.getDataValue('permissions');
        try {
          return rawValue ? JSON.parse(rawValue) : [];
        } catch (e) {
          return [];
        }
      },
      set(value) {
        this.setDataValue('permissions', 
          value ? JSON.stringify(value) : '[]'
        );
      }
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
    created_at: {
      type: DataTypes.DATE,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      field: 'updated_at'
    }
  }, {
    tableName: 'roles_vw',
    timestamps: false,
    underscored: true,
    freezeTableName: true
  });

  // Static methods
  Role.getActiveRoles = async function() {
    return await this.findAll({
      where: { active: 1 },
      raw: true
    });
  };

  Role.getRoleById = async function(roleId) {
    return await this.findOne({
      where: { role_id: roleId, active: 1 },
      raw: true
    });
  };

  return Role;
};