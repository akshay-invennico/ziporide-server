const Joi = require('joi');

const createCheckoutSession = {
  // No body parameters needed – driver is identified from JWT
};

const cancelSubscription = {
  body: Joi.object().keys({
    reason: Joi.string().required(),
    reasonOther: Joi.string().optional(),
  }),
};

const createPortalSession = {
  // No body parameters needed
};

module.exports = {
  createCheckoutSession,
  cancelSubscription,
  createPortalSession,
};
