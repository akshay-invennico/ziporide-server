const httpStatus = require('http-status');
const { Ride, Driver } = require('../models');
const VehicleCategory = require('../models/inventory.model');
const Pricing = require('../models/pricing.model');
const ApiError = require('../utils/ApiError');
const dispatchService = require('./dispatch.service');
const mapboxService = require('./mapbox.service');
const paymentService = require('./payment.service');
const driverNotificationService = require('./driverNotification.service');
const logger = require('../config/logger');

const NEARBY_DRIVERS_RADIUS_METERS = 10000; // 10 km

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
    totalFare:
      estimatedFare ||
      _round(Math.max((category.baseFare + distanceFare + timeFare) * surgeMultiplier, pricing?.minimumFare || 0)),
    estimatedFare:
      estimatedFare ||
      _round(Math.max((category.baseFare + distanceFare + timeFare) * surgeMultiplier, pricing?.minimumFare || 0)),
    currency: 'GBP',
  };

  // Authorize & hold the estimated fare on the rider's card
  if (!paymentMethod) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A payment method is required to book a ride');
  }

  // Initialize stop status tracking for each stop
  const stopsStatus = stops.map((_, index) => ({
    stopIndex: index,
    status: 'pending',
  }));

  const ride = await Ride.create({
    rider: riderId,
    pickup,
    stops,
    stopsStatus,
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
    .populate('rider', 'name phone profile')
    .populate('driver', 'name phone vehicle profilePhotoUrl currentLocation avgRating totalRatings');

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
    page: options.page || 1,
    limit: options.limit || 10,
    sortBy: options.sortBy || 'createdAt:desc',
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
    throw new ApiError(httpStatus.BAD_REQUEST, `Ride cannot be cancelled at this stage (current status: '${ride.status}')`);
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

  // driver notifications
  if (ride.driver) {
    driverNotificationService.notifyRiderCancelled(ride.driver, ride);
  }

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
    page: options.page || 1,
    limit: options.limit || 10,
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
    .populate('rider', 'name phone profile avgRating totalRatings')
    .sort({ createdAt: -1 });

  if (!ride) return null;

  const riderTotalTrips = await Ride.countDocuments({ rider: ride.rider._id, status: 'completed' });

  const pricing = await Pricing.findOne();
  const waitingChargePerMinute = pricing?.waitingCharge || 0;
  const freeWaitingTime = pricing?.freeWaitingTime || 0;
  const maxPaidWaitingTime = pricing?.maxPaidWaitingTime || 0;

  return { ride, riderTotalTrips, waitingChargePerMinute, freeWaitingTime, maxPaidWaitingTime };
};

/**
 * Driver marks arrival at the pickup point.
 * Transitions ride from driver_allocated → driver_arrived.
 */
const driverArrived = async (rideId, driverId) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }
  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not the assigned driver for this ride');
  }
  if (ride.status !== 'driver_allocated') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot mark arrived — ride status is '${ride.status}'`);
  }

  ride.status = 'driver_arrived';
  ride.rideTimestamps.driverArrivedAt = new Date();
  await ride.save();

  // Notify rider
  setImmediate(() => {
    try {
      const { getIO } = require('../socket');
      getIO().to(`user:${ride.rider.toString()}`).emit('ride:driver_arrived', {
        rideId: ride._id,
        message: 'Your driver has arrived at the pickup point.',
      });
    } catch {
      // socket may not be available in tests
    }
  });

  return ride;
};

/**
 * Driver verifies the pickup OTP to start the ride.
 * Transitions ride from driver_arrived → in_progress.
 *
 * @param {string} rideId
 * @param {string} driverId
 * @param {string} otp        – 4-digit pickup OTP
 * @param {number} [waitingTime=0] – chargeable waiting minutes sent by frontend
 *   (frontend already subtracts the free waiting window; this is only the paid portion)
 */
const verifyOtpAndStartRide = async (rideId, driverId, otp, waitingTime = 0) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }
  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not the assigned driver for this ride');
  }
  if (ride.status !== 'driver_arrived') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot start ride — ride status is '${ride.status}'`);
  }
  if (ride.pickupOtp !== otp) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OTP. Please check and try again.');
  }

  // Calculate waiting charge if chargeable waiting time was sent
  if (waitingTime > 0) {
    const pricing = await Pricing.findOne();
    if (!pricing) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Pricing configuration not found');
    }

    const waitingCharge = _round(waitingTime * pricing.waitingCharge);

    ride.fare.waitingMinutes = waitingTime;
    ride.fare.waitingCharge = waitingCharge;
    ride.fare.totalFare = _round(ride.fare.totalFare + waitingCharge);
  }

  ride.status = 'in_progress';
  ride.rideTimestamps.startedAt = new Date();
  await ride.save();

  // Notify rider
  setImmediate(() => {
    try {
      const { getIO } = require('../socket');
      getIO().to(`user:${ride.rider.toString()}`).emit('ride:started', {
        rideId: ride._id,
        waitingCharge: ride.fare.waitingCharge,
        message: 'Your ride has started. Enjoy your trip!',
      });
    } catch {
      // socket may not be available in tests
    }
  });

  return ride;
};

/**
 * Driver marks arrival at an intermediate stop.
 * Stops must be arrived at in order (0, 1, 2, …).
 * Only allowed when ride is in_progress.
 */
const arrivedAtStop = async (rideId, driverId, stopIndex) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }
  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not the assigned driver for this ride');
  }
  if (ride.status !== 'in_progress') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot update stop — ride status is '${ride.status}'`);
  }
  if (stopIndex < 0 || stopIndex >= ride.stops.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid stop index: ${stopIndex}`);
  }

  // Ensure stops are arrived at in order
  const stopEntry = ride.stopsStatus.find((s) => s.stopIndex === stopIndex);
  if (!stopEntry) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Stop ${stopIndex} not found in stops status`);
  }
  if (stopEntry.status === 'arrived') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Already arrived at stop ${stopIndex + 1}`);
  }

  // All previous stops must be arrived
  for (let i = 0; i < stopIndex; i++) {
    const prev = ride.stopsStatus.find((s) => s.stopIndex === i);
    if (!prev || prev.status !== 'arrived') {
      throw new ApiError(httpStatus.BAD_REQUEST, `Must arrive at stop ${i + 1} before stop ${stopIndex + 1}`);
    }
  }

  stopEntry.status = 'arrived';
  stopEntry.arrivedAt = new Date();
  ride.markModified('stopsStatus');
  await ride.save();

  // Notify rider
  setImmediate(() => {
    try {
      const { getIO } = require('../socket');
      getIO()
        .to(`user:${ride.rider.toString()}`)
        .emit('ride:arrived_at_stop', {
          rideId: ride._id,
          stopIndex,
          message: `Driver has arrived at stop ${stopIndex + 1}.`,
        });
    } catch {
      // socket may not be available in tests
    }
  });

  return ride;
};

/**
 * Driver marks arrival at the destination (drop location).
 * All intermediate stops must be completed first.
 * Only allowed when ride is in_progress.
 */
const arrivedAtDestination = async (rideId, driverId) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }
  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not the assigned driver for this ride');
  }
  if (ride.status !== 'in_progress') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot mark destination arrived — ride status is '${ride.status}'`);
  }
  if (ride.destinationArrived) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Already arrived at destination');
  }

  // All stops must be arrived first
  const pendingStops = ride.stopsStatus.filter((s) => s.status !== 'arrived');
  if (pendingStops.length > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'All intermediate stops must be completed before arriving at destination');
  }

  ride.destinationArrived = true;
  ride.rideTimestamps.destinationArrivedAt = new Date();
  await ride.save();

  // Notify rider
  setImmediate(() => {
    try {
      const { getIO } = require('../socket');
      getIO().to(`user:${ride.rider.toString()}`).emit('ride:arrived_at_destination', {
        rideId: ride._id,
        message: 'Driver has arrived at the destination.',
      });
    } catch {
      // socket may not be available in tests
    }
  });

  return ride;
};

/**
 * Driver completes the ride.
 * Transitions ride from in_progress → completed.
 * All stops must be arrived and destination must be reached.
 * Captures the actual fare from the payment hold.
 */
const completeRide = async (rideId, driverId) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }
  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not the assigned driver for this ride');
  }
  if (ride.status !== 'in_progress') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot complete ride — ride status is '${ride.status}'`);
  }

  // Ensure all stops have been arrived at
  const pendingStops = ride.stopsStatus.filter((s) => s.status !== 'arrived');
  if (pendingStops.length > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'All stops must be completed before finishing the ride');
  }

  // Ensure destination has been reached
  if (!ride.destinationArrived) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Must arrive at destination before completing the ride');
  }

  ride.status = 'completed';
  ride.rideTimestamps.completedAt = new Date();
  await ride.save();

  // driver notifications
  const driverDoc = await Driver.findById(driverId).select('fcmToken').lean();
  if (driverDoc) {
    driverNotificationService.notifyTripCompleted(driverDoc, ride);
  }

  // Capture the actual fare
  if (ride.stripePaymentIntentId) {
    setImmediate(async () => {
      try {
        await paymentService.captureRidePayment(rideId, ride.fare.totalFare);
      } catch (err) {
        logger.error(`Failed to capture payment for ride ${rideId}: ${err.message}`);
      }
    });
  }

  // Notify rider
  setImmediate(() => {
    try {
      const { getIO } = require('../socket');
      getIO().to(`user:${ride.rider.toString()}`).emit('ride:completed', {
        rideId: ride._id,
        fare: ride.fare,
        message: 'Your ride has been completed. Thank you for riding with ZipoRide!',
      });
    } catch {
      // socket may not be available in tests
    }
  });

  return ride;
};

/**
 * Driver cancels an assigned ride.
 * Allowed when status is 'driver_allocated' or 'driver_arrived'.
 */
const cancelRideByDriver = async (rideId, driverId, cancellationData) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }
  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not the assigned driver for this ride');
  }

  const cancellableStatuses = ['driver_allocated', 'driver_arrived'];
  if (!cancellableStatuses.includes(ride.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Ride cannot be cancelled at this stage (current status: '${ride.status}')`);
  }

  ride.status = 'cancelled';
  ride.cancellation = {
    cancelledBy: 'driver',
    reason: cancellationData.reason,
    customReason: cancellationData.customReason || undefined,
    cancelledAt: new Date(),
  };
  ride.rideTimestamps.cancelledAt = new Date();
  await ride.save();

  // Release the payment hold
  if (ride.stripePaymentIntentId) {
    setImmediate(async () => {
      try {
        await paymentService.releaseRidePayment(rideId);
      } catch (err) {
        logger.error(`Failed to release payment hold for driver-cancelled ride ${rideId}: ${err.message}`);
      }
    });
  }

  // Notify rider
  setImmediate(() => {
    try {
      const { getIO } = require('../socket');
      getIO().to(`user:${ride.rider.toString()}`).emit('ride:cancelled_by_driver', {
        rideId: ride._id,
        message: 'Your driver has cancelled the ride. We apologise for the inconvenience.',
      });
    } catch {
      // socket may not be available in tests
    }
  });

  return ride;
};

/**
 * Get the rider's current active ride (if any).
 * Useful when the rider app restarts and needs to restore the ride screen.
 */
const getCurrentRideForRider = async (riderId) => {
  const ride = await Ride.findOne({
    rider: riderId,
    status: { $in: ['searching', 'driver_allocated', 'driver_arrived', 'in_progress'] },
  })
    .populate('driver', 'name phone profilePhotoUrl vehicle currentLocation avgRating totalRatings')
    .populate('category', 'name vehicleType seatCapacity')
    .sort({ createdAt: -1 });

  if (!ride) return null;

  // If a driver is assigned, calculate ETA from driver's location to pickup
  let eta = null;
  let driverTotalTrips = null;
  if (ride.driver) {
    if (
      ride.driver.currentLocation?.coordinates?.length === 2 &&
      ['driver_allocated', 'driver_arrived'].includes(ride.status)
    ) {
      try {
        eta = await mapboxService.getETA(ride.driver.currentLocation.coordinates, ride.pickup.coordinates);
      } catch (err) {
        logger.error(`Failed to get ETA for ride ${ride._id}: ${err.message}`);
      }
    }

    driverTotalTrips = await Ride.countDocuments({ driver: ride.driver._id, status: 'completed' });
  }

  return { ride, eta, driverTotalTrips };
};

/**
 * Retry dispatch for a ride that has status 'no_drivers'.
 * Resets the ride back to 'searching' and kicks off a new dispatch.
 */
const retryDispatch = async (rideId, riderId) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }
  if (ride.rider.toString() !== riderId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorised to retry this ride');
  }
  if (ride.status !== 'no_drivers') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Retry is only allowed when no drivers were found (current status: '${ride.status}')`
    );
  }

  ride.status = 'searching';
  await ride.save();

  // Fire-and-forget new dispatch
  setImmediate(async () => {
    try {
      const { getIO } = require('../socket');
      await dispatchService.startDispatch(getIO(), ride);
    } catch (err) {
      logger.error(`Retry dispatch failed for ride ${rideId}: ${err.message}`);
    }
  });

  return ride;
};

/**
 * Get nearby online drivers for map display.
 * Returns driver locations (no ride assignment — just for the searching screen map).
 */
const getNearbyDrivers = async (latitude, longitude, vehicleType) => {
  const query = {
    isOnline: true,
    status: 'approved',
    currentLocation: {
      $nearSphere: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        $maxDistance: NEARBY_DRIVERS_RADIUS_METERS,
      },
    },
  };

  if (vehicleType) {
    query['vehicle.type'] = vehicleType;
  }

  const drivers = await Driver.find(query)
    .select('currentLocation vehicle.type vehicle.make vehicle.model')
    .limit(20)
    .lean();

  return drivers.map((d) => ({
    id: d._id,
    location: {
      latitude: d.currentLocation.coordinates[1],
      longitude: d.currentLocation.coordinates[0],
    },
    vehicleType: d.vehicle?.type,
    vehicleMake: d.vehicle?.make,
    vehicleModel: d.vehicle?.model,
  }));
};

/**
 * Get all rides for admin with filtering capabilities.
 * Admin can filter by driverId, riderId, or status.
 */
const getAllRidesForAdmin = async (filter = {}, options = {}) => {
  const query = {};

  // Apply filters if provided
  if (filter.driverId) {
    query.driver = filter.driverId;
  }
  if (filter.riderId) {
    query.rider = filter.riderId;
  }
  if (filter.status) {
    query.status = filter.status;
  }

  // Search functionality
  if (filter.search) {
    query.$or = [
      { rideNumber: { $regex: filter.search, $options: 'i' } },
      { 'driver.name': { $regex: filter.search, $options: 'i' } },
      { 'rider.name': { $regex: filter.search, $options: 'i' } },
    ];
  }

  // Date filtering
  if (filter.dateFilter) {
    const now = new Date();
    let startOfWeek;
    let endOfWeek;
    let dayOfWeek;

    switch (filter.dateFilter) {
      case 'currentYear':
        query.createdAt = {
          $gte: new Date(now.getFullYear(), 0, 1), // Jan 1 of current year
          $lt: new Date(now.getFullYear() + 1, 0, 1), // Jan 1 of next year
        };
        break;

      case 'currentMonth':
        query.createdAt = {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1), // 1st of current month
          $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1), // 1st of next month
        };
        break;

      case 'currentWeek':
        dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
        startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        query.createdAt = {
          $gte: startOfWeek,
          $lt: endOfWeek,
        };
        break;

      default:
        break;
    }
  }

  const result = await Ride.paginate(query, {
    page: options.page || 1,
    limit: options.limit || 10,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'rider,driver',
  });

  if (result.results && result.results.length > 0) {
    await Ride.populate(result.results, [
      {
        path: 'rider',
        select: 'name phone email countryCode',
      },
      {
        path: 'driver',
        select: 'name phone email vehicle',
        model: 'Driver',
      },
    ]);
  }

  return result;
};

/**
 * Get a single ride by id for admin (no access restrictions).
 */
const getRideByIdForAdmin = async (rideId) => {
  const ride = await Ride.findById(rideId)
    .populate('rider', 'name phone email countryCode avgRating totalRatings')
    .populate('driver', 'name phone email vehicle profilePhotoUrl currentLocation avgRating totalRatings countryCode')
    .populate('category', 'name vehicleType seatCapacity categoryIcon')
    .populate('paymentMethod')
    .populate('rating', 'stars behaviourTags feedback tipAmount createdAt ratedBy')
    .populate('driverRating', 'stars behaviourTags feedback createdAt ratedBy');

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }

  return ride;
};

const cancelRideByAdmin = async (rideId, cancelReason) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }

  if (ride.status === 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot cancel completed ride');
  }

  ride.status = 'cancelled';
  ride.cancellation = {
    cancelledBy: 'admin',
    reason: cancelReason,
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
        logger.error(`Failed to release payment hold for admin-cancelled ride ${rideId}: ${err.message}`);
      }
    });
  }

  // Notify both rider and driver
  setImmediate(() => {
    try {
      const { getIO } = require('../socket');

      // Notify rider
      getIO().to(`user:${ride.rider.toString()}`).emit('ride:cancelled_by_admin', {
        rideId: ride._id,
        message: 'Your ride has been cancelled by admin.',
      });

      // Notify driver if assigned
      if (ride.driver) {
        getIO().to(`driver:${ride.driver.toString()}`).emit('ride:cancelled_by_admin', {
          rideId: ride._id,
          message: 'Ride has been cancelled by admin.',
        });
      }
    } catch {
      // socket may not be available in tests
    }
  });

  return ride;
};

module.exports = {
  createRide,
  getRideById,
  getRidesByRider,
  getRidesByDriver,
  getCurrentRideForDriver,
  getCurrentRideForRider,
  cancelRide,
  driverArrived,
  verifyOtpAndStartRide,
  arrivedAtStop,
  arrivedAtDestination,
  completeRide,
  cancelRideByDriver,
  retryDispatch,
  getNearbyDrivers,
  getAllRidesForAdmin,
  getRideByIdForAdmin,
  cancelRideByAdmin,
};
