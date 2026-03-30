const httpStatus = require('http-status');
const { Driver } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * Go Online
 * Sets the driver as online and stores their initial GPS location.
 * Only approved, subscribed drivers may go online.
 *
 * @param {string} driverId
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<object>}
 */
const goOnline = async (driverId, latitude, longitude) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (driver.status !== 'approved') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Your account must be approved before going online');
  }

  if (!driver.isBankLinked) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Please link your bank account before going online');
  }

  if (!driver.isSubscribed) {
    throw new ApiError(httpStatus.FORBIDDEN, 'An active subscription is required to go online');
  }

  const updated = await Driver.findByIdAndUpdate(
    driverId,
    {
      isOnline: true,
      currentLocation: {
        type: 'Point',
        coordinates: [longitude, latitude], // GeoJSON order: [lng, lat]
      },
    },
    { new: true, select: 'isOnline currentLocation name vehicle status isSubscribed' }
  );

  logger.info(`Driver ${driverId} went ONLINE at [${longitude}, ${latitude}]`);

  return {
    isOnline: updated.isOnline,
    location: {
      latitude,
      longitude,
    },
    message: 'You are now online and will receive ride requests',
  };
};

/**
 * Go Offline
 * Marks the driver as offline. Also cancels any active dispatch request
 * so the next driver in the queue is tried immediately.
 *
 * @param {string} driverId
 * @returns {Promise<object>}
 */
const goOffline = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  await Driver.findByIdAndUpdate(driverId, { isOnline: false });

  // If this driver was holding an active dispatch offer, move to the next driver
  setImmediate(async () => {
    try {
      const { getIO } = require('../socket');
      const { handleDriverDisconnect } = require('./dispatch.service');
      const io = getIO();
      await handleDriverDisconnect(io, driverId);
    } catch {
      // Socket may not be available or no active dispatch — safe to ignore
    }
  });

  logger.info(`Driver ${driverId} went OFFLINE`);

  return {
    isOnline: false,
    message: 'You are now offline and will not receive ride requests',
  };
};

/**
 * Update Location
 * Updates the driver's real-time GPS coordinates while online.
 * Called periodically by the app (e.g. every 5–10 seconds while on a trip).
 *
 * @param {string} driverId
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<object>}
 */
const updateLocation = async (driverId, latitude, longitude) => {
  const driver = await Driver.findById(driverId, 'isOnline');
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (!driver.isOnline) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You must be online to update your location');
  }

  await Driver.findByIdAndUpdate(driverId, {
    currentLocation: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
  });

  return {
    latitude,
    longitude,
    updatedAt: new Date(),
  };
};

/**
 * Get Status
 * Returns the driver's current online status and last known location.
 *
 * @param {string} driverId
 * @returns {Promise<object>}
 */
const getStatus = async (driverId) => {
  const driver = await Driver.findById(driverId, 'isOnline currentLocation isSubscribed isBankLinked status');

  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  const [longitude, latitude] = driver.currentLocation?.coordinates || [];

  return {
    isOnline: driver.isOnline,
    isSubscribed: driver.isSubscribed,
    isBankLinked: driver.isBankLinked,
    accountStatus: driver.status,
    location: driver.currentLocation?.coordinates?.length ? { latitude, longitude } : null,
  };
};

module.exports = {
  goOnline,
  goOffline,
  updateLocation,
  getStatus,
};
