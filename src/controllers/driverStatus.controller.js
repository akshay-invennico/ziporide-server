const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const driverStatusService = require('../services/driverStatus.service');

/**
 * POST /v1/driver/status/online
 */
const goOnline = catchAsync(async (req, res) => {
  const { latitude, longitude } = req.body;
  const data = await driverStatusService.goOnline(req.user.id, latitude, longitude);
  res.status(httpStatus.OK).send({
    success: true,
    message: data.message,
    data,
  });
});

/**
 * POST /v1/driver/status/offline
 */
const goOffline = catchAsync(async (req, res) => {
  const data = await driverStatusService.goOffline(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: data.message,
    data,
  });
});

/**
 * PATCH /v1/driver/status/location
 */
const updateLocation = catchAsync(async (req, res) => {
  const { latitude, longitude } = req.body;
  const data = await driverStatusService.updateLocation(req.user.id, latitude, longitude);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Location updated',
    data,
  });
});

/**
 * GET /v1/driver/status
 */
const getStatus = catchAsync(async (req, res) => {
  const data = await driverStatusService.getStatus(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Driver status retrieved',
    data,
  });
});

module.exports = {
  goOnline,
  goOffline,
  updateLocation,
  getStatus,
};
