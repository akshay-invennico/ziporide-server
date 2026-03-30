const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { driverEarningsService } = require('../services');

const getEarningsSummary = catchAsync(async (req, res) => {
  const summary = await driverEarningsService.getEarningsSummary(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Earnings summary retrieved successfully',
    data: summary,
  });
});

const getEarningsReport = catchAsync(async (req, res) => {
  const { period } = req.query;
  const report = await driverEarningsService.getEarningsReport(req.user.id, period);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Earnings report retrieved successfully',
    data: report,
  });
});

const getTransactionHistory = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const transactions = await driverEarningsService.getDriverTransactionHistory(req.user.id, { page, limit });
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Transaction history retrieved successfully',
    data: transactions,
  });
});

const getBankAccountSummary = catchAsync(async (req, res) => {
  const bankAccount = await driverEarningsService.getBankAccountSummary(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Bank account summary retrieved successfully',
    data: bankAccount,
  });
});

module.exports = {
  getEarningsSummary,
  getEarningsReport,
  getTransactionHistory,
  getBankAccountSummary,
};
