const Joi = require('joi');

const upsertPricing = {
  body: Joi.object().keys({
    minimumFare: Joi.number().min(0).required(),
    cancellationFee: Joi.number().min(0).required(),
    airportParkingCharge: Joi.number().min(0).required(),
    waitingCharge: Joi.number().min(0).required(),
    freeWaitingTime: Joi.number().integer().min(0).required(),
    maxPaidWaitingTime: Joi.number().integer().min(0).required(),
    surgePricing: Joi.object()
      .keys({
        enabled: Joi.boolean().required(),
        multiplier: Joi.number().min(1).max(3).required(),
      })
      .required(),
  }),
};

const estimateFare = {
  body: Joi.object().keys({
    distanceMiles: Joi.number().min(0).required(),
    durationMinutes: Joi.number().min(0).required(),
    categoryId: Joi.string().required(),
    isAirportRide: Joi.boolean().default(false),
  }),
};

module.exports = {
  upsertPricing,
  estimateFare,
};
