const Joi = require('joi');
const { objectId } = require('./custom.validation');

const addPaymentMethod = {
  body: Joi.object().keys({
    stripePaymentMethodId: Joi.string().required().messages({
      'string.empty': 'Stripe payment method ID is required',
    }),
  }),
};

const removePaymentMethod = {
  params: Joi.object().keys({
    paymentMethodId: Joi.string().custom(objectId).required(),
  }),
};

const setDefaultPaymentMethod = {
  params: Joi.object().keys({
    paymentMethodId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  addPaymentMethod,
  removePaymentMethod,
  setDefaultPaymentMethod,
};
