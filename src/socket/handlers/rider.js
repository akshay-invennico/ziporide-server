/**
 * Rider Socket Event Handlers
 * ────────────────────────────
 * Riders connect to the socket server so they can receive real-time updates
 * about their ride without polling the REST API.
 *
 * The rider does NOT emit actions through the socket (all rider actions go
 * through the REST API). This file only handles the connection lifecycle.
 *
 * Events emitted TO the rider by the server (for reference):
 *   ride:driver_assigned      - A driver accepted and is on the way
 *   ride:no_drivers_available - No drivers found in the area
 */

const logger = require('../../config/logger');

const setupRiderHandlers = (io, socket) => {
  const riderId = socket.userId;

  logger.info(`Rider ${riderId} connected to socket`);

  socket.on('disconnect', (reason) => {
    logger.info(`Rider ${riderId} socket disconnected (reason: ${reason})`);
  });
};

module.exports = { setupRiderHandlers };
