const express = require('express');
const auth = require('../../middlewares/auth');
const accountController = require('../../controllers/account.controller');

const router = express.Router();

/**
 * POST /v1/driver/bank-account/links
 * Generate a Stripe Connect onboarding URL.
 * The driver opens this URL in a browser/webview to enter their bank details.
 * After completion, Stripe redirects to STRIPE_CONNECT_RETURN_URL.
 */
router.post('/link', auth(), accountController.linkBankAccount);

/**
 * GET /v1/driver/bank-account
 * Fetch the driver's linked bank account info (masked sort code, last 4 digits).
 * Also syncs the isBankLinked flag in the database.
 */
router.get('/', auth(), accountController.getBankAccount);

/**
 * DELETE /v1/driver/bank-account/:bankAccountId
 * Remove a specific bank account (ba_...) from the driver's Connect account.
 */
router.delete('/:bankAccountId', auth(), accountController.deleteBankAccount);

module.exports = router;
