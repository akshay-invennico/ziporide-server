const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Middleware: requireSubscription
 *
 * Ensures the authenticated driver has an active Stripe subscription
 * before allowing access to protected ride endpoints.
 *
 * Usage:
 *   router.post('/accept', auth(), requireSubscription, rideController.acceptRide);
 */
const requireSubscription = (req, res, next) => {
  const driver = req.user;

  // Only enforce subscription check for Driver entities
  // (User / rider documents won't have isSubscribed)
  if (driver && driver.constructor && driver.constructor.modelName === 'Driver') {
    if (!driver.isSubscribed || driver.subscriptionStatus !== 'active') {
      return next(
        new ApiError(
          httpStatus.PAYMENT_REQUIRED,
          'An active subscription is required to receive ride requests. Please subscribe to continue.'
        )
      );
    }
  }

  return next();
};

module.exports = requireSubscription;
