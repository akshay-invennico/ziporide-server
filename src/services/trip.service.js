const httpStatus = require('http-status');
const { Ride, Rating, Driver, User } = require('../models');
const ApiError = require('../utils/ApiError');
const paymentService = require('./payment.service');
const logger = require('../config/logger');

/**
 * Get paginated list of trips (completed + cancelled) for a rider.
 * Returns summary data suitable for the trips list screen.
 */
const getTrips = async (riderId, filter = {}, options = {}) => {
  const query = {
    rider: riderId,
    status: { $in: ['completed', 'cancelled'] },
    ...filter,
  };

  const result = await Ride.paginate(query, {
    page: options.page || 1,
    limit: options.limit || 10,
    sortBy: options.sortBy || 'createdAt:desc',
  });

  // Shape data for list view
  const trips = result.results.map((ride) => ({
    id: ride._id,
    rideNumber: ride.rideNumber,
    status: ride.status,
    destination: ride.destination,
    fare: {
      totalFare: ride.fare.totalFare,
      currency: ride.fare.currency,
    },
    createdAt: ride.createdAt,
    completedAt: ride.rideTimestamps?.completedAt || null,
    cancelledAt: ride.rideTimestamps?.cancelledAt || null,
  }));

  return {
    results: trips,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
    totalResults: result.totalResults,
  };
};

/**
 * Get detailed trip information for the trip details screen.
 * Includes ride details, driver info, vehicle, rating, and cancellation info.
 */
const getTripDetails = async (riderId, rideId) => {
  const ride = await Ride.findById(rideId)
    .populate('driver', 'name profilePhotoUrl avgRating totalRatings vehicle')
    .populate('category', 'name vehicleType categoryIcon')
    .populate('rating');

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Trip not found');
  }

  if (ride.rider.toString() !== riderId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorised to view this trip');
  }

  if (!['completed', 'cancelled'].includes(ride.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Trip details are only available for completed or cancelled rides');
  }

  // Build driver details
  let driverDetails = null;
  if (ride.driver) {
    driverDetails = {
      id: ride.driver._id,
      name: ride.driver.name,
      profilePhotoUrl: ride.driver.profilePhotoUrl,
      avgRating: ride.driver.avgRating,
      totalRatings: ride.driver.totalRatings,
      vehicle: ride.driver.vehicle
        ? {
          make: ride.driver.vehicle.make,
          model: ride.driver.vehicle.model,
          colour: ride.driver.vehicle.colour,
          registrationNumber: ride.driver.vehicle.registrationNumber,
          type: ride.driver.vehicle.type,
        }
        : null,
    };
  }

  // Build rating info
  let ratingDetails = null;
  if (ride.rating) {
    const rating = typeof ride.rating === 'object' ? ride.rating : await Rating.findById(ride.rating);
    if (rating) {
      ratingDetails = {
        id: rating._id,
        stars: rating.stars,
        behaviourTags: rating.behaviourTags,
        feedback: rating.feedback,
        tipAmount: rating.tipAmount,
        createdAt: rating.createdAt,
      };
    }
  }

  // Build cancellation info
  let cancellationDetails = null;
  if (ride.status === 'cancelled' && ride.cancellation) {
    cancellationDetails = {
      cancelledBy: ride.cancellation.cancelledBy,
      reason: ride.cancellation.reason,
      customReason: ride.cancellation.customReason,
      cancelledAt: ride.cancellation.cancelledAt,
    };
  }

  return {
    id: ride._id,
    rideNumber: ride.rideNumber,
    status: ride.status,
    vehicleType: ride.vehicleType,
    category: ride.category
      ? {
        name: ride.category.name,
        vehicleType: ride.category.vehicleType,
        categoryIcon: ride.category.categoryIcon,
      }
      : null,
    pickup: ride.pickup,
    stops: ride.stops,
    destination: ride.destination,
    distanceKm: ride.distanceKm,
    durationMinutes: ride.durationMinutes,
    fare: ride.fare,
    tipAmount: ride.tipAmount,
    driver: driverDetails,
    rating: ratingDetails,
    isRated: !!ride.rating,
    cancellation: cancellationDetails,
    receiptUrl: ride.receiptUrl,
    createdAt: ride.createdAt,
    rideTimestamps: ride.rideTimestamps,
  };
};

/**
 * Get the total count of completed trips for a rider.
 */
const getCompletedTripsCount = async (riderId) => {
  const count = await Ride.countDocuments({
    rider: riderId,
    status: 'completed',
  });
  return count;
};

module.exports = {
  getTrips,
  getTripDetails,
  getCompletedTripsCount,
};
