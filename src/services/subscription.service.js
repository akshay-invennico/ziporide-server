const httpStatus = require('http-status');
const { Driver, Subscription } = require('../models');
const ApiError = require('../utils/ApiError');
const stripeService = require('./stripe.service');
const config = require('../config/config');

/**
 * Create a Stripe Checkout Session for a driver subscription.
 * If the driver doesn't have a Stripe customer record yet, one is created.
 *
 * @param {string} driverId
 * @returns {Promise<{ url: string, sessionId: string }>}
 */
const createCheckoutSession = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (!driver.isProfileCompleted) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please complete your profile before subscribing');
  }

  if (driver.status !== 'approved') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Your account must be approved before you can subscribe');
  }

  // Check for an already-active subscription
  const existingSubscription = await Subscription.findOne({
    driver: driverId,
    status: 'active',
  });
  if (existingSubscription) {
    throw new ApiError(httpStatus.CONFLICT, 'You already have an active subscription');
  }

  // Create or reuse Stripe customer
  let { stripeCustomerId } = driver;
  if (!stripeCustomerId) {
    const customer = await stripeService.createCustomer({
      email: driver.email,
      name: driver.name,
      phone: `${driver.countryCode}${driver.phone}`,
      driverId: driver.id,
    });
    stripeCustomerId = customer.id;
    driver.stripeCustomerId = stripeCustomerId;
    await driver.save();
  }

  const successUrl = `${config.stripe.subscriptionReturnUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`;
  const cancelUrl = `${config.stripe.subscriptionReturnUrl}?status=cancel`;

  const session = await stripeService.createCheckoutSession({
    stripeCustomerId,
    priceId: config.stripe.priceId,
    successUrl,
    cancelUrl,
    driverId: driver.id,
  });

  // Persist a pending subscription record
  await Subscription.create({
    driver: driverId,
    stripeCustomerId,
    stripeCheckoutSessionId: session.id,
    status: 'pending',
    currency: config.stripe.currency,
  });

  return { url: session.url, sessionId: session.id };
};

/**
 * Handle incoming Stripe webhook events.
 * This is the single entry point for all subscription lifecycle events.
 *
 * @param {Buffer} rawBody
 * @param {string} signature  – stripe-signature header value
 */
const handleWebhook = async (rawBody, signature) => {
  let event;
  try {
    event = stripeService.constructWebhookEvent(rawBody, signature);
  } catch (err) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Webhook signature verification failed: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      await _handleCheckoutSessionCompleted(event.data.object);
      break;
    }
    case 'customer.subscription.updated': {
      await _handleSubscriptionUpdated(event.data.object);
      break;
    }
    case 'customer.subscription.deleted': {
      await _handleSubscriptionDeleted(event.data.object);
      break;
    }
    case 'invoice.payment_failed': {
      await _handlePaymentFailed(event.data.object);
      break;
    }
    // Other events can be added here as needed
    default:
      break;
  }
};

/** @private */
const _handleCheckoutSessionCompleted = async (session) => {
  if (session.mode !== 'subscription') return;

  const stripeSubscription = await stripeService.retrieveSubscription(session.subscription);
  const driverId = session.metadata.driverId;

  // Update the pending subscription document we created earlier
  const subscriptionDoc = await Subscription.findOneAndUpdate(
    { stripeCheckoutSessionId: session.id },
    {
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: stripeSubscription.items.data[0]?.price?.id,
      status: stripeSubscription.status,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      amount: stripeSubscription.items.data[0]?.price?.unit_amount,
    },
    { new: true }
  );

  if (!subscriptionDoc) return;

  // Activate the driver's subscription access
  if (stripeSubscription.status === 'active') {
    await Driver.findByIdAndUpdate(driverId, {
      isSubscribed: true,
      subscriptionStatus: 'active',
    });
  }
};

/** @private */
const _handleSubscriptionUpdated = async (stripeSubscription) => {
  const subscriptionDoc = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: stripeSubscription.id },
    {
      status: stripeSubscription.status,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : undefined,
    },
    { new: true }
  );

  if (!subscriptionDoc) return;

  const isActive = stripeSubscription.status === 'active';
  await Driver.findByIdAndUpdate(subscriptionDoc.driver, {
    isSubscribed: isActive,
    subscriptionStatus: stripeSubscription.status,
  });
};

/** @private */
const _handleSubscriptionDeleted = async (stripeSubscription) => {
  const subscriptionDoc = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: stripeSubscription.id },
    {
      status: 'canceled',
      canceledAt: new Date(),
    },
    { new: true }
  );

  if (!subscriptionDoc) return;

  await Driver.findByIdAndUpdate(subscriptionDoc.driver, {
    isSubscribed: false,
    subscriptionStatus: 'canceled',
  });
};

/** @private */
const _handlePaymentFailed = async (invoice) => {
  if (!invoice.subscription) return;

  const subscriptionDoc = await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: invoice.subscription },
    { status: 'past_due' },
    { new: true }
  );

  if (!subscriptionDoc) return;

  await Driver.findByIdAndUpdate(subscriptionDoc.driver, {
    isSubscribed: false,
    subscriptionStatus: 'past_due',
  });
};

/**
 * Get current subscription status for a driver.
 * @param {string} driverId
 * @returns {Promise<object>}
 */
const getSubscriptionStatus = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  const subscription = await Subscription.findOne({ driver: driverId })
    .sort({ createdAt: -1 })
    .lean();

  return {
    isSubscribed: driver.isSubscribed || false,
    subscriptionStatus: driver.subscriptionStatus || 'none',
    subscription: subscription || null,
  };
};

/**
 * Cancel a driver's subscription at period end.
 * @param {string} driverId
 * @returns {Promise<object>}
 */
const cancelSubscription = async (driverId) => {
  const subscriptionDoc = await Subscription.findOne({ driver: driverId, status: 'active' });
  if (!subscriptionDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  const stripeSubscription = await stripeService.cancelSubscription(subscriptionDoc.stripeSubscriptionId);

  subscriptionDoc.cancelAtPeriodEnd = true;
  await subscriptionDoc.save();

  return {
    message: 'Subscription will be cancelled at the end of the current billing period',
    currentPeriodEnd: subscriptionDoc.currentPeriodEnd,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
  };
};

/**
 * Create a Stripe Customer Portal session so the driver can manage billing.
 * @param {string} driverId
 * @returns {Promise<{ url: string }>}
 */
const createPortalSession = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }
  if (!driver.stripeCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No billing account found. Please subscribe first');
  }

  const session = await stripeService.createPortalSession(driver.stripeCustomerId, config.stripe.subscriptionReturnUrl);
  return { url: session.url };
};

module.exports = {
  createCheckoutSession,
  handleWebhook,
  getSubscriptionStatus,
  cancelSubscription,
  createPortalSession,
};
