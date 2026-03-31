const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const notificationValidation = require('../../validations/notification.validation');
const notificationController = require('../../controllers/notification.controller');

const router = express.Router();

/**
 * POST /v1/notifications/fcm/token
 * Rider registers/updates their FCM token for push notifications.
 */
router.post(
  '/fcm/token',
  auth(),
  validate(notificationValidation.registerFcmToken),
  notificationController.registerRiderFcmToken
);

/**
 * POST /v1/notifications/send
 * Admin sends a push notification to a target audience.
 */
router.post('/send', auth(), validate(notificationValidation.sendNotification), notificationController.sendNotification);

/**
 * GET /v1/notifications
 * Admin fetches notification history (paginated).
 */
router.get('/', auth(), validate(notificationValidation.getNotifications), notificationController.getNotifications);

module.exports = router;
