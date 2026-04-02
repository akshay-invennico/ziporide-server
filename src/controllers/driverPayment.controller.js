const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { paymentService } = require('../services');

/**
 * POST /v1/driver/payment/setup/intent
 */
const createSetupIntent = catchAsync(async (req, res) => {
  const result = await paymentService.createDriverSetupIntent(req.user.id);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Setup intent created successfully',
    data: result,
  });
});

/**
 * POST /v1/driver/payment/methods
 */
const addPaymentMethod = catchAsync(async (req, res) => {
  const paymentMethod = await paymentService.addDriverPaymentMethod(req.user.id, req.body.stripePaymentMethodId);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Payment method added successfully',
    data: { paymentMethod },
  });
});

/**
 * GET /v1/driver/payment/methods
 */
const listPaymentMethods = catchAsync(async (req, res) => {
  const paymentMethods = await paymentService.listDriverPaymentMethods(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Payment methods retrieved successfully',
    data: { paymentMethods },
  });
});

/**
 * DELETE /v1/driver/payment/methods/:paymentMethodId
 */
const removePaymentMethod = catchAsync(async (req, res) => {
  await paymentService.removeDriverPaymentMethod(req.user.id, req.params.paymentMethodId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Payment method removed successfully',
  });
});

/**
 * PATCH /v1/driver/payment/methods/:paymentMethodId/default
 */
const setDefaultPaymentMethod = catchAsync(async (req, res) => {
  const paymentMethod = await paymentService.setDriverDefaultPaymentMethod(req.user.id, req.params.paymentMethodId);
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
