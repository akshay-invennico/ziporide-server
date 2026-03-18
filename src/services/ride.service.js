const httpStatus = require('http-status');
const { Ride } = require('../models');
const ApiError = require('../utils/ApiError');
const dispatchService = require('./dispatch.service');
const logger = require('../config/logger');
const config = require('../config/config');

// Fare table per vehicle type (in GBP)
const FARE_CONFIG = {
  electric:  { baseFare: 1.99, perKm: 0.8,  perMinute: 0.1  },
  standard:  { baseFare: 2.50, perKm: 1.2,  perMinute: 0.15 },
  xl:        { baseFare: 3.50, perKm: 1.5,  perMinute: 0.18 },
  executive: { baseFare: 5.00, perKm: 2.0,  perMinute: 0.25 },
};

/**
 * Calculate estimated fare.
 * Distance / duration are placeholders until a routing API is integrated.
 */
const calculateFare = (vehicleType, distanceKm = 0, durationMin = 0, surgeMultiplier = 1) => {
  const cfg = FARE_CONFIG[vehicleType] || FARE_CONFIG.standard;
  const distanceFare   = parseFloat((distanceKm  * cfg.perKm).toFixed(2));
  const timeFare       = parseFloat((durationMin * cfg.perMinute).toFixed(2));
  const subtotal       = cfg.baseFare + distanceFare + timeFare;
  const totalFare      = parseFloat((subtotal * surgeMultiplier).toFixed(2));

  return {
    baseFare: cfg.baseFare,
    distanceFare,
    timeFare,
    surgeMultiplier,
    totalFare,
    estimatedFare: totalFare,
    currency: config.stripe.currency, // Always GBP
  };
};

/** Generate a 4-digit pickup OTP for driver verification at pickup point. */
const generatePickupOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

/**
 * Create a new ride request.
 * Responds immediately with the ride document, then kicks off dispatch
 * asynchronously so the HTTP response is not delayed.
 */
const createRide = async (riderId, rideData) => {
  const { pickup, stops = [], destination, vehicleType, paymentMethod, estimatedFare } = rideData;

  // Block if rider already has an active ride
  const activeRide = await Ride.findOne({
    rider: riderId,
    status: { $in: ['searching', 'driver_allocated', 'driver_arrived', 'in_progress'] },
  });
  if (activeRide) {
    throw new ApiError(httpStatus.CONFLICT, 'You already have an active ride in progress');
  }

  const fareBreakdown = calculateFare(vehicleType);
  if (estimatedFare) fareBreakdown.estimatedFare = estimatedFare;

  const ride = await Ride.create({
    rider: riderId,
    pickup,
    stops,
    destination,
    vehicleType,
    paymentMethod: paymentMethod || undefined,
    fare: fareBreakdown,
    pickupOtp: generatePickupOtp(),
    status: 'searching',
  });

  // Dispatch is fire-and-forget — rider gets updates via socket
  setImmediate(async () => {
    try {
      const { getIO } = require('../socket');
      await dispatchService.startDispatch(getIO(), ride);
    } catch (err) {
      logger.error(`Dispatch failed for ride ${ride._id}: ${err.message}`);
    }
  });

  return ride;
};

/**
 * Get a single ride by id.
 * Riders can only view their own rides. Drivers can only view their own rides.
 */
const getRideById = async (rideId, requesterId, requesterRole = 'rider') => {
  const ride = await Ride.findById(rideId)
    .populate('rider',  'name phone profilePhotoUrl')
    .populate('driver', 'name phone vehicle profilePhotoUrl currentLocation');

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }

  if (requesterRole === 'rider' && ride.rider._id.toString() !== requesterId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorised to view this ride');
  }

  if (requesterRole === 'driver' && ride.driver?._id.toString() !== requesterId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorised to view this ride');
  }

  return ride;
};

/**
 * Paginated list of rides for the authenticated rider.
 */
const getRidesByRider = async (riderId, filter = {}, options = {}) => {
  const query = { rider: riderId, ...filter };
  return Ride.paginate(query, {
    page:    options.page    || 1,
    limit:   options.limit   || 10,
    sortBy:  options.sortBy  || 'createdAt:desc',
    populate: 'driver',
  });
};

/**
 * Cancel a ride (rider only).
 * Allowed only when status is 'searching' or 'driver_allocated'.
 * Cancels any active dispatch and notifies the current driver via socket.
 */
const cancelRide = async (rideId, riderId, cancellationData) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }
  if (ride.rider.toString() !== riderId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorised to cancel this ride');
  }

  const cancellableStatuses = ['searching', 'driver_allocated'];
  if (!cancellableStatuses.includes(ride.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Ride cannot be cancelled at this stage (current status: '${ride.status}')`
    );
  }

  ride.status = 'cancelled';
  ride.cancellation = {
    cancelledBy: 'rider',
    reason: cancellationData.reason,
    customReason: cancellationData.customReason || undefined,
    cancelledAt: new Date(),
  };
  ride.rideTimestamps.cancelledAt = new Date();
  await ride.save();

  // Kill the dispatch loop and notify the current driver immediately
  setImmediate(() => {
    try {
      const { getIO } = require('../socket');
      dispatchService.cancelDispatch(getIO(), rideId);
    } catch {
      // Safe to ignore — socket may not be available in tests
    }
  });

  return ride;
};

/**
 * Paginated list of rides for the authenticated driver.
 */
const getRidesByDriver = async (driverId, filter = {}, options = {}) => {
  const query = { driver: driverId, ...filter };
  return Ride.paginate(query, {
    page:   options.page   || 1,
    limit:  options.limit  || 10,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'rider',
  });
};

/**
 * Get the driver's current active ride (if any).
 * Useful when the driver app restarts and needs to resume the current trip.
 */
const getCurrentRideForDriver = async (driverId) => {
  const ride = await Ride.findOne({
    driver: driverId,
    status: { $in: ['driver_allocated', 'driver_arrived', 'in_progress'] },
  })
    .populate('rider', 'name phone profilePhotoUrl')
    .sort({ createdAt: -1 });

  return ride || null;
};

module.exports = {
  createRide,
  getRideById,
  getRidesByRider,
  getRidesByDriver,
  getCurrentRideForDriver,
  cancelRide,
};
