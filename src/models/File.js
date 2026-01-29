import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class File extends Model {}

File.init({
  url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: {
      isUrl: true,
    },
  },
  publicId: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  fileType: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Size in bytes',
  },
  mimeType: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  uploadedBy: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {},
    get() {
      const value = this.getDataValue('metadata');
      return typeof value === 'string' ? JSON.parse(value) : value;
    },
    set(value) {
      this.setDataValue('metadata', JSON.stringify(value));
    },
  },
}, {
  sequelize,
  modelName: 'File',
  tableName: 'files',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  paranoid: true, // Adds deletedAt for soft deletes
  indexes: [
    {
      unique: true,
      fields: ['publicId'],
    },
    {
      fields: ['filename'],
    },
    {
      fields: ['fileType'],
    },
    {
      fields: ['isActive'],
    },
    {
      fields: ['createdAt'],
    },
  ],
});

// Instance methods
File.prototype.getSecureUrl = function() {
  // You might want to generate a signed URL here
  return this.url;
};

File.prototype.getFileSizeFormatted = function() {
  if (!this.fileSize) return 'Unknown';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = this.fileSize;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

File.prototype.isImage = function() {
  return this.mimeType?.startsWith('image/') || false;
};

File.prototype.isDocument = function() {
  const docMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument'];
  return docMimes.some(mime => this.mimeType?.includes(mime)) || false;
};

// Static methods
File.findActive = async function() {
  return await this.findAll({
    where: { isActive: true },
    order: [['createdAt', 'DESC']],
  });
};

File.findByType = async function(fileType) {
  return await this.findAll({
    where: { fileType, isActive: true },
    order: [['createdAt', 'DESC']],
  });
};

File.search = async function(searchTerm) {
  return await this.findAll({
    where: {
      [Op.or]: [
        { filename: { [Op.like]: `%${searchTerm}%` } },
        { publicId: { [Op.like]: `%${searchTerm}%` } },
      ],
      isActive: true,
    },
    limit: 50,
  });
};

export default File;