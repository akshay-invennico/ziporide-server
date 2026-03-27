const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const tripService = require('../services/trip.service');
const pick = require('../utils/pick');

const getTrips = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status']);
  const options = pick(req.query, ['page', 'limit', 'sortBy']);
  const [result, completedCount] = await Promise.all([
    tripService.getTrips(req.user.id, filter, options),
    tripService.getCompletedTripsCount(req.user.id),
  ]);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Trips retrieved successfully',
    data: {
      completedTripsCount: completedCount,
      ...result,
    },
  });
});

const getTripDetails = catchAsync(async (req, res) => {
  const trip = await tripService.getTripDetails(req.user.id, req.params.rideId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Trip details retrieved successfully',
    data: { trip },
  });
});

module.exports = {
  getTrips,
  getTripDetails,
};
