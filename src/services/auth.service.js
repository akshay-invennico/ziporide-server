const fs = require('fs').promises;
const path = require('path');
const httpStatus = require('http-status');
const moment = require('moment');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const twilioService = require('./twilio.service');
const { tokenTypes } = require('../config/tokens');
const Token = require('../models/token.model');
const tokenService = require('./token.service');
const emailService = require('./email.service');

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
    if (user.isDeleted) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been deleted. Please contact support.');
    }

    if (user.status === 'blocked') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been blocked. Please contact support.');
    }

    if (user.status === 'suspended') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been suspended. Please contact support.');
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
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired OTP');
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

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const adminLogin = async (email, password) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Incorrect email or password');
  }

  if (!user.isAdminUser()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. Admin privileges required.');
  }

  if (user.status === 'blocked') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been blocked. Please contact support.');
  }

  if (!(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Incorrect email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  return user;
};

/**
 * @param {string} email
 * @returns {Promise}
 */
const forgotPassword = async (email) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No user found with this email address');
  }

  const otp = generateOtp();
  const otpExpiresAt = moment().add(15, 'minutes').toDate();

  user.otp = otp;
  user.otpExpiresAt = otpExpiresAt;
  await user.save();

  // Read and render the OTP template
  const templatePath = path.join(__dirname, '../template/otp-verification.html');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  let htmlTemplate = await fs.readFile(templatePath, 'utf8');

  // Replace template variables
  htmlTemplate = htmlTemplate
    .replace(/{{userName}}/g, user.name || 'User')
    .replace(/{{otpCode}}/g, otp)
    .replace(/{{expiryMinutes}}/g, '15');

  // Send email with OTP
  const subject = 'ZipoRide - Password Reset OTP';
  const text = `Your password reset OTP is: ${otp}. This OTP will expire in 15 minutes.`;

  await emailService.sendEmail(user.email, subject, text, htmlTemplate);
};

/**
 * @param {string} email
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (email, newPassword) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No user found with this email address');
  }

  user.password = newPassword;
  user.otp = undefined;
  user.otpExpiresAt = undefined;
  await user.save();
};

const verifyOtpEmail = async (email, otp) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No user found with this email address');
  }

  if (!user.isOtpValid(otp)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired OTP');
  }

  user.isPhoneVerified = true;
  user.otp = undefined;
  user.otpExpiresAt = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  return user;
};

module.exports = {
  sendOtp,
  verifyOtp,
  completeProfile,
  logout,
  refreshAuth,
  adminLogin,
  forgotPassword,
  resetPassword,
  verifyOtpEmail,
};
