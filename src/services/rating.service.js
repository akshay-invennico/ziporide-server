const httpStatus = require('http-status');
const Rating = require('../models/rating.model');
const Ride = require('../models/ride.model');
const Driver = require('../models/driver.model');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const paymentService = require('./payment.service');
const driverNotificationService = require('./driverNotification.service');
const logger = require('../config/logger');

/**
 * Recomputes and persists the driver's average rating and total trip count.
 * Called after every new rating is created.
 * @param {ObjectId} driverId
 */
const _refreshDriverStats = async (driverId) => {
  const [result] = await Rating.aggregate([
    { $match: { driver: driverId, ratedBy: 'rider' } },
    {
      $group: {
        _id: '$driver',
        avgRating: { $avg: '$stars' },
        totalRatings: { $sum: 1 },
      },
    },
  ]);

  await Driver.findByIdAndUpdate(driverId, {
    avgRating: result ? Math.round(result.avgRating * 10) / 10 : 0,
    totalRatings: result ? result.totalRatings : 0,
  });
};

/**
 * Submit a rating for a completed ride, optionally with a tip.
 * If a tipAmount is provided, the tip is charged as a separate Stripe
 * transaction before the rating is saved. If the tip charge fails the
 * entire request fails so the rider can retry.
 *
 * @param {ObjectId} riderId  - The authenticated rider's ID
 * @param {string}   rideId
 * @param {object}   body     - { stars, behaviourTags?, feedback?, tipAmount? }
 * @returns {Promise<{ rating: Rating, tipPayment?: Payment }>}
 */
const submitRating = async (riderId, rideId, body) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }

  if (ride.rider.toString() !== riderId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only rate your own rides');
  }

  if (ride.status !== 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You can only rate a completed ride');
  }

  if (ride.rating) {
    throw new ApiError(httpStatus.CONFLICT, 'This ride has already been rated');
  }

  // ── Process tip payment first (if provided) ──────────────────────────
  let tipPayment = null;
  const { tipAmount } = body;

  if (tipAmount && tipAmount > 0) {
    tipPayment = await paymentService.chargeTip({
      rideId: ride._id,
      riderId,
      tipAmount,
    });
    logger.info(`Tip of £${tipAmount} charged for ride ${rideId}`);

    // notify driver via socket about the tip
    try {
      const { getIO } = require('../socket');
      const rider = await User.findById(riderId).select('name profilePhotoUrl avgRating totalRatings').lean();

      getIO().to(`user:${ride.driver.toString()}`).emit('ride:tip_received', {
        rideId: ride._id,
        tipAmount,
        currency: tipPayment.currency || 'GBP',
        rider: {
          id: riderId,
          name: rider?.name || null,
          profilePhotoUrl: rider?.profilePhotoUrl || null,
          avgRating: rider?.avgRating || 0,
          totalRatings: rider?.totalRatings || 0,
        },
      });
    } catch {
      // socket may not be available in tests
    }
  }

  // ── Save rating ──────────────────────────────────────────────────────
  const rating = await Rating.create({
    ride: ride._id,
    rider: riderId,
    driver: ride.driver,
    ratedBy: 'rider',
    stars: body.stars,
    behaviourTags: body.behaviourTags || [],
    feedback: body.feedback,
    tipAmount: tipAmount || 0,
  });

  // Link rating back to the ride and store tip amount
  ride.rating = rating._id;
  if (tipAmount && tipAmount > 0) {
    ride.tipAmount = tipAmount;
  }
  await ride.save();

  // Keep driver stats up to date
  await _refreshDriverStats(ride.driver);

  // driver notifications
  driverNotificationService.notifyNewRating(ride.driver, rating);

  return { rating, tipPayment };
};

/**
 * Recomputes and persists the rider's average rating and total rating count.
 * Called after every new driver→rider rating is created.
 * @param {ObjectId} riderId
 */
const _refreshRiderStats = async (riderId) => {
  const [result] = await Rating.aggregate([
    { $match: { rider: riderId, ratedBy: 'driver' } },
    {
      $group: {
        _id: '$rider',
        avgRating: { $avg: '$stars' },
        totalRatings: { $sum: 1 },
      },
    },
  ]);

  await User.findByIdAndUpdate(riderId, {
    avgRating: result ? Math.round(result.avgRating * 10) / 10 : 0,
    totalRatings: result ? result.totalRatings : 0,
  });
};

/**
 * Driver submits a rating for a rider after a completed ride.
 * @param {ObjectId} driverId - The authenticated driver's ID
 * @param {string}   rideId
 * @param {object}   body     - { stars, behaviourTags?, feedback? }
 * @returns {Promise<Rating>}
 */
const submitRiderRating = async (driverId, rideId, body) => {
  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }

  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only rate riders on your own rides');
  }

  if (ride.status !== 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You can only rate a rider after the ride is completed');
  }

  if (ride.driverRating) {
    throw new ApiError(httpStatus.CONFLICT, 'You have already rated this rider');
  }

  const rating = await Rating.create({
    ride: ride._id,
    rider: ride.rider,
    driver: driverId,
    ratedBy: 'driver',
    stars: body.stars,
    behaviourTags: body.behaviourTags || [],
    feedback: body.feedback,
  });

  // Link driver's rating back to the ride
  ride.driverRating = rating._id;
  await ride.save();

  // Keep rider stats up to date
  await _refreshRiderStats(ride.rider);

  return rating;
};

/**
 * Get the rating for a specific ride (rider's perspective).
 * @param {ObjectId} riderId
 * @param {string}   rideId
 * @returns {Promise<Rating>}
 */
const getRideRating = async (riderId, rideId) => {
  const ride = await Ride.findById(rideId).select('rider rating');

  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  }

  if (ride.rider.toString() !== riderId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
  }

  if (!ride.rating) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No rating found for this ride');
  }

  const rating = await Rating.findById(ride.rating).populate('driver', 'name profilePhotoUrl avgRating totalRatings');
  return rating;
};

/**
 * Get all ratings received by a driver (rated by riders, paginated).
 * @param {ObjectId} driverId
 * @param {object}   options  - { page, limit }
 * @returns {Promise<QueryResult>}
 */
const getDriverRatings = async (driverId, options) => {
  const result = await Rating.paginate(
    { driver: driverId, ratedBy: 'rider' },
    {
      ...options,
      populate: 'rider',
      sort: { createdAt: -1 },
    }
  );
  return result;
};

/**
 * Get all ratings received by a rider (rated by drivers, paginated).
 * @param {ObjectId} riderId
 * @param {object}   options  - { page, limit }
 * @returns {Promise<QueryResult>}
 */
const getRiderRatings = async (riderId, options) => {
  const result = await Rating.paginate(
    { rider: riderId, ratedBy: 'driver' },
    {
      ...options,
      populate: 'driver',
      sort: { createdAt: -1 },
    }
  );
  return result;
};

module.exports = {
  submitRating,
  submitRiderRating,
  getRideRating,
  getDriverRatings,
  getRiderRatings,
};
