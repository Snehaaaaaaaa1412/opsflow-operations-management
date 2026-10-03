import app from './app';
import { config } from './config';
import { logger } from './utils/logger';

const server = app.listen(config.port, () => {
  logger.info(`🚀 OpsFlow backend running on port ${config.port}`, {
    env: config.nodeEnv,
  });
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
