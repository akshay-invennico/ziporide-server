const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const driverTripService = require('../services/driverTrip.service');
const pick = require('../utils/pick');

const getTrips = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'period']);
  const options = pick(req.query, ['page', 'limit', 'sortBy']);
  const [result, stats] = await Promise.all([
    driverTripService.getDriverTrips(req.user.id, filter, options),
    driverTripService.getTripStats(req.user.id),
  ]);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Trips retrieved successfully',
    data: {
      stats,
      ...result,
    },
  });
});

const getTripDetails = catchAsync(async (req, res) => {
  const trip = await driverTripService.getDriverTripDetails(req.user.id, req.params.rideId);
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
