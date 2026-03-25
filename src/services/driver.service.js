const httpStatus = require('http-status');
const moment = require('moment');
const { Driver, Token, User, Ride } = require('../models');
const ApiError = require('../utils/ApiError');
const twilioService = require('./twilio.service');
const { tokenTypes } = require('../config/tokens');
const tokenService = require('./token.service');
const emailService = require('./email.service');

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

  const { profile, ...otherProfileData } = profileData;

  Object.assign(driver, otherProfileData);
  if (profile) {
    driver.profilePhotoUrl = profile;
  }

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

  const { documentUrl, ...otherLicenceData } = licenceData;

  driver.licence = {
    ...driver.licence,
    ...otherLicenceData,
    ...(documentUrl && { document: { url: documentUrl, isVerified: false } }),
  };

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

  const { insuranceCertificateUrl, motCertificateUrl, ...otherVehicleData } = vehicleData;

  driver.vehicle = {
    ...driver.vehicle,
    ...otherVehicleData,
    ...(insuranceCertificateUrl && { insurance: { url: insuranceCertificateUrl, isVerified: false } }),
    ...(motCertificateUrl && { mot: { url: motCertificateUrl, isVerified: false } }),
  };

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

const getAllDrivers = async (options) => {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    status,
    isOnline,
    isSubscribed,
    minEarnings,
    maxEarnings,
    minTrips,
    maxTrips,
    rating,
  } = options;

  const filter = {};

  if (status) {
    if (status === 'active') {
      filter.status = 'approved';
    } else {
      filter.status = status;
    }
  }

  if (isOnline !== undefined) {
    filter.isOnline = isOnline === 'true';
  }

  if (isSubscribed !== undefined) {
    filter.isSubscribed = isSubscribed === 'true';
  }

  // Rating filter

  if (rating && rating !== 'all') {
    let ratingThreshold;
    if (rating === '5_and_above') {
      ratingThreshold = 5;
    } else if (rating === '4_and_above') {
      ratingThreshold = 4;
    } else {
      ratingThreshold = 3;
    }
    filter.avgRating = { $gte: ratingThreshold };
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const drivers = await Driver.paginate(filter, {
    page,
    limit,
    sort: sortOptions,
  });

  if (drivers.results) {
    const driverPhones = drivers.results.map((driver) => driver.phone);
    const driverIds = drivers.results.map((driver) => driver._id);

    const users = await User.find({
      phone: { $in: driverPhones },
    }).select(
      '-otp -otpExpiresAt -password -isAdmin -isAdultConfirmed -isPhoneVerified -isProfileCompleted -lastLoginAt -stripeCustomerId'
    );

    const earningsPipeline = [
      { $match: { driver: { $in: driverIds }, status: 'completed' } },
      {
        $group: {
          _id: '$driver',
          totalEarnings: { $sum: '$fare.totalFare' },
          totalTrips: { $sum: 1 },
        },
      },
    ];
    const earningsData = await Ride.aggregate(earningsPipeline);

    const earningsMap = {};
    earningsData.forEach((data) => {
      earningsMap[data._id.toString()] = {
        totalEarnings: data.totalEarnings || 0,
        totalTrips: data.totalTrips || 0,
      };
    });

    let filteredDrivers = drivers.results;

    if (minEarnings !== undefined || maxEarnings !== undefined || minTrips !== undefined || maxTrips !== undefined) {
      filteredDrivers = drivers.results.filter((driver) => {
        const driverEarnings = earningsMap[driver._id.toString()] || { totalEarnings: 0, totalTrips: 0 };

        if (minEarnings !== undefined && driverEarnings.totalEarnings < minEarnings) return false;
        if (maxEarnings !== undefined && driverEarnings.totalEarnings > maxEarnings) return false;
        if (minTrips !== undefined && driverEarnings.totalTrips < minTrips) return false;
        if (maxTrips !== undefined && driverEarnings.totalTrips > maxTrips) return false;

        return true;
      });
    }

    const userMap = {};
    users.forEach((user) => {
      userMap[user.phone] = user.toJSON();
    });

    drivers.results = filteredDrivers.map((driver) => {
      const driverObj = driver.toJSON();
      delete driverObj.otp;
      delete driverObj.otpExpiresAt;

      if (userMap[driver.phone]) {
        const userDetails = userMap[driver.phone];

        if (userDetails.name && !driverObj.name) {
          driverObj.name = userDetails.name;
        }
        if (userDetails.email && !driverObj.email) {
          driverObj.email = userDetails.email;
        }
        if (userDetails.gender && !driverObj.gender) {
          driverObj.gender = userDetails.gender;
        }

        driverObj.userStatus = userDetails.status;
        driverObj.userId = userDetails.id;
      }

      const earnings = earningsMap[driver._id.toString()] || { totalEarnings: 0, totalTrips: 0 };
      driverObj.totalEarnings = earnings.totalEarnings;
      driverObj.totalTrips = earnings.totalTrips;

      return driverObj;
    });

    drivers.totalResults = filteredDrivers.length;
    drivers.totalPages = Math.ceil(filteredDrivers.length / limit);
  }

  return drivers;
};

const getDriverById = async (driverId) => {
  const driver = await Driver.findById(driverId);

  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  // Remove sensitive fields
  const driverObj = driver.toJSON();
  delete driverObj.otp;
  delete driverObj.otpExpiresAt;
  driverObj.createdAt = driver.createdAt;

  // Get earnings and trips data
  const earningsPipeline = [
    { $match: { driver: driver._id, status: 'completed' } },
    {
      $group: {
        _id: '$driver',
        totalEarnings: { $sum: '$fare.totalFare' },
        totalTrips: { $sum: 1 },
      },
    },
  ];

  const earningsData = await Ride.aggregate(earningsPipeline);

  if (earningsData.length > 0) {
    driverObj.totalEarnings = earningsData[0].totalEarnings || 0;
    driverObj.totalTrips = earningsData[0].totalTrips || 0;
  } else {
    driverObj.totalEarnings = 0;
    driverObj.totalTrips = 0;
  }

  return driverObj;
};

const verifyDocument = async (driverId, documentType, rejectedReason = null) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  const updateData = { verifiedAt: new Date() };

  if (rejectedReason) {
    updateData.isVerified = false;
    updateData.rejectedReason = rejectedReason;
  } else {
    updateData.isVerified = true;
    updateData.rejectedReason = undefined;
  }

  switch (documentType) {
    case 'licence':
      driver.licence.document.isVerified = updateData.isVerified;
      driver.licence.document.verifiedAt = updateData.verifiedAt;

      driver.licence.document.rejectedReason = updateData.rejectedReason;

      break;
    case 'insurance':
      driver.vehicle.insurance.isVerified = updateData.isVerified;
      driver.vehicle.insurance.verifiedAt = updateData.verifiedAt;

      driver.vehicle.insurance.rejectedReason = updateData.rejectedReason;

      break;
    case 'mot':
      driver.vehicle.mot.isVerified = updateData.isVerified;
      driver.vehicle.mot.verifiedAt = updateData.verifiedAt;

      driver.vehicle.mot.rejectedReason = updateData.rejectedReason;
      break;
    case 'backgroundCheck':
      driver.backgroundCheck.isVerified = updateData.isVerified;
      driver.backgroundCheck.verifiedAt = updateData.verifiedAt;

      driver.backgroundCheck.rejectedReason = updateData.rejectedReason;
      break;
    default:
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid document type');
  }

  await driver.save();
  return driver;
};

const areAllDocumentsVerified = (driver) => {
  return (
    driver.licence &&
    driver.licence.document &&
    driver.licence.document.isVerified &&
    driver.vehicle &&
    driver.vehicle.insurance &&
    driver.vehicle.insurance.isVerified &&
    driver.vehicle &&
    driver.vehicle.mot &&
    driver.vehicle.mot.isVerified &&
    driver.backgroundCheck &&
    driver.backgroundCheck.isVerified
  );
};

const getUnverifiedDocuments = (driver) => {
  const unverified = [];

  if (!driver.licence || !driver.licence.document || !driver.licence.document.isVerified) {
    unverified.push({
      document: 'licence',
      reason:
        (driver.licence && driver.licence.document && driver.licence.document.rejectedReason) || 'Document not verified',
    });
  }

  if (!driver.vehicle || !driver.vehicle.insurance || !driver.vehicle.insurance.isVerified) {
    unverified.push({
      document: 'insurance',
      reason:
        (driver.vehicle && driver.vehicle.insurance && driver.vehicle.insurance.rejectedReason) || 'Document not verified',
    });
  }

  if (!driver.vehicle || !driver.vehicle.mot || !driver.vehicle.mot.isVerified) {
    unverified.push({
      document: 'mot',
      reason: (driver.vehicle && driver.vehicle.mot && driver.vehicle.mot.rejectedReason) || 'Document not verified',
    });
  }

  if (!driver.backgroundCheck || !driver.backgroundCheck.isVerified) {
    unverified.push({
      document: 'backgroundCheck',
      reason: (driver.backgroundCheck && driver.backgroundCheck.rejectedReason) || 'Background check not verified',
    });
  }

  return unverified;
};

const updateDriverStatus = async (driverId, action, reason = null) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (action === 'approve') {
    if (!areAllDocumentsVerified(driver)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Complete all document verifications and background check before approving the driver'
      );
    }
    driver.status = 'approved';

    // Send approval email
    await emailService.sendDriverApprovalEmail(driver);
  } else if (action === 'reject') {
    driver.status = 'rejected';

    // Get unverified documents and their reasons
    const unverifiedDocuments = getUnverifiedDocuments(driver);

    // Send rejection email with details
    await emailService.sendDriverRejectionEmail(driver, unverifiedDocuments, reason);
  }

  await driver.save();
  return driver;
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
  getAllDrivers,
  getDriverById,
  verifyDocument,
  updateDriverStatus,
};
