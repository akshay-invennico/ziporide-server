const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { dashboardService } = require('../services');

/**
 * Get dashboard summary cards
 */
const getDashboardSummary = catchAsync(async (req, res) => {
  const summary = await dashboardService.getDashboardSummary(req.query);

  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Dashboard summary retrieved successfully',
    data: summary,
  });
});

/**
 * Get rider and driver report
 */
const getRiderDriverReport = catchAsync(async (req, res) => {
  const report = await dashboardService.getRiderDriverReport(req.query);

  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Rider and driver report retrieved successfully',
    data: report,
  });
});

/**
 * Get trips over time report
 */
const getTripsOverTime = catchAsync(async (req, res) => {
  const report = await dashboardService.getTripsOverTime(req.query);

  res.status(httpStatus.OK).send({
    success: true,
    statusCode: httpStatus.OK,
    message: 'Trips over time report retrieved successfully',
    data: report,
  });
});

module.exports = {
  getDashboardSummary,
  getRiderDriverReport,
  getTripsOverTime,
};
