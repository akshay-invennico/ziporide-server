const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ratingService = require('../services/rating.service');

const submitRating = catchAsync(async (req, res) => {
  const { rating, tipPayment } = await ratingService.submitRating(req.user.id, req.params.rideId, req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: tipPayment ? 'Rating and tip submitted successfully' : 'Rating submitted successfully',
    data: {
      rating,
      ...(tipPayment && { tipPayment: { id: tipPayment.id, amount: tipPayment.amount, currency: tipPayment.currency } }),
    },
  });
});

const getRideRating = catchAsync(async (req, res) => {
  const rating = await ratingService.getRideRating(req.user.id, req.params.rideId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Rating retrieved successfully',
    data: { rating },
  });
});

const getDriverRatings = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await ratingService.getDriverRatings(req.user.id, { page: Number(page), limit: Number(limit) });
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ratings retrieved successfully',
    data: result,
  });
});

const submitRiderRating = catchAsync(async (req, res) => {
  const rating = await ratingService.submitRiderRating(req.user.id, req.params.rideId, req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Rider rated successfully',
    data: { rating },
  });
});

const getRiderRatings = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const result = await ratingService.getRiderRatings(req.user.id, { page: Number(page), limit: Number(limit) });
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ratings retrieved successfully',
    data: result,
  });
});

module.exports = {
  submitRating,
  getRideRating,
  getDriverRatings,
  submitRiderRating,
  getRiderRatings,
};
