const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, tokenService } = require('../services');

const sendOtp = catchAsync(async (req, res) => {
  const { phone, countryCode } = req.body;
  const { isNewUser } = await authService.sendOtp(phone, countryCode);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'OTP sent successfully',
    data: { isNewUser },
  });
});

const verifyOtp = catchAsync(async (req, res) => {
  const { phone, countryCode, otp } = req.body;
  const user = await authService.verifyOtp(phone, countryCode, otp);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'OTP verified successfully',
    data: {
      user,
      tokens,
      isProfileCompleted: user.isProfileCompleted,
    },
  });
});

const completeProfile = catchAsync(async (req, res) => {
  const user = await authService.completeProfile(req.user.id, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Profile completed successfully',
    data: { user },
  });
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Tokens refreshed successfully',
    data: { ...tokens },
  });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Logged out successfully',
    data: {},
  });
});

module.exports = {
  sendOtp,
  verifyOtp,
  completeProfile,
  refreshTokens,
  logout,
};
