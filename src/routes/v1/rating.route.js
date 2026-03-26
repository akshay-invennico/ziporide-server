const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const ratingValidation = require('../../validations/rating.validation');
const ratingController = require('../../controllers/rating.controller');

const router = express.Router();

/**
 * @route   POST /v1/ratings/ride/:rideId
 * @desc    Rider submits a rating for a completed ride
 * @access  Private (rider)
 */
router.post('/ride/:rideId', auth(), validate(ratingValidation.submitRating), ratingController.submitRating);

/**
 * @route   GET /v1/ratings/ride/:rideId
 * @desc    Get the rating for a specific ride
 * @access  Private (rider)
 */
router.get('/ride/:rideId', auth(), validate(ratingValidation.getRideRating), ratingController.getRideRating);

/**
 * @route   GET /v1/ratings/driver
 * @desc    Driver fetches their own received ratings (paginated)
 * @access  Private (driver)
 */
router.get('/driver', auth(), validate(ratingValidation.getDriverRatings), ratingController.getDriverRatings);

/**
 * @route   GET /v1/ratings/rider
 * @desc    Rider fetches their own received ratings from drivers (paginated)
 * @access  Private (rider)
 */
router.get('/rider', auth(), validate(ratingValidation.getRiderRatings), ratingController.getRiderRatings);

module.exports = router;
