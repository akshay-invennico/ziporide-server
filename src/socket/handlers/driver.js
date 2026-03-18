/**
 * Driver Socket Event Handlers
 * ─────────────────────────────
 * All events emitted BY the driver app and handled on the server.
 *
 * Events listened to:
 *   driver:go_online      - Driver taps "Go Online" in the app
 *   driver:go_offline     - Driver taps "Go Offline"
 *   driver:update_location- Periodic GPS location updates (while online)
 *   driver:accept_ride    - Driver accepts a ride request notification
 *   driver:decline_ride   - Driver declines a ride request notification
 *   disconnect            - Socket disconnected (app closed / network lost)
 *
 * Events emitted TO the driver by the server (for reference):
 *   ride:new_request      - New ride offer with 15-second window
 *   ride:request_expired  - The 15-second window closed before response
 *   ride:cancelled_by_rider - Rider cancelled while driver had the offer
 */

const { Driver } = require('../../models');
const dispatchService = require('../../services/dispatch.service');
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
        socketId: socket.id,
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

  // ── driver:update_location ──────────────────────────────────────────────
  // Payload: { latitude: number, longitude: number }
  // Callback: { success: boolean }
  // Should be called every few seconds while the driver is online / on a trip.
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

      callback?.({ success: true });
    } catch (err) {
      logger.error(`driver:update_location error for ${driverId}: ${err.message}`);
      callback?.({ success: false, message: 'Failed to update location' });
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
