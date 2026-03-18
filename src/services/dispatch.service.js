/**
 * Dispatch Service
 * ────────────────
 * Handles the business logic for assigning a driver to a ride request.
 *
 * Full flow:
 *  1. Ride is created → startDispatch() is called.
 *  2. Find all online, approved, subscribed drivers within 10 km, matching
 *     vehicle type, sorted by distance (nearest first via $nearSphere).
 *  3. Skip any driver who:
 *       a) Already has an active ride (driver_allocated / driver_arrived / in_progress)
 *       b) Is currently receiving a request for a different ride
 *  4. Emit ride:new_request to the chosen driver and start a 15-second timer.
 *  5. Driver accepts  → stop timer, set ride to driver_allocated, notify rider.
 *  6. Driver declines → stop timer, move to the next eligible driver.
 *  7. Timer expires   → notify driver (request_expired), move to next driver.
 *  8. All drivers exhausted → set ride to no_drivers, notify rider.
 *
 * Edge cases handled:
 *  - Rider cancels while dispatch is running   → cancelDispatch()
 *  - Driver socket disconnects mid-offer       → handleDriverDisconnect()
 *  - Driver goes offline via REST while queued → handleDriverDisconnect()
 *  - Two rides competing for the same driver   → driversWithPendingRequest Set
 *  - Driver already has an active ride         → excluded from Mongo query
 *  - Race condition on simultaneous accepts    → Map.delete() is synchronous
 */

const { Ride, Driver } = require('../models');
const logger = require('../config/logger');

const DISPATCH_TIMEOUT_MS = 15000; // 15 seconds per driver
const SEARCH_RADIUS_METERS = 10000; // 10 km

/**
 * Active dispatch state.
 * Key   : rideId (string)
 * Value : { riderId, currentDriverId, driverQueue, currentIndex, timer }
 */
const activeDispatches = new Map();

/**
 * Drivers currently holding a live ride offer.
 * Prevents the same driver from getting two simultaneous requests
 * when multiple rides are dispatching at the same time.
 */
const driversWithPendingRequest = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find all online, eligible drivers near the pickup point.
 * Excludes drivers who already have an active ride assigned.
 * Results are sorted nearest-first by MongoDB's $nearSphere.
 */
const findNearbyDrivers = async (pickup, vehicleType) => {
  // Find driver IDs that already have an active ride so we can exclude them
  const busyDrivers = await Ride.distinct('driver', {
    driver: { $ne: null },
    status: { $in: ['driver_allocated', 'driver_arrived', 'in_progress'] },
  });

  return Driver.find({
    isOnline: true,
    status: 'approved',
    isSubscribed: true,
    isBankLinked: true,
    'vehicle.type': vehicleType,
    _id: { $nin: busyDrivers }, // Exclude drivers on an active ride
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
 * Build the payload sent to the driver's app.
 * Fetches a fresh, populated ride so the driver sees all the details.
 */
const buildRidePayload = async (rideId) => {
  return Ride.findById(rideId)
    .populate('rider', 'name phone profilePhotoUrl')
    .lean();
};

/**
 * Mark ride as 'no_drivers' and notify the rider.
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
 * Automatically skips drivers who are currently receiving another offer.
 */
const dispatchToNext = async (io, rideId, riderId, driverQueue, currentIndex) => {
  // All drivers in the queue have been tried
  if (currentIndex >= driverQueue.length) {
    await notifyNoDrivers(io, rideId, riderId);
    return;
  }

  // Ride might have been cancelled or already allocated while we were waiting
  const ride = await Ride.findById(rideId).lean();
  if (!ride || ride.status !== 'searching') {
    activeDispatches.delete(rideId);
    logger.info(`Ride ${rideId}: status is '${ride?.status}' — dispatch stopped`);
    return;
  }

  const currentDriver = driverQueue[currentIndex];
  const driverId = currentDriver._id.toString();

  // Skip this driver if they're already receiving a request for another ride
  if (driversWithPendingRequest.has(driverId)) {
    logger.info(`Ride ${rideId}: driver ${driverId} already has a pending request — skipping`);
    await dispatchToNext(io, rideId, riderId, driverQueue, currentIndex + 1);
    return;
  }

  // Also verify the driver is still online (they may have gone offline since query)
  const driverDoc = await Driver.findById(driverId, 'isOnline').lean();
  if (!driverDoc || !driverDoc.isOnline) {
    logger.info(`Ride ${rideId}: driver ${driverId} is no longer online — skipping`);
    await dispatchToNext(io, rideId, riderId, driverQueue, currentIndex + 1);
    return;
  }

  logger.info(`Ride ${rideId}: sending request to driver ${driverId} (${currentIndex + 1}/${driverQueue.length})`);

  // Fetch a populated ride so the driver sees rider info, pickup, destination, fare
  const ridePayload = await buildRidePayload(rideId);

  // Mark driver as having a pending request before emitting
  driversWithPendingRequest.add(driverId);

  // Send the offer to this driver's socket room
  io.to(`user:${driverId}`).emit('ride:new_request', {
    ride: ridePayload,
    timeoutSeconds: DISPATCH_TIMEOUT_MS / 1000,
  });

  // Start the 15-second countdown
  const timer = setTimeout(async () => {
    logger.info(`Ride ${rideId}: driver ${driverId} timed out — trying next`);
    driversWithPendingRequest.delete(driverId);

    // Tell the driver their window closed
    io.to(`user:${driverId}`).emit('ride:request_expired', { rideId });

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
 * Start dispatching a newly created ride to nearby drivers.
 * Called right after the ride document is saved in ride.service.js.
 */
const startDispatch = async (io, ride) => {
  const rideId = ride._id.toString();
  const riderId = ride.rider.toString();

  logger.info(`Ride ${rideId}: starting dispatch | vehicleType=${ride.vehicleType}`);

  const driverQueue = await findNearbyDrivers(ride.pickup, ride.vehicleType);

  if (driverQueue.length === 0) {
    logger.info(`Ride ${rideId}: no eligible drivers found within ${SEARCH_RADIUS_METERS / 1000} km`);
    await notifyNoDrivers(io, rideId, riderId);
    return;
  }

  logger.info(`Ride ${rideId}: ${driverQueue.length} eligible driver(s) found`);
  await dispatchToNext(io, rideId, riderId, driverQueue, 0);
};

/**
 * Driver accepts the current ride offer.
 * Stops the timer, assigns driver to ride, notifies rider.
 */
const handleDriverAccept = async (io, rideId, driverId) => {
  const dispatch = activeDispatches.get(rideId);

  if (!dispatch) {
    return { success: false, message: 'This ride request is no longer active' };
  }

  if (dispatch.currentDriverId !== driverId) {
    return { success: false, message: 'You are not the driver currently being offered this ride' };
  }

  // Clear timer and state immediately (synchronous — prevents race conditions)
  clearTimeout(dispatch.timer);
  activeDispatches.delete(rideId);
  driversWithPendingRequest.delete(driverId);

  // Double-check the ride is still in searching state before assigning
  const currentRide = await Ride.findById(rideId).lean();
  if (!currentRide || currentRide.status !== 'searching') {
    return { success: false, message: 'This ride is no longer available for acceptance' };
  }

  // Assign the driver to the ride
  const updatedRide = await Ride.findByIdAndUpdate(
    rideId,
    {
      status: 'driver_allocated',
      driver: driverId,
      'rideTimestamps.driverAllocatedAt': new Date(),
    },
    { new: true }
  )
    .populate('rider', 'name phone profilePhotoUrl')
    .populate('driver', 'name phone vehicle profilePhotoUrl currentLocation');

  if (!updatedRide) {
    return { success: false, message: 'Ride not found' };
  }

  // Notify the rider that their driver is confirmed
  io.to(`user:${dispatch.riderId}`).emit('ride:driver_assigned', {
    ride: updatedRide,
    driver: {
      id: updatedRide.driver._id,
      name: updatedRide.driver.name,
      phone: updatedRide.driver.phone,
      profilePhotoUrl: updatedRide.driver.profilePhotoUrl,
      vehicle: updatedRide.driver.vehicle,
      currentLocation: updatedRide.driver.currentLocation,
    },
    message: 'A driver has accepted your ride and is on the way!',
  });

  logger.info(`Ride ${rideId}: accepted by driver ${driverId}`);
  return { success: true, ride: updatedRide };
};

/**
 * Driver explicitly declines the ride offer.
 * Stops the timer and moves to the next driver.
 */
const handleDriverDecline = async (io, rideId, driverId) => {
  const dispatch = activeDispatches.get(rideId);

  if (!dispatch) {
    return { success: false, message: 'This ride request is no longer active' };
  }

  if (dispatch.currentDriverId !== driverId) {
    return { success: false, message: 'You are not the driver currently being offered this ride' };
  }

  clearTimeout(dispatch.timer);
  driversWithPendingRequest.delete(driverId);

  const { riderId, driverQueue, currentIndex } = dispatch;
  logger.info(`Ride ${rideId}: declined by driver ${driverId} — moving to next`);

  await dispatchToNext(io, rideId, riderId, driverQueue, currentIndex + 1);

  return { success: true, message: 'Ride declined' };
};

/**
 * Cancel all dispatch activity for a ride.
 * Called when a rider cancels their ride or the ride is forcefully stopped.
 * Notifies the driver who currently holds the offer.
 */
const cancelDispatch = (io, rideId) => {
  const dispatch = activeDispatches.get(rideId);
  if (!dispatch) return;

  clearTimeout(dispatch.timer);
  driversWithPendingRequest.delete(dispatch.currentDriverId);

  // Tell the current driver the offer is gone
  if (dispatch.currentDriverId) {
    io.to(`user:${dispatch.currentDriverId}`).emit('ride:cancelled_by_rider', {
      rideId,
      message: 'The rider has cancelled this ride request.',
    });
  }

  activeDispatches.delete(rideId);
  logger.info(`Ride ${rideId}: dispatch cancelled`);
};

/**
 * Handle a driver going offline (socket disconnect or REST API call).
 * If they were holding a live ride offer, treat it as a decline so the
 * next driver in the queue is tried immediately.
 */
const handleDriverDisconnect = async (io, driverId) => {
  driversWithPendingRequest.delete(driverId);

  for (const [rideId, dispatch] of activeDispatches.entries()) {
    if (dispatch.currentDriverId === driverId) {
      logger.info(`Ride ${rideId}: driver ${driverId} went offline — treating as decline`);
      await handleDriverDecline(io, rideId, driverId);
      break; // A driver can only hold one offer at a time
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
