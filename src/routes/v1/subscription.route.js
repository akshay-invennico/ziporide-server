const express = require('express');
const auth = require('../../middlewares/auth');
const subscriptionController = require('../../controllers/subscription.controller');

const router = express.Router();

router.post('/webhook', subscriptionController.handleWebhook);
router.post('/checkout', auth(), subscriptionController.createCheckoutSession);
router.get('/status', auth(), subscriptionController.getSubscriptionStatus);
router.post('/cancel', auth(), subscriptionController.cancelSubscription);
router.post('/portal', auth(), subscriptionController.createPortalSession);
router.get('/transactions', auth(), subscriptionController.getTransactionHistory);
router.get('/payment-method', auth(), subscriptionController.getPaymentMethod);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Subscription
 *   description: Driver subscription management (Stripe)
 */

/**
 * @swagger
 * /driver/subscription/webhook:
 *   post:
 *     summary: Stripe webhook for subscription events
 *     description: Receives raw body from Stripe. Secured via Stripe signature verification.
 *     tags: [Subscription]
 *     responses:
 *       "200":
 *         description: Webhook received successfully
 */

/**
 * @swagger
 * /driver/subscription/checkout:
 *   post:
 *     summary: Create a Stripe Checkout Session
 *     description: Starts a subscription for the authenticated driver.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Returns the Stripe checkout session URL
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /driver/subscription/status:
 *   get:
 *     summary: Get current subscription status
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Current subscription details
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /driver/subscription/cancel:
 *   post:
 *     summary: Cancel subscription
 *     description: Cancels the subscription at the end of the current billing period.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Subscription cancelled
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /driver/subscription/portal:
 *   post:
 *     summary: Create a Stripe Customer Portal session
 *     description: Allows the driver to manage their billing and subscription self-serve.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Returns the portal session URL
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
