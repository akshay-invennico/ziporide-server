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
    message: 'Drivers retrieved successfully',
    data: drivers,
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
};
