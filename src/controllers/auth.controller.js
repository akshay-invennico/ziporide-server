const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, tokenService } = require('../services');

const sendOtp = catchAsync(async (req, res) => {
  const { phone, countryCode } = req.body;
  const { isNewUser } = await authService.sendOtp(phone, countryCode);
  res.status(httpStatus.OK).send({
    message: 'OTP sent successfully',
    isNewUser,
  });
});

const verifyOtp = catchAsync(async (req, res) => {
  const { phone, countryCode, otp } = req.body;
  const user = await authService.verifyOtp(phone, countryCode, otp);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.OK).send({
    user,
    tokens,
    isProfileCompleted: user.isProfileCompleted,
  });
});

const completeProfile = catchAsync(async (req, res) => {
  const user = await authService.completeProfile(req.user.id, req.body);
  res.status(httpStatus.OK).send({ user });
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  sendOtp,
  verifyOtp,
  completeProfile,
  refreshTokens,
  logout,
};
