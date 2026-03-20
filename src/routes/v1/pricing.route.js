const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const pricingValidation = require('../../validations/pricing.validation');
const pricingController = require('../../controllers/pricing.controller');

const router = express.Router();

/**
 * @route   GET /v1/pricing
 * @desc    Get current pricing configuration
 * @access  Private (admin)
 */
router.get('/', auth(), pricingController.getPricing);

/**
 * @route   PUT /v1/pricing
 * @desc    Create or update pricing configuration
 * @access  Private (admin)
 */
router.put('/', auth(), validate(pricingValidation.upsertPricing), pricingController.upsertPricing);

/**
 * @route   POST /v1/pricing/estimate
 * @desc    Estimate fare for a ride
 * @access  Private
 */
router.post('/estimate', auth(), validate(pricingValidation.estimateFare), pricingController.estimateFare);

module.exports = router;
