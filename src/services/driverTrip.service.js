const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Ride, Rating } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Derive the trip stage at time of cancellation from ride timestamps.
 * Tells the driver at which point the ride was cancelled.
 */
const _getTripStageAtCancellation = (rideTimestamps) => {
  if (rideTimestamps?.startedAt) return 'During Trip';
  if (rideTimestamps?.driverArrivedAt) return 'After Driver Arrival';
  if (rideTimestamps?.driverAllocatedAt) return 'Before Driver Arrival';
  return 'Before Driver Allocation';
};

/**
 * Build date range filter for period-based queries.
 */
const _getDateRange = (period) => {
  const now = new Date();
  let start;

  switch (period) {
    case 'today': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    }
    case 'week': {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday as week start
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      break;
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
    default:
      return null;
  }

  return { $gte: start, $lte: now };
};

/**
 * Get trip statistics for the driver's trip history header.
 * Returns total trips, trips this week, trips today, and week-over-week change.
 */
const getTripStats = async (driverId) => {
  const driverObjectId = new mongoose.Types.ObjectId(driverId);
  const now = new Date();

  // Today start
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // This week start (Monday)
  const thisWeekDay = now.getDay();
  const thisWeekDiff = thisWeekDay === 0 ? 6 : thisWeekDay - 1;
  const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - thisWeekDiff);

  // Last week range
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);

  const [stats] = await Ride.aggregate([
    {
      $match: {
        driver: driverObjectId,
        status: { $in: ['completed', 'cancelled'] },
      },
    },
    {
      $group: {
        _id: null,
        totalTrips: { $sum: 1 },
        tripsToday: {
          $sum: { $cond: [{ $gte: ['$createdAt', todayStart] }, 1, 0] },
        },
        tripsThisWeek: {
          $sum: { $cond: [{ $gte: ['$createdAt', thisWeekStart] }, 1, 0] },
        },
        tripsLastWeek: {
          $sum: {
            $cond: [{ $and: [{ $gte: ['$createdAt', lastWeekStart] }, { $lt: ['$createdAt', lastWeekEnd] }] }, 1, 0],
          },
        },
      },
    },
  ]);

  const totalTrips = stats?.totalTrips || 0;
  const tripsToday = stats?.tripsToday || 0;
  const tripsThisWeek = stats?.tripsThisWeek || 0;
  const tripsLastWeek = stats?.tripsLastWeek || 0;
  const weekOverWeekChange = tripsThisWeek - tripsLastWeek;

  return {
    totalTrips,
    tripsThisWeek,
    tripsToday,
    weekOverWeekChange,
  };
};

/**
 * Get paginated list of trips for a driver with optional period filter.
 * Each trip includes rider name, star rating for the list view.
 */
const getDriverTrips = async (driverId, filter = {}, options = {}) => {
  const query = {
    driver: driverId,
    status: { $in: ['completed', 'cancelled'] },
  };

  // Apply period filter
  if (filter.period && filter.period !== 'all') {
    const dateRange = _getDateRange(filter.period);
    if (dateRange) {
      query.createdAt = dateRange;
    }
  }

  // Apply status filter if provided
  if (filter.status) {
    query.status = filter.status;
  }

  const result = await Ride.paginate(query, {
    page: options.page || 1,
    limit: options.limit || 10,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: [
      { path: 'rider', select: 'name avgRating' },
      { path: 'rating', select: 'stars' },
    ],
  });

  const trips = result.results.map((ride) => ({
    id: ride._id,
    rideNumber: ride.rideNumber,
    status: ride.status,
    destination: ride.destination,
    fare: {
      totalFare: ride.fare.totalFare,
      currency: ride.fare.currency,
    },
    rider: ride.rider
      ? {
          id: ride.rider._id,
          name: ride.rider.name,
        }
      : null,
    ratingStars: ride.rating?.stars || null,
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
 * Get detailed trip information for the driver's trip details screen.
 * Includes ride details, rider info, driver's rating of the rider, and cancellation details.
 */
const getDriverTripDetails = async (driverId, rideId) => {
  const ride = await Ride.findById(rideId)
    .populate('rider', 'name profile avgRating totalRatings')
    .populate('category', 'name vehicleType categoryIcon')
    .populate('driverRating');

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Trip not found');
  }

  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorised to view this trip');
  }

  if (!['completed', 'cancelled'].includes(ride.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Trip details are only available for completed or cancelled rides');
  }

  // Build rider details
  let riderDetails = null;
  if (ride.rider) {
    riderDetails = {
      id: ride.rider._id,
      name: ride.rider.name,
      profile: ride.rider.profile,
      avgRating: ride.rider.avgRating,
      totalRatings: ride.rider.totalRatings,
    };
  }

  // Build the driver's rating of the rider
  let ratingDetails = null;
  if (ride.driverRating) {
    const rating = typeof ride.driverRating === 'object' ? ride.driverRating : await Rating.findById(ride.driverRating);
    if (rating) {
      ratingDetails = {
        id: rating._id,
        stars: rating.stars,
        behaviourTags: rating.behaviourTags,
        feedback: rating.feedback,
        createdAt: rating.createdAt,
      };
    }
  }

  // Build cancellation info with trip stage
  let cancellationDetails = null;
  if (ride.status === 'cancelled' && ride.cancellation) {
    cancellationDetails = {
      cancelledBy: ride.cancellation.cancelledBy,
      reason: ride.cancellation.reason,
      customReason: ride.cancellation.customReason,
      cancelledAt: ride.cancellation.cancelledAt,
      tripStage: _getTripStageAtCancellation(ride.rideTimestamps),
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
    rider: riderDetails,
    rating: ratingDetails,
    isRated: !!ride.driverRating,
    cancellation: cancellationDetails,
    receiptUrl: ride.receiptUrl,
    createdAt: ride.createdAt,
    rideTimestamps: ride.rideTimestamps,
  };
};

module.exports = {
  getTripStats,
  getDriverTrips,
  getDriverTripDetails,
};
