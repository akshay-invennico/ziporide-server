const httpStatus = require('http-status');
const { User, Driver } = require('../models');
const Notification = require('../models/notification.model');
const { getMessaging } = require('../config/firebase');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * Register or update FCM token for a rider.
 */
const registerRiderFcmToken = async (riderId, fcmToken) => {
  await User.findByIdAndUpdate(riderId, { fcmToken });
};

/**
 * Register or update FCM token for a driver.
 */
const registerDriverFcmToken = async (driverId, fcmToken) => {
  await Driver.findByIdAndUpdate(driverId, { fcmToken });
};

/**
 * Send push notification to a target audience (riders, drivers, or all).
 * Called from the admin panel.
 */
const sendNotification = async (adminId, { title, body, targetAudience }) => {
  const messaging = getMessaging();
  if (!messaging) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Push notification service is not configured');
  }

  // Collect FCM tokens based on target audience
  const tokens = [];

  if (targetAudience === 'riders' || targetAudience === 'all') {
    const riders = await User.find({ fcmToken: { $ne: null }, isDeleted: { $ne: true } })
      .select('fcmToken')
      .lean();
    tokens.push(...riders.map((r) => r.fcmToken));
  }

  if (targetAudience === 'drivers' || targetAudience === 'all') {
    const drivers = await Driver.find({ fcmToken: { $ne: null }, isDeleted: { $ne: true } })
      .select('fcmToken')
      .lean();
    tokens.push(...drivers.map((d) => d.fcmToken));
  }

  // Remove duplicates
  const uniqueTokens = [...new Set(tokens)];

  if (uniqueTokens.length === 0) {
    // Save notification record even if no tokens
    const notification = await Notification.create({
      title,
      body,
      targetAudience,
      sentBy: adminId,
      totalSent: 0,
      totalFailed: 0,
    });
    return { notification, totalSent: 0, totalFailed: 0, message: 'No devices registered for push notifications' };
  }

  // Firebase sendEachForMulticast supports up to 500 tokens per batch
  let totalSent = 0;
  let totalFailed = 0;
  const invalidTokens = [];

  for (let i = 0; i < uniqueTokens.length; i += 500) {
    const batch = uniqueTokens.slice(i, i + 500);

    const message = {
      notification: { title, body },
      tokens: batch,
    };

    try {
      const response = await messaging.sendEachForMulticast(message);
      totalSent += response.successCount;
      totalFailed += response.failureCount;

      // Collect invalid tokens for cleanup
      response.responses.forEach((resp, idx) => {
        if (
          !resp.success &&
          resp.error &&
          ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(resp.error.code)
        ) {
          invalidTokens.push(batch[idx]);
        }
      });
    } catch (err) {
      logger.error(`FCM batch send failed: ${err.message}`);
      totalFailed += batch.length;
    }
  }

  // Clean up invalid tokens
  if (invalidTokens.length > 0) {
    await User.updateMany({ fcmToken: { $in: invalidTokens } }, { $unset: { fcmToken: 1 } });
    await Driver.updateMany({ fcmToken: { $in: invalidTokens } }, { $unset: { fcmToken: 1 } });
    logger.info(`Cleaned up ${invalidTokens.length} invalid FCM tokens`);
  }

  // Save notification record
  const notification = await Notification.create({
    title,
    body,
    targetAudience,
    sentBy: adminId,
    totalSent,
    totalFailed,
  });

  logger.info(`Notification sent: ${totalSent} success, ${totalFailed} failed, audience=${targetAudience}`);
  return { notification, totalSent, totalFailed };
};

/**
 * Get paginated notification history (admin).
 */
const getNotifications = async (options = {}) => {
  return Notification.paginate(
    {},
    {
      page: options.page || 1,
      limit: options.limit || 10,
      sortBy: options.sortBy || 'createdAt:desc',
      populate: 'sentBy',
    }
  );
};

/**
 * Send a push notification to a single user by their FCM token.
 * Utility for sending ride-related notifications (e.g., ride accepted, driver arrived).
 */
const sendToUser = async (fcmToken, { title, body, data = {} }) => {
  const messaging = getMessaging();
  if (!messaging || !fcmToken) return;

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data,
    });
  } catch (err) {
    logger.error(`FCM send to token failed: ${err.message}`);
  }
};

module.exports = {
  registerRiderFcmToken,
  registerDriverFcmToken,
  sendNotification,
  getNotifications,
  sendToUser,
};
