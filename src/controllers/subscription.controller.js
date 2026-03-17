const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { subscriptionService } = require('../services');

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
  await subscriptionService.handleWebhook(req.rawBody, signature);
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
  const data = await subscriptionService.cancelSubscription(req.user.id);
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

module.exports = {
  createCheckoutSession,
  handleWebhook,
  getSubscriptionStatus,
  cancelSubscription,
  createPortalSession,
};
