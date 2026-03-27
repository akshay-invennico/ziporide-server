const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { driverService, tokenService } = require('../services');

const sendOtp = catchAsync(async (req, res) => {
  const { phone, countryCode } = req.body;
  const { isNewUser } = await driverService.sendOtp(phone, countryCode);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'OTP sent successfully',
    data: { isNewUser },
  });
});

const verifyOtp = catchAsync(async (req, res) => {
  const { phone, countryCode, otp } = req.body;
  const driver = await driverService.verifyOtp(phone, countryCode, otp);
  const tokens = await tokenService.generateAuthTokens(driver);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'OTP verified successfully',
    data: {
      driver,
      tokens,
    },
  });
});

const updateProfile = catchAsync(async (req, res) => {
  const driver = await driverService.updateProfile(req.user.id, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Profile updated successfully',
    data: { driver },
  });
});

const updateLicence = catchAsync(async (req, res) => {
  const driver = await driverService.updateLicence(req.user.id, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Licence updated successfully',
    data: { driver },
  });
});

const updateVehicle = catchAsync(async (req, res) => {
  const driver = await driverService.updateVehicle(req.user.id, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Vehicle updated successfully',
    data: { driver },
  });
});

const completeOnboarding = catchAsync(async (req, res) => {
  const driver = await driverService.completeOnboarding(req.user.id, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Onboarding completed successfully',
    data: { driver },
  });
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await driverService.refreshAuth(req.body.refreshToken);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Tokens refreshed successfully',
    data: { ...tokens },
  });
});

const logout = catchAsync(async (req, res) => {
  await driverService.logout(req.body.refreshToken);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Logged out successfully',
    data: {},
  });
});

const getAllDrivers = catchAsync(async (req, res) => {
  const drivers = await driverService.getAllDrivers(req.query);
  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Drivers retrieved successfully',
    data: drivers,
  });
});

const getDriverById = catchAsync(async (req, res) => {
  const driver = await driverService.getDriverById(req.params.id);
  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Driver retrieved successfully',
    data: { driver },
  });
});

const verifyDocument = catchAsync(async (req, res) => {
  const { id, documentType } = req.params;
  const { rejectedReason } = req.body;

  await driverService.verifyDocument(id, documentType, rejectedReason);

  const action = rejectedReason ? 'rejected' : 'verified';
  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: `Document ${action} successfully`,
  });
});

const updateDriverStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;

  await driverService.updateDriverStatus(id, action, reason);

  const message = action === 'approve' ? 'Driver approved successfully' : 'Driver rejected successfully';
  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message,
  });
});

const getVehicleTypes = catchAsync(async (req, res) => {
  const categories = await driverService.getVehicleTypes();
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Vehicle types retrieved successfully',
    data: { vehicleTypes: categories },
  });
});

const updateDriversStatus = catchAsync(async (req, res) => {
  const { driverIds, status, suspendReason } = req.body;
  const result = await driverService.bulkUpdateDriverStatus(driverIds, status, suspendReason);

  res.status(httpStatus.OK).send({
    success: true,
    message: `Driver status updated to ${status} successfully`,
    data: {
      totalRequested: driverIds.length,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      status: result.status,
    },
  });
});

module.exports = {
  sendOtp,
  verifyOtp,
  updateProfile,
  updateLicence,
  updateVehicle,
  completeOnboarding,
  refreshTokens,
  logout,
  getAllDrivers,
  getDriverById,
  verifyDocument,
  updateDriverStatus,
  getVehicleTypes,
  updateDriversStatus,
};
