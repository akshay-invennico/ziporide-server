const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const { initSocket } = require('./socket');
const { initFirebase } = require('./config/firebase');

let server;

mongoose.connect(config.mongoose.url, config.mongoose.options).then(async () => {
  logger.info('Connected to MongoDB');

  // Drop stale email_1 index (created without partialFilterExpression) so Mongoose
  // can recreate it correctly. Safe to run every startup — dropIndex is a no-op if
  // the correct partial index already exists under a different internal name.
  try {
    const userCollection = mongoose.connection.collection('users');
    const indexes = await userCollection.indexes();
    const staleIndex = indexes.find((idx) => idx.name === 'email_1' && !idx.partialFilterExpression);
    if (staleIndex) {
      await userCollection.dropIndex('email_1');
      logger.info('Dropped stale email_1 index — will be recreated with partialFilterExpression');
      await mongoose.model('User').syncIndexes();
    }
  } catch (err) {
    logger.warn('Index migration check failed (non-fatal):', err.message);
  }

  initFirebase();

  server = http.createServer(app);
  await initSocket(server);
  server.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);
  });
});

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
});
