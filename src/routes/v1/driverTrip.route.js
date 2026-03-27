const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const driverTripValidation = require('../../validations/driverTrip.validation');
const driverTripController = require('../../controllers/driverTrip.controller');

const router = express.Router();

// All routes require a valid driver JWT
router.use(auth());

/**
 * @route   GET /v1/driver/trips
 * @desc    Get paginated trip history with stats (total, this week, today, week-over-week)
 * @access  Private (driver)
 */
router.get('/', validate(driverTripValidation.getTrips), driverTripController.getTrips);

/**
 * @route   GET /v1/driver/trips/:rideId
 * @desc    Get detailed trip information (ride, rider, rating, cancellation with trip stage)
 * @access  Private (driver)
 */
router.get('/:rideId', validate(driverTripValidation.getTripDetails), driverTripController.getTripDetails);

module.exports = router;
