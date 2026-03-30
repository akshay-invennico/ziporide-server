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
    message: 'Dashboard summary retrieved successfully',
    data: summary,
  });
});

module.exports = {
  getDashboardSummary,
};
