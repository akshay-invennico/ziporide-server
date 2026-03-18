/**
 * Bank Account Service
 * ─────────────────────
 * Handles linking a driver's bank account for receiving ride earnings.
 *
 * Uses Stripe Connect Express accounts:
 *  1. Driver calls linkBankAccount() → receives a Stripe-hosted onboarding URL
 *  2. Driver completes bank details on Stripe's page (sort code + account number)
 *  3. Driver calls getBankAccount() → server checks Stripe and returns masked details
 *
 * The bank account is separate from the subscription payment method:
 *  - Subscription is charged FROM the driver's card (Stripe Customer)
 *  - Ride earnings are paid TO the driver's bank (Stripe Connect / Express Account)
 */

const httpStatus = require('http-status');
const { Driver } = require('../models');
const ApiError = require('../utils/ApiError');
const stripeService = require('./stripe.service');
const config = require('../config/config');

/**
 * Generate (or regenerate) a Stripe Connect onboarding link so the driver
 * can link their UK bank account for receiving ride earnings.
 *
 * @param {string} driverId
 * @returns {Promise<{ url: string, isNewAccount: boolean }>}
 */
const linkBankAccount = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (driver.status !== 'approved') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Your account must be approved before linking a bank account');
  }

  let isNewAccount = false;

  // Create a Stripe Connect Express account if the driver doesn't have one yet
  if (!driver.stripeAccountId) {
    const account = await stripeService.createConnectAccount({
      email: driver.email,
      driverId: driver.id,
    });

    driver.stripeAccountId = account.id;
    await driver.save();
    isNewAccount = true;
  }

  // Generate a fresh onboarding link (links expire after a few minutes)
  const accountLink = await stripeService.createAccountLink({
    accountId: driver.stripeAccountId,
    returnUrl: config.stripe.connectReturnUrl,
    refreshUrl: config.stripe.connectRefreshUrl,
  });

  return { url: accountLink.url, isNewAccount };
};

/**
 * Retrieve the driver's linked bank account details from Stripe.
 * Also syncs the isBankLinked flag in the DB.
 *
 * @param {string} driverId
 * @returns {Promise<object>}
 */
const getBankAccount = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (!driver.stripeAccountId) {
    return {
      linked: false,
      message: 'No bank account linked yet',
      bankAccount: null,
    };
  }

  // Fetch the Connect account to check onboarding status
  const account = await stripeService.retrieveConnectAccount(driver.stripeAccountId);

  const isLinked = account.payouts_enabled && account.details_submitted;

  // Sync the DB flag if it changed
  if (driver.isBankLinked !== isLinked) {
    await Driver.findByIdAndUpdate(driverId, { isBankLinked: isLinked });
  }

  if (!isLinked) {
    return {
      linked: false,
      message: account.details_submitted
        ? 'Bank account verification is in progress'
        : 'Bank account onboarding not completed',
      bankAccount: null,
      requiresAction: !account.details_submitted,
    };
  }

  // Fetch the bank accounts attached to this Connect account
  const externalAccounts = await stripeService.listExternalAccounts(driver.stripeAccountId);
  const bankAccounts = externalAccounts.data.map((ba) => ({
    id: ba.id,
    bankName: ba.bank_name || 'Bank Account',
    accountHolderName: ba.account_holder_name,
    last4: ba.last4,
    sortCode: ba.routing_number, // In UK, routing_number = sort code
    currency: ba.currency.toUpperCase(),
    country: ba.country,
    isDefault: ba.default_for_currency,
    status: ba.status, // 'new' | 'validated' | 'verified' | 'verification_failed' | 'errored'
  }));

  return {
    linked: true,
    stripeAccountId: driver.stripeAccountId,
    payoutsEnabled: account.payouts_enabled,
    bankAccounts,
  };
};

/**
 * Remove the driver's linked bank account.
 * Deletes the external account from Stripe and resets the DB flag.
 *
 * @param {string} driverId
 * @param {string} bankAccountId  – Stripe bank account ID (ba_...)
 * @returns {Promise<object>}
 */
const deleteBankAccount = async (driverId, bankAccountId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (!driver.stripeAccountId) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No bank account linked');
  }

  await stripeService.deleteExternalAccount(driver.stripeAccountId, bankAccountId);

  // Check if any bank accounts remain
  const remaining = await stripeService.listExternalAccounts(driver.stripeAccountId);
  const isBankLinked = remaining.data.length > 0;

  await Driver.findByIdAndUpdate(driverId, { isBankLinked });

  return { success: true, message: 'Bank account removed successfully' };
};

module.exports = {
  linkBankAccount,
  getBankAccount,
  deleteBankAccount,
};
