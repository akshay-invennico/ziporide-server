const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const tripValidation = require('../../validations/trip.validation');
const tripController = require('../../controllers/trip.controller');

const router = express.Router();

/**
 * @route   GET /v1/trips
 * @desc    Get paginated list of rider's completed and cancelled trips
 * @access  Private (rider)
 */
router.get('/', auth(), validate(tripValidation.getTrips), tripController.getTrips);

/**
 * @route   GET /v1/trips/:rideId
 * @desc    Get detailed trip information (ride, driver, vehicle, rating, cancellation)
 * @access  Private (rider)
 */
router.get('/:rideId', auth(), validate(tripValidation.getTripDetails), tripController.getTripDetails);

module.exports = router;
