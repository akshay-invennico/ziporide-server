const Joi = require('joi');
const { password } = require('./custom.validation');

const sendOtp = {
  body: Joi.object().keys({
    phone: Joi.string().required().trim(),
    countryCode: Joi.string().required().trim().default('+91'),
  }),
};

const verifyOtp = {
  body: Joi.object().keys({
    phone: Joi.string().required().trim(),
    countryCode: Joi.string().required().trim().default('+91'),
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      'string.length': 'OTP must be exactly 6 digits',
      'string.pattern.base': 'OTP must contain only digits',
    }),
  }),
};

const completeProfile = {
  body: Joi.object().keys({
    name: Joi.string().trim().required(),
    email: Joi.string().email().trim().lowercase().optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    isAdultConfirmed: Joi.boolean().valid(true).required().messages({
      'any.only': 'You must confirm that you are 18 or above to use Zipo',
    }),
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

const adminLogin = {
  body: Joi.object().keys({
    email: Joi.string().required().email().trim().lowercase(),
    password: Joi.string().required(),
  }),
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().required().email().trim().lowercase(),
  }),
};

const resetPassword = {
  body: Joi.object().keys({
    email: Joi.string().required().email().trim().lowercase(),
    newPassword: Joi.string().required().custom(password),
  }),
};

const verifyOtpEmail = {
  body: Joi.object().keys({
    email: Joi.string().required().email().trim().lowercase(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      'string.length': 'OTP must be exactly 6 digits',
      'string.pattern.base': 'OTP must contain only digits',
    }),
  }),
};

module.exports = {
  sendOtp,
  verifyOtp,
  completeProfile,
  refreshTokens,
  logout,
  adminLogin,
  forgotPassword,
  resetPassword,
  verifyOtpEmail,
};
