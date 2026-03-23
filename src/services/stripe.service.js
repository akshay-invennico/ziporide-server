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
 * Used for subscription events (checkout, invoice, etc.)
 * @param {Buffer} rawBody      – Raw request body (must NOT be JSON-parsed)
 * @param {string} signature    – Value of the `stripe-signature` header
 * @returns {Stripe.Event}
 */
const constructWebhookEvent = (rawBody, signature) => {
  return getStripe().webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
};

/**
 * Construct and verify a Stripe Connect Webhook Event.
 * Used for account events (account.updated — bank account linked/verified).
 * Uses a SEPARATE signing secret from the subscription webhook.
 * @param {Buffer} rawBody
 * @param {string} signature
 * @returns {Stripe.Event}
 */
const constructConnectWebhookEvent = (rawBody, signature) => {
  return getStripe().webhooks.constructEvent(rawBody, signature, config.stripe.connectWebhookSecret);
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

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Connect – driver payout accounts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Stripe Connect Express account for a driver.
 * Express accounts let drivers receive payouts with Stripe-hosted onboarding.
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.driverId  – stored as metadata
 * @returns {Promise<Stripe.Account>}
 */
const createConnectAccount = async ({ email, driverId }) => {
  const stripe = getStripe();
  return stripe.accounts.create({
    type: 'express',
    country: 'GB',
    default_currency: 'gbp',
    email,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    business_type: 'individual',
    metadata: { driverId: driverId.toString() },
  });
};

/**
 * Generate a Stripe Account Link URL so the driver can complete bank account
 * onboarding on Stripe's hosted page.
 * @param {object} params
 * @param {string} params.accountId   – Stripe Connect account ID
 * @param {string} params.returnUrl   – Redirect after successful onboarding
 * @param {string} params.refreshUrl  – Redirect if the link expires
 * @returns {Promise<Stripe.AccountLink>}
 */
const createAccountLink = async ({ accountId, returnUrl, refreshUrl }) => {
  const stripe = getStripe();
  return stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  });
};

/**
 * Retrieve a Stripe Connect account (to check onboarding status / bank details).
 * @param {string} accountId
 * @returns {Promise<Stripe.Account>}
 */
const retrieveConnectAccount = async (accountId) => {
  return getStripe().accounts.retrieve(accountId);
};

/**
 * List external accounts (bank accounts) attached to a Connect account.
 * @param {string} accountId
 * @returns {Promise<Stripe.ApiList<Stripe.BankAccount>>}
 */
const listExternalAccounts = async (accountId) => {
  return getStripe().accounts.listExternalAccounts(accountId, {
    object: 'bank_account',
    limit: 10,
  });
};

/**
 * Delete (detach) a bank account from a Connect account.
 * @param {string} accountId
 * @param {string} bankAccountId
 * @returns {Promise<Stripe.DeletedBankAccount>}
 */
const deleteExternalAccount = async (accountId, bankAccountId) => {
  return getStripe().accounts.deleteExternalAccount(accountId, bankAccountId);
};

// ─────────────────────────────────────────────────────────────────────────────
// Invoices & Payment Methods – subscription billing history
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List Stripe invoices for a customer (subscription payment history).
 * @param {string} stripeCustomerId
 * @param {number} [limit=20]
 * @returns {Promise<Stripe.ApiList<Stripe.Invoice>>}
 */
const listInvoices = async (stripeCustomerId, limit = 20) => {
  return getStripe().invoices.list({
    customer: stripeCustomerId,
    limit,
    expand: ['data.payment_intent'],
  });
};

/**
 * List payment methods attached to a Stripe customer.
 * @param {string} stripeCustomerId
 * @param {string} [type='card']
 * @returns {Promise<Stripe.ApiList<Stripe.PaymentMethod>>}
 */
const listPaymentMethods = async (stripeCustomerId, type = 'card') => {
  return getStripe().paymentMethods.list({
    customer: stripeCustomerId,
    type,
  });
};

/**
 * Retrieve a single payment method by ID.
 * @param {string} paymentMethodId
 * @returns {Promise<Stripe.PaymentMethod>}
 */
const retrievePaymentMethod = async (paymentMethodId) => {
  return getStripe().paymentMethods.retrieve(paymentMethodId);
};

// ─────────────────────────────────────────────────────────────────────────────
// Rider payment – Setup Intents & Payment Methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Stripe Customer for a rider.
 * @param {object} params
 * @param {string} params.phone
 * @param {string} [params.email]
 * @param {string} [params.name]
 * @param {string} params.riderId – MongoDB user ID stored as metadata
 * @returns {Promise<Stripe.Customer>}
 */
const createRiderCustomer = async ({ phone, email, name, riderId }) => {
  const stripe = getStripe();
  return stripe.customers.create({
    phone,
    ...(email && { email }),
    ...(name && { name }),
    metadata: { riderId: riderId.toString(), role: 'rider' },
  });
};

/**
 * Create a SetupIntent so the client can securely collect card details.
 * The client_secret is returned to the mobile app which uses it with
 * Stripe's SDK to confirm the setup and save the payment method.
 * @param {string} stripeCustomerId
 * @returns {Promise<Stripe.SetupIntent>}
 */
const createSetupIntent = async (stripeCustomerId) => {
  const stripe = getStripe();
  return stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
  });
};

/**
 * Attach a payment method to a customer.
 * @param {string} paymentMethodId – Stripe pm_xxxx
 * @param {string} stripeCustomerId – Stripe cus_xxxx
 * @returns {Promise<Stripe.PaymentMethod>}
 */
const attachPaymentMethod = async (paymentMethodId, stripeCustomerId) => {
  return getStripe().paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
};

/**
 * Detach a payment method from its customer.
 * @param {string} paymentMethodId
 * @returns {Promise<Stripe.PaymentMethod>}
 */
const detachPaymentMethod = async (paymentMethodId) => {
  return getStripe().paymentMethods.detach(paymentMethodId);
};

/**
 * List all payment methods for a customer.
 * @param {string} stripeCustomerId
 * @param {string} [type='card']
 * @returns {Promise<Stripe.ApiList<Stripe.PaymentMethod>>}
 */
const listCustomerPaymentMethods = async (stripeCustomerId, type = 'card') => {
  return getStripe().paymentMethods.list({ customer: stripeCustomerId, type });
};

// ─────────────────────────────────────────────────────────────────────────────
// Ride payments – Authorize & Hold (manual capture)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a PaymentIntent with manual capture (authorize & hold).
 * This places a hold on the rider's card for the estimated fare.
 * The hold is captured after the ride completes or released on cancellation.
 *
 * @param {object} params
 * @param {number} params.amount – Amount in pence (e.g. 1850 for £18.50)
 * @param {string} params.currency – e.g. 'gbp'
 * @param {string} params.stripeCustomerId – Stripe cus_xxxx
 * @param {string} params.paymentMethodId – Stripe pm_xxxx
 * @param {string} params.rideId – MongoDB ride ID for metadata
 * @param {string} [params.description]
 * @returns {Promise<Stripe.PaymentIntent>}
 */
const createAuthorizeHold = async ({ amount, currency, stripeCustomerId, paymentMethodId, rideId, description }) => {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    customer: stripeCustomerId,
    payment_method: paymentMethodId,
    capture_method: 'manual',
    confirm: true,
    off_session: true,
    metadata: { rideId: rideId.toString() },
    ...(description && { description }),
  });
};

/**
 * Capture a previously authorized PaymentIntent.
 * Can capture a lower amount than what was authorized (e.g. actual fare < estimated).
 *
 * @param {string} paymentIntentId – Stripe pi_xxxx
 * @param {number} [amountToCapture] – Amount in pence. If omitted, captures full authorized amount.
 * @returns {Promise<Stripe.PaymentIntent>}
 */
const capturePaymentIntent = async (paymentIntentId, amountToCapture) => {
  const stripe = getStripe();
  const params = {};
  if (amountToCapture !== undefined) {
    params.amount_to_capture = amountToCapture;
  }
  return stripe.paymentIntents.capture(paymentIntentId, params);
};

/**
 * Cancel a PaymentIntent (release the hold).
 * Used when a ride is cancelled before completion.
 *
 * @param {string} paymentIntentId – Stripe pi_xxxx
 * @returns {Promise<Stripe.PaymentIntent>}
 */
const cancelPaymentIntent = async (paymentIntentId) => {
  return getStripe().paymentIntents.cancel(paymentIntentId);
};

/**
 * Retrieve a PaymentIntent by ID.
 * @param {string} paymentIntentId
 * @returns {Promise<Stripe.PaymentIntent>}
 */
const retrievePaymentIntent = async (paymentIntentId) => {
  return getStripe().paymentIntents.retrieve(paymentIntentId);
};

/**
 * Create a refund for a captured PaymentIntent.
 * @param {string} paymentIntentId
 * @param {number} [amount] – Partial refund in pence. If omitted, full refund.
 * @returns {Promise<Stripe.Refund>}
 */
const createRefund = async (paymentIntentId, amount) => {
  const stripe = getStripe();
  const params = { payment_intent: paymentIntentId };
  if (amount !== undefined) {
    params.amount = amount;
  }
  return stripe.refunds.create(params);
};

/**
 * Retrieve a Stripe Price by ID, expanding its product.
 * @param {string} priceId – Stripe price_xxxx
 * @returns {Promise<Stripe.Price>}
 */
const retrievePrice = async (priceId) => {
  return getStripe().prices.retrieve(priceId, { expand: ['product'] });
};

module.exports = {
  getStripe,
  createCustomer,
  retrieveCustomer,
  retrievePrice,
  createCheckoutSession,
  retrieveCheckoutSession,
  retrieveSubscription,
  cancelSubscription,
  cancelSubscriptionImmediately,
  constructWebhookEvent,
  constructConnectWebhookEvent,
  createPortalSession,
  // Connect
  createConnectAccount,
  createAccountLink,
  retrieveConnectAccount,
  listExternalAccounts,
  deleteExternalAccount,
  // Billing history
  listInvoices,
  listPaymentMethods,
  retrievePaymentMethod,
  // Rider payment methods
  createRiderCustomer,
  createSetupIntent,
  attachPaymentMethod,
  detachPaymentMethod,
  listCustomerPaymentMethods,
  // Ride payments (authorize & hold)
  createAuthorizeHold,
  capturePaymentIntent,
  cancelPaymentIntent,
  retrievePaymentIntent,
  createRefund,
};
