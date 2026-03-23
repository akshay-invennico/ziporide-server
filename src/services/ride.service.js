const httpStatus = require('http-status');
const { Ride } = require('../models');
const VehicleCategory = require('../models/inventory.model');
const Pricing = require('../models/pricing.model');
const ApiError = require('../utils/ApiError');
const dispatchService = require('./dispatch.service');
const mapboxService = require('./mapbox.service');
const paymentService = require('./payment.service');
const logger = require('../config/logger');

/** Generate a 4-digit pickup OTP for driver verification at pickup point. */
const generatePickupOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

const _round = (val) => Math.round(val * 100) / 100;

/**
 * Create a new ride request.
 * Responds immediately with the ride document, then kicks off dispatch
 * asynchronously so the HTTP response is not delayed.
 */
const createRide = async (riderId, rideData) => {
  const { pickup, stops = [], destination, categoryId, paymentMethod, estimatedFare, isAirportRide = false } = rideData;

  // Block if rider already has an active ride
  const activeRide = await Ride.findOne({
    rider: riderId,
    status: { $in: ['searching', 'driver_allocated', 'driver_arrived', 'in_progress'] },
  });
  if (activeRide) {
    throw new ApiError(httpStatus.CONFLICT, 'You already have an active ride in progress');
  }

  // Validate the selected category
  const category = await VehicleCategory.findById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Vehicle category not found');
  }
  if (!category.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected vehicle category is not available');
  }

  // Get real route distance & duration from Google Maps
  const route = await mapboxService.getDistanceAndDuration(pickup, stops, destination);

  // Build fare from pricing config
  const pricing = await Pricing.findOne();
  const surgeMultiplier = pricing?.surgePricing?.enabled ? pricing.surgePricing.multiplier : 1;
  const distanceFare = _round(route.distanceMiles * category.pricePerMile);
  const timeFare = _round(route.durationMinutes * category.pricePerMinute);

  const fareBreakdown = {
    baseFare: category.baseFare,
    distanceFare,
    timeFare,
    surgeMultiplier,
    cancellationFee: pricing?.cancellationFee || 0,
    totalFare: estimatedFare || _round(Math.max((category.baseFare + distanceFare + timeFare) * surgeMultiplier, pricing?.minimumFare || 0)),
    estimatedFare: estimatedFare || _round(Math.max((category.baseFare + distanceFare + timeFare) * surgeMultiplier, pricing?.minimumFare || 0)),
    currency: 'GBP',
  };

  // Authorize & hold the estimated fare on the rider's card
  if (!paymentMethod) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A payment method is required to book a ride');
  }

  const ride = await Ride.create({
    rider: riderId,
    pickup,
    stops,
    destination,
    vehicleType: category.vehicleType,
    category: categoryId,
    isAirportRide,
    distanceKm: _round(route.distanceMiles * 1.60934),
    durationMinutes: route.durationMinutes,
    paymentMethod,
    fare: fareBreakdown,
    pickupOtp: generatePickupOtp(),
    status: 'searching',
  });

  // Place an authorize-and-hold on the rider's card for the estimated fare
  try {
    const authResult = await paymentService.authorizeRidePayment({
      rideId: ride._id,
      riderId,
      paymentMethodId: paymentMethod,
      estimatedFare: fareBreakdown.totalFare,
      currency: fareBreakdown.currency,
    });

    ride.stripePaymentIntentId = authResult.paymentIntentId;
    ride.paymentStatus = 'authorized';
    await ride.save();
  } catch (err) {
    // Authorization failed — delete the ride and throw
    await Ride.findByIdAndDelete(ride._id);
    logger.error(`Payment authorization failed for ride ${ride._id}: ${err.message}`);
    throw new ApiError(
      err.statusCode || httpStatus.PAYMENT_REQUIRED,
      err.message || 'Card authorization failed. Please try a different payment method.'
    );
  }

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

  // Release the payment hold (if any)
  if (ride.stripePaymentIntentId) {
    setImmediate(async () => {
      try {
        await paymentService.releaseRidePayment(rideId);
      } catch (err) {
        logger.error(`Failed to release payment hold for cancelled ride ${rideId}: ${err.message}`);
      }
    });
  }

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
