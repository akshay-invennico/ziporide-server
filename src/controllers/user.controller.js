const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService } = require('../services');
const pick = require('../utils/pick');

const getMe = catchAsync(async (req, res) => {
  const { user } = req;
  const role = user.constructor.modelName === 'Driver' ? 'driver' : 'rider';

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Profile retrieved successfully',
    data: { role, user },
  });
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.status(httpStatus.OK).send({
    success: true,
    message: 'User retrieved successfully',
    data: { user },
  });
});

const updateUser = catchAsync(async (req, res) => {
  await userService.updateUserById(req.user, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'User updated successfully',
  });
});

const initiateDeleteAccount = catchAsync(async (req, res) => {
  const { deleteReason } = req.body;
  const result = await userService.initiateAccountDeletion(req.user, deleteReason);

  res.status(httpStatus.OK).send({
    success: true,
    message: result.message,
    data: {
      maskedPhone: result.maskedPhone,
    },
  });
});

/**
 * Verify OTP and delete account
 */
const verifyDeleteAccount = catchAsync(async (req, res) => {
  const { otp } = req.body;
  await userService.deleteUserById(req.user, otp);

  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Account deleted successfully',
  });
});

const updatePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await userService.updatePassword(req.user._id, currentPassword, newPassword);

  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Password updated successfully',
  });
});

const getUsers = catchAsync(async (req, res) => {
  const filter = {
    ...pick(req.query, ['status', 'rating', 'minSpend', 'maxSpend', 'minTrips', 'maxTrips']),
  };
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send({
    success: true,
    message: 'Users retrieved successfully',
    data: result,
  });
});

const updateRidersStatus = catchAsync(async (req, res) => {
  const { riderIds, status } = req.body;
  const result = await userService.bulkUpdateRiderStatus(riderIds, status);

  res.status(httpStatus.OK).send({
    success: true,
    message: `Rider status updated to ${status} successfully`,
    data: {
      totalRequested: riderIds.length,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      status: result.status,
    },
  });
});

module.exports = {
  getMe,
  getUser,
  updateUser,
  updatePassword,
  getUsers,
  initiateDeleteAccount,
  verifyDeleteAccount,
  updateRidersStatus,
};
