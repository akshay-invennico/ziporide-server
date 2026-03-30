const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { transactionService } = require('../services');

const getAllTransactions = catchAsync(async (req, res) => {
  const transactions = await transactionService.getAllTransactions(req.query);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Transactions retrieved successfully',
    data: transactions,
  });
});

const getTransactionById = catchAsync(async (req, res) => {
  const transaction = await transactionService.getTransactionById(req.params.transactionId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Transaction retrieved successfully',
    data: { transaction },
  });
});

module.exports = {
  getAllTransactions,
  getTransactionById,
};
