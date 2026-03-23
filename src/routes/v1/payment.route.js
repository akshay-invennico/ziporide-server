const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const paymentValidation = require('../../validations/payment.validation');
const paymentController = require('../../controllers/payment.controller');

const router = express.Router();

router.use(auth());

/**
 * @route   POST /v1/payment/setup-intent
 * @desc    Create a Stripe SetupIntent to securely collect card details
 * @access  Private (rider)
 */
router.post('/setup/intent', paymentController.createSetupIntent);

/**
 * @route   POST /v1/payment/methods
 * @desc    Save a new payment method (after SetupIntent is confirmed on client)
 * @access  Private (rider)
 */
router.post('/methods', validate(paymentValidation.addPaymentMethod), paymentController.addPaymentMethod);

/**
 * @route   GET /v1/payment/methods
 * @desc    List all saved payment methods
 * @access  Private (rider)
 */
router.get('/methods', paymentController.listPaymentMethods);

/**
 * @route   DELETE /v1/payment/methods/:paymentMethodId
 * @desc    Remove a saved payment method
 * @access  Private (rider)
 */
router.delete(
  '/methods/:paymentMethodId',
  validate(paymentValidation.removePaymentMethod),
  paymentController.removePaymentMethod
);

/**
 * @route   PATCH /v1/payment/methods/:paymentMethodId/default
 * @desc    Set a payment method as the default
 * @access  Private (rider)
 */
router.patch(
  '/methods/:paymentMethodId/default',
  validate(paymentValidation.setDefaultPaymentMethod),
  paymentController.setDefaultPaymentMethod
);

module.exports = router;
