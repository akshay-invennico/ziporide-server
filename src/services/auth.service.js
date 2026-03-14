const httpStatus = require('http-status');
const moment = require('moment');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const twilioService = require('./twilio.service');
const { tokenTypes } = require('../config/tokens');
const Token = require('../models/token.model');
const tokenService = require('./token.service');

/**
 * @returns {string}
 */
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * @param {string} phone
 * @param {string} countryCode
 * @returns {Promise<{ isNewUser: boolean }>}
 */
const sendOtp = async (phone, countryCode) => {
  const otp = generateOtp();
  const otpExpiresAt = moment().add(10, 'minutes').toDate();
  const fullPhone = `${countryCode}${phone}`;

  let user = await User.findOne({ phone, countryCode });
  const isNewUser = !user;

  if (!user) {
    user = await User.create({ phone, countryCode, otp, otpExpiresAt });
  } else {
    if (user.status === 'blocked') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been blocked. Please contact support.');
    }
    user.otp = otp;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();
  }

  await twilioService.sendOtpSms(fullPhone, otp);
  return { isNewUser };
};

/**
 * @param {string} phone
 * @param {string} countryCode
 * @param {string} otp
 * @returns {Promise<User>}
 */
const verifyOtp = async (phone, countryCode, otp) => {
  const user = await User.findOne({ phone, countryCode });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!user.isOtpValid(otp)) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired OTP');
  }

  user.isPhoneVerified = true;
  user.otp = undefined;
  user.otpExpiresAt = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  return user;
};

/**
 * @param {ObjectId} userId
 * @param {Object} profileData
 * @returns {Promise<User>}
 */
const completeProfile = async (userId, profileData) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const { name, email, gender, isAdultConfirmed } = profileData;

  user.name = name;
  if (email) user.email = email;
  if (gender) user.gender = gender;
  if (isAdultConfirmed !== undefined) user.isAdultConfirmed = isAdultConfirmed;
  user.isProfileCompleted = true;

  await user.save();
  return user;
};

/**
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({ token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Refresh token not found');
  }
  await refreshTokenDoc.remove();
};

/**
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const user = await User.findById(refreshTokenDoc.user);
    if (!user) throw new Error();
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  completeProfile,
  logout,
  refreshAuth,
};
