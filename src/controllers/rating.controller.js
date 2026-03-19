const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ratingService = require('../services/rating.service');

const submitRating = catchAsync(async (req, res) => {
  const rating = await ratingService.submitRating(req.user.id, req.params.rideId, req.body);
  res.status(httpStatus.CREATED).send({ message: 'Rating submitted successfully', rating });
});

const getRideRating = catchAsync(async (req, res) => {
  const rating = await ratingService.getRideRating(req.user.id, req.params.rideId);
  res.send(rating);
});

const getDriverRatings = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await ratingService.getDriverRatings(req.user.id, { page: Number(page), limit: Number(limit) });
  res.send(result);
});

module.exports = {
  submitRating,
  getRideRating,
  getDriverRatings,
};
