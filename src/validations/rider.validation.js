const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getRiders = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'suspended'),
    rating: Joi.string().valid('5', '4', '3'),
    minSpend: Joi.number().min(0),
    maxSpend: Joi.number().min(0),
    minTrips: Joi.number().integer().min(0),
    maxTrips: Joi.number().integer().min(0),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getRider = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId),
  }),
};

const updateRidersStatus = {
  body: Joi.object().keys({
    riderIds: Joi.array().items(Joi.string().custom(objectId)).min(1).required().messages({
      'array.min': 'At least one rider ID is required',
      'any.required': 'Rider IDs are required',
    }),
    status: Joi.string().valid('active', 'suspended').required().messages({
      'any.only': 'Status must be either active or suspended',
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

const getRiderSummary = {
  query: Joi.object().keys({
    riderId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  getRiders,
  getRider,
  updateRidersStatus,
  getRiderSummary,
};
