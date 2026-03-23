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
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'User updated successfully',
    data: { user },
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

module.exports = {
  getMe,
  getUser,
  updateUser,
  deleteUser,
};
