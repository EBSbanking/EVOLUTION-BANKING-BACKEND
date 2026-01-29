// models/GLAccountSeg.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class GLAccountSeg extends Model {
  // Method to check if segment is active
  isActive() {
    return this.REC_ST === 'A';
  }

  // Method to deactivate segment
  deactivate() {
    this.REC_ST = 'I';
    this.VERSION_NO += 1;
  }

  // Method to reactivate segment
  reactivate() {
    this.REC_ST = 'A';
    this.VERSION_NO += 1;
  }

  // Method to get segment details
  getSegmentDetails() {
    return {
      segmentId: this.GL_ACCT_SEG_ID,
      structureId: this.GL_ACCT_STRUCT_ID,
      position: this.POSN,
      description: this.ACCT_SEG_DESC,
      type: this.SEG_TY_CD,
      isActive: this.isActive(),
      placeholderId: this.SEG_PLACEHLDR_ID
    };
  }

  // Static method to find segments by account structure
  static async findByAccountStructure(structureId) {
    return await this.findAll({
      where: {
        GL_ACCT_STRUCT_ID: structureId,
        REC_ST: 'A'
      },
      order: [['POSN', 'ASC']]
    });
  }

  // Static method to find segment by position
  static async findByPosition(structureId, position) {
    return await this.findOne({
      where: {
        GL_ACCT_STRUCT_ID: structureId,
        POSN: position,
        REC_ST: 'A'
      }
    });
  }

  // Static method to get all active segments
  static async getAllActiveSegments() {
    return await this.findAll({
      where: { REC_ST: 'A' },
      order: [['GL_ACCT_STRUCT_ID', 'ASC'], ['POSN', 'ASC']]
    });
  }

  // Static method to get segment structure summary
  static async getStructureSummary(structureId) {
    const segments = await this.findAll({
      where: {
        GL_ACCT_STRUCT_ID: structureId,
        REC_ST: 'A'
      },
      order: [['POSN', 'ASC']]
    });

    return {
      structureId,
      totalSegments: segments.length,
      segments: segments.map(seg => seg.getSegmentDetails()),
      hasValidStructure: this.validateSegmentStructure(segments)
    };
  }

  // Static method to validate segment structure
  static validateSegmentStructure(segments) {
    if (!segments || segments.length === 0) return false;

    // Check for sequential positions starting from 1
    const positions = segments.map(s => s.POSN).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i + 1) return false;
    }

    // Check for duplicate types
    const types = segments.map(s => s.SEG_TY_CD);
    const uniqueTypes = new Set(types);
    return types.length === uniqueTypes.size;
  }

  // Static method to create multiple segments
  static async createSegments(structureId, segments) {
    const transaction = await sequelize.transaction();
    
    try {
      const createdSegments = [];
      
      // First, deactivate any existing segments for this structure
      await this.update(
        { REC_ST: 'I', VERSION_NO: sequelize.literal('VERSION_NO + 1') },
        {
          where: { GL_ACCT_STRUCT_ID: structureId },
          transaction
        }
      );

      // Create new segments
      for (const segment of segments) {
        const created = await this.create({
          ...segment,
          GL_ACCT_STRUCT_ID: structureId,
          REC_ST: 'A',
          VERSION_NO: 1
        }, { transaction });
        
        createdSegments.push(created);
      }

      await transaction.commit();
      return createdSegments;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // Static method to update segment
  static async updateSegment(segmentId, updates) {
    const segment = await this.findByPk(segmentId);
    if (!segment) {
      throw new Error('Segment not found');
    }

    // Don't allow updates to GL_ACCT_SEG_ID and GL_ACCT_STRUCT_ID
    delete updates.GL_ACCT_SEG_ID;
    delete updates.GL_ACCT_STRUCT_ID;

    await segment.update({
      ...updates,
      VERSION_NO: segment.VERSION_NO + 1
    });

    return segment;
  }

  // Static method to get next available segment ID
  static async getNextSegmentId() {
    const lastSegment = await this.findOne({
      order: [['GL_ACCT_SEG_ID', 'DESC']],
      attributes: ['GL_ACCT_SEG_ID']
    });

    return lastSegment ? lastSegment.GL_ACCT_SEG_ID + 1 : 1;
  }

  // Static method to find segments by type
  static async findByType(segmentType) {
    return await this.findAll({
      where: {
        SEG_TY_CD: segmentType,
        REC_ST: 'A'
      },
      order: [['GL_ACCT_STRUCT_ID', 'ASC'], ['POSN', 'ASC']]
    });
  }

  // Static method to get segment statistics
  static async getSegmentStatistics() {
    const stats = await this.findAll({
      attributes: [
        'SEG_TY_CD',
        [sequelize.fn('COUNT', sequelize.col('GL_ACCT_SEG_ID')), 'segmentCount'],
        [sequelize.fn('COUNT', sequelize.literal('DISTINCT GL_ACCT_STRUCT_ID')), 'structureCount']
      ],
      where: { REC_ST: 'A' },
      group: ['SEG_TY_CD'],
      order: [[sequelize.fn('COUNT', sequelize.col('GL_ACCT_SEG_ID')), 'DESC']],
      raw: true
    });

    const total = await this.count({ where: { REC_ST: 'A' } });

    return {
      totalSegments: total,
      byType: stats.map(stat => ({
        type: stat.SEG_TY_CD,
        segmentCount: parseInt(stat.segmentCount) || 0,
        structureCount: parseInt(stat.structureCount) || 0,
        percentage: total > 0 ? Math.round((parseInt(stat.segmentCount) / total) * 10000) / 100 : 0
      })),
      lastUpdated: (await this.max('ROW_TS')) || 'Never'
    };
  }
}

GLAccountSeg.init({
  GL_ACCT_SEG_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    unique: true,
    comment: 'Account Segment Identifier'
  },
  GL_ACCT_STRUCT_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    references: {
      model: 'GLAccounts',
      key: 'GL_ACCT_NO'
    },
    comment: 'GL Account Structure Identifier (matches GL_ACCT_NO)'
  },
  POSN: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 999
    },
    comment: 'Position in Account Segment (1-3 digits)'
  },
  PROMPT: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Prompt Text'
  },
  SEG_PLACEHLDR_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Segment Placeholder Identifier'
  },
  ACCT_SEG_DESC: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Account Segment Description'
  },
  SEG_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Segment Type Code'
  },
  REC_ST: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I']] // Active, Inactive
    },
    comment: 'Record State'
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version Number'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Row Timestamp'
  }
}, {
  sequelize,
  modelName: 'GLAccountSeg',
  tableName: 'GLACCOUNT_SEG',
  timestamps: false, // Using custom ROW_TS field
  underscored: false,
  hooks: {
    beforeCreate: async (segment, options) => {
      // Auto-increment GL_ACCT_SEG_ID if not provided
      if (!segment.GL_ACCT_SEG_ID) {
        segment.GL_ACCT_SEG_ID = await GLAccountSeg.getNextSegmentId();
      }
    },
    beforeUpdate: (segment, options) => {
      // Increment version number on update
      if (segment.changed()) {
        segment.VERSION_NO += 1;
        segment.ROW_TS = new Date();
      }
    },
    beforeDestroy: async (segment, options) => {
      // Prevent deletion of active segments
      if (segment.REC_ST === 'A') {
        throw new Error('Cannot delete active segment. Deactivate it first.');
      }
    }
  },
  indexes: [
    {
      name: 'idx_gl_account_seg_id',
      fields: ['GL_ACCT_SEG_ID'],
      unique: true
    },
    {
      name: 'idx_gl_account_seg_structure',
      fields: ['GL_ACCT_STRUCT_ID', 'POSN'],
      unique: true
    },
    {
      name: 'idx_gl_account_seg_position',
      fields: ['POSN']
    },
    {
      name: 'idx_gl_account_seg_type',
      fields: ['SEG_TY_CD']
    },
    {
      name: 'idx_gl_account_seg_rec_st',
      fields: ['REC_ST']
    },
    {
      name: 'idx_gl_account_seg_structure_active',
      fields: ['GL_ACCT_STRUCT_ID', 'REC_ST']
    }
  ]
});

export default GLAccountSeg;