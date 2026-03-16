const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { rideService } = require('../services');
const pick = require('../utils/pick');

const createRide = catchAsync(async (req, res) => {
  const ride = await rideService.createRide(req.user.id, req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Ride request created successfully',
    data: { ride },
  });
});

const getRides = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status']);
  const options = pick(req.query, ['page', 'limit', 'sortBy']);
  const result = await rideService.getRidesByRider(req.user.id, filter, options);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Rides retrieved successfully',
    data: result,
  });
});

const getRide = catchAsync(async (req, res) => {
  const ride = await rideService.getRideById(req.params.rideId, req.user.id, 'rider');
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ride retrieved successfully',
    data: { ride },
  });
});

const cancelRide = catchAsync(async (req, res) => {
  const ride = await rideService.cancelRide(req.params.rideId, req.user.id, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ride cancelled successfully',
    data: { ride },
  });
});

module.exports = {
  createRide,
  getRides,
  getRide,
  cancelRide,
};
