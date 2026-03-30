const httpStatus = require('http-status');
const { Driver, Ride, Subscription } = require('../models');
const ApiError = require('../utils/ApiError');
const stripeService = require('./stripe.service');
const logger = require('../config/logger');

const ACTIVE_TRIP_STATUSES = ['driver_allocated', 'driver_arrived', 'in_progress', 'completed', 'cancelled'];

const getDriverOrThrow = async (driverId) => {
  const driver = await Driver.findById(driverId).lean();
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  return driver;
};

const formatMoney = (amount) => {
  return Number((amount || 0).toFixed(2));
};

const formatPaymentMethod = (pm) => {
  if (!pm) return null;

  if (pm.type === 'card') {
    return {
      id: pm.id,
      type: 'card',
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
      funding: pm.card.funding,
      country: pm.card.country,
      holderName: pm.billing_details && pm.billing_details.name ? pm.billing_details.name : null,
    };
  }

  return {
    id: pm.id,
    type: pm.type,
  };
};

const getTripReportDate = (ride) => {
  if (!ride) return null;

  if (ride.rideTimestamps && ride.rideTimestamps.completedAt) {
    return new Date(ride.rideTimestamps.completedAt);
  }

  if (ride.rideTimestamps && ride.rideTimestamps.startedAt) {
    return new Date(ride.rideTimestamps.startedAt);
  }

  if (ride.createdAt) {
    return new Date(ride.createdAt);
  }

  return null;
};

const getRangeWindow = (range) => {
  const now = new Date();
  let start = new Date(now);
  let step = 'month';

  if (range === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    step = 'day';
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    step = 'day';
  } else {
    start = new Date(now.getFullYear(), 0, 1);
  }

  return { start, end: now, step };
};

const buildReportBuckets = (range, completedTrips) => {
  const { start, end, step } = getRangeWindow(range);
  const buckets = [];
  const bucketMap = new Map();

  if (step === 'month') {
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(start.getFullYear(), month, 1);
      const key = `${date.getFullYear()}-${String(month + 1).padStart(2, '0')}`;
      const bucket = {
        key,
        label: date.toLocaleString('en-GB', { month: 'short' }),
        startDate: date,
        totalEarnings: 0,
        tripCount: 0,
      };
      buckets.push(bucket);
      bucketMap.set(key, bucket);
    }
  } else {
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const bucket = {
        key,
        label:
          range === 'week'
            ? cursor.toLocaleString('en-GB', { weekday: 'short' })
            : String(cursor.getDate()).padStart(2, '0'),
        startDate: new Date(cursor),
        totalEarnings: 0,
        tripCount: 0,
      };
      buckets.push(bucket);
      bucketMap.set(key, bucket);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  completedTrips.forEach((ride) => {
    const tripDate = getTripReportDate(ride);
    if (!tripDate || tripDate < start || tripDate > end) {
      return;
    }

    const key =
      step === 'month'
        ? `${tripDate.getFullYear()}-${String(tripDate.getMonth() + 1).padStart(2, '0')}`
        : tripDate.toISOString().slice(0, 10);

    const bucket = bucketMap.get(key);
    if (!bucket) {
      return;
    }

    bucket.tripCount += 1;
    bucket.totalEarnings = formatMoney(bucket.totalEarnings + (ride.fare && ride.fare.totalFare ? ride.fare.totalFare : 0));
  });

  return buckets.map((bucket) => ({
    label: bucket.label,
    amount: bucket.totalEarnings,
    totalEarnings: bucket.totalEarnings,
    tripCount: bucket.tripCount,
    startDate: bucket.startDate,
  }));
};

const getDriverSubscriptions = async (driverId, options = {}) => {
  const driver = await getDriverOrThrow(driverId);
  const page = options.page || 1;
  const limit = options.limit || 10;
  const billingLimit = options.billingLimit || 20;

  const currentSubscription = await Subscription.findOne({
    driver: driverId,
    status: { $in: ['active', 'trialing', 'past_due', 'pending', 'incomplete'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  const subscriptionHistory = await Subscription.paginate(
    { driver: driverId },
    {
      page,
      limit,
      sortBy: 'createdAt:desc',
    }
  );

  let billingHistory = [];
  let paymentMethod = null;

  if (driver.stripeCustomerId) {
    try {
      const invoices = await stripeService.listInvoices(driver.stripeCustomerId, billingLimit);
      billingHistory = invoices.data.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.number,
        description: invoice.description || 'Driver subscription',
        amount: formatMoney((invoice.amount_paid || 0) / 100),
        currency: invoice.currency ? invoice.currency.toUpperCase() : 'GBP',
        status: invoice.status,
        paid: invoice.paid,
        invoiceUrl: invoice.hosted_invoice_url,
        pdfUrl: invoice.invoice_pdf,
        createdAt: new Date(invoice.created * 1000),
        periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      }));
    } catch (error) {
      logger.warn(`Unable to fetch subscription invoices for driver ${driverId}: ${error.message}`);
    }

    try {
      const paymentMethods = await stripeService.listPaymentMethods(driver.stripeCustomerId, 'card');
      if (paymentMethods.data.length) {
        paymentMethod = formatPaymentMethod(paymentMethods.data[0]);
      }
    } catch (error) {
      logger.warn(`Unable to fetch subscription payment method for driver ${driverId}: ${error.message}`);
    }
  }

  return {
    currentSubscription: currentSubscription
      ? {
          id: currentSubscription._id,
          stripeSubscriptionId: currentSubscription.stripeSubscriptionId,
          stripePriceId: currentSubscription.stripePriceId,
          status: currentSubscription.status,
          amount: formatMoney((currentSubscription.amount || 0) / 100),
          currency: currentSubscription.currency,
          currentPeriodStart: currentSubscription.currentPeriodStart,
          currentPeriodEnd: currentSubscription.currentPeriodEnd,
          cancelAtPeriodEnd: currentSubscription.cancelAtPeriodEnd,
          canceledAt: currentSubscription.canceledAt,
          subscribedOn: currentSubscription.createdAt,
        }
      : null,
    subscriptionHistory: {
      results: subscriptionHistory.results.map((subscription) => ({
        id: subscription._id,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCheckoutSessionId: subscription.stripeCheckoutSessionId,
        stripePriceId: subscription.stripePriceId,
        status: subscription.status,
        amount: formatMoney((subscription.amount || 0) / 100),
        currency: subscription.currency,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        createdAt: subscription.createdAt,
      })),
    },
    subscriptionHistoryMeta: {
      page: subscriptionHistory.page,
      limit: subscriptionHistory.limit,
      totalPages: subscriptionHistory.totalPages,
      totalResults: subscriptionHistory.totalResults,
    },
    billingHistory,
    paymentMethod,
    summary: {
      isSubscribed: driver.isSubscribed || false,
      subscriptionStatus: driver.subscriptionStatus || 'none',
      stripeCustomerId: driver.stripeCustomerId || null,
    },
  };
};

const getDriverEarningStats = async (driverId, options = {}) => {
  await getDriverOrThrow(driverId);

  const range = options.range || 'year';
  const assignedTripsQuery = {
    driver: driverId,
    status: { $in: ACTIVE_TRIP_STATUSES },
  };

  const completedTripsQuery = {
    driver: driverId,
    status: 'completed',
  };

  const [assignedTrips, completedTrips] = await Promise.all([
    Ride.find(assignedTripsQuery)
      .select('status cancellation fare rideTimestamps createdAt rideNumber pickup destination')
      .lean(),
    Ride.find(completedTripsQuery).select('fare rideTimestamps createdAt rideNumber pickup destination').lean(),
  ]);

  const totalTrips = assignedTrips.length;
  const totalEarnings = formatMoney(
    completedTrips.reduce((sum, ride) => sum + (ride.fare && ride.fare.totalFare ? ride.fare.totalFare : 0), 0)
  );
  const averageTripValue = completedTrips.length ? formatMoney(totalEarnings / completedTrips.length) : 0;
  const driverCancelledTrips = assignedTrips.filter(
    (ride) => ride.status === 'cancelled' && ride.cancellation && ride.cancellation.cancelledBy === 'driver'
  ).length;
  const acceptanceRate = totalTrips ? Number((((totalTrips - driverCancelledTrips) / totalTrips) * 100).toFixed(2)) : null;

  const report = buildReportBuckets(range, completedTrips);
  const periodSummary = report.reduce(
    (acc, item) => ({
      totalEarnings: formatMoney(acc.totalEarnings + item.totalEarnings),
      totalTrips: acc.totalTrips + item.tripCount,
    }),
    { totalEarnings: 0, totalTrips: 0 }
  );

  return {
    summary: {
      totalTrips,
      totalEarnings,
      averageTripValue,
      acceptanceRate,
    },
    period: range,
    periodSummary,
    report,
  };
};

module.exports = {
  getDriverSubscriptions,
  getDriverEarningStats,
};
