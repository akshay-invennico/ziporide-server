const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { driverDashboardService } = require('../services');

const getDashboard = catchAsync(async (req, res) => {
  console.log(req.user);
  const dashboard = await driverDashboardService.getDashboard(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Dashboard retrieved successfully',
    data: dashboard,
  });
});

module.exports = {
  getDashboard,
};
