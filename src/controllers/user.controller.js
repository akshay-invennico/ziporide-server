const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService } = require('../services');

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

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'User deleted successfully',
    data: {},
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

module.exports = {
  getMe,
  getUser,
  updateUser,
  deleteUser,
  updatePassword,
};
