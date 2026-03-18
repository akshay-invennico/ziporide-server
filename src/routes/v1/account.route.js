const express = require('express');
const auth = require('../../middlewares/auth');
const accountController = require('../../controllers/account.controller');

const router = express.Router();

/**
 * POST /v1/driver/bank-account/webhook
 * Stripe Connect webhook — receives account.updated events from Stripe.
 * Must be declared BEFORE express.json() is applied (raw body required).
 * No JWT auth — secured by Stripe signature verification.
 */
router.post('/webhook', accountController.handleConnectWebhook);

/**
 * POST /v1/driver/bank-account/link
 * Generate a Stripe Connect onboarding URL.
 * The driver opens this URL in a browser/webview to enter their sort code + account number.
 * After completion, Stripe redirects to STRIPE_CONNECT_RETURN_URL.
 */
router.post('/link', auth(), accountController.linkBankAccount);

/**
 * POST /v1/driver/bank-account/verify
 * Call this immediately when Stripe redirects the driver back to STRIPE_CONNECT_RETURN_URL.
 * Checks Stripe in real-time and sets isBankLinked = true in the database.
 */
router.post('/verify', auth(), accountController.verifyBankAccount);

/**
 * GET /v1/driver/bank-account
 * Fetch the driver's linked bank account info (masked sort code, last 4 digits).
 */
router.get('/', auth(), accountController.getBankAccount);

/**
 * DELETE /v1/driver/bank-account/:bankAccountId
 * Remove a specific bank account (ba_...) from the driver's Connect account.
 */
router.delete('/:bankAccountId', auth(), accountController.deleteBankAccount);

module.exports = router;
