const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const vehicleService = require('../services/vehicle.service');

const getVehicles = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    'make',
    'model',
    'year',
    'color',
    'licensePlate',
    'category',
    'driverName',
    'driverPhone',
    'status',
    'search',
  ]);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const result = await vehicleService.queryVehicles(filter, options);
  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Vehicles retrieved successfully',
    data: result,
  });
});

const getVehicle = catchAsync(async (req, res) => {
  const vehicle = await vehicleService.getVehicleByDriverId(req.params.vehicleId);
  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Vehicle retrieved successfully',
    data: { vehicle },
  });
});

module.exports = {
  getVehicles,
  getVehicle,
};
