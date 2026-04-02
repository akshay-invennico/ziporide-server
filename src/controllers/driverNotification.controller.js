const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const driverNotificationService = require('../services/driverNotification.service');
const pick = require('../utils/pick');

/**
 * GET /v1/driver/notifications
 */
const getNotifications = catchAsync(async (req, res) => {
  const options = pick(req.query, ['page', 'limit', 'isRead']);
  const result = await driverNotificationService.getNotifications(req.user.id, options);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Notifications retrieved successfully',
    data: result.results,
    meta: {
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalResults: result.totalResults,
    },
  });
});

/**
 * GET /v1/driver/notifications/unread-count
 */
const getUnreadCount = catchAsync(async (req, res) => {
  const count = await driverNotificationService.getUnreadCount(req.user.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Unread count retrieved successfully',
    data: { unreadCount: count },
  });
});

/**
 * PATCH /v1/driver/notifications/read/all
 */
const markAllAsRead = catchAsync(async (req, res) => {
  const result = await driverNotificationService.markAllAsRead(req.user.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'All notifications marked as read',
    data: result,
  });
});

module.exports = {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
};
