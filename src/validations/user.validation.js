const Joi = require('joi');
const { password, objectId } = require('./custom.validation');
const { validate } = require('../middlewares/validate');

const createUser = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(password),
    name: Joi.string().required(),
    role: Joi.string().required().valid('user', 'admin'),
  }),
};

const getUsers = {
  query: Joi.object().keys({
    name: Joi.string(),
    role: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

// Role-based field schemas
const driverUpdateSchema = Joi.object()
  .keys({
    name: Joi.string(),
    email: Joi.string().email(),
    dob: Joi.date().iso(),
    gender: Joi.string().valid('male', 'female', 'prefer_not_to_say'),
    address: Joi.string(),
    postCode: Joi.string(),
    profile: Joi.string(),
  })
  .min(1);

const riderUpdateSchema = Joi.object()
  .keys({
    name: Joi.string(),
    email: Joi.string().email(),
    gender: Joi.string().valid('male', 'female', 'prefer_not_to_say'),
    profile: Joi.string(),
  })
  .min(1);

const adminUpdateSchema = Joi.object()
  .keys({
    profile: Joi.string(),
    name: Joi.string(),
  })
  .min(1);

const updateUser = (req, res, next) => {
  const { user } = req;

  let schema;
  if (user.constructor.modelName === 'Driver') {
    schema = driverUpdateSchema;
  } else if (user.isAdmin) {
    schema = adminUpdateSchema;
  } else {
    schema = riderUpdateSchema;
  }

  return validate({
    body: schema,
  })(req, res, next);
};

const deleteUser = {
  body: Joi.object().keys({
    deleteReason: Joi.string().required().max(500),
  }),
};

const updatePassword = {
  body: Joi.object().keys({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().required().custom(password),
  }),
};

const initiateDeleteAccount = {
  body: Joi.object().keys({
    deleteReason: Joi.string().required().max(250),
  }),
};

const verifyDeleteAccount = {
  body: Joi.object().keys({
    otp: Joi.string().required().length(6).pattern(/^\d+$/),
  }),
};

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updatePassword,
  initiateDeleteAccount,
  verifyDeleteAccount,
};
