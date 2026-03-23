const httpStatus = require('http-status');
const { User, Payment, Ride } = require('../models');
const PaymentMethod = require('../models/paymentMethod.model');
const ApiError = require('../utils/ApiError');
const stripeService = require('./stripe.service');
const logger = require('../config/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Stripe customer management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create a Stripe customer for a rider.
 * @param {string} riderId
 * @returns {Promise<string>} Stripe customer ID
 */
const getOrCreateStripeCustomer = async (riderId) => {
  const user = await User.findById(riderId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripeService.createRiderCustomer({
    phone: user.phone,
    email: user.email,
    name: user.name,
    riderId,
  });

  user.stripeCustomerId = customer.id;
  await user.save();

  return customer.id;
};

// ─────────────────────────────────────────────────────────────────────────────
// Payment method CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a SetupIntent for adding a new card.
 * Returns the client_secret for the mobile app to confirm with Stripe SDK.
 */
const createSetupIntent = async (riderId) => {
  const stripeCustomerId = await getOrCreateStripeCustomer(riderId);
  const setupIntent = await stripeService.createSetupIntent(stripeCustomerId);

  return {
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
    stripeCustomerId,
  };
};

/**
 * Save a payment method after the mobile app confirms the SetupIntent.
 * Called by the client after Stripe SDK confirms the card.
 *
 * @param {string} riderId
 * @param {string} stripePaymentMethodId – pm_xxxx from Stripe SDK
 * @returns {Promise<PaymentMethod>}
 */
const addPaymentMethod = async (riderId, stripePaymentMethodId) => {
  const stripeCustomerId = await getOrCreateStripeCustomer(riderId);

  // Retrieve the payment method details from Stripe
  const stripePm = await stripeService.retrievePaymentMethod(stripePaymentMethodId);

  // Attach to customer if not already attached
  if (!stripePm.customer || stripePm.customer !== stripeCustomerId) {
    await stripeService.attachPaymentMethod(stripePaymentMethodId, stripeCustomerId);
  }

  // Check if this card already exists (by last4 + brand + expiry)
  const existing = await PaymentMethod.findOne({
    rider: riderId,
    isRemoved: false,
    'card.last4': stripePm.card.last4,
    'card.brand': stripePm.card.brand,
    'card.expiryMonth': stripePm.card.exp_month,
    'card.expiryYear': stripePm.card.exp_year,
  });

  if (existing) {
    // Update the gateway IDs in case they changed
    existing.gatewayPaymentMethodId = stripePaymentMethodId;
    existing.gatewayCustomerId = stripeCustomerId;
    await existing.save();
    return existing;
  }

  // Check if rider has any existing methods — first card becomes default
  const existingCount = await PaymentMethod.countDocuments({ rider: riderId, isRemoved: false });

  const paymentMethod = await PaymentMethod.create({
    rider: riderId,
    type: 'card',
    card: {
      last4: stripePm.card.last4,
      brand: stripePm.card.brand,
      expiryMonth: stripePm.card.exp_month,
      expiryYear: stripePm.card.exp_year,
      holderName: stripePm.billing_details?.name || undefined,
    },
    gatewayCustomerId: stripeCustomerId,
    gatewayPaymentMethodId: stripePaymentMethodId,
    isDefault: existingCount === 0,
  });

  return paymentMethod;
};

/**
 * List all active payment methods for a rider.
 */
const listPaymentMethods = async (riderId) => {
  return PaymentMethod.find({ rider: riderId, isRemoved: false }).sort({ isDefault: -1, createdAt: -1 });
};

/**
 * Remove a payment method (soft-delete + detach from Stripe).
 */
const removePaymentMethod = async (riderId, paymentMethodId) => {
  const pm = await PaymentMethod.findOne({ _id: paymentMethodId, rider: riderId, isRemoved: false });
  if (!pm) throw new ApiError(httpStatus.NOT_FOUND, 'Payment method not found');

  // Detach from Stripe
  if (pm.gatewayPaymentMethodId) {
    try {
      await stripeService.detachPaymentMethod(pm.gatewayPaymentMethodId);
    } catch (err) {
      logger.error('Failed to detach payment method from Stripe:', err.message);
    }
  }

  pm.isRemoved = true;
  pm.isDefault = false;
  await pm.save();

  // If this was the default, promote another card
  if (pm.isDefault) {
    const nextDefault = await PaymentMethod.findOne({ rider: riderId, isRemoved: false });
    if (nextDefault) {
      nextDefault.isDefault = true;
      await nextDefault.save();
    }
  }

  return pm;
};

/**
 * Set a payment method as the default.
 */
const setDefaultPaymentMethod = async (riderId, paymentMethodId) => {
  const pm = await PaymentMethod.findOne({ _id: paymentMethodId, rider: riderId, isRemoved: false });
  if (!pm) throw new ApiError(httpStatus.NOT_FOUND, 'Payment method not found');

  // Unset current default
  await PaymentMethod.updateMany({ rider: riderId, isRemoved: false }, { isDefault: false });

  pm.isDefault = true;
  await pm.save();

  return pm;
};

// ─────────────────────────────────────────────────────────────────────────────
// Ride payment – Authorize, Capture, Release, Refund
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert pounds to pence for Stripe (which expects amounts in smallest currency unit).
 */
const _toPence = (pounds) => Math.round(pounds * 100);

/**
 * Authorize & hold the estimated fare on the rider's card.
 * Called during ride creation (before dispatch).
 *
 * @param {object} params
 * @param {string} params.rideId
 * @param {string} params.riderId
 * @param {string} params.paymentMethodId – Our PaymentMethod _id
 * @param {number} params.estimatedFare – In pounds (e.g. 18.50)
 * @param {string} [params.currency='GBP']
 * @returns {Promise<{ paymentIntentId: string, status: string }>}
 */
const authorizeRidePayment = async ({ rideId, riderId, paymentMethodId, estimatedFare, currency = 'GBP' }) => {
  // Look up the payment method to get Stripe IDs
  const pm = await PaymentMethod.findOne({ _id: paymentMethodId, rider: riderId, isRemoved: false });
  if (!pm) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment method');
  if (!pm.gatewayPaymentMethodId || !pm.gatewayCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment method is not properly configured');
  }

  const amountInPence = _toPence(estimatedFare);
  if (amountInPence < 30) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Amount too low for card authorization');
  }

  const paymentIntent = await stripeService.createAuthorizeHold({
    amount: amountInPence,
    currency,
    stripeCustomerId: pm.gatewayCustomerId,
    paymentMethodId: pm.gatewayPaymentMethodId,
    rideId,
    description: `Ride authorization – Ride ${rideId}`,
  });

  if (paymentIntent.status !== 'requires_capture') {
    logger.error('PaymentIntent authorization failed:', paymentIntent.status);
    throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Card authorization failed. Please try a different payment method.');
  }

  return {
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
  };
};

/**
 * Capture the ride payment after completion.
 * The actual fare may be less than or equal to the authorized amount.
 *
 * @param {string} rideId
 * @param {number} [actualFare] – In pounds. If omitted, captures full authorized amount.
 * @returns {Promise<Payment>}
 */
const captureRidePayment = async (rideId, actualFare) => {
  const ride = await Ride.findById(rideId).populate('paymentMethod');
  if (!ride) throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  if (!ride.stripePaymentIntentId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No payment authorization found for this ride');
  }
  if (ride.paymentStatus === 'paid') {
    throw new ApiError(httpStatus.CONFLICT, 'Payment has already been captured');
  }

  const amountToCapture = actualFare !== undefined ? _toPence(actualFare) : undefined;

  const paymentIntent = await stripeService.capturePaymentIntent(ride.stripePaymentIntentId, amountToCapture);

  // Determine captured amount in pounds
  const capturedPounds = paymentIntent.amount_received / 100;

  // Create Payment record
  const payment = await Payment.create({
    ride: rideId,
    rider: ride.rider,
    driver: ride.driver,
    paymentMethod: ride.paymentMethod?._id,
    amount: capturedPounds,
    currency: ride.fare.currency || 'GBP',
    type: 'charge',
    status: 'completed',
    gateway: 'stripe',
    gatewayTransactionId: paymentIntent.id,
    gatewayResponse: {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      amount_received: paymentIntent.amount_received,
      status: paymentIntent.status,
    },
    platformCommissionPct: 20,
    driverPayout: capturedPounds * 0.8,
  });

  // Update ride payment status
  ride.paymentStatus = 'paid';
  ride.fare.totalFare = capturedPounds;
  await ride.save();

  return payment;
};

/**
 * Release (void) the payment hold when a ride is cancelled.
 *
 * @param {string} rideId
 * @returns {Promise<void>}
 */
const releaseRidePayment = async (rideId) => {
  const ride = await Ride.findById(rideId);
  if (!ride || !ride.stripePaymentIntentId) return;

  // Only release if still in authorized (uncaptured) state
  if (ride.paymentStatus !== 'authorized') return;

  try {
    await stripeService.cancelPaymentIntent(ride.stripePaymentIntentId);
    ride.paymentStatus = 'waived';
    await ride.save();
    logger.info(`Payment hold released for ride ${rideId}`);
  } catch (err) {
    logger.error(`Failed to release payment hold for ride ${rideId}:`, err.message);
  }
};

/**
 * Refund a captured ride payment (full or partial).
 *
 * @param {string} rideId
 * @param {number} [refundAmount] – In pounds. If omitted, full refund.
 * @returns {Promise<Payment>}
 */
const refundRidePayment = async (rideId, refundAmount) => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');
  if (!ride.stripePaymentIntentId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No payment found for this ride');
  }
  if (ride.paymentStatus !== 'paid') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment has not been captured yet');
  }

  const refundAmountPence = refundAmount !== undefined ? _toPence(refundAmount) : undefined;
  const refund = await stripeService.createRefund(ride.stripePaymentIntentId, refundAmountPence);

  const refundPounds = refund.amount / 100;

  const payment = await Payment.create({
    ride: rideId,
    rider: ride.rider,
    driver: ride.driver,
    paymentMethod: ride.paymentMethod,
    amount: refundPounds,
    currency: ride.fare.currency || 'GBP',
    type: 'refund',
    status: 'completed',
    gateway: 'stripe',
    gatewayTransactionId: refund.id,
    gatewayResponse: {
      id: refund.id,
      amount: refund.amount,
      status: refund.status,
    },
  });

  ride.paymentStatus = 'refunded';
  await ride.save();

  return payment;
};

module.exports = {
  // Stripe customer
  getOrCreateStripeCustomer,
  // Payment methods
  createSetupIntent,
  addPaymentMethod,
  listPaymentMethods,
  removePaymentMethod,
  setDefaultPaymentMethod,
  // Ride payments
  authorizeRidePayment,
  captureRidePayment,
  releaseRidePayment,
  refundRidePayment,
};
