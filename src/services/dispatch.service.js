/**
 * Dispatch Service
 * ────────────────
 * Handles the business logic for assigning a driver to a ride request.
 *
 * Flow:
 *  1. When a ride is created, startDispatch() is called.
 *  2. We find all online, approved, subscribed drivers within SEARCH_RADIUS_METERS
 *     sorted by distance (nearest first, thanks to $nearSphere).
 *  3. We send the ride request to the nearest driver and start a 15-second timer.
 *  4. If the driver accepts  → ride is updated to 'driver_allocated', rider is notified.
 *  5. If the driver declines or the timer expires → we move to the next driver.
 *  6. If every driver is exhausted → ride is marked 'no_drivers', rider is notified.
 */

const { Ride, Driver } = require('../models');
const logger = require('../config/logger');

// How long (ms) to wait for a driver to respond before trying the next one
const DISPATCH_TIMEOUT_MS = 15000; // 15 seconds

// Radius (metres) to search for nearby drivers
const SEARCH_RADIUS_METERS = 10000; // 10 km

/**
 * In-memory store of active dispatches.
 * Key   : rideId (string)
 * Value : { riderId, currentDriverId, driverQueue, currentIndex, timer }
 */
const activeDispatches = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find all online, eligible drivers near the pickup point.
 * Results are sorted nearest-first automatically by MongoDB's $nearSphere.
 */
const findNearbyDrivers = async (pickup, vehicleType) => {
  return Driver.find({
    isOnline: true,
    status: 'approved',
    isSubscribed: true,
    'vehicle.type': vehicleType,
    currentLocation: {
      $nearSphere: {
        $geometry: {
          type: 'Point',
          coordinates: [pickup.coordinates[0], pickup.coordinates[1]], // [lng, lat]
        },
        $maxDistance: SEARCH_RADIUS_METERS,
      },
    },
  }).lean();
};

/**
 * Mark ride as 'no_drivers' and notify the rider via socket.
 */
const notifyNoDrivers = async (io, rideId, riderId) => {
  await Ride.findByIdAndUpdate(rideId, { status: 'no_drivers' });

  io.to(`user:${riderId}`).emit('ride:no_drivers_available', {
    rideId,
    message: 'No drivers are available in your area right now. Please try again later.',
  });

  activeDispatches.delete(rideId);
  logger.info(`Ride ${rideId}: no drivers available — status set to no_drivers`);
};

/**
 * Core dispatch loop — tries the driver at `currentIndex` in the queue.
 * If rejected / timed out, recurses with currentIndex + 1.
 */
const dispatchToNext = async (io, rideId, riderId, driverQueue, currentIndex) => {
  // All drivers exhausted
  if (currentIndex >= driverQueue.length) {
    await notifyNoDrivers(io, rideId, riderId);
    return;
  }

  // Ride might have been cancelled by the rider while we were waiting
  const ride = await Ride.findById(rideId).lean();
  if (!ride || ride.status !== 'searching') {
    activeDispatches.delete(rideId);
    logger.info(`Ride ${rideId}: no longer in 'searching' state — dispatch stopped`);
    return;
  }

  const currentDriver = driverQueue[currentIndex];
  const driverId = currentDriver._id.toString();

  logger.info(
    `Ride ${rideId}: sending request to driver ${driverId} (queue position ${currentIndex + 1}/${driverQueue.length})`
  );

  // Send the ride request to this specific driver
  io.to(`user:${driverId}`).emit('ride:new_request', {
    ride,
    timeoutSeconds: DISPATCH_TIMEOUT_MS / 1000,
  });

  // Start the 15-second countdown
  const timer = setTimeout(async () => {
    logger.info(`Ride ${rideId}: driver ${driverId} timed out — trying next driver`);

    // Inform the driver their window has closed
    io.to(`user:${driverId}`).emit('ride:request_expired', { rideId });

    // Move on
    await dispatchToNext(io, rideId, riderId, driverQueue, currentIndex + 1);
  }, DISPATCH_TIMEOUT_MS);

  activeDispatches.set(rideId, {
    riderId,
    currentDriverId: driverId,
    driverQueue,
    currentIndex,
    timer,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start the dispatch process for a newly created ride.
 * Called right after the ride document is saved.
 */
const startDispatch = async (io, ride) => {
  const rideId = ride._id.toString();
  const riderId = ride.rider.toString();

  logger.info(`Ride ${rideId}: starting dispatch for vehicleType=${ride.vehicleType}`);

  const driverQueue = await findNearbyDrivers(ride.pickup, ride.vehicleType);

  if (driverQueue.length === 0) {
    await notifyNoDrivers(io, rideId, riderId);
    return;
  }

  logger.info(`Ride ${rideId}: found ${driverQueue.length} nearby driver(s)`);
  await dispatchToNext(io, rideId, riderId, driverQueue, 0);
};

/**
 * Called when a driver accepts the current ride request.
 * Cancels the timer, updates the ride, and notifies the rider.
 */
const handleDriverAccept = async (io, rideId, driverId) => {
  const dispatch = activeDispatches.get(rideId);

  if (!dispatch) {
    return { success: false, message: 'No active dispatch found for this ride' };
  }

  if (dispatch.currentDriverId !== driverId) {
    return { success: false, message: 'You are not the driver currently being offered this ride' };
  }

  // Cancel the expiry timer immediately
  clearTimeout(dispatch.timer);
  activeDispatches.delete(rideId);

  // Persist the assignment
  const updatedRide = await Ride.findByIdAndUpdate(
    rideId,
    {
      status: 'driver_allocated',
      driver: driverId,
      'rideTimestamps.driverAllocatedAt': new Date(),
    },
    { new: true }
  )
    .populate('rider', 'name phone')
    .populate('driver', 'name phone vehicle profilePhotoUrl');

  if (!updatedRide) {
    return { success: false, message: 'Ride not found' };
  }

  // Tell the rider their driver is on the way
  io.to(`user:${dispatch.riderId}`).emit('ride:driver_assigned', {
    ride: updatedRide,
    message: 'A driver has accepted your ride and is on the way!',
  });

  logger.info(`Ride ${rideId}: accepted by driver ${driverId}`);
  return { success: true, ride: updatedRide };
};

/**
 * Called when a driver explicitly declines the ride request.
 * Cancels the timer and moves on to the next driver in the queue.
 */
const handleDriverDecline = async (io, rideId, driverId) => {
  const dispatch = activeDispatches.get(rideId);

  if (!dispatch) {
    return { success: false, message: 'No active dispatch found for this ride' };
  }

  if (dispatch.currentDriverId !== driverId) {
    return { success: false, message: 'You are not the driver currently being offered this ride' };
  }

  clearTimeout(dispatch.timer);

  const { riderId, driverQueue, currentIndex } = dispatch;
  logger.info(`Ride ${rideId}: declined by driver ${driverId} — trying next`);

  await dispatchToNext(io, rideId, riderId, driverQueue, currentIndex + 1);

  return { success: true };
};

/**
 * Cancel any active dispatch for a ride (e.g. rider cancelled).
 * Notifies the driver who currently holds the request (if any).
 */
const cancelDispatch = (io, rideId) => {
  const dispatch = activeDispatches.get(rideId);
  if (!dispatch) return;

  clearTimeout(dispatch.timer);

  // If a driver is currently holding the request, let them know
  if (dispatch.currentDriverId) {
    io.to(`user:${dispatch.currentDriverId}`).emit('ride:cancelled_by_rider', { rideId });
  }

  activeDispatches.delete(rideId);
  logger.info(`Ride ${rideId}: dispatch cancelled (rider cancelled the ride)`);
};

/**
 * Handle a driver socket disconnection.
 * If the disconnecting driver was currently holding a dispatch request,
 * treat it as a decline and move to the next driver.
 */
const handleDriverDisconnect = async (io, driverId) => {
  for (const [rideId, dispatch] of activeDispatches.entries()) {
    if (dispatch.currentDriverId === driverId) {
      logger.info(`Ride ${rideId}: driver ${driverId} disconnected — treating as decline`);
      await handleDriverDecline(io, rideId, driverId);
      break; // A driver can only hold one dispatch at a time
    }
  }
};

module.exports = {
  startDispatch,
  handleDriverAccept,
  handleDriverDecline,
  cancelDispatch,
  handleDriverDisconnect,
};
