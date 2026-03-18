/**
 * Socket.io Initialisation
 * ─────────────────────────
 * Sets up the Socket.io server and attaches it to the existing HTTP server.
 *
 * Architecture:
 *  - Every connected client (driver or rider) authenticates via JWT.
 *  - After auth, each client joins a private room: "user:<userId>"
 *    This allows the server to send targeted events with io.to("user:X").emit(...)
 *  - Drivers get driver-specific event handlers.
 *  - Riders get rider-specific event handlers.
 */

const socketIO = require('socket.io');
const { socketAuthMiddleware } = require('./socketAuth');
const { setupDriverHandlers } = require('./handlers/driver');
const { setupRiderHandlers } = require('./handlers/rider');
const { Driver } = require('../models');
const logger = require('../config/logger');

let io;

/**
 * Initialise Socket.io on the given HTTP server.
 * Call this once, right after the HTTP server is created.
 * @param {http.Server} httpServer
 * @returns {SocketIO.Server} io instance
 */
const initSocket = async (httpServer) => {
  io = socketIO(httpServer, {
    cors: {
      origin: '*', // tighten this to your frontend origin in production
      methods: ['GET', 'POST'],
    },
  });

  // Reset all drivers to offline on server start.
  // This handles the case where the server restarts while drivers were marked online.
  try {
    await Driver.updateMany({ isOnline: true }, { $set: { isOnline: false, socketId: null } });
    logger.info('Socket init: reset all drivers to offline');
  } catch (err) {
    logger.error(`Socket init: failed to reset driver online status — ${err.message}`);
  }

  // Apply JWT authentication to every incoming connection
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const { userId, userRole } = socket;

    logger.info(`Socket connected | id=${socket.id} | userId=${userId} | role=${userRole}`);

    // Join a private room named after the user's DB id.
    // The server uses io.to("user:<id>").emit(...) to send targeted messages.
    socket.join(`user:${userId}`);

    if (userRole === 'driver') {
      setupDriverHandlers(io, socket);
    } else if (userRole === 'rider') {
      setupRiderHandlers(io, socket);
    }
  });

  logger.info('Socket.io initialised');
  return io;
};

/**
 * Return the existing io instance.
 * Throws if initSocket has not been called yet.
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialised. Call initSocket(httpServer) first.');
  }
  return io;
};

module.exports = { initSocket, getIO };
