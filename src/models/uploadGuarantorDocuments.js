// models/UploadGuarantorDocuments.js - MySQL/Sequelize Version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const UploadGuarantorDocuments = sequelize.define('UploadGuarantorDocuments', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  GUARANTOR_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'guarantor_id'
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'filename'
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'url'
  },
  public_id: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'public_id'
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'size'
  },
  format: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'format'
  },
  uploadedBy: {
    type: DataTypes.STRING(100),
    defaultValue: 'System',
    field: 'uploaded_by'
  },
  docType: {
    type: DataTypes.ENUM('IMAGE', 'DOCUMENT'),
    allowNull: false,
    field: 'doc_type'
  },
  mime_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'mime_type'
  },
  original_filename: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'original_filename'
  },
  file_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'file_path'
  },
  is_archived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_archived'
  },
  archive_reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'archive_reason'
  },
  archived_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'archived_at'
  },
  archived_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'archived_by'
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
  tableName: 'guarantor_documents',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: false,
      fields: ['guarantor_id']
    },
    {
      unique: false,
      fields: ['guarantor_id', 'doc_type']
    },
    {
      unique: false,
      fields: ['public_id']
    },
    {
      unique: false,
      fields: ['uploaded_by']
    },
    {
      unique: false,
      fields: ['created_at']
    },
    {
      unique: false,
      fields: ['is_archived']
    }
  ]
});

// Helper methods for UploadGuarantorDocuments
UploadGuarantorDocuments.createDocument = async (documentData) => {
  try {
    const document = await UploadGuarantorDocuments.create(documentData);
    return document;
  } catch (error) {
    console.error('Error creating guarantor document:', error.message);
    throw error;
  }
};

UploadGuarantorDocuments.getDocumentsByGuarantor = async (guarantorId, includeArchived = false) => {
  try {
    const whereClause = {
      guarantor_id: guarantorId
    };
    
    if (!includeArchived) {
      whereClause.is_archived = false;
    }
    
    const documents = await UploadGuarantorDocuments.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });
    
    return documents;
  } catch (error) {
    console.error('Error getting guarantor documents:', error.message);
    throw error;
  }
};

UploadGuarantorDocuments.getDocumentsByType = async (guarantorId, docType, includeArchived = false) => {
  try {
    const whereClause = {
      guarantor_id: guarantorId,
      doc_type: docType
    };
    
    if (!includeArchived) {
      whereClause.is_archived = false;
    }
    
    const documents = await UploadGuarantorDocuments.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });
    
    return documents;
  } catch (error) {
    console.error('Error getting guarantor documents by type:', error.message);
    throw error;
  }
};

UploadGuarantorDocuments.getDocumentByPublicId = async (publicId) => {
  try {
    const document = await UploadGuarantorDocuments.findOne({
      where: { public_id: publicId }
    });
    
    return document;
  } catch (error) {
    console.error('Error getting document by public ID:', error.message);
    throw error;
  }
};

UploadGuarantorDocuments.archiveDocument = async (documentId, reason, archivedBy) => {
  try {
    const document = await UploadGuarantorDocuments.findByPk(documentId);
    
    if (!document) {
      throw new Error('Document not found');
    }
    
    await document.update({
      is_archived: true,
      archive_reason: reason,
      archived_by: archivedBy,
      archived_at: new Date()
    });
    
    return document;
  } catch (error) {
    console.error('Error archiving document:', error.message);
    throw error;
  }
};

UploadGuarantorDocuments.restoreDocument = async (documentId) => {
  try {
    const document = await UploadGuarantorDocuments.findByPk(documentId);
    
    if (!document) {
      throw new Error('Document not found');
    }
    
    await document.update({
      is_archived: false,
      archive_reason: null,
      archived_by: null,
      archived_at: null
    });
    
    return document;
  } catch (error) {
    console.error('Error restoring document:', error.message);
    throw error;
  }
};

UploadGuarantorDocuments.deleteDocument = async (documentId) => {
  try {
    const document = await UploadGuarantorDocuments.findByPk(documentId);
    
    if (!document) {
      throw new Error('Document not found');
    }
    
    await document.destroy();
    return true;
  } catch (error) {
    console.error('Error deleting document:', error.message);
    throw error;
  }
};

UploadGuarantorDocuments.getDocumentStats = async (guarantorId = null) => {
  try {
    let whereClause = {};
    let replacements = [];
    
    if (guarantorId) {
      whereClause = 'WHERE guarantor_id = ?';
      replacements = [guarantorId];
    }
    
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_documents,
        SUM(CASE WHEN doc_type = 'IMAGE' THEN 1 ELSE 0 END) as image_count,
        SUM(CASE WHEN doc_type = 'DOCUMENT' THEN 1 ELSE 0 END) as document_count,
        SUM(CASE WHEN is_archived = true THEN 1 ELSE 0 END) as archived_count,
        SUM(size) as total_size_bytes,
        ROUND(SUM(size) / 1048576, 2) as total_size_mb,
        MAX(created_at) as latest_upload,
        MIN(created_at) as earliest_upload
      FROM guarantor_documents 
      ${whereClause}
    `, { replacements });
    
    return stats[0];
  } catch (error) {
    console.error('Error getting document stats:', error.message);
    throw error;
  }
};

UploadGuarantorDocuments.uploadMultipleDocuments = async (documentsData) => {
  try {
    const documents = await UploadGuarantorDocuments.bulkCreate(documentsData);
    return documents;
  } catch (error) {
    console.error('Error uploading multiple documents:', error.message);
    throw error;
  }
};

// Initialize table if it doesn't exist
UploadGuarantorDocuments.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS guarantor_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guarantor_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        public_id VARCHAR(255) NOT NULL,
        size INT NOT NULL,
        format VARCHAR(50) NOT NULL,
        uploaded_by VARCHAR(100) DEFAULT 'System',
        doc_type ENUM('IMAGE', 'DOCUMENT') NOT NULL,
        mime_type VARCHAR(100),
        original_filename VARCHAR(255),
        file_path VARCHAR(500),
        is_archived BOOLEAN DEFAULT false,
        archive_reason VARCHAR(255),
        archived_at DATETIME,
        archived_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_guarantor_id (guarantor_id),
        INDEX idx_guarantor_doc_type (guarantor_id, doc_type),
        INDEX idx_public_id (public_id),
        INDEX idx_uploaded_by (uploaded_by),
        INDEX idx_created_at (created_at),
        INDEX idx_is_archived (is_archived),
        UNIQUE KEY unique_public_id (public_id),
        CONSTRAINT fk_guarantor_documents_guarantor FOREIGN KEY (guarantor_id) REFERENCES guarantors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ Guarantor documents table initialized');
    return true;
  } catch (error) {
    console.error('Error initializing guarantor documents table:', error.message);
    return false;
  }
};

// Sync the model (creates table if it doesn't exist)
UploadGuarantorDocuments.syncTable = async () => {
  try {
    await UploadGuarantorDocuments.sync({ alter: false });
    console.log('✅ GuarantorDocuments table synced');
    return true;
  } catch (error) {
    console.error('Error syncing GuarantorDocuments table:', error.message);
    return false;
  }
};

export default UploadGuarantorDocuments;
