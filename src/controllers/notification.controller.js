const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const notificationService = require('../services/notification.service');
const pick = require('../utils/pick');

/**
 * POST /v1/notifications/fcm-token (rider)
 * POST /v1/driver/notifications/fcm-token (driver)
 * Register or update the FCM token for push notifications.
 */
const registerRiderFcmToken = catchAsync(async (req, res) => {
  await notificationService.registerRiderFcmToken(req.user.id, req.body.fcmToken);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'FCM token registered successfully',
  });
});

const registerDriverFcmToken = catchAsync(async (req, res) => {
  await notificationService.registerDriverFcmToken(req.user.id, req.body.fcmToken);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'FCM token registered successfully',
  });
});

/**
 * POST /v1/notifications/send
 * Admin sends a push notification to riders, drivers, or all.
 */
const sendNotification = catchAsync(async (req, res) => {
  const { title, body, targetAudience } = req.body;
  const result = await notificationService.sendNotification(req.user.id, { title, body, targetAudience });

  res.status(httpStatus.OK).send({
    success: true,
    message: `Notification sent: ${result.totalSent} delivered, ${result.totalFailed} failed`,
    data: {
      notification: result.notification,
      totalSent: result.totalSent,
      totalFailed: result.totalFailed,
    },
  });
});

/**
 * GET /v1/notifications
 * Admin fetches notification history (paginated).
 */
const getNotifications = catchAsync(async (req, res) => {
  const options = pick(req.query, ['page', 'limit', 'sortBy']);
  const result = await notificationService.getNotifications(options);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Notifications retrieved successfully',
    data: result,
  });
});

module.exports = {
  registerRiderFcmToken,
  registerDriverFcmToken,
  sendNotification,
  getNotifications,
};
