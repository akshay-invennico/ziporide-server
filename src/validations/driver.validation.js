const Joi = require('joi');

const sendOtp = {
  body: Joi.object().keys({
    phone: Joi.string().required(),
    countryCode: Joi.string().required().default('+44'),
  }),
};

const verifyOtp = {
  body: Joi.object().keys({
    phone: Joi.string().required(),
    countryCode: Joi.string().required().default('+44'),
    otp: Joi.string().required(),
  }),
};

const updateProfile = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    dateOfBirth: Joi.date().iso().required(),
    email: Joi.string().email().required(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    address: Joi.object()
      .keys({
        line1: Joi.string().required(),
        postcode: Joi.string().required(),
        country: Joi.string().default('GB').optional(),
      })
      .required(),
    profile: Joi.string().uri().required(),
  }),
};

const updateLicence = {
  body: Joi.object().keys({
    number: Joi.string().required(),
    expiryDate: Joi.date().iso().required(),
    issuingAuthority: Joi.string().required(),
    documentUrl: Joi.string().uri().required(),
  }),
};

const updateVehicle = {
  body: Joi.object().keys({
    type: Joi.string().valid('electric', 'standard', 'xl').required(),
    registrationNumber: Joi.string().required(),
    make: Joi.string().required(),
    model: Joi.string().required(),
    year: Joi.number()
      .integer()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .required(),
    colour: Joi.string().allow('', null).optional(), // added colour just in case, though might not be in UI, skipped in reqs, but safe
    insuranceCertificateUrl: Joi.string().uri().required(),
    motCertificateUrl: Joi.string().uri().required(),
  }),
};

const completeOnboarding = {
  body: Joi.object().keys({
    termsOfService: Joi.boolean().valid(true).required(),
    privacyPolicy: Joi.boolean().valid(true).required(),
    dataProcessingConsent: Joi.boolean().valid(true).required(),
  }),
};

const refreshTokens = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const logout = {
  body: Joi.object().keys({
    refreshToken: Joi.string().required(),
  }),
};

const getAllDrivers = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'name', 'status', 'lastLoginAt', 'avgRating').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'suspended', 'active'),
    isOnline: Joi.string().valid('true', 'false'),
    isSubscribed: Joi.string().valid('true', 'false'),
    minEarnings: Joi.number().min(0).optional(),
    maxEarnings: Joi.number().min(0).optional(),
    minTrips: Joi.number().min(0).optional(),
    maxTrips: Joi.number().min(0).optional(),
    rating: Joi.string().valid('5_and_above', '4_and_above', '3_and_above'),
  }),
};

const getDriverById = {
  params: Joi.object().keys({
    id: Joi.string().required().hex().length(24),
  }),
};

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
};
