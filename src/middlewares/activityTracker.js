// middleware/activityTracker.js
import UserActivityLog from '../models/UserActivityLog.js';
import UserSession from '../models/UserSession.js';

export const trackActivity = async (req, res, next) => {
  const startTime = Date.now();
  
  // Store original send to capture response
  const originalSend = res.send;
  let responseBody;
  
  res.send = function(data) {
    responseBody = data;
    return originalSend.call(this, data);
  };
  
  // Track after response is sent
  res.on('finish', async () => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (userId) {
        // Find active session
        const session = await UserSession.findOne({
          where: {
            user_id: userId,
            token: token,
            is_active: true,
            logout_time: null
          }
        });
        
        const responseTime = Date.now() - startTime;
        
        // Determine action type
        let actionType = 'VIEW_PAGE';
        if (req.method === 'POST') actionType = 'CREATE';
        else if (req.method === 'PUT' || req.method === 'PATCH') actionType = 'UPDATE';
        else if (req.method === 'DELETE') actionType = 'DELETE';
        else if (req.path.includes('login')) actionType = 'LOGIN';
        else if (req.path.includes('logout')) actionType = 'LOGOUT';
        else if (req.path.includes('export')) actionType = 'EXPORT';
        else if (req.path.includes('import')) actionType = 'IMPORT';
        else if (req.path.includes('search')) actionType = 'SEARCH';
        
        // Log activity
        await UserActivityLog.create({
          user_id: userId,
          session_id: session?.id || null,
          action_type: actionType,
          action: `${req.method} ${req.path}`,
          description: `${req.method} request to ${req.path}`,
          url: req.originalUrl,
          method: req.method,
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.headers['user-agent'],
          request_body: req.method !== 'GET' ? req.body : null,
          response_status: res.statusCode,
          response_time: responseTime,
          error_message: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null,
          metadata: {
            query: req.query,
            params: req.params,
            responseTime: responseTime,
            contentLength: res.get('content-length')
          }
        });
        
        // Update session request count
        if (session) {
          await session.increment('request_count');
        }
      }
    } catch (error) {
      console.error('Activity tracking error:', error);
    }
  });
  
  next();
};