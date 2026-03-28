const Joi = require('joi');
const { objectId } = require('./custom.validation');

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
    categoryId: Joi.string().custom(objectId).required(),
    paymentMethod: Joi.string().custom(objectId).required(),
    estimatedFare: Joi.number().min(0).optional(),
    isAirportRide: Joi.boolean().default(false),
  }),
};

const getRideOptions = {
  body: Joi.object().keys({
    pickup: locationSchema.required(),
    stops: Joi.array().items(locationSchema).max(5).default([]).optional(),
    destination: locationSchema.required(),
    isAirportRide: Joi.boolean().default(false),
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
        'driver_taking_too_long',
        'wrong_location',
        'incorrect_pickup_location',
        'changed_mind',
        'found_another_ride',
        'ordered_by_mistake',
        'driver_not_moving',
        'driver_asked_to_cancel',
        'safety_concerns',
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

// ── Driver-side validations ────────────────────────────────────────────────

const acceptRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
};

const declineRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().valid('busy', 'too_far', 'wrong_vehicle_type', 'personal_reason', 'other').optional(),
  }),
};

const getDriverRides = {
  query: Joi.object().keys({
    status: Joi.string().valid('driver_allocated', 'driver_arrived', 'in_progress', 'completed', 'cancelled').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    sortBy: Joi.string().optional(),
  }),
};

const arrivedAtPickup = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
};

const verifyOtp = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    otp: Joi.string().length(4).required().messages({
      'string.length': 'OTP must be exactly 4 digits',
    }),
    waitingTime: Joi.number().min(0).optional().default(0).messages({
      'number.min': 'Waiting time cannot be negative',
    }),
  }),
};

const arrivedAtStop = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
    stopIndex: Joi.number().integer().min(0).required(),
  }),
};

const arrivedAtDestination = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
};

const completeRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
};

const driverCancelRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string()
      .valid(
        'taking_too_long',
        'driver_taking_too_long',
        'wrong_location',
        'incorrect_pickup_location',
        'changed_mind',
        'found_another_ride',
        'ordered_by_mistake',
        'driver_not_moving',
        'driver_asked_to_cancel',
        'safety_concerns',
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

const retryDispatch = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
};

const getNearbyDrivers = {
  body: Joi.object().keys({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    vehicleType: Joi.string().trim().optional(),
  }),
};

const getAdminRides = {
  query: Joi.object().keys({
    driverId: Joi.string().custom(objectId).optional(),
    riderId: Joi.string().custom(objectId).optional(),
    status: Joi.string()
      .valid('searching', 'driver_allocated', 'driver_arrived', 'in_progress', 'completed', 'cancelled', 'no_drivers')
      .optional(),
    search: Joi.string().optional(),
    dateFilter: Joi.string().valid('currentYear', 'currentMonth', 'currentWeek').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    sortBy: Joi.string().optional(),
  }),
};

const getAdminRide = {
  params: Joi.object().keys({
    rideId: Joi.string().required(),
  }),
};

module.exports = {
  createRide,
  getRideOptions,
  cancelRide,
  getRide,
  getRides,
  retryDispatch,
  getNearbyDrivers,
  acceptRide,
  declineRide,
  getDriverRides,
  arrivedAtPickup,
  verifyOtp,
  arrivedAtStop,
  arrivedAtDestination,
  completeRide,
  driverCancelRide,
  getAdminRides,
  getAdminRide,
};
