const Joi = require('joi');
const { ALL_PERMISSIONS, OPERATOR_ROLES } = require('../config/permissions');
const { objectId } = require('./custom.validation');

const login = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required(),
  }),
};

const createOperator = {
  body: Joi.object().keys({
    name: Joi.string().required().trim().min(2).max(100),
    email: Joi.string().required().email().trim(),
    password: Joi.string().required().min(8).max(128).messages({
      'string.min': 'Password must be at least 8 characters long',
    }),
    phone: Joi.string().trim().allow('', null),
    countryCode: Joi.string().trim().default('+44'),
    role: Joi.string()
      .required()
      .valid(...OPERATOR_ROLES),
    permissions: Joi.array()
      .items(Joi.string().valid(...ALL_PERMISSIONS))
      .default([]),
    status: Joi.string().valid('active', 'inactive', 'suspended').default('active'),
  }),
};

const getOperators = {
  query: Joi.object().keys({
    role: Joi.string().valid(...OPERATOR_ROLES),
    status: Joi.string().valid('active', 'inactive', 'suspended'),
    search: Joi.string().trim().allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getOperator = {
  params: Joi.object().keys({
    operatorId: Joi.string().required().custom(objectId),
  }),
};

const updateOperator = {
  params: Joi.object().keys({
    operatorId: Joi.string().required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim().min(2).max(100),
      email: Joi.string().email().trim(),
      phone: Joi.string().trim().allow('', null),
      countryCode: Joi.string().trim(),
      role: Joi.string().valid(...OPERATOR_ROLES),
      permissions: Joi.array().items(Joi.string().valid(...ALL_PERMISSIONS)),
      status: Joi.string().valid('active', 'inactive', 'suspended'),
    })
    .min(1),
};

const deleteOperator = {
  params: Joi.object().keys({
    operatorId: Joi.string().required().custom(objectId),
  }),
};

const updatePermissions = {
  params: Joi.object().keys({
    operatorId: Joi.string().required().custom(objectId),
  }),
  body: Joi.object().keys({
    permissions: Joi.array()
      .items(Joi.string().valid(...ALL_PERMISSIONS))
      .required(),
  }),
};

const updateStatus = {
  params: Joi.object().keys({
    operatorId: Joi.string().required().custom(objectId),
  }),
  body: Joi.object().keys({
    status: Joi.string().required().valid('active', 'inactive', 'suspended'),
  }),
};

module.exports = {
  login,
  createOperator,
  getOperators,
  getOperator,
  updateOperator,
  deleteOperator,
  updatePermissions,
  updateStatus,
};
