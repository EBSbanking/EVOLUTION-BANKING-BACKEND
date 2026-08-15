// src/routes/LogRoutes.js
import express from 'express';
import { sequelize } from '../../config/db.js';
import { QueryTypes } from 'sequelize';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /api/logs/frontend - Receive frontend logs
router.post('/logs/frontend', async (req, res) => {
  try {
    const { logs, timestamp } = req.body;
    
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid logs data' 
      });
    }

    let savedCount = 0;
    let failedCount = 0;

    for (const log of logs) {
      try {
        // Determine event type based on log type
        let eventType = 'FRONTEND_LOG';
        let status = 'SUCCESS';
        
        switch (log.type) {
          case 'error':
            eventType = 'FRONTEND_ERROR';
            status = 'FAILED';
            break;
          case 'api':
            eventType = 'FRONTEND_API';
            status = log.status >= 400 ? 'FAILED' : 'SUCCESS';
            break;
          case 'activity':
            if (log.action === 'page_view') {
              eventType = 'FRONTEND_PAGE_VIEW';
            } else if (log.action === 'user_action') {
              eventType = 'FRONTEND_USER_ACTION';
            } else {
              eventType = 'FRONTEND_LOG';
            }
            break;
          default:
            eventType = 'FRONTEND_LOG';
        }

        // Generate a unique event ID
        const eventId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);

        // Prepare additional info
        const additionalInfo = {
          url: log.url || null,
          userAgent: log.userAgent || null,
          environment: log.environment || process.env.NODE_ENV || 'development',
          details: log.details || null,
          stack: log.stack || null,
          sessionId: log.sessionId || null,
          ...(log.type === 'api' && {
            method: log.method,
            endpoint: log.url,
            statusCode: log.status,
            duration: log.duration
          })
        };

        // Insert into audit_trail table
        await sequelize.query(`
          INSERT INTO audit_trail (
            event_id,
            user_id,
            event_type,
            action,
            description,
            entity_type,
            entity_id,
            ip_address,
            old_value,
            new_value,
            additional_info,
            status,
            created_at,
            updated_at,
            user_agent,
            endpoint,
            method
          ) VALUES (
            :eventId,
            :userId,
            :eventType,
            :action,
            :description,
            :entityType,
            :entityId,
            :ipAddress,
            :oldValue,
            :newValue,
            :additionalInfo,
            :status,
            NOW(),
            NOW(),
            :userAgent,
            :endpoint,
            :method
          )
        `, {
          replacements: {
            eventId: eventId,
            userId: log.userId || 'system',
            eventType: eventType,
            action: log.action || log.message || 'frontend_event',
            description: log.type === 'error' ? log.message : (log.action || 'Frontend event'),
            entityType: 'FRONTEND',
            entityId: log.sessionId || null,
            ipAddress: log.ipAddress || req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
            oldValue: null,
            newValue: log.type === 'error' ? JSON.stringify({ message: log.message, stack: log.stack }) : JSON.stringify(log.details || {}),
            additionalInfo: JSON.stringify(additionalInfo),
            status: status,
            userAgent: log.userAgent || req.headers['user-agent'] || null,
            endpoint: log.url || null,
            method: log.method || null
          },
          type: QueryTypes.INSERT
        });
        
        savedCount++;
        
        // Also log to Winston for server-side tracking
        if (log.type === 'error') {
          logger.error(`[FRONTEND:ERROR] ${log.message}`, {
            userId: log.userId,
            sessionId: log.sessionId,
            context: log.context,
            stack: log.stack,
            severity: log.severity,
            url: log.url
          });
        } else {
          logger.info(`[FRONTEND:${log.type.toUpperCase()}] ${log.action || log.message}`, {
            userId: log.userId,
            sessionId: log.sessionId,
            details: log.details,
            url: log.url
          });
        }
        
      } catch (insertError) {
        failedCount++;
        logger.error('Failed to insert frontend log:', insertError.message);
      }
    }

    logger.info(`✅ Saved ${savedCount} frontend logs to audit trail (${failedCount} failed)`);
    
    res.json({ 
      success: true, 
      received: logs.length, 
      saved: savedCount,
      failed: failedCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error processing frontend logs:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/logs/frontend - Get frontend logs (admin only)
router.get('/logs/frontend', async (req, res) => {
  try {
    const { limit = 100, offset = 0, startDate, endDate, type } = req.query;

    let whereClause = "event_type IN ('FRONTEND_LOG', 'FRONTEND_ERROR', 'FRONTEND_API', 'FRONTEND_PAGE_VIEW', 'FRONTEND_USER_ACTION')";
    const replacements = {};

    if (type) {
      whereClause += " AND event_type = :type";
      replacements.type = type;
    }

    if (startDate) {
      whereClause += " AND created_at >= :startDate";
      replacements.startDate = startDate;
    }

    if (endDate) {
      whereClause += " AND created_at <= :endDate";
      replacements.endDate = endDate;
    }

    // Get total count
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total FROM audit_trail WHERE ${whereClause}
    `, {
      replacements: replacements,
      type: QueryTypes.SELECT
    });

    // Get paginated results
    const results = await sequelize.query(`
      SELECT 
        event_id,
        user_id,
        event_type,
        action,
        description,
        entity_type,
        entity_id,
        ip_address,
        additional_info,
        status,
        created_at,
        updated_at,
        user_agent,
        endpoint,
        method
      FROM audit_trail 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: {
        ...replacements,
        limit: parseInt(limit),
        offset: parseInt(offset)
      },
      type: QueryTypes.SELECT
    });

    // Parse additional_info for each log
    const parsedResults = results.map(row => {
      let additionalInfo = {};
      try {
        additionalInfo = row.additional_info ? JSON.parse(row.additional_info) : {};
      } catch (e) {
        additionalInfo = { raw: row.additional_info };
      }

      return {
        ...row,
        additional_info: additionalInfo,
        url: additionalInfo.url || row.endpoint || null,
        user_agent: row.user_agent || additionalInfo.userAgent || null,
        details: additionalInfo.details || null,
        stack: additionalInfo.stack || null,
        environment: additionalInfo.environment || null,
        method: row.method || additionalInfo.method || null,
        duration: additionalInfo.duration || null,
        statusCode: additionalInfo.statusCode || null
      };
    });

    res.json({
      success: true,
      data: parsedResults,
      total: parseInt(countResult?.total || 0),
      limit: parseInt(limit),
      offset: parseInt(offset),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching frontend logs:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/logs/frontend/stats - Get frontend log statistics
router.get('/logs/frontend/stats', async (req, res) => {
  try {
    const { days = 7 } = req.query;

    // Get stats by event type
    const [typeStats] = await sequelize.query(`
      SELECT 
        event_type,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count
      FROM audit_trail
      WHERE event_type IN ('FRONTEND_LOG', 'FRONTEND_ERROR', 'FRONTEND_API', 'FRONTEND_PAGE_VIEW', 'FRONTEND_USER_ACTION')
        AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
      GROUP BY event_type
      ORDER BY count DESC
    `, {
      replacements: { days: parseInt(days) },
      type: QueryTypes.SELECT
    });

    // Get daily trends
    const [dailyStats] = await sequelize.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        COUNT(CASE WHEN event_type = 'FRONTEND_ERROR' THEN 1 END) as errors,
        COUNT(CASE WHEN event_type = 'FRONTEND_API' THEN 1 END) as api_calls,
        COUNT(CASE WHEN event_type = 'FRONTEND_PAGE_VIEW' THEN 1 END) as page_views
      FROM audit_trail
      WHERE event_type IN ('FRONTEND_LOG', 'FRONTEND_ERROR', 'FRONTEND_API', 'FRONTEND_PAGE_VIEW', 'FRONTEND_USER_ACTION')
        AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, {
      replacements: { days: parseInt(days) },
      type: QueryTypes.SELECT
    });

    // Get total counts
    const [totalResult] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN event_type = 'FRONTEND_ERROR' THEN 1 END) as total_errors,
        COUNT(CASE WHEN event_type = 'FRONTEND_API' THEN 1 END) as total_api_calls,
        COUNT(CASE WHEN event_type = 'FRONTEND_PAGE_VIEW' THEN 1 END) as total_page_views,
        COUNT(DISTINCT user_id) as unique_users
      FROM audit_trail
      WHERE event_type IN ('FRONTEND_LOG', 'FRONTEND_ERROR', 'FRONTEND_API', 'FRONTEND_PAGE_VIEW', 'FRONTEND_USER_ACTION')
        AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
    `, {
      replacements: { days: parseInt(days) },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        summary: {
          total: parseInt(totalResult?.total || 0),
          totalErrors: parseInt(totalResult?.total_errors || 0),
          totalApiCalls: parseInt(totalResult?.total_api_calls || 0),
          totalPageViews: parseInt(totalResult?.total_page_views || 0),
          uniqueUsers: parseInt(totalResult?.unique_users || 0),
          days: parseInt(days)
        },
        byType: typeStats.map(stat => ({
          ...stat,
          count: parseInt(stat.count),
          success_count: parseInt(stat.success_count || 0),
          failed_count: parseInt(stat.failed_count || 0)
        })),
        daily: dailyStats.map(stat => ({
          ...stat,
          count: parseInt(stat.count),
          errors: parseInt(stat.errors || 0),
          api_calls: parseInt(stat.api_calls || 0),
          page_views: parseInt(stat.page_views || 0)
        }))
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching frontend log stats:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// DELETE /api/logs/frontend - Clear frontend logs (admin only)
router.delete('/logs/frontend', async (req, res) => {
  try {
    const { olderThanDays = 30 } = req.query;

    const [result] = await sequelize.query(`
      DELETE FROM audit_trail
      WHERE event_type IN ('FRONTEND_LOG', 'FRONTEND_ERROR', 'FRONTEND_API', 'FRONTEND_PAGE_VIEW', 'FRONTEND_USER_ACTION')
        AND created_at < DATE_SUB(NOW(), INTERVAL :days DAY)
    `, {
      replacements: { days: parseInt(olderThanDays) },
      type: QueryTypes.DELETE
    });

    const deletedCount = result || 0;

    logger.info(`🗑️ Deleted ${deletedCount} frontend logs older than ${olderThanDays} days`);
    
    res.json({
      success: true,
      message: `Deleted ${deletedCount} frontend logs older than ${olderThanDays} days`,
      deletedCount: deletedCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error deleting frontend logs:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;