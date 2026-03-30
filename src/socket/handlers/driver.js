/**
 * Driver Socket Event Handlers
 * ─────────────────────────────
 * All events emitted BY the driver app and handled on the server.
 *
 * Events listened to:
 *   driver:go_online       - Driver taps "Go Online" in the app
 *   driver:go_offline      - Driver taps "Go Offline"
 *   driver:update_location - Periodic GPS updates (broadcasts to rider during active ride)
 *   driver:accept_ride     - Driver accepts a ride request notification
 *   driver:decline_ride    - Driver declines a ride request notification
 *   driver:arrived         - Driver arrived at pickup location
 *   driver:verify_otp      - Driver enters OTP to start the ride
 *   driver:complete_ride   - Driver completes the ride at destination
 *   driver:cancel_ride     - Driver cancels an assigned ride
 *   disconnect             - Socket disconnected (app closed / network lost)
 *
 * Events emitted TO the driver by the server (for reference):
 *   ride:new_request       - New ride offer with 15-second window
 *   ride:request_expired   - The 15-second window closed before response
 *   ride:cancelled_by_rider - Rider cancelled while driver had the offer
 */

const { Driver, Ride } = require('../../models');
const dispatchService = require('../../services/dispatch.service');
const rideService = require('../../services/ride.service');
const mapboxService = require('../../services/mapbox.service');
const logger = require('../../config/logger');

const setupDriverHandlers = (io, socket) => {
  const driverId = socket.userId;

  // ── driver:go_online ────────────────────────────────────────────────────
  // Payload: { latitude: number, longitude: number }
  // Callback: { success: boolean, message: string }
  socket.on('driver:go_online', async (data, callback) => {
    try {
      const { latitude, longitude } = data || {};

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return callback?.({ success: false, message: 'latitude and longitude (numbers) are required' });
      }

      // Only approved, subscribed drivers may go online
      const driver = await Driver.findById(driverId);
      if (!driver) {
        return callback?.({ success: false, message: 'Driver account not found' });
      }
      if (driver.status !== 'approved') {
        return callback?.({ success: false, message: 'Your account has not been approved yet' });
      }
      if (!driver.isSubscribed) {
        return callback?.({ success: false, message: 'An active subscription is required to go online' });
      }

      await Driver.findByIdAndUpdate(driverId, {
        isOnline: true,
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude], // GeoJSON order: [lng, lat]
        },
      });

      logger.info(`Driver ${driverId} is ONLINE at [${longitude}, ${latitude}]`);
      callback?.({ success: true, message: 'You are now online and can receive ride requests' });
    } catch (err) {
      logger.error(`driver:go_online error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: 'Failed to go online. Please try again.' });
    }
  });

  // ── driver:go_offline ───────────────────────────────────────────────────
  // Payload: (none)
  // Callback: { success: boolean, message: string }
  socket.on('driver:go_offline', async (data, callback) => {
    try {
      await Driver.findByIdAndUpdate(driverId, {
        isOnline: false,
        socketId: null,
      });

      // If this driver was holding a ride offer, release it to the next driver
      await dispatchService.handleDriverDisconnect(io, driverId);

      logger.info(`Driver ${driverId} is OFFLINE`);
      callback?.({ success: true, message: 'You are now offline' });
    } catch (err) {
      logger.error(`driver:go_offline error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: 'Failed to go offline. Please try again.' });
    }
  });

  // ── driver:accept_ride ──────────────────────────────────────────────────
  // Payload: { rideId: string }
  // Callback: { success: boolean, ride?: object, message?: string }
  socket.on('driver:accept_ride', async (data, callback) => {
    try {
      const { rideId } = data || {};

      if (!rideId) {
        return callback?.({ success: false, message: 'rideId is required' });
      }

      const result = await dispatchService.handleDriverAccept(io, rideId, driverId);
      callback?.(result);
    } catch (err) {
      logger.error(`driver:accept_ride error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: 'Failed to accept ride. Please try again.' });
    }
  });

  // ── driver:decline_ride ─────────────────────────────────────────────────
  // Payload: { rideId: string }
  // Callback: { success: boolean, message?: string }
  socket.on('driver:decline_ride', async (data, callback) => {
    try {
      const { rideId } = data || {};

      if (!rideId) {
        return callback?.({ success: false, message: 'rideId is required' });
      }

      const result = await dispatchService.handleDriverDecline(io, rideId, driverId);
      callback?.(result);
    } catch (err) {
      logger.error(`driver:decline_ride error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: 'Failed to decline ride. Please try again.' });
    }
  });

  // ── driver:update_location (broadcast to rider) ────────────────────────
  // When a driver has an active ride, broadcast their location to the rider
  // so the rider can see the driver moving on the map in real time.
  socket.on('driver:update_location', async (data, callback) => {
    try {
      const { latitude, longitude } = data || {};

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return callback?.({ success: false, message: 'latitude and longitude (numbers) are required' });
      }

      await Driver.findByIdAndUpdate(driverId, {
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
      });

      // If driver has an active ride, broadcast location to the rider
      const activeRide = await Ride.findOne({
        driver: driverId,
        status: { $in: ['driver_allocated', 'driver_arrived', 'in_progress'] },
      }).lean();

      if (activeRide) {
        // Calculate ETA from driver's current location to pickup (if driver hasn't arrived yet)
        let eta = null;
        if (['driver_allocated'].includes(activeRide.status)) {
          try {
            eta = await mapboxService.getETA([longitude, latitude], activeRide.pickup.coordinates);
          } catch (err) {
            logger.error(`ETA calculation failed for ride ${activeRide._id}: ${err.message}`);
          }
        }

        io.to(`user:${activeRide.rider.toString()}`).emit('ride:driver_location', {
          rideId: activeRide._id,
          location: { latitude, longitude },
          eta,
        });
      }

      callback?.({ success: true });
    } catch (err) {
      logger.error(`driver:update_location error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: 'Failed to update location' });
    }
  });

  // ── driver:arrived ────────────────────────────────────────────────────
  // Payload: { rideId: string }
  // Driver has arrived at the pickup location.
  socket.on('driver:arrived', async (data, callback) => {
    try {
      const { rideId } = data || {};
      if (!rideId) {
        return callback?.({ success: false, message: 'rideId is required' });
      }

      const ride = await rideService.driverArrived(rideId, driverId);
      callback?.({ success: true, ride });
    } catch (err) {
      logger.error(`driver:arrived error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: err.message || 'Failed to mark arrival' });
    }
  });

  // ── driver:verify_otp ─────────────────────────────────────────────────
  // Payload: { rideId: string, otp: string }
  // Driver enters the OTP shown on the rider's phone to start the ride.
  socket.on('driver:verify_otp', async (data, callback) => {
    try {
      const { rideId, otp } = data || {};
      if (!rideId || !otp) {
        return callback?.({ success: false, message: 'rideId and otp are required' });
      }

      const ride = await rideService.verifyOtpAndStartRide(rideId, driverId, otp);
      callback?.({ success: true, ride });
    } catch (err) {
      logger.error(`driver:verify_otp error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: err.message || 'OTP verification failed' });
    }
  });

  // ── driver:complete_ride ──────────────────────────────────────────────
  // Payload: { rideId: string }
  // Driver marks the ride as completed at the destination.
  socket.on('driver:complete_ride', async (data, callback) => {
    try {
      const { rideId } = data || {};
      if (!rideId) {
        return callback?.({ success: false, message: 'rideId is required' });
      }

      const ride = await rideService.completeRide(rideId, driverId);
      callback?.({ success: true, ride });
    } catch (err) {
      logger.error(`driver:complete_ride error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: err.message || 'Failed to complete ride' });
    }
  });

  // ── driver:cancel_ride ────────────────────────────────────────────────
  // Payload: { rideId: string, reason: string, customReason?: string }
  // Driver cancels an assigned ride before the trip starts.
  socket.on('driver:cancel_ride', async (data, callback) => {
    try {
      const { rideId, reason, customReason } = data || {};
      if (!rideId || !reason) {
        return callback?.({ success: false, message: 'rideId and reason are required' });
      }

      const ride = await rideService.cancelRideByDriver(rideId, driverId, { reason, customReason });
      callback?.({ success: true, ride });
    } catch (err) {
      logger.error(`driver:cancel_ride error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: err.message || 'Failed to cancel ride' });
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', async (reason) => {
    try {
      logger.info(`Driver ${driverId} socket disconnected (reason: ${reason})`);

      // Mark driver offline in DB
      await Driver.findByIdAndUpdate(driverId, {
        isOnline: false,
        socketId: null,
      });

      // If this driver was holding an active ride offer, treat it as a decline
      await dispatchService.handleDriverDisconnect(io, driverId);
    } catch (err) {
      logger.error(`Driver ${driverId} disconnect handler error: ${err.message}`);
    }
  });
};

module.exports = { setupDriverHandlers };
