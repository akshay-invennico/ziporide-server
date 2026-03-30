const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { driverAdminService } = require('../services');

const getDriverSubscriptions = catchAsync(async (req, res) => {
  const data = await driverAdminService.getDriverSubscriptions(req.params.id, req.query);
  const { subscriptionHistoryMeta, ...responseData } = data;
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Driver subscriptions retrieved successfully',
    data: {
      ...responseData,
    },
    meta: subscriptionHistoryMeta,
  });
});

const getDriverEarningStats = catchAsync(async (req, res) => {
  const data = await driverAdminService.getDriverEarningStats(req.params.id, req.query);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Driver earning stats retrieved successfully',
    data,
  });
});

module.exports = {
  getDriverSubscriptions,
  getDriverEarningStats,
};
