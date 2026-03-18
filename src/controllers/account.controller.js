const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { accountService } = require('../services');

/**
 * POST /v1/driver/bank-account/link
 * Generate a Stripe Connect onboarding URL for the driver to link their bank account.
 */
const linkBankAccount = catchAsync(async (req, res) => {
  const { url, isNewAccount } = await accountService.linkBankAccount(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: isNewAccount
      ? 'Bank account onboarding started. Complete the process via the link below.'
      : 'Onboarding link regenerated. Use the link below to complete bank account setup.',
    data: { url },
  });
});

/**
 * GET /v1/driver/bank-account
 * Retrieve the driver's linked bank account details.
 */
const getBankAccount = catchAsync(async (req, res) => {
  const data = await accountService.getBankAccount(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: data.linked ? 'Bank account details retrieved' : 'No bank account linked',
    data,
  });
});

/**
 * DELETE /v1/driver/bank-account/:bankAccountId
 * Remove a linked bank account.
 */
const deleteBankAccount = catchAsync(async (req, res) => {
  const data = await accountService.deleteBankAccount(req.user.id, req.params.bankAccountId);
  res.status(httpStatus.OK).send({
    success: true,
    message: data.message,
    data,
  });
});

module.exports = {
  linkBankAccount,
  getBankAccount,
  deleteBankAccount,
};
