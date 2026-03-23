const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { paymentService } = require('../services');

/**
 * POST /v1/payment/setup-intent
 * Create a Stripe SetupIntent for adding a new card.
 * Returns client_secret for the mobile app to use with Stripe SDK.
 */
const createSetupIntent = catchAsync(async (req, res) => {
  const result = await paymentService.createSetupIntent(req.user.id);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Setup intent created successfully',
    data: result,
  });
});

/**
 * POST /v1/payment/methods
 * Save a payment method after the client confirms the SetupIntent.
 */
const addPaymentMethod = catchAsync(async (req, res) => {
  const paymentMethod = await paymentService.addPaymentMethod(req.user.id, req.body.stripePaymentMethodId);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Payment method added successfully',
    data: { paymentMethod },
  });
});

/**
 * GET /v1/payment/methods
 * List all saved payment methods for the authenticated rider.
 */
const listPaymentMethods = catchAsync(async (req, res) => {
  const paymentMethods = await paymentService.listPaymentMethods(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Payment methods retrieved successfully',
    data: { paymentMethods },
  });
});

/**
 * DELETE /v1/payment/methods/:paymentMethodId
 * Remove a saved payment method.
 */
const removePaymentMethod = catchAsync(async (req, res) => {
  await paymentService.removePaymentMethod(req.user.id, req.params.paymentMethodId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Payment method removed successfully',
  });
});

/**
 * PATCH /v1/payment/methods/:paymentMethodId/default
 * Set a payment method as the default.
 */
const setDefaultPaymentMethod = catchAsync(async (req, res) => {
  const paymentMethod = await paymentService.setDefaultPaymentMethod(req.user.id, req.params.paymentMethodId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Default payment method updated',
    data: { paymentMethod },
  });
});

module.exports = {
  createSetupIntent,
  addPaymentMethod,
  listPaymentMethods,
  removePaymentMethod,
  setDefaultPaymentMethod,
};
