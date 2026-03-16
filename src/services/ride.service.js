const httpStatus = require('http-status');
const { Ride } = require('../models');
const ApiError = require('../utils/ApiError');

// Fare table per vehicle type (in GBP)
const FARE_CONFIG = {
  electric: { baseFare: 1.99, perKm: 0.8, perMinute: 0.1 },
  standard: { baseFare: 2.5, perKm: 1.2, perMinute: 0.15 },
  xl: { baseFare: 3.5, perKm: 1.5, perMinute: 0.18 },
  executive: { baseFare: 5.0, perKm: 2.0, perMinute: 0.25 },
};

/**
 * Calculate an estimated fare based on vehicle type and rough distance/duration.
 * In production this will be replaced by a routing API (Google Maps / HERE).
 * @param {string} vehicleType
 * @param {number} distanceKm  - estimated distance in kilometres
 * @param {number} durationMin - estimated duration in minutes
 * @param {number} [surgeMultiplier=1]
 * @returns {Object} fareBreakdown
 */
const calculateFare = (vehicleType, distanceKm = 0, durationMin = 0, surgeMultiplier = 1) => {
  const config = FARE_CONFIG[vehicleType] || FARE_CONFIG.standard;
  const { baseFare } = config;
  const distanceFare = parseFloat((distanceKm * config.perKm).toFixed(2));
  const timeFare = parseFloat((durationMin * config.perMinute).toFixed(2));
  const subtotal = baseFare + distanceFare + timeFare;
  const totalFare = parseFloat((subtotal * surgeMultiplier).toFixed(2));

  return {
    baseFare,
    distanceFare,
    timeFare,
    surgeMultiplier,
    totalFare,
    estimatedFare: totalFare,
    currency: 'GBP',
  };
};

/**
 * Generate a 4-digit pickup OTP for driver verification.
 * @returns {string}
 */
const generatePickupOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

/**
 * Create a new ride request.
 * @param {ObjectId} riderId  - authenticated user's _id
 * @param {Object}   rideData - validated request body
 * @returns {Promise<Ride>}
 */
const createRide = async (riderId, rideData) => {
  const { pickup, stops = [], destination, vehicleType, paymentMethod, estimatedFare } = rideData;

  // Block if the user already has an active ride
  const activeRide = await Ride.findOne({
    rider: riderId,
    status: { $in: ['searching', 'driver_allocated', 'driver_arrived', 'in_progress'] },
  });

  if (activeRide) {
    throw new ApiError(httpStatus.CONFLICT, 'You already have an active ride in progress');
  }

  // Build fare breakdown (placeholder values until a routing API is integrated)
  const fareBreakdown = calculateFare(vehicleType, 0, 0);
  if (estimatedFare) {
    fareBreakdown.estimatedFare = estimatedFare;
  }

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

  return ride;
};

/**
 * Get a single ride by id. Verifies that the requesting user owns the ride.
 * @param {string}   rideId
 * @param {ObjectId} requesterId - user or driver id
 * @param {string}   requesterRole - 'rider' | 'driver'
 * @returns {Promise<Ride>}
 */
const getRideById = async (rideId, requesterId, requesterRole = 'rider') => {
  const ride = await Ride.findById(rideId).populate('rider', 'name phone').populate('driver', 'name phone vehicle');

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }

  // Authorisation: rider can only see their own rides
  if (requesterRole === 'rider' && ride.rider._id.toString() !== requesterId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorised to view this ride');
  }

  return ride;
};

/**
 * Paginated list of rides for the authenticated rider.
 * @param {ObjectId} riderId
 * @param {Object}   filter  - additional mongoose filter (e.g. { status })
 * @param {Object}   options - { page, limit, sortBy }
 * @returns {Promise<QueryResult>}
 */
const getRidesByRider = async (riderId, filter = {}, options = {}) => {
  const query = { rider: riderId, ...filter };
  const paginateOptions = {
    page: options.page || 1,
    limit: options.limit || 10,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'driver',
  };
  return Ride.paginate(query, paginateOptions);
};

/**
 * Cancel a ride.
 * - Only the rider who booked the ride may cancel it.
 * - A ride can only be cancelled if it is in the 'searching' or 'driver_allocated' state.
 * @param {string}   rideId
 * @param {ObjectId} riderId
 * @param {Object}   cancellationData - { reason, customReason }
 * @returns {Promise<Ride>}
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
    throw new ApiError(httpStatus.BAD_REQUEST, `Ride cannot be cancelled because it is currently '${ride.status}'`);
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
  return ride;
};

module.exports = {
  createRide,
  getRideById,
  getRidesByRider,
  cancelRide,
};
