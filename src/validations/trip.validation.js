const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getTrips = {
  query: Joi.object().keys({
    status: Joi.string().valid('completed', 'cancelled').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    sortBy: Joi.string().optional(),
  }),
};

const getTripDetails = {
  params: Joi.object().keys({
    rideId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  getTrips,
  getTripDetails,
};
