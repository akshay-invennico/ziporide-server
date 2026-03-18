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

/**
 * POST /v1/driver/bank-account/verify
 * Called by the frontend immediately after Stripe redirects back to STRIPE_CONNECT_RETURN_URL.
 * Checks Stripe in real-time and sets isBankLinked = true in the database.
 */
const verifyBankAccount = catchAsync(async (req, res) => {
  const data = await accountService.verifyBankAccount(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: data.message,
    data,
  });
});

/**
 * POST /v1/driver/bank-account/webhook
 * Stripe Connect webhook — called automatically by Stripe on account.updated events.
 * No JWT auth — secured via Stripe signature verification instead.
 */
const handleConnectWebhook = catchAsync(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  // req.body is a raw Buffer here — app.js applies express.raw() before express.json() for this path
  await accountService.handleConnectWebhook(req.body, signature);
  res.status(httpStatus.OK).send({ received: true });
});

module.exports = {
  linkBankAccount,
  getBankAccount,
  deleteBankAccount,
  verifyBankAccount,
  handleConnectWebhook,
};
