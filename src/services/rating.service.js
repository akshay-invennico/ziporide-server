const httpStatus = require('http-status');
const Rating = require('../models/rating.model');
const Ride = require('../models/ride.model');
const Driver = require('../models/driver.model');
const ApiError = require('../utils/ApiError');

/**
 * Recomputes and persists the driver's average rating and total trip count.
 * Called after every new rating is created.
 * @param {ObjectId} driverId
 */
const _refreshDriverStats = async (driverId) => {
  const [result] = await Rating.aggregate([
    { $match: { driver: driverId } },
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
 * Submit a rating for a completed ride.
 * @param {ObjectId} riderId  - The authenticated rider's ID
 * @param {string}   rideId
 * @param {object}   body     - { stars, behaviourTags?, feedback? }
 * @returns {Promise<Rating>}
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

  const rating = await Rating.create({
    ride: ride._id,
    rider: riderId,
    driver: ride.driver,
    stars: body.stars,
    behaviourTags: body.behaviourTags || [],
    feedback: body.feedback,
  });

  // Link rating back to the ride
  ride.rating = rating._id;
  await ride.save();

  // Keep driver stats up to date
  await _refreshDriverStats(ride.driver);

  return rating;
};

/**
 * Get the rating for a specific ride.
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
 * Get all ratings received by a driver (paginated).
 * @param {ObjectId} driverId
 * @param {object}   options  - { page, limit }
 * @returns {Promise<QueryResult>}
 */
const getDriverRatings = async (driverId, options) => {
  const result = await Rating.paginate(
    { driver: driverId },
    {
      ...options,
      populate: 'rider',
      sort: { createdAt: -1 },
    }
  );
  return result;
};

module.exports = {
  submitRating,
  getRideRating,
  getDriverRatings,
};
