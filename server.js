import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import logger from './utils/logger.js';
import { initializeCollections } from './utils/dbInitializer.js';
import { createError } from './utils/errorUtils.js';
import app from './app.js'; // Import the app from app.js
import initializeApplication from './utils/initializeApplication.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const configureLogging = () => {
  const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'server.log');

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.accessSync(LOG_DIR, fs.constants.W_OK | fs.constants.R_OK);
  } catch (err) {
    logger.error('Log directory setup failed', { error: err.message });
    throw createError('Log directory initialization failed', 'INITIALIZATION_ERROR');
  }

  return {
    logStream: fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8', mode: 0o666 }),
    logFile: LOG_FILE
  };
};

const { logStream, logFile } = configureLogging();

const configureShutdown = () => {
  const shutdown = async (signal) => {
    logger.info(`Shutdown signal received: ${signal}`);
    try {
      await mongoose.connection.close();
      logStream.end(() => {
        logger.info('Shutdown completed');
        process.exit(0);
      });
    } catch (err) {
      logger.error('Error during shutdown', { error: err.message });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? reason.message : reason
    });
  });
};

const startServer = async () => {
  const PORT = process.env.PORT || 3001;

  try {
    await connectDB();
    await initializeApplication();

    const server = app.listen(PORT, () => {
      logger.info(`✅ Server started on port ${PORT}`, {
        environment: process.env.NODE_ENV || 'development',
        logFile,
        nodeVersion: process.version,
        pid: process.pid,
        clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
        buildPath: path.join(__dirname, 'build')
      });
    });

    configureShutdown();

    server.on('error', (err) => {
      logger.error('Server error', { error: err.message });
      process.exit(1);
    });
  } catch (error) {
    logger.error('❌ Server startup failed', {
      error: error.message,
      code: 'SERVER_STARTUP_ERROR',
      stack: error.stack
    });
    process.exit(1);
  }
};

startServer();