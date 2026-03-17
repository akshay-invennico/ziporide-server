const Stripe = require('stripe');
const config = require('../config/config');

/**
 * Lazy-initialized Stripe client.
 * The instance is created once and reused for all calls.
 */
let stripeClient;

const getStripe = () => {
  if (!stripeClient) {
    stripeClient = Stripe(config.stripe.secretKey);
  }
  return stripeClient;
};

/**
 * Create or retrieve a Stripe Customer for a driver.
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.name
 * @param {string} params.phone
 * @param {string} params.driverId  – MongoDB driver ID stored as metadata
 * @returns {Promise<Stripe.Customer>}
 */
const createCustomer = async ({ email, name, phone, driverId }) => {
  const stripe = getStripe();
  return stripe.customers.create({
    email,
    name,
    phone,
    metadata: { driverId: driverId.toString() },
  });
};

/**
 * Retrieve a Stripe Customer by ID.
 * @param {string} stripeCustomerId
 * @returns {Promise<Stripe.Customer>}
 */
const retrieveCustomer = async (stripeCustomerId) => {
  return getStripe().customers.retrieve(stripeCustomerId);
};

/**
 * Create a Stripe Checkout Session for a subscription.
 * @param {object} params
 * @param {string} params.stripeCustomerId
 * @param {string} params.priceId         – Stripe Price ID
 * @param {string} params.successUrl      – Redirect URL on success
 * @param {string} params.cancelUrl       – Redirect URL on cancel
 * @param {string} params.driverId        – MongoDB driver ID
 * @returns {Promise<Stripe.Checkout.Session>}
 */
const createCheckoutSession = async ({ stripeCustomerId, priceId, successUrl, cancelUrl, driverId }) => {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { driverId: driverId.toString() },
    subscription_data: {
      metadata: { driverId: driverId.toString() },
    },
  });
};

/**
 * Retrieve a Stripe Checkout Session by ID.
 * @param {string} sessionId
 * @returns {Promise<Stripe.Checkout.Session>}
 */
const retrieveCheckoutSession = async (sessionId) => {
  return getStripe().checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
};

/**
 * Retrieve a Stripe Subscription by ID.
 * @param {string} subscriptionId
 * @returns {Promise<Stripe.Subscription>}
 */
const retrieveSubscription = async (subscriptionId) => {
  return getStripe().subscriptions.retrieve(subscriptionId);
};

/**
 * Cancel a Stripe Subscription at period end.
 * @param {string} subscriptionId
 * @returns {Promise<Stripe.Subscription>}
 */
const cancelSubscription = async (subscriptionId) => {
  return getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
};

/**
 * Cancel a Stripe Subscription immediately.
 * @param {string} subscriptionId
 * @returns {Promise<Stripe.Subscription>}
 */
const cancelSubscriptionImmediately = async (subscriptionId) => {
  return getStripe().subscriptions.cancel(subscriptionId);
};

/**
 * Construct and verify a Stripe Webhook Event from the raw request body.
 * @param {Buffer} rawBody      – Raw request body (must NOT be JSON-parsed)
 * @param {string} signature    – Value of the `stripe-signature` header
 * @returns {Stripe.Event}
 */
const constructWebhookEvent = (rawBody, signature) => {
  return getStripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
};

/**
 * Create a Customer Portal session so drivers can manage their own subscription.
 * @param {string} stripeCustomerId
 * @param {string} returnUrl
 * @returns {Promise<Stripe.BillingPortal.Session>}
 */
const createPortalSession = async (stripeCustomerId, returnUrl) => {
  return getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
};

module.exports = {
  getStripe,
  createCustomer,
  retrieveCustomer,
  createCheckoutSession,
  retrieveCheckoutSession,
  retrieveSubscription,
  cancelSubscription,
  cancelSubscriptionImmediately,
  constructWebhookEvent,
  createPortalSession,
};
