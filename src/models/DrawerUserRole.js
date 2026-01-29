// models/DrawerUserRole.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class DrawerUserRole extends Model {
  // Method to deactivate user role
  deactivate() {
    this.REC_ST = 'I';
    this.VERSION_NO += 1;
  }

  // Method to reactivate user role
  reactivate() {
    this.REC_ST = 'A';
    this.VERSION_NO += 1;
  }

  // Method to update user role
  updateRole(newUserRoleId, updatedBy) {
    this.USER_ROLE_ID = newUserRoleId;
    this.USER_ID = updatedBy;
    this.VERSION_NO += 1;
  }

  // Virtual getter for isActive status
  get isActive() {
    return this.REC_ST === 'A';
  }

  // Static method to find active roles by drawer
  static async findActiveByDrawer(drawerId) {
    return await this.findAll({
      where: {
        DRAWER_ID: drawerId,
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method to find roles by user
  static async findByUser(userId) {
    return await this.findAll({
      where: {
        USER_ID: userId,
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method to find user's drawer roles
  static async findUserDrawerRoles(userId, drawerId) {
    return await this.findAll({
      where: {
        USER_ID: userId,
        DRAWER_ID: drawerId,
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method to check if user has access to drawer
  static async hasAccessToDrawer(userId, drawerId) {
    const count = await this.count({
      where: {
        USER_ID: userId,
        DRAWER_ID: drawerId,
        REC_ST: 'A'
      }
    });
    return count > 0;
  }

  // Static method to find all drawers accessible by user
  static async findDrawersByUser(userId) {
    const roles = await this.findAll({
      where: {
        USER_ID: userId,
        REC_ST: 'A'
      },
      attributes: ['DRAWER_ID'],
      group: ['DRAWER_ID'],
      order: [['CREATE_DT', 'DESC']]
    });
    
    return roles.map(role => role.DRAWER_ID);
  }

  // Static method to find all users with access to drawer
  static async findUsersByDrawer(drawerId) {
    const roles = await this.findAll({
      where: {
        DRAWER_ID: drawerId,
        REC_ST: 'A'
      },
      attributes: ['USER_ID'],
      group: ['USER_ID'],
      order: [['CREATE_DT', 'DESC']]
    });
    
    return roles.map(role => role.USER_ID);
  }

  // Static method to assign role to user
  static async assignRole(drawerId, userId, userRoleId, createdBy) {
    // Check if assignment already exists and is active
    const existing = await this.findOne({
      where: {
        DRAWER_ID: drawerId,
        USER_ID: userId,
        USER_ROLE_ID: userRoleId,
        REC_ST: 'A'
      }
    });

    if (existing) {
      // Reactivate if inactive, otherwise return existing
      if (existing.REC_ST === 'I') {
        existing.REC_ST = 'A';
        existing.VERSION_NO += 1;
        await existing.save();
      }
      return existing;
    }

    // Deactivate any existing active assignments for this user-drawer combination
    await this.update(
      { REC_ST: 'I', VERSION_NO: sequelize.literal('VERSION_NO + 1') },
      {
        where: {
          DRAWER_ID: drawerId,
          USER_ID: userId,
          REC_ST: 'A'
        }
      }
    );

    // Create new assignment
    return await this.create({
      DRAWER_ID: drawerId,
      USER_ID: userId,
      USER_ROLE_ID: userRoleId,
      CREATED_BY: createdBy,
      REC_ST: 'A',
      VERSION_NO: 1
    });
  }

  // Static method to remove user role from drawer
  static async removeRole(drawerId, userId, userRoleId = null) {
    const where = {
      DRAWER_ID: drawerId,
      USER_ID: userId,
      REC_ST: 'A'
    };
    
    if (userRoleId) {
      where.USER_ROLE_ID = userRoleId;
    }

    return await this.update(
      { REC_ST: 'I', VERSION_NO: sequelize.literal('VERSION_NO + 1') },
      { where }
    );
  }

  // Static method to get role history for user-drawer combination
  static async getRoleHistory(drawerId, userId) {
    return await this.findAll({
      where: {
        DRAWER_ID: drawerId,
        USER_ID: userId
      },
      order: [['CREATE_DT', 'DESC']]
    });
  }
}

DrawerUserRole.init({
  DRAWER_USER_ROLE_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    unique: true,
    field: 'drawerUserRoleId'
  },
  DRAWER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'drawerId',
    references: {
      model: 'Drawers',
      key: 'DRAWER_ID'
    }
  },
  REC_ST: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'A',
    field: 'recSt',
    validate: {
      isIn: [['A', 'I']] // A=Active, I=Inactive
    }
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'versionNo'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'rowTs'
  },
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    field: 'userId'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'createDt'
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'sysCreateTs'
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    field: 'createdBy'
  },
  USER_ROLE_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'userRoleId',
    references: {
      model: 'UserRoles',
      key: 'USER_ROLE_ID'
    }
  }
}, {
  sequelize,
  modelName: 'DrawerUserRole',
  tableName: 'drawer_user_roles',
  timestamps: false, // Using custom timestamp fields
  underscored: false,
  hooks: {
    beforeSave: async (drawerUserRole, options) => {
      if (drawerUserRole.changed()) {
        drawerUserRole.VERSION_NO += 1;
        drawerUserRole.ROW_TS = new Date();
      }
    }
  },
  indexes: [
    {
      name: 'idx_drawer_user_roles_id',
      fields: ['drawerUserRoleId'],
      unique: true
    },
    {
      name: 'idx_drawer_user_roles_drawer_user',
      fields: ['drawerId', 'userId']
    },
    {
      name: 'idx_drawer_user_roles_drawer',
      fields: ['drawerId']
    },
    {
      name: 'idx_drawer_user_roles_user',
      fields: ['userId']
    },
    {
      name: 'idx_drawer_user_roles_user_role',
      fields: ['userRoleId']
    },
    {
      name: 'idx_drawer_user_roles_rec_st',
      fields: ['recSt']
    },
    {
      name: 'idx_drawer_user_roles_composite',
      fields: ['drawerId', 'userId', 'recSt']
    }
  ]
});

export default DrawerUserRole;