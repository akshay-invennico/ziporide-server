const httpStatus = require('http-status');
const DriverNotification = require('../models/driverNotification.model');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const notificationService = require('./notification.service');

const getNotifications = async (driverId, options = {}) => {
  const query = { driver: driverId };
  if (options.isRead !== undefined) {
    query.isRead = options.isRead === 'true' || options.isRead === true;
  }

  return DriverNotification.paginate(query, {
    page: options.page || 1,
    limit: options.limit || 20,
    sortBy: 'createdAt:desc',
  });
};

const getUnreadCount = async (driverId) => {
  return DriverNotification.countDocuments({ driver: driverId, isRead: false });
};

const markAsRead = async (driverId, notificationId) => {
  const notification = await DriverNotification.findOneAndUpdate(
    { _id: notificationId, driver: driverId },
    { isRead: true },
    { new: true }
  );
  if (!notification) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
  }
  return notification;
};

const markAllAsRead = async (driverId) => {
  const result = await DriverNotification.updateMany({ driver: driverId, isRead: false }, { isRead: true });
  return { modifiedCount: result.modifiedCount };
};

const _createAndPush = async (driverId, { type, title, body, metadata }, fcmToken) => {
  try {
    await DriverNotification.create({ driver: driverId, type, title, body, metadata });

    if (fcmToken) {
      await notificationService.sendToUser(fcmToken, { title, body, data: { type } });
    }
  } catch (err) {
    logger.error(`Failed to create driver notification (${type}) for ${driverId}: ${err.message}`);
  }
};

const notifyTripCompleted = async (driver, ride) => {
  await _createAndPush(
    driver._id || driver,
    {
      type: 'trip_completed',
      title: 'Trip Completed',
      body: 'Trip completed successfully. Your earnings for this ride will be added to your account.',
      metadata: { rideId: ride._id?.toString(), rideNumber: ride.rideNumber },
    },
    driver.fcmToken
  );
};

const notifyPaymentReceived = async (driver, ride, payment) => {
  await _createAndPush(
    driver._id || driver,
    {
      type: 'payment_received',
      title: 'Payment Received',
      body: `Payment for your recent trip has been successfully processed.`,
      metadata: {
        rideId: ride._id?.toString(),
        rideNumber: ride.rideNumber,
        amount: payment.driverPayout,
        currency: payment.currency,
      },
    },
    driver.fcmToken
  );
};

const notifySubscriptionRenewalSuccess = async (driverId) => {
  const Driver = require('../models/driver.model');
  const driver = await Driver.findById(driverId).select('fcmToken').lean();

  await _createAndPush(
    driverId,
    {
      type: 'subscription_renewal_success',
      title: 'Subscription Renewal Successful',
      body: 'Your monthly Zipo Subscription has been renewed successfully.',
      metadata: {},
    },
    driver?.fcmToken
  );
};

const notifySubscriptionPaymentFailed = async (driverId) => {
  const Driver = require('../models/driver.model');
  const driver = await Driver.findById(driverId).select('fcmToken').lean();

  await _createAndPush(
    driverId,
    {
      type: 'subscription_payment_failed',
      title: 'Subscription Payment Failed',
      body: "We couldn't process your subscription payment. Please update your payment method to stay active.",
      metadata: {},
    },
    driver?.fcmToken
  );
};

const notifyNewRating = async (driverId, rating) => {
  const Driver = require('../models/driver.model');
  const driver = await Driver.findById(driverId).select('fcmToken avgRating').lean();

  await _createAndPush(
    driverId,
    {
      type: 'new_rating',
      title: 'New Rider Rating Received',
      body: 'You received a new rating from a rider. Check your updated driver rating.',
      metadata: {
        ratingId: rating._id?.toString(),
        stars: rating.stars,
        rideId: rating.ride?.toString(),
      },
    },
    driver?.fcmToken
  );
};

const notifyRiderCancelled = async (driverId, ride) => {
  const Driver = require('../models/driver.model');
  const driver = await Driver.findById(driverId).select('fcmToken').lean();

  await _createAndPush(
    driverId,
    {
      type: 'rider_cancelled',
      title: 'Rider Cancelled the Trip',
      body: 'The rider has cancelled the trip. You are now available for new ride requests.',
      metadata: { rideId: ride._id?.toString(), rideNumber: ride.rideNumber },
    },
    driver?.fcmToken
  );
};

const notifySupportTicketUpdate = async (ticket) => {
  const Driver = require('../models/driver.model');
  const driver = await Driver.findById(ticket.driver).select('fcmToken').lean();

  await _createAndPush(
    ticket.driver,
    {
      type: 'support_ticket_update',
      title: 'Support Ticket Update',
      body: 'Your support request has been reviewed. Please check the response from the support team.',
      metadata: { ticketId: ticket._id?.toString(), ticketNumber: ticket.ticketId, status: ticket.status },
    },
    driver?.fcmToken
  );
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notifyTripCompleted,
  notifyPaymentReceived,
  notifySubscriptionRenewalSuccess,
  notifySubscriptionPaymentFailed,
  notifyNewRating,
  notifyRiderCancelled,
  notifySupportTicketUpdate,
};
