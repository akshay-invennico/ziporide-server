const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const rideValidation = require('../../validations/ride.validation');
const rideController = require('../../controllers/ride.controller');

const router = express.Router();

router.use(auth());

/**
 * @route   POST /v1/ride
 * @desc    Create new ride request
 * @access  Private (rider)
 */
router.post('/', validate(rideValidation.createRide), rideController.createRide);

/**
 * @route   GET /v1/ride
 * @desc    Get all rides
 * @access  Private (rider)
 */
router.get('/', validate(rideValidation.getRides), rideController.getRides);

/**
 * @route   GET /v1/ride/:rideId
 * @desc    Get a single ride by id
 * @access  Private (rider)
 */
router.get('/:rideId', validate(rideValidation.getRide), rideController.getRide);

/**
 * @route   POST /v1/ride/:rideId/cancel
 * @desc    Cancel a ride
 * @access  Private (rider)
 */
router.post('/:rideId/cancel', validate(rideValidation.cancelRide), rideController.cancelRide);

module.exports = router;
