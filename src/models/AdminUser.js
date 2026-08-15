import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import bcrypt from 'bcrypt';

class AdminUser extends Model {
  // Instance method to compare password
  async comparePassword(plainPassword) {
    return bcrypt.compare(plainPassword, this.password_hash);
  }
}

AdminUser.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      onUpdate: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'AdminUser',
    tableName: 'admin_users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (adminUser) => {
        // If password is provided directly (e.g., during creation), hash it
        if (adminUser.password_hash && !adminUser.password_hash.startsWith('$2b$')) {
          const salt = await bcrypt.genSalt(10);
          adminUser.password_hash = await bcrypt.hash(adminUser.password_hash, salt);
        }
      },
      beforeUpdate: async (adminUser) => {
        if (adminUser.changed('password_hash') && !adminUser.password_hash.startsWith('$2b$')) {
          const salt = await bcrypt.genSalt(10);
          adminUser.password_hash = await bcrypt.hash(adminUser.password_hash, salt);
        }
      },
    },
  }
);

export default AdminUser;
