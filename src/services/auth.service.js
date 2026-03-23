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

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const adminLogin = async (email, password) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }

  if (!user.isAdminUser()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. Admin privileges required.');
  }

  if (user.status === 'blocked') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Your account has been blocked. Please contact support.');
  }

  if (!(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
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

  // Send email with OTP
  const subject = 'ZipoRide - Password Reset OTP';
  const text = `Your password reset OTP is: ${otp}. This OTP will expire in 15 minutes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #00897b;">ZipoRide - Password Reset</h2>
      <p>Hello ${user.name || 'User'},</p>
      <p>You requested to reset your password. Use the OTP below to proceed:</p>
      <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
        <h1 style="color: #00897b; font-size: 32px; margin: 0;">${otp}</h1>
      </div>
      <p>This OTP will expire in <strong>15 minutes</strong>.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <p>Best regards,<br>ZipoRide Team</p>
    </div>
  `;

  await emailService.sendEmail(user.email, subject, text, html);
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
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired OTP');
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
