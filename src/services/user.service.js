const httpStatus = require('http-status');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');

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
 * Delete user by id
 * @param {ObjectId} userId
 * @returns {Promise<User>}
 */
const deleteUserById = async (user, deleteReason) => {
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const updatedUser = user;
  updatedUser.isDeleted = true;
  updatedUser.deletedAt = new Date();
  updatedUser.deleteReason = deleteReason;
  await updatedUser.save();

  return updatedUser;
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

  user.password = newPassword;
  await user.save();

  // Return user without password
  const userWithoutPassword = await User.findById(userId);
  return userWithoutPassword;
};

module.exports = {
  getUserById,
  getUserByPhone,
  updateUserById,
  deleteUserById,
  updatePassword,
};
