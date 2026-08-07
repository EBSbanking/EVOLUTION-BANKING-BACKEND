// middleware/sessionTracker.js

import UserSession from '../models/UserSession.js';
import User from '../models/User.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';

const parseUserAgent = (userAgent) => {
  if (!userAgent) return { browser: 'Unknown', os: 'Unknown', device: 'desktop' };
  
  const ua = userAgent.toLowerCase();
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'desktop';
  
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('opera')) browser = 'Opera';
  
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone')) os = 'iOS';
  
  if (ua.includes('mobile')) device = 'mobile';
  else if (ua.includes('tablet')) device = 'tablet';
  
  return { browser, os, device };
};

export const trackSession = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const userId = req.user?.userId || req.user?.id;
    
    if (userId && token) {
      const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || '';
      const { browser, os, device } = parseUserAgent(userAgent);
      
      let session = await UserSession.findOne({
        where: {
          user_id: userId,
          token: token,
          is_active: true,
          logout_time: null
        }
      });
      
      if (!session) {
        session = await UserSession.create({
          user_id: userId,
          session_id: `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          token: token,
          ip_address: ipAddress,
          user_agent: userAgent,
          login_time: new Date(),
          last_activity: new Date(),
          is_active: true,
          device_type: device,
          browser: browser,
          os: os,
          session_duration: 0,
          request_count: 1,
          last_request_url: req.originalUrl || req.url,
          last_request_method: req.method
        });
        console.log(`✅ Session created for user ${userId}: ${session.session_id}`);
      } else {
        await session.update({
          last_activity: new Date(),
          request_count: session.request_count + 1,
          last_request_url: req.originalUrl || req.url,
          last_request_method: req.method,
          session_duration: Math.floor((Date.now() - new Date(session.login_time).getTime()) / 1000)
        });
      }
    }
  } catch (error) {
    console.error('Session tracking error:', error);
  }
  
  next();
};

export const logoutSession = async (userId, token) => {
  try {
    await UserSession.update(
      {
        is_active: false,
        logout_time: new Date(),
        session_duration: sequelize.literal(`TIMESTAMPDIFF(SECOND, login_time, NOW())`)
      },
      {
        where: {
          user_id: userId,
          token: token,
          is_active: true
        }
      }
    );
    console.log(`✅ Session ended for user ${userId}`);
  } catch (error) {
    console.error('Logout session error:', error);
  }
};

export const getActiveSessions = async (userId = null) => {
  try {
    const whereClause = {
      is_active: true,
      logout_time: null
    };
    
    if (userId) {
      whereClause.user_id = userId;
    }
    
    const sessions = await UserSession.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'User',  // ✅ Use the alias defined in the association
          attributes: ['id', 'user_name', 'email', 'first_name', 'last_name', 'primary_business_role', 'BU_ROLE_ID', 'status']
        }
      ],
      order: [['last_activity', 'DESC']]
    });
    
    return sessions;
  } catch (error) {
    console.error('Get active sessions error:', error);
    return [];
  }
};

export const createUserSession = async (userId, token, req) => {
  try {
    const ipAddress = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';
    const { browser, os, device } = parseUserAgent(userAgent);
    
    const sessionId = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Check if session already exists
    let session = await UserSession.findOne({
      where: {
        user_id: userId,
        token: token,
        is_active: true,
        logout_time: null
      }
    });
    
    if (!session) {
      session = await UserSession.create({
        user_id: userId,
        session_id: sessionId,
        token: token,
        ip_address: ipAddress,
        user_agent: userAgent,
        login_time: new Date(),
        last_activity: new Date(),
        is_active: true,
        device_type: device,
        browser: browser,
        os: os,
        session_duration: 0,
        request_count: 0
      });
      
      console.log(`✅ Session created for user ${userId}: ${sessionId}`);
    } else {
      await session.update({
        last_activity: new Date(),
        ip_address: ipAddress,
        user_agent: userAgent,
        device_type: device,
        browser: browser,
        os: os
      });
      console.log(`✅ Session updated for user ${userId}: ${session.session_id}`);
    }
    
    return session;
  } catch (error) {
    console.error('❌ Error creating user session:', error.message);
    return null;
  }
};

export const endUserSession = async (userId, token) => {
  try {
    const session = await UserSession.findOne({
      where: {
        user_id: userId,
        token: token,
        is_active: true,
        logout_time: null
      }
    });
    
    if (session) {
      await session.update({
        is_active: false,
        logout_time: new Date(),
        session_duration: Math.floor((Date.now() - new Date(session.login_time).getTime()) / 1000)
      });
      
      console.log(`✅ Session ended for user ${userId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error ending session:', error.message);
    return false;
  }
};

export default {
  createUserSession,
  endUserSession,
  trackSession,
  logoutSession,
  getActiveSessions
};