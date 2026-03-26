const httpStatus = require('http-status');
const { User } = require('../models');
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
  initiateAccountDeletion,
};
