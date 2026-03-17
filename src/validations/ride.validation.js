const Joi = require('joi');

// Reusable location schema matching the ride model's locationPointSchema
const locationSchema = Joi.object({
  coordinates: Joi.array().items(Joi.number()).length(2).required().messages({
    'array.length': 'coordinates must be [longitude, latitude]',
  }),
  address: Joi.string().trim().optional().allow('', null),
});

const createRide = {
  body: Joi.object().keys({
    pickup: locationSchema.required(),
    stops: Joi.array().items(locationSchema).max(5).default([]).optional(),
    destination: locationSchema.required(),
    vehicleType: Joi.string().valid('electric', 'standard', 'xl', 'executive').required(),
    paymentMethod: Joi.string().optional(), // ObjectId string for payment method
    estimatedFare: Joi.number().min(0).optional(),
  }),
};

const cancelRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string()
      .valid(
        'taking_too_long',
        'wrong_location',
        'changed_mind',
        'found_another_ride',
        'ordered_by_mistake',
        'driver_not_moving',
        'other'
      )
      .required(),
    customReason: Joi.string()
      .trim()
      .max(300)
      .when('reason', {
        is: 'other',
        then: Joi.string().required(),
        otherwise: Joi.string().allow('', null).optional(),
      }),
  }),
};

const getRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
};

const getRides = {
  query: Joi.object().keys({
    status: Joi.string()
      .valid('searching', 'driver_allocated', 'driver_arrived', 'in_progress', 'completed', 'cancelled', 'no_drivers')
      .optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    sortBy: Joi.string().optional(),
  }),
};

module.exports = {
  createRide,
  cancelRide,
  getRide,
  getRides,
};
