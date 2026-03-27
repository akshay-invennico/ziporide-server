const Joi = require('joi');
const { objectId } = require('./custom.validation');

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
    vehicleCategory: Joi.string().custom(objectId).required(),
    registrationNumber: Joi.string().required(),
    make: Joi.string().required(),
    model: Joi.string().required(),
    year: Joi.number()
      .integer()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .required(),
    colour: Joi.string().allow('', null).optional(),
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

const verifyDocument = {
  params: Joi.object().keys({
    id: Joi.string().required().hex().length(24),
    documentType: Joi.string().valid('licence', 'insurance', 'mot', 'backgroundCheck').required(),
  }),
  body: Joi.object().optional().keys({
    rejectedReason: Joi.string().optional(),
  }),
};

const updateDriverStatus = {
  params: Joi.object().keys({
    id: Joi.string().required().hex().length(24),
  }),
  body: Joi.object().keys({
    action: Joi.string().valid('approve', 'reject').required(),
    reason: Joi.string().optional(),
  }),
};

const updateDriversStatus = {
  body: Joi.object().keys({
    driverIds: Joi.array().items(Joi.string().custom(objectId)).min(1).required().messages({
      'array.min': 'At least one driver ID is required',
      'any.required': 'Driver IDs are required',
    }),
    status: Joi.string().valid('approved', 'suspended').required().messages({
      'any.only': 'Status must be either approved or suspended',
      'any.required': 'Status is required',
    }),
    suspendReason: Joi.when('status', {
      is: 'suspended',
      then: Joi.string().required().messages({
        'any.required': 'Suspend reason is required when status is suspended',
      }),
      otherwise: Joi.string().optional(),
    }),
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
  verifyDocument,
  updateDriverStatus,
  updateDriversStatus,
};
