const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { driverService, tokenService } = require('../services');

const sendOtp = catchAsync(async (req, res) => {
  const { phone, countryCode } = req.body;
  const { isNewUser } = await driverService.sendOtp(phone, countryCode);
  res.status(httpStatus.OK).send({
    message: 'OTP sent successfully',
    isNewUser,
  });
});

const verifyOtp = catchAsync(async (req, res) => {
  const { phone, countryCode, otp } = req.body;
  const driver = await driverService.verifyOtp(phone, countryCode, otp);
  const tokens = await tokenService.generateAuthTokens(driver);
  res.status(httpStatus.OK).send({
    driver,
    tokens,
  });
});

const updateProfile = catchAsync(async (req, res) => {
  const driver = await driverService.updateProfile(req.user.id, req.body);
  res.status(httpStatus.OK).send({ driver });
});

const updateLicence = catchAsync(async (req, res) => {
  const driver = await driverService.updateLicence(req.user.id, req.body);
  res.status(httpStatus.OK).send({ driver });
});

const updateVehicle = catchAsync(async (req, res) => {
  const driver = await driverService.updateVehicle(req.user.id, req.body);
  res.status(httpStatus.OK).send({ driver });
});

const completeOnboarding = catchAsync(async (req, res) => {
  const driver = await driverService.completeOnboarding(req.user.id, req.body);
  res.status(httpStatus.OK).send({ driver });
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await driverService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const logout = catchAsync(async (req, res) => {
  await driverService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
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
};
