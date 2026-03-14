const httpStatus = require('http-status');
const moment = require('moment');
const { Driver, Token } = require('../models');
const ApiError = require('../utils/ApiError');
const twilioService = require('./twilio.service');
const { tokenTypes } = require('../config/tokens');
const tokenService = require('./token.service');

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOtp = async (phone, countryCode) => {
  const otp = generateOtp();
  const otpExpiresAt = moment().add(10, 'minutes').toDate();
  const fullPhone = `${countryCode}${phone}`;

  let driver = await Driver.findOne({ phone, countryCode });
  const isNewUser = !driver;

  if (!driver) {
    driver = await Driver.create({ phone, countryCode, otp, otpExpiresAt });
  } else {
    if (driver.status === 'suspended' || driver.status === 'rejected') {
      throw new ApiError(httpStatus.FORBIDDEN, `Your account has been ${driver.status}. Please contact support.`);
    }
    driver.otp = otp;
    driver.otpExpiresAt = otpExpiresAt;
    await driver.save();
  }

  await twilioService.sendOtpSms(fullPhone, otp);
  return { isNewUser };
};

const verifyOtp = async (phone, countryCode, otp) => {
  const driver = await Driver.findOne({ phone, countryCode });

  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!driver.isOtpValid(otp)) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired OTP');
  }

  driver.isPhoneVerified = true;
  driver.otp = undefined;
  driver.otpExpiresAt = undefined;
  driver.lastLoginAt = new Date();

  if (driver.onboardingStep === 0) {
    driver.onboardingStep = 1; // Phone verified, move to profile
  }

  await driver.save();
  return driver;
};

const updateProfile = async (driverId, profileData) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  Object.assign(driver, profileData);

  if (driver.onboardingStep === 1) {
    driver.onboardingStep = 2; // Profile done, move to licence
  }

  await driver.save();
  return driver;
};

const updateLicence = async (driverId, licenceData) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  driver.licence = { ...driver.licence, ...licenceData };

  if (driver.onboardingStep === 2) {
    driver.onboardingStep = 3; // Licence done, move to vehicle
  }

  await driver.save();
  return driver;
};

const updateVehicle = async (driverId, vehicleData) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  driver.vehicle = { ...driver.vehicle, ...vehicleData };

  if (driver.onboardingStep === 3) {
    driver.onboardingStep = 4; // Vehicle done, move to consents
  }

  await driver.save();
  return driver;
};

const completeOnboarding = async (driverId, consentsData) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  driver.consents = { ...driver.consents, ...consentsData, acceptedAt: new Date() };
  driver.isProfileCompleted = true;
  driver.status = 'pending'; // Waiting for admin approval

  await driver.save();
  return driver;
};

const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({ token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.remove();
};

const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const driver = await Driver.findById(refreshTokenDoc.user);
    if (!driver) {
      throw new Error();
    }
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(driver);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  updateProfile,
  updateLicence,
  updateVehicle,
  completeOnboarding,
  logout,
  refreshAuth,
};
