import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class FileUpload extends Model {}

FileUpload.init({
  CUST_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  format: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  uploadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  uploadedBy: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'FileUpload',
  tableName: 'file_uploads',
  timestamps: true, // This creates createdAt and updatedAt automatically
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['CUST_NO'],
    },
    {
      fields: ['filename'],
    },
    {
      fields: ['uploadedAt'],
    },
    {
      fields: ['format'],
    },
  ],
});

// Optional: Add associations if needed
FileUpload.associate = (models) => {
  // If you have a Customer model, you could add:
  // FileUpload.belongsTo(models.Customer, {
  //   foreignKey: 'CUST_NO',
  //   targetKey: 'customerNumber',
  //   as: 'customer'
  // });
};

export default FileUpload;
