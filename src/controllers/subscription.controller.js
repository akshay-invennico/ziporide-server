const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { subscriptionService } = require('../services');

/**
 * GET /v1/driver/subscription/plan
 * Get the subscription plan details (name, price, features) from Stripe.
 * Used to display the plan screen before the driver subscribes.
 */
const getSubscriptionPlan = catchAsync(async (req, res) => {
  const data = await subscriptionService.getSubscriptionPlan(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Subscription plan retrieved',
    data,
  });
});

/**
 * POST /v1/driver/subscription/checkout
 * Create a Stripe Checkout Session.
 * Returns a URL for the driver to complete payment.
 */
const createCheckoutSession = catchAsync(async (req, res) => {
  const { url, sessionId } = await subscriptionService.createCheckoutSession(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Checkout session created',
    data: { url, sessionId },
  });
});

/**
 * POST /v1/driver/subscription/webhook
 * Stripe webhook endpoint – receives raw body (no JSON middleware).
 */
const handleWebhook = catchAsync(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  // req.body is a raw Buffer here — app.js applies express.raw() before express.json() for this path
  await subscriptionService.handleWebhook(req.body, signature);
  res.status(httpStatus.OK).send({ received: true });
});

/**
 * GET /v1/driver/subscription/status
 * Get the current subscription status for the authenticated driver.
 */
const getSubscriptionStatus = catchAsync(async (req, res) => {
  const data = await subscriptionService.getSubscriptionStatus(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Subscription status retrieved',
    data,
  });
});

/**
 * POST /v1/driver/subscription/cancel
 * Cancel the driver's subscription at the end of the current billing period.
 */
const cancelSubscription = catchAsync(async (req, res) => {
  const { reason, reasonOther } = req.body;
  const data = await subscriptionService.cancelSubscription(req.user.id, { reason, reasonOther });
  res.status(httpStatus.OK).send({
    success: true,
    message: data.message,
    data,
  });
});

/**
 * POST /v1/driver/subscription/portal
 * Create a Stripe Customer Portal session for self-serve billing management.
 */
const createPortalSession = catchAsync(async (req, res) => {
  const { url } = await subscriptionService.createPortalSession(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Billing portal session created',
    data: { url },
  });
});

/**
 * GET /v1/driver/subscription/transactions
 * Get the driver's subscription payment / invoice history.
 */
const getTransactionHistory = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  const data = await subscriptionService.getTransactionHistory(req.user.id, limit);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Transaction history retrieved',
    data,
  });
});

/**
 * GET /v1/driver/subscription/payment-method
 * Get the card / payment method used for the driver's subscription.
 */
const getPaymentMethod = catchAsync(async (req, res) => {
  const data = await subscriptionService.getPaymentMethod(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: data.paymentMethod ? 'Payment method retrieved' : 'No payment method found',
    data,
  });
});

module.exports = {
  getSubscriptionPlan,
  createCheckoutSession,
  handleWebhook,
  getSubscriptionStatus,
  cancelSubscription,
  createPortalSession,
  getTransactionHistory,
  getPaymentMethod,
};
