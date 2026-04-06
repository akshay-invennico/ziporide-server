const httpStatus = require('http-status');
const { User, Payment, Ride, Driver } = require('../models');
const PaymentMethod = require('../models/paymentMethod.model');
const ApiError = require('../utils/ApiError');
const stripeService = require('./stripe.service');
const driverNotificationService = require('./driverNotification.service');
const logger = require('../config/logger');

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

/**
 * Get or create a Stripe customer for a driver.
 * @param {string} driverId
 * @returns {Promise<string>} Stripe customer ID
 */
const getOrCreateDriverStripeCustomer = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');

  if (driver.stripeCustomerId) return driver.stripeCustomerId;

  const customer = await stripeService.createCustomer({
    phone: driver.phone,
    email: driver.email,
    name: driver.name,
    driverId,
  });

  driver.stripeCustomerId = customer.id;
  await driver.save();

  return customer.id;
};


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
 * Create a SetupIntent for a driver to add a new card.
 */
const createDriverSetupIntent = async (driverId) => {
  const stripeCustomerId = await getOrCreateDriverStripeCustomer(driverId);
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
    ownerType: 'rider',
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

  const wasDefault = pm.isDefault;
  pm.isRemoved = true;
  pm.isDefault = false;
  await pm.save();

  // If this was the default, promote another card
  if (wasDefault) {
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

/**
 * Save a payment method for a driver after the mobile app confirms the SetupIntent.
 */
const addDriverPaymentMethod = async (driverId, stripePaymentMethodId) => {
  const stripeCustomerId = await getOrCreateDriverStripeCustomer(driverId);

  const stripePm = await stripeService.retrievePaymentMethod(stripePaymentMethodId);

  if (!stripePm.customer || stripePm.customer !== stripeCustomerId) {
    await stripeService.attachPaymentMethod(stripePaymentMethodId, stripeCustomerId);
  }

  const existing = await PaymentMethod.findOne({
    driver: driverId,
    ownerType: 'driver',
    isRemoved: false,
    'card.last4': stripePm.card.last4,
    'card.brand': stripePm.card.brand,
    'card.expiryMonth': stripePm.card.exp_month,
    'card.expiryYear': stripePm.card.exp_year,
  });

  if (existing) {
    existing.gatewayPaymentMethodId = stripePaymentMethodId;
    existing.gatewayCustomerId = stripeCustomerId;
    await existing.save();
    return existing;
  }

  const existingCount = await PaymentMethod.countDocuments({ driver: driverId, ownerType: 'driver', isRemoved: false });

  const paymentMethod = await PaymentMethod.create({
    driver: driverId,
    ownerType: 'driver',
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
 * List all active payment methods for a driver.
 */
const listDriverPaymentMethods = async (driverId) => {
  return PaymentMethod.find({ driver: driverId, ownerType: 'driver', isRemoved: false }).sort({
    isDefault: -1,
    createdAt: -1,
  });
};

/**
 * Remove a driver's payment method (soft-delete + detach from Stripe).
 */
const removeDriverPaymentMethod = async (driverId, paymentMethodId) => {
  const pm = await PaymentMethod.findOne({ _id: paymentMethodId, driver: driverId, ownerType: 'driver', isRemoved: false });
  if (!pm) throw new ApiError(httpStatus.NOT_FOUND, 'Payment method not found');

  if (pm.gatewayPaymentMethodId) {
    try {
      await stripeService.detachPaymentMethod(pm.gatewayPaymentMethodId);
    } catch (err) {
      logger.error('Failed to detach payment method from Stripe:', err.message);
    }
  }

  const wasDefault = pm.isDefault;
  pm.isRemoved = true;
  pm.isDefault = false;
  await pm.save();

  if (wasDefault) {
    const nextDefault = await PaymentMethod.findOne({ driver: driverId, ownerType: 'driver', isRemoved: false });
    if (nextDefault) {
      nextDefault.isDefault = true;
      await nextDefault.save();
    }
  }

  return pm;
};

/**
 * Set a driver's payment method as the default.
 * Also updates the Stripe subscription's default payment method so future renewals use the new card.
 */
const setDriverDefaultPaymentMethod = async (driverId, paymentMethodId) => {
  const pm = await PaymentMethod.findOne({ _id: paymentMethodId, driver: driverId, ownerType: 'driver', isRemoved: false });
  if (!pm) throw new ApiError(httpStatus.NOT_FOUND, 'Payment method not found');

  await PaymentMethod.updateMany({ driver: driverId, ownerType: 'driver', isRemoved: false }, { isDefault: false });

  pm.isDefault = true;
  await pm.save();

  // Update Stripe subscription's default payment method for future renewals
  if (pm.gatewayPaymentMethodId) {
    try {
      const { Subscription } = require('../models');
      const activeSub = await Subscription.findOne({ driver: driverId, status: 'active' });
      if (activeSub?.stripeSubscriptionId) {
        const stripe = stripeService.getStripe();
        await stripe.subscriptions.update(activeSub.stripeSubscriptionId, {
          default_payment_method: pm.gatewayPaymentMethodId,
        });
      }
    } catch (err) {
      logger.error(`Failed to update Stripe subscription payment method for driver ${driverId}: ${err.message}`);
    }
  }

  return pm;
};

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

  // Determine captured amount in pounds and pence
  const capturedPence = paymentIntent.amount_received;
  const capturedPounds = capturedPence / 100;

  let transfer = null;
  if (ride.driver) {
    const driver = await Driver.findById(ride.driver);
    if (driver && driver.stripeAccountId) {
      try {
        transfer = await stripeService.createTransfer({
          amount: capturedPence,
          currency: ride.fare.currency || 'GBP',
          destinationAccountId: driver.stripeAccountId,
          sourceTransaction: paymentIntent.latest_charge,
          transferGroup: `ride_${rideId}`,
          description: `Ride earnings – ${ride.rideNumber}`,
        });
        logger.info(`Transfer ${transfer.id} created for ride ${rideId} → driver ${driver.stripeAccountId}`);
      } catch (err) {
        logger.error(`Failed to transfer ride payment to driver for ride ${rideId}:`, err.message);
      }
    } else {
      logger.warn(`Driver ${ride.driver} has no stripeAccountId — transfer skipped for ride ${rideId}`);
    }
  }

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
    stripeTransferId: transfer?.id || null,
    gatewayResponse: {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      amount_received: paymentIntent.amount_received,
      status: paymentIntent.status,
      chargeId: paymentIntent.latest_charge,
      transferId: transfer?.id,
    },
    platformCommissionPct: 0,
    driverPayout: capturedPounds,
    payoutStatus: transfer ? 'paid' : 'pending',
    ...(transfer && { payoutAt: new Date() }),
  });

  // Update ride payment status
  ride.paymentStatus = 'paid';
  ride.fare.totalFare = capturedPounds;
  await ride.save();

  // notifications
  if (ride.driver) {
    const driverDoc = await Driver.findById(ride.driver).select('fcmToken').lean();
    if (driverDoc) {
      driverNotificationService.notifyPaymentReceived(driverDoc, ride, payment);
    }
  }

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
 * Stripe automatically reverses the associated transfer to the driver's
 * connected account when reverse_transfer is set to true.
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

// ─────────────────────────────────────────────────────────────────────────────
// Tip payment – separate immediate charge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge a tip for a completed ride as a separate Stripe transaction,
 * then transfer the full amount to the driver's connected account.
 *
 * Flow:
 *  1. Create an immediate-capture PaymentIntent for the tip
 *  2. Transfer full tip amount to driver via source_transaction
 *     → Driver receives 100% of tip, platform absorbs Stripe fees
 *
 * @param {object} params
 * @param {string} params.rideId
 * @param {string} params.riderId
 * @param {number} params.tipAmount – In pounds (e.g. 2.00)
 * @returns {Promise<Payment>}
 */
const chargeTip = async ({ rideId, riderId, tipAmount }) => {
  const ride = await Ride.findById(rideId).populate('paymentMethod');
  if (!ride) throw new ApiError(httpStatus.NOT_FOUND, 'Ride not found');

  if (ride.rider.toString() !== riderId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only tip on your own rides');
  }

  if (ride.status !== 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tips can only be added to completed rides');
  }

  // Check if a tip has already been charged for this ride
  const existingTip = await Payment.findOne({ ride: rideId, type: 'tip', status: 'completed' });
  if (existingTip) {
    throw new ApiError(httpStatus.CONFLICT, 'A tip has already been added for this ride');
  }

  // Use the same payment method that was used for the ride
  const pm = ride.paymentMethod;
  if (!pm || !pm.gatewayPaymentMethodId || !pm.gatewayCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No valid payment method found for this ride');
  }

  const amountInPence = _toPence(tipAmount);
  if (amountInPence < 30) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tip amount must be at least £0.30');
  }

  const paymentIntent = await stripeService.createPaymentIntent({
    amount: amountInPence,
    currency: ride.fare.currency || 'GBP',
    stripeCustomerId: pm.gatewayCustomerId,
    paymentMethodId: pm.gatewayPaymentMethodId,
    rideId,
    description: `Tip – Ride ${ride.rideNumber}`,
  });

  if (paymentIntent.status !== 'succeeded') {
    logger.error('Tip PaymentIntent failed:', paymentIntent.status);
    throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Tip payment failed. Please try again.');
  }

  const tipPence = paymentIntent.amount_received;
  const tipPounds = tipPence / 100;

  // ── Transfer tip to driver's connected account ─────────────────────────
  let transfer = null;
  if (ride.driver) {
    const driver = await Driver.findById(ride.driver);
    if (driver && driver.stripeAccountId) {
      try {
        transfer = await stripeService.createTransfer({
          amount: tipPence,
          currency: ride.fare.currency || 'GBP',
          destinationAccountId: driver.stripeAccountId,
          sourceTransaction: paymentIntent.latest_charge,
          transferGroup: `ride_${rideId}`,
          description: `Tip – Ride ${ride.rideNumber}`,
        });
        logger.info(`Tip transfer ${transfer.id} created for ride ${rideId} → driver ${driver.stripeAccountId}`);
      } catch (err) {
        logger.error(`Failed to transfer tip to driver for ride ${rideId}:`, err.message);
      }
    } else {
      logger.warn(`Driver ${ride.driver} has no stripeAccountId — tip transfer skipped for ride ${rideId}`);
    }
  }

  const payment = await Payment.create({
    ride: rideId,
    rider: ride.rider,
    driver: ride.driver,
    paymentMethod: pm._id,
    amount: tipPounds,
    currency: ride.fare.currency || 'GBP',
    type: 'tip',
    status: 'completed',
    gateway: 'stripe',
    gatewayTransactionId: paymentIntent.id,
    stripeTransferId: transfer?.id || null,
    gatewayResponse: {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      amount_received: paymentIntent.amount_received,
      status: paymentIntent.status,
      chargeId: paymentIntent.latest_charge,
      transferId: transfer?.id,
    },
    platformCommissionPct: 0,
    driverPayout: tipPounds,
    payoutStatus: transfer ? 'paid' : 'pending',
    ...(transfer && { payoutAt: new Date() }),
  });

  return payment;
};

module.exports = {
  // Stripe customer
  getOrCreateStripeCustomer,
  getOrCreateDriverStripeCustomer,
  // Rider payment methods
  createSetupIntent,
  addPaymentMethod,
  listPaymentMethods,
  removePaymentMethod,
  setDefaultPaymentMethod,
  // Driver payment methods
  createDriverSetupIntent,
  addDriverPaymentMethod,
  listDriverPaymentMethods,
  removeDriverPaymentMethod,
  setDriverDefaultPaymentMethod,
  // Ride payments
  authorizeRidePayment,
  captureRidePayment,
  releaseRidePayment,
  refundRidePayment,
  // Tips
  chargeTip,
};
