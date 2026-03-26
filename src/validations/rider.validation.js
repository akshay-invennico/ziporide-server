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

module.exports = {
  getRiders,
  getRider,
};
