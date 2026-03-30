const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { User, Ride } = require('../models');
const ApiError = require('../utils/ApiError');
const authService = require('./auth.service');

/**
 * Get user by id
 * @param {ObjectId} id
 * @returns {Promise<User>}
 */
const getUserById = async (id) => {
  return User.findById(id);
};

/**
 * Get user by phone number
 * @param {string} phone
 * @param {string} countryCode
 * @returns {Promise<User>}
 */
const getUserByPhone = async (phone, countryCode) => {
  return User.findOne({ phone, countryCode });
};

/**
 * Update user by id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async (user, updateBody) => {
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Handle field mappings based on user type
  const mappedUpdateBody = { ...updateBody };

  if (user.constructor.modelName === 'Driver') {
    // Map profile to profilePhotoUrl for Driver
    if (mappedUpdateBody.profile && !mappedUpdateBody.profilePhotoUrl) {
      mappedUpdateBody.profilePhotoUrl = mappedUpdateBody.profile;
      delete mappedUpdateBody.profile;
    }
    // Map postCode to address.postcode for Driver
    if (mappedUpdateBody.postCode) {
      mappedUpdateBody.address = {
        ...(user.address || {}),
        postcode: mappedUpdateBody.postCode,
      };
      delete mappedUpdateBody.postCode;
    }
  } else {
    // For User model (rider/admin), profile field stays as is
    // No field mapping needed
  }

  Object.assign(user, mappedUpdateBody);
  await user.save();
  return user;
};

/**
 * Initiate account deletion process
 * @param {Object} user - User document
 * @param {string} deleteReason - Reason for deletion
 * @returns {Promise<{message: string, maskedPhone: string}>}
 */
const initiateAccountDeletion = async (user, deleteReason) => {
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (user.isDeleted) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account is already deleted');
  }

  // Use existing sendOtp function from auth service
  await authService.sendOtp(user.phone, user.countryCode);

  // Store deletion reason temporarily
  const updatedUser = user;
  updatedUser.deleteReason = deleteReason;
  await updatedUser.save();

  // Mask phone number for response
  const maskedPhone = `${user.countryCode} **** ${user.phone.slice(-4)}`;

  return {
    message: 'Verification code sent to your registered mobile number',
    maskedPhone,
  };
};

/**
 * Delete user by id with OTP verification
 * @param {Object} user - User document
 * @param {string} otp - OTP code
 * @returns {Promise<User>}
 */
const deleteUserById = async (user, otp) => {
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (user.isDeleted) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account is already deleted');
  }

  // Verify OTP using existing auth service function
  const verifiedUser = await authService.verifyOtp(user.phone, user.countryCode, otp);
  // Soft delete the user
  const deletedUser = verifiedUser;
  deletedUser.isDeleted = true;
  deletedUser.deletedAt = new Date();
  await deletedUser.save();

  return deletedUser;
};

const updatePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!user.password) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User does not have a password set');
  }

  const isCurrentPasswordValid = await user.isPasswordMatch(currentPassword);
  if (!isCurrentPasswordValid) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Current password is incorrect');
  }

  if (currentPassword === newPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'New password must be different from current password');
  }

  user.password = newPassword;
  await user.save();

  // Return user without password
  const userWithoutPassword = await User.findById(userId);
  return userWithoutPassword;
};

const queryUsers = async (filter, options) => {
  const query = { isAdmin: false };

  // Status filter
  if (filter.status) {
    query.status = filter.status;
  }

  // Build aggregation pipeline for complex filters
  const pipeline = [];
  let hasComplexFilters = false;

  // Rating filter
  if (filter.rating) {
    hasComplexFilters = true;
    const ratingMatch = {};
    if (filter.rating === '5') {
      ratingMatch.$expr = { $eq: ['$avgRating', 5] };
    } else if (filter.rating === '4') {
      ratingMatch.$expr = { $gte: ['$avgRating', 4] };
    } else if (filter.rating === '3') {
      ratingMatch.$expr = { $gte: ['$avgRating', 3] };
    }

    if (Object.keys(ratingMatch).length > 0) {
      pipeline.push({
        $lookup: {
          from: 'ratings',
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$rider', '$$userId'] } } },
            { $group: { _id: '$rider', avgRating: { $avg: '$stars' }, totalRatings: { $sum: 1 } } },
          ],
          as: 'ratingData',
        },
      });
      pipeline.push({
        $addFields: {
          avgRating: { $ifNull: [{ $arrayElemAt: ['$ratingData.avgRating', 0] }, 0] },
          totalRatings: { $ifNull: [{ $arrayElemAt: ['$ratingData.totalRatings', 0] }, 0] },
        },
      });
      pipeline.push({ $match: ratingMatch });
    }
  }

  // Spend range filter
  if (filter.minSpend || filter.maxSpend) {
    hasComplexFilters = true;
    pipeline.push({
      $lookup: {
        from: 'rides',
        let: { userId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$rider', '$$userId'] }, status: 'completed' } },
          { $group: { _id: '$rider', totalSpent: { $sum: '$fare.totalFare' } } },
        ],
        as: 'spendData',
      },
    });
    pipeline.push({
      $addFields: {
        totalSpent: { $ifNull: [{ $arrayElemAt: ['$spendData.totalSpent', 0] }, 0] },
      },
    });

    if (filter.minSpend) {
      pipeline.push({ $match: { totalSpent: { $gte: parseFloat(filter.minSpend) } } });
    }
    if (filter.maxSpend) {
      pipeline.push({ $match: { totalSpent: { $lte: parseFloat(filter.maxSpend) } } });
    }
  }

  // Trip range filter
  if (filter.minTrips || filter.maxTrips) {
    hasComplexFilters = true;
    pipeline.push({
      $lookup: {
        from: 'rides',
        let: { userId: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: ['$rider', '$$userId'] }, status: 'completed' } }, { $count: 'tripCount' }],
        as: 'tripData',
      },
    });
    pipeline.push({
      $addFields: {
        totalTrips: { $ifNull: [{ $arrayElemAt: ['$tripData.tripCount', 0] }, 0] },
      },
    });

    if (filter.minTrips) {
      pipeline.push({ $match: { totalTrips: { $gte: parseInt(filter.minTrips, 10) } } });
    }
    if (filter.maxTrips) {
      pipeline.push({ $match: { totalTrips: { $lte: parseInt(filter.maxTrips, 10) } } });
    }
  }

  // Apply base query and aggregation
  if (hasComplexFilters) {
    pipeline.unshift({ $match: query });

    // Create count pipeline (same as main pipeline but without pagination)
    const countPipeline = [...pipeline];
    const lastSortIndex = countPipeline.findIndex((stage) => stage.$sort);
    if (lastSortIndex !== -1) {
      countPipeline.splice(lastSortIndex);
    }
    countPipeline.push({ $count: 'total' });

    // Add sorting to main pipeline
    if (options.sortBy) {
      const [field, order] = options.sortBy.split(':');
      pipeline.push({ $sort: { [field]: order === 'desc' ? -1 : 1 } });
    } else {
      pipeline.push({ $sort: { createdAt: -1 } });
    }

    // Add pagination
    const page = parseInt(options.page, 10) || 1;
    const limit = parseInt(options.limit, 10) || 10;
    const skip = (page - 1) * limit;

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Execute both queries in parallel
    const [results, countResult] = await Promise.all([User.aggregate(pipeline), User.aggregate(countPipeline)]);

    const totalResults = countResult.length > 0 ? countResult[0].total : 0;

    return {
      results,
      page,
      limit,
      totalPages: Math.ceil(totalResults / limit),
      totalResults,
    };
  }

  return User.paginate(query, options);
};

/**
 * Bulk update rider status
 * @param {Array} riderIds - Array of rider IDs
 * @param {string} status - New status ('active' or 'suspended')
 * @param {string} suspendReason - Reason for suspension (required when status is 'suspended')
 * @returns {Promise<Object>} - Update result
 */
const bulkUpdateRiderStatus = async (riderIds, status, suspendReason) => {
  const validIds = riderIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No valid rider IDs provided');
  }

  const updateData = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'suspended' && suspendReason) {
    updateData.suspendReason = suspendReason;
  } else if (status === 'active') {
    updateData.suspendReason = undefined;
  }

  const result = await User.updateMany(
    {
      _id: { $in: validIds },
    },
    updateData
  );

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    status,
  };
};

/**
 * Get rider dashboard summary cards
 * Returns total trips, total spent, average trip value, and cancellation rate
 */
const getRiderSummary = async (riderId) => {
  const aggregationPipeline = [
    { $match: { rider: mongoose.Types.ObjectId(riderId) } },
    {
      $group: {
        _id: null,
        totalRides: { $sum: 1 },
        completedRides: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        cancelledRides: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
        },
        totalSpent: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$fare.totalFare', 0] },
        },
        totalFareSum: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$fare.totalFare', 0] },
        },
      },
    },
  ];

  const result = await Ride.aggregate(aggregationPipeline);
  const summary = result[0] || {
    totalRides: 0,
    completedRides: 0,
    cancelledRides: 0,
    totalSpent: 0,
    totalFareSum: 0,
  };

  const cancellationRate = summary.totalRides > 0 ? ((summary.cancelledRides / summary.totalRides) * 100).toFixed(1) : '0.0';

  const averageTripValue = summary.completedRides > 0 ? (summary.totalFareSum / summary.completedRides).toFixed(2) : '0.00';

  return {
    totalTrips: summary.completedRides,
    totalSpent: summary.totalSpent,
    averageTripValue: parseFloat(averageTripValue),
    cancellationRate: parseFloat(cancellationRate),
  };
};

module.exports = {
  getUserById,
  getUserByPhone,
  updateUserById,
  deleteUserById,
  updatePassword,
  queryUsers,
  initiateAccountDeletion,
  bulkUpdateRiderStatus,
  getRiderSummary,
};
