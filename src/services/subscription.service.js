const httpStatus = require('http-status');
const { Driver, Subscription } = require('../models');
const ApiError = require('../utils/ApiError');
const stripeService = require('./stripe.service');
const driverNotificationService = require('./driverNotification.service');
const config = require('../config/config');

/**
 * Get the subscription plan details from Stripe's product catalogue.
 * Fetches the Price (with expanded Product) configured in STRIPE_PRICE_ID.
 *
 * @returns {Promise<object>} Plan details formatted for the UI
 */
const getSubscriptionPlan = async () => {
  const { priceId } = config.stripe;
  if (!priceId) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Subscription plan is not configured');
  }

  const price = await stripeService.retrievePrice(priceId);
  const { product } = price;

  return {
    plan: {
      id: price.id,
      name: product.name,
      description: product.description || null,
      amount: price.unit_amount / 100,
      currency: price.currency.toUpperCase(),
      interval: price.recurring?.interval || 'month',
      intervalCount: price.recurring?.interval_count || 1,
      features: (product.marketing_features || []).map((f) => f.name),
      metadata: product.metadata || {},
    },
  };
};

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
  const { driverId } = session.metadata;

  const firstItem = stripeSubscription.items?.data?.[0];
  const periodStart = stripeSubscription.current_period_start ?? firstItem?.current_period_start;
  const periodEnd = stripeSubscription.current_period_end ?? firstItem?.current_period_end;

  const update = {
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: firstItem?.price?.id,
    status: stripeSubscription.status,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    amount: firstItem?.price?.unit_amount,
  };
  if (periodStart) update.currentPeriodStart = new Date(periodStart * 1000);
  if (periodEnd) update.currentPeriodEnd = new Date(periodEnd * 1000);

  // Update the pending subscription document we created earlier
  const subscriptionDoc = await Subscription.findOneAndUpdate({ stripeCheckoutSessionId: session.id }, update, {
    new: true,
  });

  if (!subscriptionDoc) return;

  // Activate the driver's subscription access
  if (stripeSubscription.status === 'active') {
    await Driver.findByIdAndUpdate(driverId, {
      isSubscribed: true,
      subscriptionStatus: 'active',
    });
    driverNotificationService.notifySubscriptionRenewalSuccess(driverId);
  }
};

/** @private */
const _handleSubscriptionUpdated = async (stripeSubscription) => {
  const firstItem = stripeSubscription.items?.data?.[0];
  const periodStart = stripeSubscription.current_period_start ?? firstItem?.current_period_start;
  const periodEnd = stripeSubscription.current_period_end ?? firstItem?.current_period_end;

  const update = {
    status: stripeSubscription.status,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : undefined,
  };
  if (periodStart) update.currentPeriodStart = new Date(periodStart * 1000);
  if (periodEnd) update.currentPeriodEnd = new Date(periodEnd * 1000);

  const subscriptionDoc = await Subscription.findOneAndUpdate({ stripeSubscriptionId: stripeSubscription.id }, update, {
    new: true,
  });

  if (!subscriptionDoc) return;

  const isActive = stripeSubscription.status === 'active';
  await Driver.findByIdAndUpdate(subscriptionDoc.driver, {
    isSubscribed: isActive,
    subscriptionStatus: stripeSubscription.status,
  });

  if (isActive) {
    driverNotificationService.notifySubscriptionRenewalSuccess(subscriptionDoc.driver);
  }
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

  driverNotificationService.notifySubscriptionPaymentFailed(subscriptionDoc.driver);
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

  const subscription = await Subscription.findOne({ driver: driverId }).sort({ createdAt: -1 }).lean();

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

/**
 * Get subscription transaction / invoice history for a driver.
 * Returns Stripe invoices formatted for UI display.
 * @param {string} driverId
 * @param {number} [limit=20]
 * @returns {Promise<object[]>}
 */
const getTransactionHistory = async (driverId, limit = 20) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (!driver.stripeCustomerId) {
    return { transactions: [] };
  }

  const invoiceList = await stripeService.listInvoices(driver.stripeCustomerId, limit);

  const transactions = invoiceList.data.map((invoice) => {
    const pm = invoice.payment_intent?.payment_method;
    let paidWith = null;
    if (pm && typeof pm === 'object' && pm.card) {
      paidWith = {
        brand: pm.card.brand,
        last4: pm.card.last4,
        expiryMonth: pm.card.exp_month,
        expiryYear: pm.card.exp_year,
      };
    }

    return {
      id: invoice.id,
      invoiceNumber: invoice.number,
      description: invoice.description || 'Monthly Subscription',
      amount: invoice.amount_paid / 100, // Convert pence to pounds
      currency: invoice.currency.toUpperCase(),
      status: invoice.status, // 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
      paid: invoice.paid,
      invoiceUrl: invoice.hosted_invoice_url,
      pdfUrl: invoice.invoice_pdf,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      createdAt: new Date(invoice.created * 1000),
      paidWith,
      paymentIntent: invoice.payment_intent
        ? {
          id: invoice.payment_intent.id,
          status: invoice.payment_intent.status,
          paymentMethod: typeof invoice.payment_intent.payment_method === 'object'
            ? invoice.payment_intent.payment_method.id
            : invoice.payment_intent.payment_method,
        }
        : null,
    };
  });

  return { transactions };
};

/**
 * Get the payment method (card) used for the driver's subscription.
 * @param {string} driverId
 * @returns {Promise<object>}
 */
const getPaymentMethod = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (!driver.stripeCustomerId) {
    return { paymentMethod: null };
  }

  // Get the active subscription to find the default payment method
  const subscription = await Subscription.findOne({
    driver: driverId,
    status: { $in: ['active', 'trialing', 'past_due'] },
  }).sort({ createdAt: -1 });

  if (!subscription?.stripeSubscriptionId) {
    return { paymentMethod: null };
  }

  // Retrieve the Stripe subscription to get the payment method
  const stripeSub = await stripeService.retrieveSubscription(subscription.stripeSubscriptionId);

  const pmId = stripeSub.default_payment_method || stripeSub.latest_invoice?.payment_intent?.payment_method;

  if (!pmId) {
    // Fall back to listing all payment methods on the customer
    const pmList = await stripeService.listPaymentMethods(driver.stripeCustomerId, 'card');
    if (!pmList.data.length) return { paymentMethod: null };

    const pm = pmList.data[0];
    return {
      paymentMethod: _formatPaymentMethod(pm),
    };
  }

  const pm = await stripeService.retrievePaymentMethod(pmId);
  return { paymentMethod: _formatPaymentMethod(pm) };
};

/** @private Format a Stripe PaymentMethod for the UI */
const _formatPaymentMethod = (pm) => {
  if (!pm) return null;

  if (pm.type === 'card') {
    return {
      id: pm.id,
      type: 'card',
      brand: pm.card.brand, // 'visa' | 'mastercard' | 'amex' etc.
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      funding: pm.card.funding, // 'credit' | 'debit' | 'prepaid'
      country: pm.card.country,
      holderName: pm.billing_details?.name || null,
    };
  }

  // apple_pay / google_pay come through as 'card' type in Stripe's model
  return {
    id: pm.id,
    type: pm.type,
  };
};

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
