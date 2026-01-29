import express from 'express';
import { getPool } from '../../config/db.js'; // MySQL connection pool

const router = express.Router();

// Cleanup sequences route for MySQL
router.get('/cleanup-sequences', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    console.log('Starting MySQL database cleanup...');
    
    connection = await pool.getConnection();

    // First, let's check if the sequences table exists
    const [tableCheck] = await connection.query(`
      SELECT COUNT(*) as tableExists 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'sequences'
    `, [process.env.DB_NAME || 'your_database']);

    if (tableCheck[0].tableExists === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sequences table does not exist in the database'
      });
    }

    // Count before cleanup
    const [countBefore] = await connection.query(
      'SELECT COUNT(*) as total FROM sequences'
    );
    const beforeCount = countBefore[0].total;
    console.log('Documents before cleanup:', beforeCount);

    // Find problematic documents (where collection or targetCollection is NULL or empty)
    const [problematicDocs] = await connection.query(`
      SELECT * FROM sequences 
      WHERE collection IS NULL 
         OR collection = ''
         OR targetCollection IS NULL 
         OR targetCollection = ''
    `);
    
    console.log('Found problematic documents:', problematicDocs.length);

    // Delete problematic documents
    const [deleteResult] = await connection.query(`
      DELETE FROM sequences 
      WHERE collection IS NULL 
         OR collection = ''
         OR targetCollection IS NULL 
         OR targetCollection = ''
    `);

    const deletedCount = deleteResult.affectedRows;
    console.log('Deleted documents:', deletedCount);

    // Count after cleanup
    const [countAfter] = await connection.query(
      'SELECT COUNT(*) as total FROM sequences'
    );
    const afterCount = countAfter[0].total;
    console.log('Documents after cleanup:', afterCount);

    // Check and recreate indexes if needed
    const [indexes] = await connection.query(`
      SHOW INDEX FROM sequences
    `);

    console.log('Current indexes:', indexes.length);

    // Drop unique indexes if they exist
    try {
      const [hasCollectionIndex] = await connection.query(`
        SHOW INDEX FROM sequences 
        WHERE Column_name = 'collection' 
        AND Non_unique = 0
      `);
      
      if (hasCollectionIndex.length > 0) {
        await connection.query('ALTER TABLE sequences DROP INDEX collection');
        console.log('Dropped collection unique index');
      }
    } catch (e) {
      console.log('collection index might not exist:', e.message);
    }

    try {
      const [hasTargetCollectionIndex] = await connection.query(`
        SHOW INDEX FROM sequences 
        WHERE Column_name = 'targetCollection' 
        AND Non_unique = 0
      `);
      
      if (hasTargetCollectionIndex.length > 0) {
        await connection.query('ALTER TABLE sequences DROP INDEX targetCollection');
        console.log('Dropped targetCollection unique index');
      }
    } catch (e) {
      console.log('targetCollection index might not exist:', e.message);
    }

    // Create new unique indexes
    await connection.query('CREATE UNIQUE INDEX idx_collection_unique ON sequences (collection)');
    await connection.query('CREATE UNIQUE INDEX idx_targetCollection_unique ON sequences (targetCollection)');
    console.log('Indexes recreated successfully');

    // Show remaining sequences
    const [remainingSequences] = await connection.query('SELECT * FROM sequences');
    console.log('Remaining sequences count:', remainingSequences.length);

    // Optional: Fix any sequence values that might be problematic
    const [sequencesToFix] = await connection.query(`
      SELECT * FROM sequences 
      WHERE seq_value IS NULL 
         OR seq_value < 0
    `);

    if (sequencesToFix.length > 0) {
      console.log('Fixing invalid sequence values:', sequencesToFix.length);
      
      for (const seq of sequencesToFix) {
        await connection.query(
          'UPDATE sequences SET seq_value = 1 WHERE id = ?',
          [seq.id]
        );
      }
      console.log('Fixed invalid sequence values');
    }

    res.json({
      success: true,
      message: `MySQL cleanup completed. Deleted ${deletedCount} problematic documents.`,
      data: {
        beforeCount,
        afterCount,
        deletedCount,
        remainingSequences: remainingSequences.length,
        tableInfo: {
          name: 'sequences',
          columns: await getTableColumns(connection),
          indexes: await getTableIndexes(connection)
        }
      }
    });

  } catch (error) {
    console.error('MySQL cleanup failed:', error);
    res.status(500).json({
      success: false,
      message: 'Cleanup failed: ' + error.message,
      error: error.toString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Helper function to get table columns
async function getTableColumns(connection) {
  try {
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'sequences'
      ORDER BY ORDINAL_POSITION
    `, [process.env.DB_NAME || 'your_database']);
    
    return columns;
  } catch (error) {
    console.error('Error getting table columns:', error);
    return [];
  }
}

// Helper function to get table indexes
async function getTableIndexes(connection) {
  try {
    const [indexes] = await connection.query(`
      SHOW INDEX FROM sequences
    `);
    
    return indexes.map(index => ({
      name: index.Key_name,
      column: index.Column_name,
      unique: index.Non_unique === 0,
      type: index.Index_type
    }));
  } catch (error) {
    console.error('Error getting table indexes:', error);
    return [];
  }
}

// Additional endpoint to view sequences table structure
router.get('/sequences-structure', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();

    const [tableExists] = await connection.query(`
      SELECT COUNT(*) as tableExists 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'sequences'
    `, [process.env.DB_NAME || 'your_database']);

    if (tableExists[0].tableExists === 0) {
      return res.json({
        success: false,
        message: 'Sequences table does not exist',
        suggestion: 'The sequences table might need to be created. Check your database migrations.'
      });
    }

    // Get table columns
    const columns = await getTableColumns(connection);
    
    // Get table indexes
    const indexes = await getTableIndexes(connection);
    
    // Get table row count
    const [rowCount] = await connection.query('SELECT COUNT(*) as total FROM sequences');
    
    // Get sample data
    const [sampleData] = await connection.query('SELECT * FROM sequences LIMIT 10');

    res.json({
      success: true,
      data: {
        tableName: 'sequences',
        exists: true,
        columns,
        indexes,
        rowCount: rowCount[0].total,
        sampleData
      }
    });

  } catch (error) {
    console.error('Error getting table structure:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get table structure: ' + error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Endpoint to create sequences table if it doesn't exist
router.post('/create-sequences-table', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS sequences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        collection VARCHAR(255) NOT NULL,
        targetCollection VARCHAR(255) NOT NULL,
        seq_value BIGINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_collection_unique (collection),
        UNIQUE KEY idx_targetCollection_unique (targetCollection)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await connection.query(createTableSQL);
    
    res.json({
      success: true,
      message: 'Sequences table created successfully or already exists'
    });

  } catch (error) {
    console.error('Error creating sequences table:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create table: ' + error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;